<?php
declare(strict_types=1);
namespace ArgusPayments;

/** TOTP (RFC 6238) step-up for portal withdrawals and new payout API keys.
 * No external verification service; encrypted seed; 6-digit codes, 30-second window.
 */
final class SellerMfa {
  private static function fail(string $msg,int $code=403):never{throw new ApiError($msg,$code);}
  public static function install(Database $db):void {
    $db->pdo()->exec('CREATE TABLE IF NOT EXISTS argus_seller_mfa (
      account_id VARCHAR(64) PRIMARY KEY, secret_sealed TEXT NOT NULL,
      enabled_at BIGINT NULL, pending_until BIGINT NOT NULL,
      last_step BIGINT NOT NULL DEFAULT -1, created_at BIGINT NOT NULL)');
  }
  private static function key():string {
    $secret=(string)(getenv('ARGUS_SECURITY_RATE_SECRET')?:getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY')?:'');
    if(strlen($secret)<32||!function_exists('sodium_crypto_secretbox')||!function_exists('hash_hkdf'))
      self::fail('Proteção do autenticador indisponível; tente novamente',503);
    return hash_hkdf('sha256',$secret,SODIUM_CRYPTO_SECRETBOX_KEYBYTES,'argus-seller-totp-v1');
  }
  private static function seal(string $raw):string {
    $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return base64_encode($nonce.sodium_crypto_secretbox($raw,$nonce,self::key()));
  }
  private static function open(string $v):string {
    $bin=base64_decode($v,true);
    if(!is_string($bin)||strlen($bin)<SODIUM_CRYPTO_SECRETBOX_NONCEBYTES+16)
      self::fail('Configuração do autenticador inválida; consulte o suporte',503);
    $raw=sodium_crypto_secretbox_open(substr($bin,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
      substr($bin,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),self::key());
    if(!is_string($raw)||strlen($raw)!==20)self::fail('Autenticador indisponível; consulte o suporte',503);
    return $raw;
  }
  private static function base32(string $bytes):string {
    $chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$out='';$buff=0;$bits=0;
    foreach(unpack('C*',$bytes) as $v){
      $buff=($buff<<8)|$v;$bits+=8;
      while($bits>=5){$bits-=5;$out.=$chars[($buff>>$bits)&31];}
      $buff&=(1<<$bits)-1;
    }
    return $bits>0?$out.$chars[($buff<<(5-$bits))&31]:$out;
  }
  private static function totp(string $raw,int $step):string {
    $digest=hash_hmac('sha1',pack('N2',intdiv($step,4294967296),$step%4294967296),$raw,true);
    $offset=ord($digest[19])&15;
    $digits=(unpack('N',substr($digest,$offset,4))[1]&0x7fffffff)%1000000;
    return str_pad((string)$digits,6,'0',STR_PAD_LEFT);
  }
  private static function step(string $raw,string $code,int $last):?int {
    if(!preg_match('/^[0-9]{6}$/D',$code))return null;
    $now=intdiv(time(),30);
    foreach([$now,$now-1,$now+1] as $i)
      if($i>$last&&hash_equals(self::totp($raw,$i),$code))return $i;
    return null;
  }
  public static function status(Database $db,string $id):array {
    self::install($db);
    $row=$db->one('SELECT enabled_at,pending_until FROM argus_seller_mfa WHERE account_id=?',[$id]);
    return ['enabled'=>$row!==null&&$row['enabled_at']!==null,
      'pending'=>$row!==null&&$row['enabled_at']===null&&(int)$row['pending_until']>time(),
      'withdrawal_mfa_required'=>true];
  }
  /** Password-based setup; never creates a second active seed silently. */
  public static function setup(Database $db,array $account,string $password):array {
    self::install($db);
    SecurityShield::rate($db,'mfa_setup',(string)$account['id'],5,900);
    if($password===''||!password_verify($password,(string)$account['password_hash']))
      self::fail('Senha atual incorreta',403);
    $secret=random_bytes(20);$sealed=self::seal($secret);$now=time();$id=(string)$account['id'];
    $db->transaction(static function(Database $db)use($id,$sealed,$now){
      $sql='SELECT enabled_at FROM argus_seller_mfa WHERE account_id=?';
      if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
      $row=$db->one($sql,[$id]);
      if($row&&$row['enabled_at']!==null)self::fail('Autenticador já habilitado. Alterações exigem verificação pelo suporte.',409);
      if($row)$db->run('UPDATE argus_seller_mfa SET secret_sealed=?,pending_until=?,last_step=-1 WHERE account_id=?',[$sealed,$now+600,$id]);
      else $db->run('INSERT INTO argus_seller_mfa(account_id,secret_sealed,enabled_at,pending_until,last_step,created_at)
        VALUES(?,?,NULL,?,-1,?)',[$id,$sealed,$now+600,$now]);
    });
    $value=self::base32($secret);
    return ['secret'=>$value,'expires_in'=>600,
      'otpauth'=>'otpauth://totp/'.rawurlencode('ARGUS Pay:'.$account['email']).
        '?secret='.$value.'&issuer=ARGUS%20Pay&digits=6&period=30'];
  }
  public static function enable(Database $db,array $account,string $code):void {
    self::install($db);$id=(string)$account['id'];
    SecurityShield::rate($db,'mfa_enable',$id,10,600);
    $db->transaction(static function(Database $db)use($id,$code){
      $sql='SELECT * FROM argus_seller_mfa WHERE account_id=?';
      if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
      $row=$db->one($sql,[$id]);
      if(!$row||$row['enabled_at']!==null||(int)$row['pending_until']<=time())
        self::fail('Configuração expirada ou já ativada. Inicie novamente.',409);
      $step=self::step(self::open((string)$row['secret_sealed']),$code,-1);
      if($step===null)self::fail('Código incorreto. Confira o relógio do celular.',422);
      $db->run('UPDATE argus_seller_mfa SET enabled_at=?,pending_until=0,last_step=? WHERE account_id=? AND enabled_at IS NULL',
        [time(),$step,$id]);
    });
  }
  /** Single use per 30s step, guarded by DB row lock. */
  public static function requireCode(Database $db,array $account,array $input):void {
    self::install($db);$id=(string)$account['id'];
    SecurityShield::rate($db,'mfa_finance',$id,12,600);
    $code=$input['mfa_code']??null;
    if(!is_string($code)||!preg_match('/^[0-9]{6}$/D',$code))
      self::fail('Configure o autenticador em Saldo e saques e informe um código de seis dígitos',403);
    $db->transaction(static function(Database $db)use($id,$code){
      $sql='SELECT enabled_at,secret_sealed,last_step FROM argus_seller_mfa WHERE account_id=?';
      if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
      $r=$db->one($sql,[$id]);
      if(!$r||$r['enabled_at']===null)
        self::fail('Ative o autenticador em Saldo e saques antes de realizar esta operação',403);
      $step=self::step(self::open((string)$r['secret_sealed']),$code,(int)$r['last_step']);
      if($step===null)self::fail('Código inválido ou já utilizado. Utilize um código novo.',403);
      $updated=$db->run('UPDATE argus_seller_mfa SET last_step=? WHERE account_id=? AND last_step=?',
        [$step,$id,$r['last_step']]);
      if($updated->rowCount()!==1)self::fail('Código já utilizado',409);
    });
  }
  public static function handle(Database $db,string $method,string $path,array $account):never {
    if($method==='GET'&&$path==='/api/portal/security/mfa/status')self::out(self::status($db,(string)$account['id']));
    if($method!=='POST')self::fail('Método não autorizado',405);
    $raw=file_get_contents('php://input',false,null,0,2049);
    if(!is_string($raw)||strlen($raw)>2048)self::fail('Dados inválidos',413);
    try{$body=json_decode($raw,true,8,JSON_THROW_ON_ERROR);}
    catch(\Throwable){self::fail('JSON inválido',422);}
    if(!is_array($body))self::fail('Dados inválidos',422);
    if($path==='/api/portal/security/mfa/setup'){
      $pass=$body['password']??null;
      if(!is_string($pass)||strlen($pass)>200)self::fail('Senha atual obrigatória',422);
      self::out(self::setup($db,$account,$pass));
    }
    if($path==='/api/portal/security/mfa/enable'){
      $code=$body['code']??null;
      if(!is_string($code))self::fail('Código obrigatório',422);
      self::enable($db,$account,$code);
      self::out(['ok'=>true,'enabled'=>true]);
    }
    self::fail('Rota não encontrada',404);
  }
  private static function out(array $value):never{
    http_response_code(200);header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;
  }
}
