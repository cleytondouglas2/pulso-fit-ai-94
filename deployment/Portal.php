<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * ARGUS client onboarding. Customer sessions are separate from admin sessions.
 * Document uploads are only accepted when encrypted persistent storage is configured.
 * Automated format checks DO NOT constitute identity verification or permission to process money.
 */
final class Portal
{
    private static function fail(string $message,int $status=400): never {throw new ApiError($message,$status);}
    private static function out(array $value,int $status=200): never {
        http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store, private');
        echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
    }
    private static function body(int $limit=12288):array {
        $raw=file_get_contents('php://input');
        if(!is_string($raw)||strlen($raw)>$limit) self::fail('Requisição muito grande',413);
        try{$v=json_decode($raw,true,32,JSON_THROW_ON_ERROR);}catch(\JsonException){self::fail('JSON inválido',400);}
        if(!is_array($v)||array_is_list($v))self::fail('Objeto JSON obrigatório',400);
        return $v;
    }
    private static function string(array $body,string $key,int $min,int $max):string {
        $v=$body[$key]??null;if(!is_string($v))self::fail("Campo $key obrigatório",422);
        $v=trim($v);$size=function_exists('mb_strlen')?mb_strlen($v,'UTF-8'):strlen($v);
        if($size<$min||$size>$max)self::fail("Campo $key inválido",422);return $v;
    }
    private static function id():string{return bin2hex(random_bytes(16));}
    private static function now():string{return Database::stamp();}
    private static function digest(string $document):string {
        $key=(string)(getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY'));
        if(strlen($key)<32)self::fail('Cadastro temporariamente indisponível: proteção documental não configurada',503);
        return hash_hmac('sha256',$document,$key);
    }
    private static function validCpf(string $cpf):bool {
        if(!preg_match('/^\d{11}$/D',$cpf)||preg_match('/^(\d)\1{10}$/D',$cpf))return false;
        for($t=9;$t<11;$t++){$sum=0;for($i=0;$i<$t;$i++)$sum+=(int)$cpf[$i]*($t+1-$i);$d=($sum*10)%11;if($d===10)$d=0;if($d!==(int)$cpf[$t])return false;}return true;
    }
    private static function validCnpj(string $c):bool {
        if(!preg_match('/^\d{14}$/D',$c)||preg_match('/^(\d)\1{13}$/D',$c))return false;
        for($p=12;$p<=13;$p++){$w=$p===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];$s=0;foreach($w as $i=>$v)$s+=$v*(int)$c[$i];$r=$s%11;if((int)$c[$p]!==($r<2?0:11-$r))return false;}return true;
    }
    private static function cookie(string $token,int $expires):void {
        setcookie('arg_portal_session',$token,['expires'=>$expires,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Strict']);
    }
    private static function csrfCookie(string $token,int $expires):void {
        setcookie('arg_portal_csrf',$token,['expires'=>$expires,'path'=>'/','secure'=>true,'httponly'=>false,'samesite'=>'Strict']);
    }
    public static function install(Database $db):void {
        $sql=[
            "CREATE TABLE IF NOT EXISTS argus_portal_accounts (id VARCHAR(64) PRIMARY KEY, account_type VARCHAR(2) NOT NULL, display_name VARCHAR(180) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, document_digest VARCHAR(64) NOT NULL UNIQUE, document_last4 VARCHAR(4) NOT NULL, password_hash VARCHAR(255) NOT NULL, status VARCHAR(40) NOT NULL, merchant_id VARCHAR(120), failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until BIGINT NOT NULL DEFAULT 0, created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL)",
            "CREATE TABLE IF NOT EXISTS argus_portal_sessions (token_hash VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64) NOT NULL, csrf_hash VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL, created_at VARCHAR(32) NOT NULL)",
            "CREATE TABLE IF NOT EXISTS argus_portal_documents (id VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64) NOT NULL, document_type VARCHAR(40) NOT NULL, mime VARCHAR(80) NOT NULL, sealed_file VARCHAR(100) NOT NULL, file_digest VARCHAR(64) NOT NULL, created_at VARCHAR(32) NOT NULL, review_status VARCHAR(32) NOT NULL)",
            "CREATE TABLE IF NOT EXISTS argus_portal_keys (id VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64) NOT NULL, merchant_id VARCHAR(120) NOT NULL, public_key VARCHAR(90) NOT NULL UNIQUE, secret_hash VARCHAR(64) NOT NULL, created_at VARCHAR(32) NOT NULL, revoked_at VARCHAR(32))"
        ];foreach($sql as $q)$db->pdo()->exec($q);
    }
    private static function session(Database $db):array {
        $v=$_COOKIE['arg_portal_session']??'';
        if(!is_string($v)||!preg_match('/^[a-f0-9]{64}$/D',$v))self::fail('Entre na sua conta para continuar',401);
        $a=$db->one('SELECT a.*,s.csrf_hash FROM argus_portal_sessions s JOIN argus_portal_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?',[hash('sha256',$v),time()]);
        if(!$a)self::fail('Sua sessão expirou. Entre novamente',401);
        return $a;
    }
    private static function csrf(array $account):void {
        $token=$_SERVER['HTTP_X_CSRF_TOKEN']??'';
        if(!is_string($token)||strlen($token)!==64||!hash_equals($account['csrf_hash'],hash('sha256',$token)))self::fail('Recarregue a página e tente novamente',403);
    }
    private static function summary(Database $db,array $a):array {
        $documents=$db->all('SELECT id,document_type,mime,review_status,created_at FROM argus_portal_documents WHERE account_id=? ORDER BY created_at DESC',[$a['id']]);
        return ['id'=>$a['id'],'account_type'=>$a['account_type'],'display_name'=>$a['display_name'],'email'=>$a['email'],
            'document_last4'=>$a['document_last4'],'status'=>$a['status'],'documents'=>$documents,
            'can_issue_live_keys'=>$a['status']==='approved'&&!empty($a['merchant_id']),
            'kyc_message'=>'Verificação automática de integridade e formato não substitui validação de identidade, prova de vida e análise do prestador de pagamentos.'];
    }
    private static function authPair(Database $db):array {
        $key=$_SERVER['HTTP_X_ARGUS_KEY']??'';
        $secret=$_SERVER['HTTP_X_ARGUS_SECRET']??'';
        if(!is_string($key)||!preg_match('/^agp_live_[a-f0-9]{24}$/D',$key)||!is_string($secret)||!preg_match('/^ags_live_[a-f0-9]{64}$/D',$secret))self::fail('Informe X-Argus-Key e X-Argus-Secret no servidor',401);
        $c=$db->one('SELECT k.*,a.status account_status FROM argus_portal_keys k JOIN argus_portal_accounts a ON a.id=k.account_id WHERE k.public_key=? AND k.revoked_at IS NULL',[$key]);
        if(!$c||!hash_equals($c['secret_hash'],hash('sha256',$secret))||$c['account_status']!=='approved')self::fail('Credenciais inválidas, revogadas ou não autorizadas',403);
        $merchant=$db->one("SELECT * FROM b2b_merchants WHERE id=? AND status='approved_live'",[$c['merchant_id']]);
        if(!$merchant)self::fail('Recebedor ainda não autorizado para pagamentos',403);
        return $merchant;
    }
    private static function upload(Database $db,array $account,array $data):never {
        $root=(string)getenv('ARGUS_KYC_STORAGE_PATH');
        $keyB64=(string)getenv('ARGUS_KYC_ENCRYPTION_KEY');
        $key=base64_decode($keyB64,true);
        if(!function_exists('sodium_crypto_secretbox')||!is_string($key)||strlen($key)!==SODIUM_CRYPTO_SECRETBOX_KEYBYTES||
           $root===''||!str_starts_with($root,'/')||str_starts_with($root,'/var/www/html')||!is_dir($root)||!is_writable($root)) {
            self::fail('Envio documental indisponível até ativação de armazenamento persistente criptografado. Seu cadastro foi preservado.',503);
        }
        $type=self::string($data,'document_type',3,30);
        if(!in_array($type,['identidade_frente','identidade_verso','selfie','contrato_social'],true))self::fail('Tipo de documento não permitido',422);
        if($account['account_type']==='PF'&&$type==='contrato_social')self::fail('Documento exclusivo de pessoa jurídica',422);
        $b64=self::string($data,'file_base64',32,4400000);
        $bytes=base64_decode($b64,true);
        if($bytes===false||strlen($bytes)<1024||strlen($bytes)>3200000)self::fail('Arquivo deve ter entre 1 KB e 3,2 MB',422);
        $mime=(new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if(!in_array($mime,['image/jpeg','image/png','application/pdf'],true))self::fail('Envie JPG, PNG ou PDF válido',422);
        if(($type==='selfie'&&$mime==='application/pdf')||($mime==='application/pdf'&&!str_starts_with($bytes,'%PDF-')))self::fail('Formato do arquivo incompatível',422);
        $name='kyc_'.self::id().'.enc';$nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $sealed=$nonce.sodium_crypto_secretbox($bytes,$nonce,$key);
        $destination=rtrim($root,'/').'/'.$name;
        if(file_put_contents($destination,$sealed,LOCK_EX)===false)self::fail('Não foi possível armazenar o arquivo com segurança',503);
        chmod($destination,0600);
        try {
            $db->transaction(function(Database $db)use($account,$type,$mime,$name,$bytes){
                $db->run('INSERT INTO argus_portal_documents(id,account_id,document_type,mime,sealed_file,file_digest,created_at,review_status) VALUES (?,?,?,?,?,?,?,?)',
                    [self::id(),$account['id'],$type,$mime,$name,hash('sha256',$bytes),self::now(),'awaiting_review']);
                $db->run("UPDATE argus_portal_accounts SET status='documents_under_review',updated_at=? WHERE id=? AND status IN ('documents_required','documents_under_review')",[self::now(),$account['id']]);
            });
        } catch(\Throwable $e){@unlink($destination);throw $e;}
        self::out(['ok'=>true,'message'=>'Arquivo recebido, criptografado e submetido à análise. Nenhum pagamento foi liberado.'],201);
    }

    public static function handle(Database $db,string $method,string $path):never {
        self::install($db);
        if(str_starts_with($path,'/api/v1/')){
            $merchant=self::authPair($db);
            if($method==='POST'&&$path==='/api/v1/pix/charges') {
                $data=self::body();LivePix::issueCharge($db,$merchant,$data,(string)($_SERVER['HTTP_IDEMPOTENCY_KEY']??''));
            }
            if($method==='GET'&&preg_match('~^/api/v1/pix/charges/([a-zA-Z0-9_-]+)$~D',$path,$m)){
                $x=$db->one('SELECT id,amount_cents,status,qr_copy,created_at,paid_at,checked_at FROM b2b_live_pix WHERE merchant_id=? AND id=?',[$merchant['id'],$m[1]]);
                if(!$x)self::fail('Cobrança não encontrada',404);
                self::out(['id'=>$x['id'],'amount_cents'=>(int)$x['amount_cents'],'status'=>$x['status'],'pix_copy_paste'=>$x['qr_copy'],'created_at'=>$x['created_at'],'paid_at'=>$x['paid_at'],'checked_at'=>$x['checked_at']]);
            }
            self::fail('Endpoint indisponível',404);
        }
        if($method==='POST'&&$path==='/api/portal/register'){
            $data=self::body();$type=self::string($data,'account_type',2,2);
            if(!in_array($type,['PF','PJ'],true))self::fail('Selecione pessoa física ou jurídica',422);
            $name=self::string($data,'display_name',3,180);
            $email=strtolower(self::string($data,'email',5,190));
            if(!filter_var($email,FILTER_VALIDATE_EMAIL))self::fail('E-mail inválido',422);
            $number=preg_replace('/\D/','',self::string($data,'document_number',11,24));
            if(!(($type==='PF'&&self::validCpf($number))||($type==='PJ'&&self::validCnpj($number))))self::fail('CPF ou CNPJ inválido',422);
            $password=self::string($data,'password',14,200);
            if(!preg_match('/[A-Z]/',$password)||!preg_match('/[a-z]/',$password)||!preg_match('/[0-9]/',$password))self::fail('Use senha com pelo menos 14 caracteres, letras e números',422);
            $h=self::digest($number);$existing=$db->one('SELECT id FROM argus_portal_accounts WHERE email=? OR document_digest=?',[$email,$h]);
            if($existing)self::fail('Já existe um cadastro para este e-mail ou documento',409);
            $id=self::id();
            try{$db->run('INSERT INTO argus_portal_accounts(id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                [$id,$type,$name,$email,$h,substr($number,-4),password_hash($password,PASSWORD_DEFAULT),'documents_required',null,self::now(),self::now()]);}
            catch(\PDOException){self::fail('Cadastro já existente ou dados inválidos',409);}
            self::out(['ok'=>true,'message'=>'Conta criada. Entre para enviar os documentos e acompanhar sua validação.','status'=>'documents_required'],201);
        }
        if($method==='POST'&&$path==='/api/portal/login'){
            $data=self::body();$email=strtolower(self::string($data,'email',5,190));$password=self::string($data,'password',1,200);
            $account=$db->one('SELECT * FROM argus_portal_accounts WHERE email=?',[$email]);
            $valid=$account&&time()>=(int)$account['locked_until']&&password_verify($password,$account['password_hash']);
            if(!$valid){
                if($account){$n=(int)$account['failed_attempts']+1;$db->run('UPDATE argus_portal_accounts SET failed_attempts=?,locked_until=? WHERE id=?',[$n,$n>=5?time()+900:0,$account['id']]);}
                self::fail('Credenciais inválidas ou acesso temporariamente bloqueado',401);
            }
            $token=bin2hex(random_bytes(32));$csrf=bin2hex(random_bytes(32));$expires=time()+28800;
            $db->transaction(function(Database $db)use($account,$token,$csrf,$expires){
                $db->run('DELETE FROM argus_portal_sessions WHERE account_id=? OR expires_at<?',[$account['id'],time()]);
                $db->run('INSERT INTO argus_portal_sessions(token_hash,account_id,csrf_hash,expires_at,created_at) VALUES (?,?,?,?,?)',[hash('sha256',$token),$account['id'],hash('sha256',$csrf),$expires,self::now()]);
                $db->run('UPDATE argus_portal_accounts SET failed_attempts=0,locked_until=0 WHERE id=?',[$account['id']]);
            });
            self::cookie($token,$expires);self::csrfCookie($csrf,$expires);
            self::out(['ok'=>true,'account'=>self::summary($db,$account),'csrf_token'=>$csrf]);
        }
        if($method==='GET'&&$path==='/api/portal/session'){self::out(['account'=>self::summary($db,self::session($db))]);}
        $account=self::session($db);
        if($method!=='GET')self::csrf($account);
        if($method==='POST'&&$path==='/api/portal/logout'){
            $token=$_COOKIE['arg_portal_session']??'';
            $db->run('DELETE FROM argus_portal_sessions WHERE token_hash=?',[hash('sha256',(string)$token)]);
            self::cookie('',time()-3600);self::csrfCookie('',time()-3600);self::out(['ok'=>true]);
        }
        if($method==='POST'&&$path==='/api/portal/documents')self::upload($db,$account,self::body(4600000));
        if($method==='GET'&&$path==='/api/portal/keys'){
            $v=$db->all('SELECT id,public_key,created_at,revoked_at FROM argus_portal_keys WHERE account_id=? ORDER BY created_at DESC',[$account['id']]);
            self::out(['keys'=>$v,'can_issue'=>$account['status']==='approved'&&!empty($account['merchant_id'])]);
        }
        if($method==='POST'&&$path==='/api/portal/keys'){
            if($account['status']!=='approved'||!$account['merchant_id'])self::fail('A emissão de credenciais exige validação documental e liberação operacional',403);
            $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",[$account['merchant_id']]);
            if(!$merchant)self::fail('Aguardando aprovação do recebedor no sistema de pagamentos',403);
            $key='agp_live_'.bin2hex(random_bytes(12));
            $secret='ags_live_'.bin2hex(random_bytes(32));$id=self::id();
            $db->run('INSERT INTO argus_portal_keys(id,account_id,merchant_id,public_key,secret_hash,created_at) VALUES (?,?,?,?,?,?)',
                [$id,$account['id'],$merchant['id'],$key,hash('sha256',$secret),self::now()]);
            self::out(['id'=>$id,'api_key'=>$key,'api_secret'=>$secret,'message'=>'Salve a chave secreta agora. Ela não será exibida novamente.'],201);
        }
        if($method==='POST'&&preg_match('~^/api/portal/keys/([a-f0-9]{32})/revoke$~D',$path,$m)){
            $db->run('UPDATE argus_portal_keys SET revoked_at=? WHERE id=? AND account_id=? AND revoked_at IS NULL',[self::now(),$m[1],$account['id']]);
            self::out(['ok'=>true]);
        }
        self::fail('Rota não encontrada',404);
    }
}
