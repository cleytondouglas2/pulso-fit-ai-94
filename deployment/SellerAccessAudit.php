<?php
declare(strict_types=1);
namespace ArgusPayments;

/** Privacy-safe successful-login audit and unusual device/network notices.
 * No raw IP, UA or device ID in persistent storage or response. Alert delivery
 * never blocks authentication. Not an authentication factor or geo-IP verdict.
 */
final class SellerAccessAudit {
    private static function key():?string {
      $v=(string)(getenv('ARGUS_SECURITY_RATE_SECRET')?:getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY')?:'');
      return strlen($v)>=32?$v:null;
    }
    private static function digest(string $what,string $account):string {
      return hash_hmac('sha256',$account."\n".$what,(string)self::key());
    }
    public static function install(Database $db):void {
      $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_seller_access_events(
        id VARCHAR(32) PRIMARY KEY,
        account_id VARCHAR(64) NOT NULL,
        device_digest VARCHAR(64) NOT NULL,
        network_digest VARCHAR(64) NOT NULL,
        is_new_device INTEGER NOT NULL DEFAULT 0,
        is_new_network INTEGER NOT NULL DEFAULT 0,
        email_sent INTEGER NOT NULL DEFAULT 0,
        occurred_at BIGINT NOT NULL
      )");
      if($db->driver()==='mysql'){
        $existing=$db->one("SELECT INDEX_NAME AS name FROM information_schema.statistics
          WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='argus_seller_access_events'
            AND INDEX_NAME='argus_seller_access_account_idx' LIMIT 1");
        if(!$existing)$db->pdo()->exec('CREATE INDEX argus_seller_access_account_idx
          ON argus_seller_access_events(account_id,occurred_at)');
      }else{
        $db->pdo()->exec('CREATE INDEX IF NOT EXISTS argus_seller_access_account_idx
          ON argus_seller_access_events(account_id,occurred_at)');
      }
    }
    public static function record(Database $db,array $account):?string {
      $secret=self::key();
      if($secret===null)return null; // Logging unavailable; never bypass other auth guards.
      try{
        self::install($db);
        $id=(string)$account['id'];
        $ua=substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,350);
        $ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
        $device=self::digest('browser:'.$ua,$id);
        $network=self::digest('network:'.$ip,$id);
        $had=$db->one('SELECT id FROM argus_seller_access_events WHERE account_id=? ORDER BY occurred_at DESC LIMIT 1',[$id]);
        $knownDevice=$db->one('SELECT id FROM argus_seller_access_events WHERE account_id=? AND device_digest=? LIMIT 1',[$id,$device]);
        $knownNetwork=$db->one('SELECT id FROM argus_seller_access_events WHERE account_id=? AND network_digest=? LIMIT 1',[$id,$network]);
        $newDevice=$had!==null&&$knownDevice===null;
        $newNetwork=$had!==null&&$knownNetwork===null;
        $notify=$newDevice||$newNetwork;
        $now=time();
        $db->run('INSERT INTO argus_seller_access_events
          (id,account_id,device_digest,network_digest,is_new_device,is_new_network,email_sent,occurred_at)
          VALUES(?,?,?,?,?,?,0,?)',[
          bin2hex(random_bytes(16)),$id,$device,$network,$newDevice?1:0,$newNetwork?1:0,$now
        ]);
        if($notify){
          $recent=$db->one('SELECT COUNT(*) AS n FROM argus_seller_access_events WHERE account_id=?
            AND email_sent=1 AND occurred_at>?',[$id,$now-3600]);
          if((int)($recent['n']??0)<3 && self::sendAlert((string)$account['email'])){
            $db->run('UPDATE argus_seller_access_events SET email_sent=1
              WHERE account_id=? AND device_digest=? AND network_digest=? AND occurred_at=?',[$id,$device,$network,$now]);
          }
        }
        // Opportunistic cleanup: keep forensic trail for 90 days only.
        if(random_int(1,100)===1)try{
          $db->run('DELETE FROM argus_seller_access_events WHERE occurred_at<?',[$now-90*86400]);
        }catch(\Throwable){}
        return $notify?'Detectamos acesso por novo navegador ou rede. Confira seus acessos na seção Perfil e documentos.':null;
      }catch(\Throwable $e){
        error_log('ARGUS access audit degraded: '.get_class($e));
        return null;
      }
    }
    private static function sendAlert(string $email):bool {
      $key=trim((string)getenv('ARGUS_RESET_RESEND_KEY'));
      $from=trim((string)getenv('ARGUS_RESET_FROM_EMAIL'));
      if(strlen($key)<15||!filter_var($from,FILTER_VALIDATE_EMAIL)||
        !filter_var($email,FILTER_VALIDATE_EMAIL)||!function_exists('curl_init'))return false;
      $payload=json_encode([
        'from'=>$from,'to'=>[$email],'subject'=>'ArgusPay | Novo acesso à conta',
        'html'=>'<div style="background:#171b24;color:#f9ddb0;font:16px Arial;padding:24px">
          <h2>Novo acesso à sua conta ArgusPay</h2>
          <p>Um navegador ou rede diferente foi detectado após uma autenticação válida.</p>
          <p>Se não foi você, acesse o painel diretamente pelo endereço oficial, altere sua senha e revogue credenciais financeiras desconhecidas.</p>
          <a href="https://app.arguspay.com.br/conta" style="color:#f2c284">Abrir ArgusPay</a>
          </div>'
      ],JSON_THROW_ON_ERROR);
      $ch=curl_init('https://api.resend.com/emails');
      if($ch===false)return false;
      curl_setopt_array($ch,[
        CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$payload,
        CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$key,'Content-Type: application/json'],
        CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_TIMEOUT=>4,CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_FOLLOWLOCATION=>false
      ]);
      try{$reply=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);}
      finally{curl_close($ch);}
      return is_string($reply)&&$status>=200&&$status<300;
    }
    public static function activity(Database $db,string $accountId):array {
      self::install($db);
      $rows=$db->all('SELECT occurred_at,is_new_device,is_new_network,email_sent
        FROM argus_seller_access_events WHERE account_id=? ORDER BY occurred_at DESC LIMIT 12',[$accountId]);
      return ['events'=>array_map(static fn(array $r)=>[
        'date'=>gmdate('c',(int)$r['occurred_at']),
        'unusual'=>((int)$r['is_new_device']===1||(int)$r['is_new_network']===1),
        'email_sent'=>(int)$r['email_sent']===1
      ],$rows)];
    }
    public static function respond(Database $db,array $account):never {
      header('Content-Type: application/json; charset=utf-8');
      header('Cache-Control: no-store, private');
      echo json_encode(self::activity($db,(string)$account['id']),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
      exit;
    }
}
