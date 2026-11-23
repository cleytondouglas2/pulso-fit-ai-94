<?php
declare(strict_types=1);
/**
 * Fully local synthetic reseller /e/{code} Pix regression.
 * NO network / PSP requests / real QR / real withdrawals.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\ResellerPublicPix as Checkout;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\SellerFeeSplit as Split;
use ArgusPayments\PlatformFeeTreasury as Treasury;
use ArgusPayments\FeePolicy;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio;
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);KycStudio::install($db);
Wallet::install($db);Split::install($db);Treasury::install($db);
Checkout::install($db);
$actor=['id'=>'public-reseller-synthetic-test','role'=>'superadmin'];
$current=FeePolicy::current($db);
$rates=FeePolicy::save($db,$actor,[
 'version'=>$current['version'],
 'mistic_deposit_cents'=>50,'mistic_withdraw_cents'=>50,
 'argus_deposit_fixed_cents'=>50,'argus_withdraw_fixed_cents'=>50,
 'argus_deposit_bps'=>0,'argus_withdraw_bps'=>0,
 'reason'=>'Offline seller public Pix: configured 50 + 50'
]);
$accounts=[];$merchants=[];
for($i=0;$i<2;$i++){
 $account=bin2hex(random_bytes(16));
 $merchant='mer_'.bin2hex(random_bytes(10));
 $email=$account.'@example.invalid';
 $db->run('INSERT INTO b2b_merchants
  (id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at)
  VALUES(?,?,?,?,?,?,?,?,?)',[
   $merchant,'Estabelecimento teste '.$i,substr($account,0,14),$email,$email,0,
   'approved_live',DB::stamp(),DB::stamp()
 ]);
 $db->run('INSERT INTO argus_portal_accounts
  (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
   $account,'PJ','Loja teste '.$i,$email,hash('sha256',$account),'0000','synthetic','approved',
   $merchant,DB::stamp(),DB::stamp()
 ]);
 $db->run('INSERT INTO argus_seller_wallets
  (account_id,merchant_id,available_cents,held_cents,debt_cents,updated_at)
  VALUES(?,?,?,?,?,?)',[$account,$merchant,0,0,0,DB::stamp()]);
 $accounts[]=$account;$merchants[]=$merchant;
}
$one=Checkout::linkForAccount($db,$accounts[0]);
$again=Checkout::linkForAccount($db,$accounts[0]);
$two=Checkout::linkForAccount($db,$accounts[1]);
if(!preg_match('/^[a-f0-9]{32}$/D',$one)||$one!==$again||$one===$two||
   $one===$accounts[0]||$one===$accounts[1])
 throw new RuntimeException('Two resellers need distinct, stable, unguessable public links');
$link=Checkout::myLink($db,[
 'id'=>$accounts[0],'display_name'=>'Loja teste 0','status'=>'approved',
 'merchant_id'=>$merchants[0]
]);
if($link['public_path']!=='/e/'.$one||$link['business_name']!=='Loja teste 0')
 throw new RuntimeException('Authenticated dashboard returned incorrect seller link');
$q=Checkout::quote($db,1000);
if($q['base_amount_cents']!==1000||$q['total_amount_cents']!==1100||
   $q['service_fee_cents']!==100||$q['seller_expected_net_cents']!==1000||
   $q['policy_version']!==$rates['version'])
 throw new RuntimeException('Public buyer R$10 must pay R$11 and credit R$10 net to seller');
$fee=Split::quote($db,'deposit',1100);
if($fee['argus_fee_cents']!==50||$fee['provider_fee_cents']!==50||
   $fee['net_cents']!==1000)
 throw new RuntimeException('R$1 seller fee was not split 50/50');
$charge='mwc_'.bin2hex(random_bytes(16));
$db->transaction(static function(DB $db)use($charge,$accounts,$merchants,$fee):void{
 $db->run('INSERT INTO argus_seller_charges
  (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,net_cents,
   description,provider_id,copy_paste,status,created_at,checked_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
  $charge,$accounts[0],$merchants[0],hash('sha256',$charge),hash('sha256','synthetic'),
  1100,100,1000,'Offline public Pix','tr_synthetic','offline QR only','pending',DB::stamp(),null
 ]);
 Split::reserve($db,'deposit',$charge,$accounts[0],$fee);
});
$apply=new ReflectionMethod(Wallet::class,'applyVerifiedStatus');
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$accounts[0]],'paid');
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$accounts[0]],'paid');
$w1=$db->one('SELECT available_cents FROM argus_seller_wallets WHERE account_id=?',[$accounts[0]]);
$w2=$db->one('SELECT available_cents FROM argus_seller_wallets WHERE account_id=?',[$accounts[1]]);
$journal=$db->one('SELECT amount_cents FROM argus_platform_fee_journal
 WHERE event_kind=? AND operation_id=?',['deposit_paid',$charge]);
if((int)$w1['available_cents']!==1000||(int)$w2['available_cents']!==0||
   (int)($journal['amount_cents']??-1)!==50)
 throw new RuntimeException('Reseller cross-credit, double credit or wrong ARGUS earning');
$updated=FeePolicy::save($db,$actor,[
 'version'=>$rates['version'],
 'mistic_deposit_cents'=>70,'mistic_withdraw_cents'=>50,
 'argus_deposit_fixed_cents'=>30,'argus_withdraw_fixed_cents'=>50,
 'argus_deposit_bps'=>0,'argus_withdraw_bps'=>0,
 'reason'=>'Offline seller public Pix fee-policy change'
]);
$newQuote=Checkout::quote($db,1000);
$prior=Split::get($db,'deposit',$charge);
if($newQuote['service_fee_cents']!==100||
   $newQuote['policy_version']!==$updated['version']||
   $prior['policy_version']===$updated['version']||
   $prior['provider_fee_cents']!==50||$prior['argus_fee_cents']!==50)
 throw new RuntimeException('Admin fee policy did not reprice new public Pix or revalued old receipt');
// Test percent rate on payer gross: must maintain base amount and display
// charged fee, not silently debit the seller with a surprise remainder.
$percent=FeePolicy::save($db,$actor,[
 'version'=>$updated['version'],
 'mistic_deposit_cents'=>70,'mistic_withdraw_cents'=>50,
 'argus_deposit_fixed_cents'=>30,'argus_withdraw_fixed_cents'=>50,
 'argus_deposit_bps'=>500,'argus_withdraw_bps'=>0,
 'reason'=>'Offline seller public Pix rate + percentage'
]);
$percentQuote=Checkout::quote($db,1000);
$percentage=Split::quote($db,'deposit',$percentQuote['total_amount_cents']);
if($percentQuote['service_fee_cents']!==$percentage['total_fee_cents']||
   $percentQuote['seller_expected_net_cents']!==$percentage['net_cents']||
   $percentage['net_cents']<1000||$percentQuote['policy_version']!==$percent['version'])
 throw new RuntimeException('Seller public Pix percentage fee must be quoted on actual gross');
$php=(string)file_get_contents('/var/www/html/src/ResellerPublicPix.php');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$portal=(string)file_get_contents('/var/www/html/src/Portal.php');
$worker=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$html=(string)file_get_contents('/var/www/html/public/static/reseller-public-pix.html');
$js=(string)file_get_contents('/var/www/html/public/static/reseller-public-pix.js');
$card=(string)file_get_contents('/var/www/html/public/static/reseller-public-link.js');
$index=(string)file_get_contents('/var/www/html/public/static/client.html');
foreach([
 'hash_equals(', 'receipt_hash', 'public_code', 'account_id',
 "MerchantWallet::create(\$db,\$account,\$dataForWallet,\$idemHash)",
 "MerchantWallet::reconcile(\$db,\$id,(string)\$account['id'])",
 'SecurityShield::rate(', 'browserOrigin()', "private static function accountReady(",
 'seedExisting(Database $db'
] as $needle)if(!str_contains($php,$needle))
 throw new RuntimeException('Public seller tenant or financial guard missing: '.$needle);
if(!str_contains($gateway,"self::htmlFile('reseller-public-pix.html')")||
   !str_contains($gateway,'ResellerPublicPix::handle($sellerCheckoutDb,$method,$path)'))
 throw new RuntimeException('Public /e/code gateway route missing');
if(!str_contains($portal,'ResellerPublicPix::linkForAccount($db,$id)')||
   !str_contains($portal,"'/api/portal/public-pix-link'"))
 throw new RuntimeException('New registrations or authenticated link endpoint missing');
if(!str_contains($worker,'ResellerPublicPix::seedExisting($db,100)')||
   !str_contains($worker,'$freshStale=gmdate(')||
   !str_contains($worker,'$claimed->rowCount()!==1'))
 throw new RuntimeException('Existing seller links or 30-minute server-side verification missing');
foreach([
 'id="reseller-public-business"','id="reseller-dialog-business"',
 'id="public-pix-qr"','id="pix-code-preview"','id="pix-copy"',
 'Taxa de serviço ARGUS Pay','Valor líquido previsto para o revendedor'
] as $needle)if(!str_contains($html,$needle))
 throw new RuntimeException('Missing reseller public checkout component: '.$needle);
foreach([
 'loadReseller().then(()=>price())','resellerBase','service_fee_cents',
 'seller_expected_net_cents','/quote?amount_cents=',
 "resellerBase+'/create'","resellerBase+'/status'"
] as $needle)if(!str_contains($js,$needle))
 throw new RuntimeException('Wrong reseller public checkout quote or recipient binding: '.$needle);
if(preg_match('/Mistic[\s_-]*Pay/i',$html.$js.$card))
 throw new RuntimeException('Acquirer name must never be shown on seller public pages');
if(!str_contains($index,'reseller-public-link.js?v=20261123-1')||
   !str_contains($card,"'/api/portal/public-pix-link'")||
   !str_contains($card,'Meu link público de Pix')||
   !str_contains($card,'argus-rpl-copy'))
 throw new RuntimeException('Reseller dashboard Pix CTA missing');
echo "PASS: two unique permanent /e/code seller pages, R$10+R$1=R$11 payer, R$10 isolated seller net, R$0.50 admin fee, live policy changes, percentage quote, 30min status worker, no public acquirer name, no real Pix.\n";
