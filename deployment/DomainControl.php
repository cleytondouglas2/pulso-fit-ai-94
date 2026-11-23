<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Super Admin-only custom domain registry.
 * No host redirects, cookies, Pix endpoints, webhook URL or PSP credentials are
 * modified here. Old domains stay attached to Render during migration.
 * The Render API token is read only from server environment; never from browsers.
 */
final class DomainControl {
    private const FALLBACK='arguspay.com.br';
    private static function fail(string $message,int $status=422):never {
        throw new ApiError($message,$status);
    }
    private static function reply(array $data,int $http=200):never {
        http_response_code($http);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        exit;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_site_domains (
            id INTEGER PRIMARY KEY,
            primary_domain VARCHAR(253) NOT NULL,
            staged_domain VARCHAR(253) NOT NULL DEFAULT '',
            changed_at VARCHAR(32) NOT NULL,
            changed_by VARCHAR(100) NOT NULL
        )");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_site_domains_audit (
            event_id VARCHAR(40) PRIMARY KEY,
            action VARCHAR(20) NOT NULL,
            domain VARCHAR(253) NOT NULL,
            changed_at VARCHAR(32) NOT NULL,
            changed_by VARCHAR(100) NOT NULL
        )");
    }
    private static function normalize(string $value):string {
        $host=strtolower(trim($value));
        if(strlen($host)>253||strlen($host)<4||$host!==rtrim($host,'.')||
           str_contains($host,'://')||str_contains($host,'/')||str_contains($host,':')||
           str_contains($host,'@')||str_contains($host,'*')||
           !preg_match('/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/D',$host))
            self::fail('Informe apenas um domínio válido, sem https://, caminhos, portas ou caracteres especiais.');
        $parts=explode('.',$host);
        $suffix=(string)end($parts);
        if(strlen($suffix)<2||preg_match('/^[0-9]+$/',$suffix)||
           in_array($suffix,['local','localhost','internal','test','invalid','example'],true)||
           str_ends_with($host,'.onrender.com'))
            self::fail('Escolha um domínio público próprio, não um endereço interno ou reservado.');
        return $host;
    }
    private static function envDomain():string {
        $env=(string)(getenv('ARGUS_PRIMARY_DOMAIN')?:self::FALLBACK);
        try{return self::normalize($env);}catch(\Throwable){return self::FALLBACK;}
    }
    private static function current(Database $db):array {
        self::install($db);
        $row=$db->one('SELECT primary_domain,staged_domain,changed_at,changed_by FROM argus_site_domains WHERE id=1');
        if($row)return [
            'primary'=>(string)$row['primary_domain'],
            'staged'=>(string)$row['staged_domain'],
            'updated_at'=>(string)$row['changed_at'],
            'source'=>'admin'
        ];
        return ['primary'=>self::envDomain(),'staged'=>'','updated_at'=>null,'source'=>'environment'];
    }
    private static function audit(Database $db,string $action,string $host,string $actor):void {
        $db->run('INSERT INTO argus_site_domains_audit(event_id,action,domain,changed_at,changed_by)
                  VALUES(?,?,?,?,?)',[
            'dom_'.bin2hex(random_bytes(16)),$action,$host,Database::stamp(),$actor
        ]);
    }
    private static function save(Database $db,string $primary,string $staged,string $actor,string $action):void {
        $db->transaction(static function(Database $db)use($primary,$staged,$actor,$action):void {
            $db->run('DELETE FROM argus_site_domains WHERE id=1');
            $db->run('INSERT INTO argus_site_domains(id,primary_domain,staged_domain,changed_at,changed_by)
                      VALUES(1,?,?,?,?)',[$primary,$staged,Database::stamp(),$actor]);
            self::audit($db,$action,$staged!==''?$staged:$primary,$actor);
        });
    }
    private static function renderConfig():array {
        $token=(string)(getenv('ARGUS_RENDER_API_TOKEN')?:'');
        $service=(string)(getenv('ARGUS_RENDER_SERVICE_ID')?:'');
        if($token!==''&&!preg_match('/^srv-[a-z0-9]+$/D',$service))$service='';
        return [$token,$service];
    }
    private static function renderRequest(string $method,string $host='',string $action=''):array {
        [$token,$service]=self::renderConfig();
        if($token===''||$service==='')
            self::fail('Falta configurar ARGUS_RENDER_API_TOKEN e ARGUS_RENDER_SERVICE_ID nas variáveis protegidas do Render. O domínio atual permanece ativo.',503);
        if(!function_exists('curl_init'))self::fail('cURL não está disponível no servidor.',503);
        $url='https://api.render.com/v1/services/'.$service.'/custom-domains';
        if($host!=='')$url.='/'.rawurlencode(self::normalize($host));
        if($action==='verify')$url.='/verify';
        $headers=['Accept: application/json','Authorization: Bearer '.$token];
        $params=[
            CURLOPT_RETURNTRANSFER=>true,
            CURLOPT_FOLLOWLOCATION=>false,
            CURLOPT_MAXREDIRS=>0,
            CURLOPT_CONNECTTIMEOUT=>4,
            CURLOPT_TIMEOUT=>14,
            CURLOPT_SSL_VERIFYPEER=>true,
            CURLOPT_SSL_VERIFYHOST=>2,
            CURLOPT_HTTPHEADER=>$headers,
            CURLOPT_USERAGENT=>'ArgusPay-SuperAdmin-Domains/1.0'
        ];
        if($method==='POST'){
            $params[CURLOPT_POST]=true;
            if($action==='register'){
                $params[CURLOPT_POSTFIELDS]=json_encode(['name'=>self::normalize($host)],JSON_THROW_ON_ERROR);
                $headers[]='Content-Type: application/json';
                $params[CURLOPT_HTTPHEADER]=$headers;
            }else $params[CURLOPT_POSTFIELDS]='';
        }
        $curl=curl_init($url);
        curl_setopt_array($curl,$params);
        $body=curl_exec($curl);
        $http=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);
        curl_close($curl);
        $data=is_string($body)?json_decode($body,true):null;
        // Never send Render error bodies to browser (may contain infrastructure metadata).
        if($http<200||$http>=300)
            self::fail('Não foi possível concluir a operação no Render (HTTP '.($http?:'sem resposta').'). Verifique a chave, as permissões, o domínio e a configuração DNS.',502);
        return is_array($data)?$data:[];
    }
    private static function domainState(string $host):array {
        $record=self::renderRequest('GET',$host);
        if(isset($record['domain'])&&is_array($record['domain']))$record=$record['domain'];
        if(isset($record['customDomain'])&&is_array($record['customDomain']))$record=$record['customDomain'];
        $name=(string)($record['name']??'');
        if(strtolower($name)!==strtolower($host))
            self::fail('O Render não devolveu uma confirmação inequívoca do domínio cadastrado.',502);
        return [
            'name'=>$host,
            'verified'=>($record['verificationStatus']??'')==='verified',
            'verification_status'=>(string)($record['verificationStatus']??'unverified')
        ];
    }
    private static function status(Database $db):array {
        $current=self::current($db);
        [$token,$service]=self::renderConfig();
        $connected=$token!==''&&$service!=='';
        $state=null;$error='';
        if($current['staged']!==''&&$connected){
            try{$state=self::domainState($current['staged']);}
            catch(\Throwable){$error='Ainda não foi possível confirmar o domínio no Render.';}
        }
        return [
            'primary_domain'=>$current['primary'],
            'primary_url'=>'https://'.$current['primary'],
            'staged_domain'=>$current['staged']!==''?$current['staged']:null,
            'render_configured'=>$connected,
            'render_verified'=>$state['verified']??false,
            'render_status'=>$state['verification_status']??($connected?'not_registered':'not_configured'),
            'render_service_url'=>'https://dashboard.render.com/web/'.($service?:'srv-dbut6bu7bikc73auidf0'),
            'render_origin'=>'argus-payments-oregon-testes.onrender.com',
            'checked_at'=>gmdate('c'),
            'updated_at'=>$current['updated_at'],
            'notice'=>$error?:($connected?'A conexão com o Render está configurada.':'Para cadastrar e verificar automaticamente, configure a chave de API do Render no servidor.'),
            'mode'=>'safe_additive',
            'migration_note'=>'O domínio antigo continuará acessível. Redirecionamentos e URLs de webhooks/callbacks exigem revisão antes de desativar qualquer domínio.'
        ];
    }
    public static function handle(Database $db,string $method,string $path,array $actor,array $body=[]):never {
        if(($actor['role']??'')!=='superadmin')self::fail('Somente o Super Admin pode alterar domínios.',403);
        header('Cache-Control: private, no-store');
        if(!in_array($db->driver(),['pgsql','mysql'],true))
            self::fail('Banco persistente necessário para alterações de domínio.',503);
        $current=self::current($db);
        $actorId=(string)($actor['id']??$actor['email']??'superadmin');
        if($method==='GET'&&$path==='/api/admin/domains/status')
            self::reply(self::status($db));
        if($method==='POST'&&$path==='/api/admin/domains/stage'){
            $host=self::normalize((string)($body['domain']??''));
            if($host===$current['primary'])self::fail('Esse já é o domínio preferencial.');
            self::save($db,$current['primary'],$host,$actorId,'stage');
            self::reply(self::status($db));
        }
        $draft=$current['staged'];
        if($draft==='')self::fail('Cadastre primeiro o novo domínio.',409);
        if($method==='POST'&&$path==='/api/admin/domains/register'){
            $result=self::renderRequest('POST',$draft,'register');
            self::audit($db,'register',$draft,$actorId);
            self::reply(['ok'=>true,'message'=>'Solicitação enviada ao Render. Configure os registros DNS e depois solicite a verificação.','domain'=>$draft]);
        }
        if($method==='POST'&&$path==='/api/admin/domains/verify'){
            self::renderRequest('POST',$draft,'verify');
            self::audit($db,'verify',$draft,$actorId);
            self::reply(['ok'=>true,'message'=>'Verificação DNS solicitada ao Render. Consulte o status até aparecer Verificado.','domain'=>$draft]);
        }
        if($method==='POST'&&$path==='/api/admin/domains/activate'){
            $state=self::domainState($draft);
            if(!$state['verified'])self::fail('O domínio ainda não está verificado no Render. Mantenha o domínio atual.',409);
            // This is a preference record only. No implicit redirect, cookie change,
            // callback migration, webhook mutation or deletion of previous domain.
            self::save($db,$draft,'',$actorId,'prefer');
            self::reply(['ok'=>true,'preferred_domain'=>$draft,
                'message'=>'Domínio preferencial registrado. Confirme os links públicos, TLS, webhooks e callbacks antes de desativar o endereço anterior.']);
        }
        self::fail('Operação de domínio não encontrada.',404);
    }
}
