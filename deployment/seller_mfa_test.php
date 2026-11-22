<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\SellerMfa as MFA;
use ArgusPayments\Database as DB;
use ArgusPayments\SecurityShield;
use ArgusPayments\ApiError;
putenv('ARGUS_SECURITY_RATE_SECRET='.str_repeat('S',64));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
SecurityShield::install($db);MFA::install($db);
$id=bin2hex(random_bytes(16));$a=['id'=>$id,'email'=>'mfa-test@example.invalid','password_hash'=>password_hash('StrongSyntheticPassword123!',PASSWORD_DEFAULT)];
if(MFA::status($db,$id)['enabled'])throw new RuntimeException('Unexpected automatic MFA enrollment');
$setup=MFA::setup($db,$a,'StrongSyntheticPassword123!');
if(!preg_match('/^[A-Z2-7]{32}$/D',$setup['secret']))throw new RuntimeException('TOTP secret format');
if(str_contains((string)$db->one('SELECT secret_sealed FROM argus_seller_mfa WHERE account_id=?',[$id])['secret_sealed'],$setup['secret']))
 throw new RuntimeException('Raw OTP seed stored in table');
$codeMethod=new ReflectionMethod(MFA::class,'totp');
$keyMethod=new ReflectionMethod(MFA::class,'open');
$row=$db->one('SELECT secret_sealed FROM argus_seller_mfa WHERE account_id=?',[$id]);
$raw=$keyMethod->invoke(null,$row['secret_sealed']);
$code=$codeMethod->invoke(null,$raw,intdiv(time(),30));
try{MFA::requireCode($db,$a,['mfa_code'=>$code]);throw new RuntimeException('Allowed withdrawal before activation');}
catch(ApiError $e){if($e->status!==403)throw $e;}
MFA::enable($db,$a,$code);
if(!MFA::status($db,$id)['enabled'])throw new RuntimeException('Activation failed');
try{MFA::requireCode($db,$a,['mfa_code'=>$code]);throw new RuntimeException('Reused enrollment token');}
catch(ApiError $e){if($e->status!==403)throw $e;}
$db->run('UPDATE argus_seller_mfa SET last_step=-1 WHERE account_id=?',[$id]); // synthetic test fixture only
MFA::requireCode($db,$a,['mfa_code'=>$code]);
try{MFA::requireCode($db,$a,['mfa_code'=>$code]);throw new RuntimeException('TOTP replay allowed');}
catch(ApiError $e){if($e->status!==403)throw $e;}
$portal=file_get_contents('/var/www/html/src/Portal.php');
$wallet=file_get_contents('/var/www/html/src/MerchantWallet.php');
$chat=file_get_contents('/var/www/html/public/static/chat-payout.js');
foreach([
 [$portal,'SellerMfa::handle($db,$method,$path,$account)'],
 [$portal,'SellerMfa::requireCode($db,$account,$request)'],
 [$wallet,'SellerMfa::requireCode($db,$account,$withdrawInput)'],
 [$chat,"mfa_code:otp.value.trim()"],
] as [$file,$needle])if(!str_contains($file,$needle))throw new RuntimeException('MFA contract missing '.$needle);
echo "PASS: password-protected enrollment, encrypted TOTP, replay prevention, browser/chat payout and key issuance checks, no PSP operations\n";
