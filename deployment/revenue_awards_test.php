<?php
declare(strict_types=1);
/** Synthetic, offline awards regression. No PSP calls, payouts or financial writes in production. */
$root='/var/www/html';
require_once $root.'/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\MerchantWallet;
use ArgusPayments\Portal;
use ArgusPayments\RevenueAwards;
$db=new Database(require $root.'/config.php');
$db->installAndSeed(); Portal::install($db); MerchantWallet::install($db);
RevenueAwards::install($db);
$id='awd_'.bin2hex(random_bytes(13));
$other='awd_'.bin2hex(random_bytes(13));
$now=(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
foreach([[$id,'Loja Prêmio Alfa'],[$other,'Loja Prêmio Beta']] as [$account,$name]){
 $db->run('INSERT INTO argus_portal_accounts(id,account_type,display_name,email,
  document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
  $account,'PJ',$name,$account.'@example.invalid',hash('sha256',$account),
  '0000','synthetic','approved',null,$now,$now
 ]);
}
$firstCharge='';
foreach([[$id,10000],[$id,9000],[$other,10000]] as [$account,$gross]){
 $charge='mwc_'.bin2hex(random_bytes(16));
 if($account===$id&&$gross===10000)$firstCharge=$charge;
 $db->run('INSERT INTO argus_seller_charges
  (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,
   service_fee_cents,net_cents,description,provider_id,copy_paste,status,created_at,checked_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
  $charge,$account,'synthetic',hash('sha256',$charge),hash('sha256','body_'.$charge),
  $gross,100,$gross-100,'Synthetic confirmed Pix','tr_synthetic',null,'paid',$now,null
 ]);
 $db->run('INSERT INTO argus_seller_ledger
  (id,account_id,operation_kind,operation_id,delta_available,delta_held,
    delta_debt,service_fee_cents,created_at)
  VALUES (?,?,?,?,?,?,?,?,?)',[
  'mwl_'.bin2hex(random_bytes(16)),$account,'deposit_paid',$charge,$gross-100,0,0,100,$now
 ]);
}
// A refund must reduce net sales, but not the original sale ticket average.
$db->run('INSERT INTO argus_seller_ledger
  (id,account_id,operation_kind,operation_id,delta_available,delta_held,
   delta_debt,service_fee_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[
  'mwl_'.bin2hex(random_bytes(16)),$id,'deposit_refund',$firstCharge,-9900,0,0,0,$now
]);
$admin=RevenueAwards::admin($db,$id);
if($admin['basis']!=='confirmed_pix_ledger'||count($admin['monthly'])!==12)
 throw new RuntimeException('Admin awards data source or 12-month chart missing');
$by=array_column($admin['sellers'],null,'account_id');
if(!isset($by[$id],$by[$other])||
 $by[$id]['lifetime_gross_cents']!==9000||
 $by[$id]['monthly_count']!==2||
 $by[$id]['ticket_cents']!==9500||
 $by[$id]['plaques'][0]['threshold_cents']!==1000000||
 $by[$id]['plaques'][0]['remaining_cents']!==991000||
 count($by[$id]['plaques'])!==6)
 throw new RuntimeException('Incorrect real settlement aggregates, ticket, goals, or remaining');
$own=RevenueAwards::seller($db,$id);
$rankedOther=array_values(array_filter($own['ranking'],static fn($r)=>$r['private']??false));
if(count($rankedOther)<1)throw new RuntimeException('At least one participant must be private');
foreach($rankedOther as $privateRow){
 if($privateRow['monthly_gross_cents']!==null||
    $privateRow['monthly_count']!==null||
    $privateRow['ticket_cents']!==null||
    array_key_exists('lifetime_gross_cents',$privateRow)||
    array_key_exists('account_id',$privateRow))
    throw new RuntimeException('Private seller gross, ticket and lifetime exposure');
}
if($own['self']['account_id']!==$id||
 count($own['monthly'])!==12||
 in_array($other,array_column($own['ranking'],'account_id'),true))
 throw new RuntimeException('Seller tenant isolation failed');
$pub=RevenueAwards::publicRanking($db);
if(count(array_filter($pub['ranking'],static fn($r)=>str_contains($r['display_name'],'Prêmio')))!==0)
 throw new RuntimeException('Public financial identities leaked without consent');
$db->run('INSERT INTO argus_awards_public_consent(account_id,enabled,updated_at) VALUES(?,?,?)',
 [$id,1,$now]);
$pub=RevenueAwards::publicRanking($db);
$match=array_values(array_filter($pub['ranking'],static fn($r)=>$r['display_name']==='Loja Prêmio Alfa'));
if(count($match)!==1||$match[0]['monthly_gross_cents']!==9000||
 array_key_exists('account_id',$match[0]))
 throw new RuntimeException('Explicit public consent or public projection invalid');
$admin=(string)file_get_contents($root.'/public/static/admin.html');
$client=(string)file_get_contents($root.'/public/static/client.html');
$landing=(string)file_get_contents($root.'/public/static/landing.html');
$dash=(string)file_get_contents($root.'/public/static/reseller-dashboard.js');
$js=(string)file_get_contents($root.'/public/static/revenue-awards.js');
$css=(string)file_get_contents($root.'/public/static/revenue-awards.css');
$wallet=(string)file_get_contents($root.'/src/MerchantWallet.php');
$gateway=(string)file_get_contents($root.'/src/Gateway.php');
foreach(['data-nav="awards"','id="page-awards"','argus-awards-admin'] as $term)
 if(!str_contains($admin,$term))throw new RuntimeException('Admin awards page missing '.$term);
if(!str_contains($dash,"nav('awards')")||
 !str_contains($dash,"page('awards'")||
 !str_contains($dash,"awards:'Ranking e placas'")||
 !str_contains($js,'argus-reseller-page-awards')||
 !str_contains($js,'argus-awards-seller'))
 throw new RuntimeException('Seller awards menu or dynamic awards page missing');
if(!str_contains($landing,'id="argus-awards-public"')||
 !str_contains($gateway,"/api/public/revenue-ranking")||
 !str_contains($wallet,'/api/portal/wallet/awards/visibility')||
 !str_contains($wallet,'/api/admin/merchant-wallet/awards'))
 throw new RuntimeException('Secure dedicated awards routes missing');
foreach(['10K','20K','50K','100K','500K','1M',
  'confirmed_pix_ledger','public_opt_in','/api/public/revenue-ranking',
  '/api/admin/merchant-wallet/awards','/api/portal/wallet/awards'] as $term)
 if(!str_contains($js,$term))throw new RuntimeException('UI awards contract missing '.$term);
if(!str_contains($css,'scroll-snap-type:x mandatory')||
 !str_contains($css,'.argus-aw-podium-card'))
 throw new RuntimeException('Swipeable medals styling missing');
foreach([$admin,$client,$landing] as $html)
 if(!str_contains($html,'revenue-awards.css?v=awards-20261123-2')||
 !str_contains($html,'revenue-awards.js?v=awards-20261123-2'))
 throw new RuntimeException('Awards assets are not cache-busted on all pages');
echo "PASS: real ledger-only ranking, 6 milestones, full ticket and month data, opt-in public protection, tenant isolation, dashboards, charts and swipeable plaques.\n";
