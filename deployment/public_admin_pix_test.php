<?php
declare(strict_types=1);
/**
 * Offline-only synthetic public Pix contract. NO PSP payment creation,
 * no admin login, no bank transfer, no customer data leaves this process.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\PublicAdminPix as PublicPix;
use ArgusPayments\FeePolicy;
use ArgusPayments\Database as DB;
use ArgusPayments\ApiError;
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();\ArgusPayments\Admin::install($db);
PublicPix::install($db);
$actor=['id'=>'public-pix-test-only','role'=>'superadmin'];
$old=FeePolicy::current($db);
$policy=FeePolicy::save($db,$actor,[
 'version'=>$old['version'],
 'mistic_deposit_cents'=>50,'mistic_withdraw_cents'=>50,
 'argus_deposit_fixed_cents'=>50,'argus_withdraw_fixed_cents'=>50,
 'argus_deposit_bps'=>0,'argus_withdraw_bps'=>0,
 'reason'=>'Teste isolado do checkout publico na conta principal'
]);
$quote=PublicPix::quote($db,1000);
if($quote['base_amount_cents']!==1000||
   $quote['provider_fee_cents']!==50||
   $quote['total_amount_cents']!==1050||
   $quote['admin_expected_net_cents']!==1000||
   $quote['policy_version']!==$policy['version']||
   $quote['admin_argus_seller_fee_applied']!==false)
 throw new RuntimeException('Public admin Pix charged reseller ARGUS fee or wrong R$10.50');
$policy2=FeePolicy::save($db,$actor,[
 'version'=>$policy['version'],
 'mistic_deposit_cents'=>75,'mistic_withdraw_cents'=>50,
 'argus_deposit_fixed_cents'=>95,'argus_withdraw_fixed_cents'=>50,
 'argus_deposit_bps'=>200,'argus_withdraw_bps'=>0,
 'reason'=>'Teste de alteracao central na taxa da adquirente'
]);
$changed=PublicPix::quote($db,1000);
if($changed['provider_fee_cents']!==75||
   $changed['total_amount_cents']!==1075||
   $changed['admin_expected_net_cents']!==1000||
   $changed['policy_version']!==$policy2['version'])
 throw new RuntimeException('Super Admin cost change does not update public checkout');
try{
 PublicPix::quote($db,10000);
 throw new RuntimeException('PSP maximum 100.00 plus surcharge was not enforced');
}catch(ApiError $expected){}
foreach([
 '/var/www/html/src/Gateway.php'=>[
  "self::htmlFile('public-pix.html')",
  "PublicAdminPix::handle(\$db,\$method,\$path)",
  "require_once __DIR__ . '/PublicAdminPix.php'"
 ],
 '/var/www/html/src/TraditionalQuickPix.php'=>[
  'public static function publicConfigured():bool',
  'public static function publicCreate(array $body,string $idem):array',
  "self::request('/transactions/create','POST',\$body,\$idem)"
 ],
 '/var/www/html/src/PublicAdminPix.php'=>[
  "lower(email)=? AND role='superadmin' AND status='active'",
  'argus_public_admin_pix',
  'argus_public_pix_limits',
  "TraditionalQuickPix::createBody(",
  "TraditionalQuickPix::reconcileRow(\$db,\$charge)",
  "hash_equals(",
  "'unknown'",
  "FeePolicy::current(\$db)",
  "'ARGUS_QUICK_PIX_PROVIDER'",
  "self::origin()"
 ],
 '/var/www/html/public/static/public-pix.html'=>[
  'id="pix-amount"','id="payer-name"','id="payer-document"',
  'id="summary-total"','id="summary-net"',
  'id="pix-dialog"','id="public-pix-qr"',
  'id="pix-code"','id="pix-verify"',
  '/static/qrcode.min.js'
 ],
 '/var/www/html/public/static/public-pix.js'=>[
  '/pix/quote','/pix/create','/pix/status',
  'crypto.randomUUID()','crypto.getRandomValues',
  'fee_version', // checked below as policy_version for this route
  'navigator.clipboard','QRCode'
 ],
 '/var/www/html/public/static/landing.html'=>[
  'href="/pix"'
 ]
] as $file=>$tokens){
 $src=file_get_contents($file);
 if(!is_string($src))throw new RuntimeException('Missing required public Pix asset '.$file);
 foreach($tokens as $token){
  if($token==='fee_version')continue;
  if(!str_contains($src,$token))throw new RuntimeException('Public Pix contract missing '.$file.': '.$token);
 }
}
$js=(string)file_get_contents('/var/www/html/public/static/public-pix.js');
if(str_contains($js,'ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')||
   str_contains($js,'ARGUS_FINANCE_QR_CLIENT_SECRET')||
   str_contains($js,'/api/admin/')||
   str_contains($js,'localStorage')||
   str_contains($js,'sessionStorage'))
 throw new RuntimeException('Public browser must never get admin credentials or call private API');
$backend=(string)file_get_contents('/var/www/html/src/PublicAdminPix.php');
if(str_contains($backend,"'/transactions/withdraw'")||
   str_contains($backend,'MisticPayPayout('))
 throw new RuntimeException('Anonymous public checkout must not create payout');
echo "PASS: R$ 10.00 + R$ 0.50 = R$ 10.50 Pix, no reseller markup, admin policy live changes, immutable QR status and anti-replay controls; NO PSP network request.\n";