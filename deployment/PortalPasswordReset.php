<?php
declare(strict_types=1);
namespace ArgusPayments;

/** Standalone account recovery, independent of payments and administrator MFA. */
final class PortalPasswordReset {
    private const EXPIRE_SECONDS=1200;
    private const GENERIC='Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha. Confira também o spam.';
    private static function fail(string $message,int $code):never{throw new ApiError($message,$code);}
    private static function out(array $data,int $code=200):never{
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('Referrer-Policy: no-referrer');
        echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;
    }
    private static function json():array {
        $raw=file_get_contents('php://input');
        if(!is_string($raw)||strlen($raw)>4096)self::fail('Solicitação inválida',413);
        try{$data=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}
        catch(\Throwable){self::fail('JSON inválido',400);}
        if(!is_array($data)||array_is_list($data))self::fail('Dados inválidos',422);
        return $data;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec('CREATE TABLE IF NOT EXISTS argus_portal_password_resets (
            id VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64) NOT NULL,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
            used_at BIGINT
        )');
        $db->pdo()->exec('CREATE INDEX IF NOT EXISTS argus_portal_password_resets_account
            ON argus_portal_password_resets(account_id,expires_at)');
        $db->pdo()->exec('CREATE TABLE IF NOT EXISTS argus_portal_reset_limits (
            key_digest VARCHAR(64) PRIMARY KEY,
            window_start BIGINT NOT NULL, attempts INTEGER NOT NULL
        )');
    }
    private static function options():array {
        $key=trim((string)getenv('ARGUS_RESET_RESEND_KEY'));
        $from=trim((string)getenv('ARGUS_RESET_FROM_EMAIL'));
        $base=rtrim(trim((string)getenv('ARGUS_RESET_BASE_URL')),'/');
        $hmac=(string)(getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY'));
        $parts=parse_url($base);
        if(strlen($key)<15||strlen($hmac)<32||
           !filter_var($from,FILTER_VALIDATE_EMAIL)||
           !is_array($parts)||($parts['scheme']??'')!=='https'||
           empty($parts['host'])||!empty($parts['user'])||!empty($parts['pass'])||
           !empty($parts['query'])||!empty($parts['fragment'])||
           ($parts['path']??'')!==''&&($parts['path']??'')!=='/'||
           (isset($parts['port'])&&$parts['port']!==443))
            self::fail('Recuperação por e-mail ainda não configurada. Entre em contato com o suporte.',503);
        return [$key,$from,$base,$hmac];
    }
    /** An anonymous request must originate from the same site, not a third-party form. */
    private static function origin(string $base):void {
        $origin=trim((string)($_SERVER['HTTP_ORIGIN']??''));
        if($origin!==''&&$origin!==$base)self::fail('Origem de acesso não autorizada',403);
        $site=strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE']??''));
        if($site!==''&&!in_array($site,['same-origin','none'],true))
            self::fail('Origem de acesso não autorizada',403);
    }
    /**
     * One fixed-size anonymous rate key per requested address and per remote IP.
     * No address or IP is stored in the limits table. Concurrent duplicate
     * inserts are denied instead of granting more requests.
     */
    private static function permit(Database $db,string $key,int $limit,int $seconds):bool {
        $now=time();
        try {
            return $db->transaction(static function(Database $db)use($key,$limit,$seconds,$now):bool {
                $lock=$db->driver()==='sqlite'?'':' FOR UPDATE';
                $row=$db->one('SELECT window_start,attempts FROM argus_portal_reset_limits WHERE key_digest=?'.$lock,[$key]);
                if(!$row){
                    $db->run('INSERT INTO argus_portal_reset_limits(key_digest,window_start,attempts) VALUES(?,?,1)',[$key,$now]);
                    return true;
                }
                $count=$now-(int)$row['window_start']>=$seconds?0:(int)$row['attempts'];
                if($count>=$limit)return false;
                $start=$count===0?$now:(int)$row['window_start'];
                $db->run('UPDATE argus_portal_reset_limits SET window_start=?,attempts=? WHERE key_digest=?',
                    [$start,$count+1,$key]);
                return true;
            });
        }catch(\PDOException){return false;}
    }
    private static function sendMail(string $key,string $from,string $to,string $link):bool{
        if(!function_exists('curl_init'))return false;
        $body=[
            'from'=>'ARGUS Payments <'.$from.'>','to'=>[$to],
            'subject'=>'Redefinição de senha — ARGUS Payments',
            'text'=>"Recebemos uma solicitação para redefinir sua senha de revendedor.\n\n".
                "Abra o link: ".$link."\n\n".
                "O link expira em 20 minutos e pode ser usado apenas uma vez.\n".
                "Se não foi você, ignore esta mensagem.\n\nEquipe ARGUS Payments"
        ];
        $curl=curl_init('https://api.resend.com/emails');
        if($curl===false)return false;
        curl_setopt_array($curl,[
            CURLOPT_POST=>true,
            CURLOPT_POSTFIELDS=>json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$key,'Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,
            CURLOPT_TIMEOUT=>12,CURLOPT_CONNECTTIMEOUT=>5,
            CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2
        ]);
        $response=curl_exec($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);
        curl_close($curl);
        return is_string($response)&&$status>=200&&$status<300;
    }
    public static function request(Database $db,array $data):array {
        self::install($db);
        [$key,$from,$base,$hmac]=self::options();
        self::origin($base);
        $email=$data['email']??null;
        if(!is_string($email)||strlen($email)>190||
           !filter_var($email=strtolower(trim($email)),FILTER_VALIDATE_EMAIL))
           self::fail('Informe um e-mail válido',422);
        $originIP=(string)($_SERVER['REMOTE_ADDR']??'unknown');
        $ipKey=hash_hmac('sha256','ip:'.$originIP,$hmac);
        $emailKey=hash_hmac('sha256','email:'.$email,$hmac);
        if(!self::permit($db,$ipKey,20,3600)||!self::permit($db,$emailKey,1,90))
            return ['ok'=>true,'message'=>self::GENERIC];
        $account=$db->one('SELECT id,email FROM argus_portal_accounts WHERE email=?',[$email]);
        if(!$account)return ['ok'=>true,'message'=>self::GENERIC];
        $plain=bin2hex(random_bytes(32));
        $id=bin2hex(random_bytes(16));$now=time();
        $db->run('INSERT INTO argus_portal_password_resets(id,account_id,token_hash,created_at,expires_at,used_at)
            VALUES(?,?,?,?,?,NULL)',[$id,$account['id'],hash('sha256',$plain),$now,$now+self::EXPIRE_SECONDS]);
        $link=$base.'/conta#redefinir='.$plain;
        try{$sent=self::sendMail($key,$from,(string)$account['email'],$link);}
        catch(\Throwable){$sent=false;}
        if($sent){
            $db->run('UPDATE argus_portal_password_resets SET used_at=? WHERE account_id=? AND id<>? AND used_at IS NULL',
                [$now,$account['id'],$id]);
        }else{
            $db->run('DELETE FROM argus_portal_password_resets WHERE id=?',[$id]);
            error_log('ARGUS password reset email delivery failed (credentials or email provider); no account details logged');
        }
        return ['ok'=>true,'message'=>self::GENERIC];
    }
    public static function redeem(Database $db,string $token,string $password):void {
        self::install($db);
        if(!preg_match('/^[a-f0-9]{64}$/D',$token))
            self::fail('Link inválido ou expirado. Solicite outro.',422);
        if(strlen($password)<14||strlen($password)>200||
           !preg_match('/[A-Z]/',$password)||!preg_match('/[a-z]/',$password)||!preg_match('/[0-9]/',$password))
            self::fail('A senha precisa de 14 caracteres, letras maiúsculas, minúsculas e números.',422);
        $tokenHash=hash('sha256',$token);
        $db->transaction(static function(Database $db)use($tokenHash,$password):void{
            $lock=$db->driver()==='sqlite'?'':' FOR UPDATE';
            $row=$db->one('SELECT account_id,expires_at,used_at FROM argus_portal_password_resets WHERE token_hash=?'.$lock,[$tokenHash]);
            if(!$row||$row['used_at']!==null||(int)$row['expires_at']<=time())
                self::fail('Link inválido ou expirado. Solicite outro.',422);
            $account=$db->one('SELECT id,password_hash FROM argus_portal_accounts WHERE id=?',[$row['account_id']]);
            if(!$account)self::fail('Link inválido ou expirado. Solicite outro.',422);
            if(password_verify($password,(string)$account['password_hash']))
                self::fail('Escolha uma senha diferente da anterior.',422);
            $hash=password_hash($password,PASSWORD_DEFAULT);
            if(!is_string($hash))self::fail('Não foi possível atualizar sua senha',503);
            $db->run('UPDATE argus_portal_accounts
                SET password_hash=?,failed_attempts=0,locked_until=0,updated_at=? WHERE id=?',
                [$hash,Database::stamp(),$account['id']]);
            $db->run('DELETE FROM argus_portal_sessions WHERE account_id=?',[$account['id']]);
            $db->run('UPDATE argus_portal_password_resets SET used_at=? WHERE account_id=? AND used_at IS NULL',
                [time(),$account['id']]);
            // Issued financial API keys are separate credentials and remain
            // unchanged; the seller should review them after a recovery.
        });
    }
    public static function handle(Database $db,string $method,string $path):never{
        if($method!=='POST')self::fail('Método não permitido',405);
        if($path==='/api/portal/password-reset/request'){
            self::out(self::request($db,self::json()));
        }
        if($path==='/api/portal/password-reset/confirm'){
            $data=self::json();
            $token=$data['token']??null;$password=$data['password']??null;
            if(!is_string($token)||!is_string($password))
                self::fail('Token e senha obrigatórios',422);
            self::redeem($db,$token,$password);
            self::out(['ok'=>true,'message'=>'Senha redefinida com segurança. Entre novamente com a nova senha.']);
        }
        self::fail('Rota não encontrada',404);
    }
}
