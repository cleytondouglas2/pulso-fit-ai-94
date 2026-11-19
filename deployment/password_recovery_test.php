<?php
declare(strict_types=1);
/** Offline password recovery; no outgoing email, no financial operations. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\PortalPasswordReset as Recovery;
use ArgusPayments\ApiError;
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);Recovery::install($db);
$a=bin2hex(random_bytes(16));$b=bin2hex(random_bytes(16));
$old='OldPassword12345';$new='NewPassword8675309';
foreach([[$a,'test-a-'.substr($a,0,12).'@example.invalid'],[$b,'test-b-'.substr($b,0,12).'@example.invalid']] as [$id,$email]){
 $db->run('INSERT INTO argus_portal_accounts(id,account_type,display_name,email,document_digest,document_last4,
    password_hash,status,merchant_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
    $id,'PF','Cliente de Teste',$email,hash('sha256','document'.$id),'1234',
    password_hash($old,PASSWORD_DEFAULT),'documents_required',null,DB::stamp(),DB::stamp()]);
 $db->run('INSERT INTO argus_portal_sessions(token_hash,account_id,csrf_hash,expires_at,created_at)
    VALUES(?,?,?,?,?)',[hash('sha256','session'.$id),$id,hash('sha256','csrf'.$id),time()+1800,DB::stamp()]);
}
$token=bin2hex(random_bytes(32));$token2=bin2hex(random_bytes(32));
foreach([[$token,time()+1200],[$token2,time()+1200]] as [$value,$expires]){
  $db->run('INSERT INTO argus_portal_password_resets(id,account_id,token_hash,created_at,expires_at,used_at)
    VALUES(?,?,?,?,?,NULL)',[bin2hex(random_bytes(16)),$a,hash('sha256',$value),time(),$expires]);
}
$invalid=static function(callable $fn,int $code) : void{
 try{$fn();throw new RuntimeException('Unsafe reset unexpectedly accepted');}
 catch(ApiError $e){if($e->status!==$code)throw new RuntimeException('Unexpected reset error code '.$e->status);}
};
$invalid(static fn()=>Recovery::redeem($db,'not-a-token',$new),422);
$invalid(static fn()=>Recovery::redeem($db,$token,'short1A'),422);
$invalid(static fn()=>Recovery::redeem($db,$token,$old),422);
if(!$db->one('SELECT id FROM argus_portal_sessions WHERE account_id=?',[$a]))
 throw new RuntimeException('Invalid attempt revoked valid session');
Recovery::redeem($db,$token,$new);
$accA=$db->one('SELECT password_hash,failed_attempts,locked_until,status FROM argus_portal_accounts WHERE id=?',[$a]);
$accB=$db->one('SELECT password_hash FROM argus_portal_accounts WHERE id=?',[$b]);
if(!password_verify($new,$accA['password_hash'])||password_verify($old,$accA['password_hash']))
 throw new RuntimeException('New password was not hashed and stored correctly');
if(!password_verify($old,$accB['password_hash']))
 throw new RuntimeException('Other seller credentials were modified');
if($db->one('SELECT token_hash FROM argus_portal_sessions WHERE account_id=?',[$a])||
   !$db->one('SELECT token_hash FROM argus_portal_sessions WHERE account_id=?',[$b]))
 throw new RuntimeException('Session invalidation was not isolated');
if((int)$db->one('SELECT COUNT(*) AS total FROM argus_portal_password_resets WHERE account_id=? AND used_at IS NULL',[$a])['total']!==0)
 throw new RuntimeException('Multiple password recovery links remained valid');
$invalid(static fn()=>Recovery::redeem($db,$token,$old.'Different'),422);
$invalid(static fn()=>Recovery::redeem($db,$token2,$old.'Different'),422);
$expired=bin2hex(random_bytes(32));
$db->run('INSERT INTO argus_portal_password_resets(id,account_id,token_hash,created_at,expires_at,used_at)
    VALUES(?,?,?,?,?,NULL)',[bin2hex(random_bytes(16)),$a,hash('sha256',$expired),time()-900,time()-1]);
$invalid(static fn()=>Recovery::redeem($db,$expired,$old.'Different'),422);
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$portal=(string)file_get_contents('/var/www/html/src/Portal.php');
$html=(string)file_get_contents('/var/www/html/public/static/client.html');
$script=(string)file_get_contents('/var/www/html/public/static/reseller-password-recovery.js');
$style=(string)file_get_contents('/var/www/html/public/static/reseller-password-recovery.css');
foreach([
 "require_once __DIR__ . '/PortalPasswordReset.php';",
] as $needle)if(!str_contains($gateway,$needle))throw new RuntimeException('Reset class not loaded by gateway');
foreach([
 "'/api/portal/password-reset/'",
 'PortalPasswordReset::handle($db,$method,$path)',
 "if(\$method==='POST'&&\$path==='/api/portal/register')"
] as $needle)if(!str_contains($portal,$needle))throw new RuntimeException('Recovery route missing: '.$needle);
foreach([
 'id="auth" hidden','id="register-form"','id="login-form"','id="dashboard" hidden',
 'reseller-password-recovery.js?v=reset-20261119-1',
 'reseller-password-recovery.css?v=reset-20261119-1'
] as $needle)if(!str_contains($html,$needle))throw new RuntimeException('Seller login or recovery asset missing: '.$needle);
foreach([
 'Esqueci minha senha','argus-recovery-request','argus-recovery-confirm',
 'password-reset/request','password-reset/confirm','history.replaceState','redefinir='
] as $needle)if(!str_contains($script,$needle))throw new RuntimeException('Seller recovery flow missing: '.$needle);
if(!str_contains($style,'#argus-password-recovery')||!str_contains($style,'@media(max-width:480px)'))
 throw new RuntimeException('Mobile password reset modal is not installed');
if(!str_contains((string)file_get_contents('/var/www/html/src/PortalPasswordReset.php'),'ARGUS_RESET_RESEND_KEY'))
 throw new RuntimeException('Verified email service dependency absent');
echo "PASS: one-time hashed reset, strong password policy, expired/replayed token rejection, session revocation, seller isolation and account-form integration.\n";
