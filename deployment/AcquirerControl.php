<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Super Admin only. PSP contracts are allowlisted, not determined by user URLs.
 * A draft never changes the active environment credential. Encryption keys are
 * derived from the existing protected document HMAC secret, with domain separation.
 */
final class AcquirerControl {
    private const SLOTS=[
        'pix'=>['label'=>'Pix / cobranças','key'=>'ARGUS_TRADITIONAL_PIX_CLIENT_ID','secret'=>'ARGUS_TRADITIONAL_PIX_CLIENT_SECRET'],
        'finance'=>['label'=>'Finance QR Codes (opcional)','key'=>'ARGUS_FINANCE_QR_CLIENT_ID','secret'=>'ARGUS_FINANCE_QR_CLIENT_SECRET'],
        'payout'=>['label'=>'Saques / transferências','key'=>'ARGUS_MISTICPAY_PAYOUT_PK','secret'=>'ARGUS_MISTICPAY_PAYOUT_SK']
    ];
    private static ?array $activeCache=null;

    private static function fail(string $message,int $http=422):never {throw new ApiError($message,$http);}
    private static function reply(array $result,int $http=200):never {
        http_response_code($http);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        exit;
    }
    private static function slot(string $slot):array {
        if(!isset(self::SLOTS[$slot]))self::fail('Integração não identificada',422);
        return self::SLOTS[$slot];
    }
    private static function cryptKey():string {
        $seed=(string)(getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY')?:'');
        if(strlen($seed)<32||!function_exists('sodium_crypto_secretbox')||!function_exists('hash_hkdf'))
            self::fail('A chave de criptografia das integrações não está disponível',503);
        return hash_hkdf('sha256',$seed,SODIUM_CRYPTO_SECRETBOX_KEYBYTES,'argus-acquirer-vault-v1');
    }
    private static function seal(string $value):string {
        $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce.sodium_crypto_secretbox($value,$nonce,self::cryptKey()));
    }
    private static function unseal(string $value):string {
        $raw=base64_decode($value,true);
        if(!is_string($raw)||strlen($raw)<SODIUM_CRYPTO_SECRETBOX_NONCEBYTES+SODIUM_CRYPTO_SECRETBOX_MACBYTES)
            self::fail('Credencial protegida inválida',503);
        $plain=sodium_crypto_secretbox_open(
            substr($raw,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            substr($raw,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),self::cryptKey());
        if(!is_string($plain))self::fail('Falha ao abrir credencial protegida; alteração bloqueada',503);
        return $plain;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_acquirer_vault (
            slot VARCHAR(16) NOT NULL,
            stage VARCHAR(12) NOT NULL,
            provider VARCHAR(32) NOT NULL,
            provider_label VARCHAR(80) NOT NULL,
            key_sealed TEXT NOT NULL,
            secret_sealed TEXT NOT NULL,
            changed_by VARCHAR(100) NOT NULL,
            changed_at VARCHAR(32) NOT NULL,
            PRIMARY KEY(slot,stage)
        )");
    }
    private static function rows(Database $db):array {
        self::install($db);
        $out=[];
        foreach($db->all('SELECT slot,stage,provider,provider_label,key_sealed,secret_sealed,changed_at FROM argus_acquirer_vault') as $r){
            if(isset(self::SLOTS[(string)$r['slot']])&&in_array($r['stage'],['active','draft','backup'],true))
                $out[$r['slot']][$r['stage']]=$r;
        }
        return $out;
    }
    private static function activeRows():array {
        if(self::$activeCache!==null)return self::$activeCache;
        $config=require '/var/www/html/config.php';
        $db=new Database($config);
        $rows=self::rows($db);
        $out=[];
        foreach($rows as $slot=>$stages){
            if(isset($stages['active'])&&$stages['active']['provider']==='misticpay'){
                $r=$stages['active'];
                $out[$slot]=['key'=>self::unseal((string)$r['key_sealed']),
                    'secret'=>self::unseal((string)$r['secret_sealed'])];
            }
        }
        return self::$activeCache=$out;
    }
    /** Called at each PSP credential read, including independent reconciliation workers. */
    public static function effective(string $name):string {
        foreach(self::SLOTS as $slot=>$fields){
            if($fields['key']===$name||$fields['secret']===$name){
                $active=self::activeRows();
                $kind=$fields['key']===$name?'key':'secret';
                if(isset($active[$slot][$kind]))return $active[$slot][$kind];
                break;
            }
        }
        return (string)(getenv($name)?:'');
    }
    private static function mask(string $value):string {
        if($value==='')return 'Não configurada';
        return strlen($value)<=9?'••••'.substr($value,-2):substr($value,0,4).'••••'.substr($value,-4);
    }
    private static function environment(string $slot):array {
        $f=self::slot($slot);
        $key=(string)(getenv($f['key'])?:'');
        $secret=(string)(getenv($f['secret'])?:'');
        if($slot==='pix'&&($key===''||$secret==='')){
            $key=$key?:((string)(getenv('ARGUS_FINANCE_QR_CLIENT_ID')?:''));
            $secret=$secret?:((string)(getenv('ARGUS_FINANCE_QR_CLIENT_SECRET')?:''));
        }
        return [$key,$secret];
    }
    private static function current(Database $db,string $slot,string $stage='active'):array {
        $rows=self::rows($db);
        $r=$rows[$slot][$stage]??null;
        if($r){
            return ['provider'=>(string)$r['provider'],'provider_label'=>(string)$r['provider_label'],
                'key'=>self::unseal((string)$r['key_sealed']),
                'secret'=>self::unseal((string)$r['secret_sealed'])];
        }
        if($stage!=='active')return ['provider'=>'','provider_label'=>'','key'=>'','secret'=>''];
        [$key,$secret]=self::environment($slot);
        return ['provider'=>'misticpay','provider_label'=>'MisticPay','key'=>$key,'secret'=>$secret];
    }
    /** Never accepts a customer-entered API URL. No charges, withdrawals or mutation. */
    private static function probe(string $slot,string $provider,string $key,string $secret):array {
        if($provider!=='misticpay')return ['status'=>'adapter_required','http'=>null,
            'message'=>'Adquirente cadastrada como rascunho. Integração de endpoints ainda necessária.'];
        if($key===''||$secret==='')return ['status'=>'not_configured','http'=>null,
            'message'=>'API Key e Secret não configurados.'];
        if(!function_exists('curl_init'))return ['status'=>'unavailable','http'=>null,'message'=>'cURL indisponível.'];
        $url=$slot==='finance'
          ?'https://api.finance.misticpay.com/v1/public/charges/argus_monitor_'.bin2hex(random_bytes(12))
          :'https://api.misticpay.com/api/users/info';
        $ch=curl_init($url);
        curl_setopt_array($ch,[
            CURLOPT_RETURNTRANSFER=>true,CURLOPT_USERPWD=>$key.':'.$secret,
            CURLOPT_HTTPAUTH=>CURLAUTH_BASIC,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>9,
            CURLOPT_MAXREDIRS=>0,CURLOPT_FOLLOWLOCATION=>false,
            CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
            CURLOPT_HTTPHEADER=>['Accept: application/json'],
            CURLOPT_USERAGENT=>'ARGUS-Private-ReadOnly-Monitor/1.0'
        ]);
        $raw=curl_exec($ch);
        $http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
        curl_close($ch);
        $status=match(true){
            $slot==='finance'&&$http===404=>'online',
            $slot!=='finance'&&$http===200=>'online',
            $http===401=>'invalid_credentials',
            $http===403=>'insufficient_permissions',
            $http===429=>'rate_limited',
            default=>'unavailable'
        };
        $msg=match($status){
            'online'=>'Autenticação aceita no endpoint de consulta.',
            'invalid_credentials'=>'Credenciais rejeitadas pela adquirente (401).',
            'insufficient_permissions'=>'A adquirente respondeu, mas o acesso foi recusado (403). Verifique escopos e IP.',
            'rate_limited'=>'Limite de consultas atingido na adquirente (429).',
            default=>'Não foi possível confirmar a conectividade. Sem qualquer transação de teste.'
        };
        unset($raw);
        return ['status'=>$status,'http'=>$http?:null,'message'=>$msg,'checked_at'=>gmdate('c'),'read_only'=>true];
    }
    private static function pending(Database $db,string $slot):int {
        $checks=$slot==='payout'
            ?[["SELECT COUNT(*) AS n FROM argus_seller_withdrawals WHERE status NOT IN ('paid','completed','failed','cancelled','refunded','rejected')"]]
            :[["SELECT COUNT(*) AS n FROM admin_quick_pix WHERE status IN ('pending','unknown')"],
              ["SELECT COUNT(*) AS n FROM argus_seller_charges WHERE status IN ('pending','unknown')"]];
        $total=0;
        foreach($checks as [$sql]){
            try{$row=$db->one($sql);$total+=(int)($row['n']??0);}
            catch(\Throwable){self::fail('Não foi possível verificar operações pendentes; ativação bloqueada.',503);}
        }
        return $total;
    }
    private static function validatePair(string $slot,string $provider,string $key,string $secret,string $label):void {
        if(!in_array($provider,['misticpay','other'],true))self::fail('Selecione uma adquirente válida.');
        if(strlen($key)<8||strlen($key)>256||strlen($secret)<12||strlen($secret)>256||
           preg_match('/[\x00-\x1f\x7f]/',$key.$secret))
            self::fail('API Key/Secret inválidos ou fora do tamanho permitido.');
        if($provider==='misticpay'&&in_array($slot,['pix','payout'],true)&&
           (!preg_match('/^pk_[A-Za-z0-9_-]{8,}$/D',$key)||
            !preg_match('/^sk_[A-Za-z0-9_-]{8,}$/D',$secret)))
            self::fail('Para esta integração MisticPay, informe credenciais pk_ e sk_ válidas.');
        if($provider==='misticpay'&&$slot==='finance'&&
           (preg_match('/^ci_/',$key)||preg_match('/^cs_/',$secret)))
            self::fail('As credenciais antigas ci_/cs_ não são aceitas na API Finance.');
        if($provider==='other'&&(strlen($label)<3||strlen($label)>80||
           preg_match('/[\x00-\x1f\x7f<>]/',$label)))
            self::fail('Informe o nome da nova adquirente (3 a 80 caracteres).');
    }
    private static function store(Database $db,string $slot,string $stage,string $provider,string $label,
        string $key,string $secret,string $actor):void {
        $db->run('DELETE FROM argus_acquirer_vault WHERE slot=? AND stage=?',[$slot,$stage]);
        $db->run('INSERT INTO argus_acquirer_vault
            (slot,stage,provider,provider_label,key_sealed,secret_sealed,changed_by,changed_at)
            VALUES(?,?,?,?,?,?,?,?)',[
             $slot,$stage,$provider,$label,self::seal($key),self::seal($secret),$actor,Database::stamp()
        ]);
    }
    public static function handle(Database $db,string $method,string $path,array $actor,array $body=[]):never {
        if(($actor['role']??'')!=='superadmin')self::fail('Somente o Super Admin pode acessar a adquirente',403);
        header('Cache-Control: private, no-store');
        if(!in_array($db->driver(),['pgsql','mysql'],true))
            self::fail('Banco persistente exigido para configurações financeiras',503);
        $rows=self::rows($db);
        if($method==='GET'&&$path==='/api/admin/acquirer/status'){
            $slots=[];
            foreach(self::SLOTS as $slot=>$info){
                $record=$rows[$slot]['active']??null;$draft=$rows[$slot]['draft']??null;
                $active=self::current($db,$slot);
                $slots[]=[
                    'slot'=>$slot,'label'=>$info['label'],
                    'provider'=>$active['provider_label'],
                    'key_masked'=>self::mask($active['key']),
                    'key_present'=>$active['key']!==''&&$active['secret']!=='',
                    'source'=>$record?'Painel Argus Pay':'Variáveis protegidas do servidor',
                    'updated_at'=>$record['changed_at']??null,
                    'draft'=>!!$draft,'draft_provider'=>$draft['provider_label']??null,
                    'draft_updated_at'=>$draft['changed_at']??null
                ];
            }
            self::reply(['slots'=>$slots,'read_only'=>true,
                'message'=>'Monitoramento somente leitura. A configuração atual permanece ativa até aprovação e teste.']);
        }
        if($method==='GET'&&$path==='/api/admin/acquirer/probe'){
            $slot=(string)($_GET['slot']??'');self::slot($slot);
            $stage=(string)($_GET['stage']??'active');
            if(!in_array($stage,['active','draft'],true))self::fail('Selecione uma configuração.');
            SecurityShield::rate($db,'acquirer_probe',(string)$actor['id'],36,600);
            $credentials=self::current($db,$slot,$stage);
            self::reply(['slot'=>$slot,'stage'=>$stage]+self::probe(
                $slot,$credentials['provider'],$credentials['key'],$credentials['secret']));
        }
        if($method==='POST'&&$path==='/api/admin/acquirer/credentials'){
            SecurityShield::rate($db,'acquirer_change',(string)$actor['id'],10,3600);
            $slot=(string)($body['slot']??'');self::slot($slot);
            $provider=(string)($body['provider']??'misticpay');
            $label=trim((string)($body['provider_label']??''));
            $key=trim((string)($body['api_key']??''));
            $secret=trim((string)($body['api_secret']??''));
            self::validatePair($slot,$provider,$key,$secret,$label);
            $db->pdo()->beginTransaction();
            try {
                self::store($db,$slot,'draft',$provider,$provider==='misticpay'?'MisticPay':$label,
                    $key,$secret,(string)$actor['id']);
                $db->pdo()->commit();
            }catch(\Throwable $e){if($db->pdo()->inTransaction())$db->pdo()->rollBack();throw $e;}
            self::reply(['ok'=>true,'draft'=>true,'message'=>'Credenciais criptografadas e salvas como rascunho. Nenhuma configuração em produção foi alterada.']);
        }
        if($method==='POST'&&$path==='/api/admin/acquirer/activate'){
            SecurityShield::rate($db,'acquirer_change',(string)$actor['id'],10,3600);
            $slot=(string)($body['slot']??'');self::slot($slot);
            $draft=$rows[$slot]['draft']??null;
            if(!$draft)self::fail('Salve e teste novas credenciais antes de ativá-las.',409);
            if($draft['provider']!=='misticpay')
                self::fail('Essa adquirente ainda precisa de um adaptador homologado. A integração atual foi preservada.',409);
            // An old payment can be disputed or refunded long after being paid,
            // and an old payout can require reconciliation after completion.
            // Do not activate different Pix/payout secrets without immutable
            // transaction-to-credential-version binding and an atomic drain gate.
            // Draft editing and non-mutating provider probes remain available.
            if(in_array($slot,['pix','payout'],true))
                self::fail('Troca de chaves Pix/saques temporariamente bloqueada: vinculação de cada operação à versão original das credenciais e controle de novas operações ainda não homologados. O rascunho e a integração atual foram preservados.',409);
            $key=self::unseal((string)$draft['key_sealed']);
            $secret=self::unseal((string)$draft['secret_sealed']);
            $check=self::probe($slot,'misticpay',$key,$secret);
            if($check['status']!=='online')
                self::fail('A nova integração não passou no teste de consulta. Nada foi alterado.',409);
            if(self::pending($db,$slot)>0)
                self::fail('Existem operações financeiras pendentes. Concilie antes de trocar a credencial da adquirente.',409);
            $old=self::current($db,$slot);
            $db->pdo()->beginTransaction();
            try{
                if($old['key']!==''&&$old['secret']!=='')
                    self::store($db,$slot,'backup','misticpay','MisticPay',
                        $old['key'],$old['secret'],(string)$actor['id']);
                self::store($db,$slot,'active','misticpay','MisticPay',$key,$secret,(string)$actor['id']);
                $db->run('DELETE FROM argus_acquirer_vault WHERE slot=? AND stage=?',[$slot,'draft']);
                $db->pdo()->commit();
            }catch(\Throwable $e){if($db->pdo()->inTransaction())$db->pdo()->rollBack();throw $e;}
            self::$activeCache=null;
            self::reply(['ok'=>true,'status'=>'active',
                'message'=>'Credencial ativada após teste autenticado. Nenhuma cobrança ou transferência foi executada no teste.']);
        }
        self::fail('Operação não permitida',404);
    }
}
