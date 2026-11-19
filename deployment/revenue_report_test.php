<?php
declare(strict_types=1);
/** Synthetic, offline revenue reporting regression. NO PSP calls or real money. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\MerchantWallet;
use ArgusPayments\RevenueReport as R;
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
Portal::install($db);
MerchantWallet::install($db);
$now=new DateTimeImmutable('2026-11-19T16:00:00-03:00');
$baseline=R::build($db,null,$now); // Other build stages may have synthetic rows.
$a=bin2hex(random_bytes(16));$b=bin2hex(random_bytes(16));
foreach([[$a,'Loja Alfa','alfa@example.invalid'],[$b,'Loja Beta','beta@example.invalid']] as [$id,$name,$email]){
    $db->run('INSERT INTO argus_portal_accounts(id,account_type,display_name,email,
        document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
        $id,'PF',$name,$email,hash('sha256',$id),'0000','synthetic','identity_verified',null,
        '2026-10-01 00:00:00','2026-10-01 00:00:00'
    ]);
}
$add=static function(string $owner,int $gross,int $net,string $kind,string $when)use($db):void{
    $charge='mwc_'.bin2hex(random_bytes(16));
    $db->run('INSERT INTO argus_seller_charges
        (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,
         service_fee_cents,net_cents,description,provider_id,copy_paste,status,created_at,checked_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
        $charge,$owner,'synthetic_mer_'.$owner,hash('sha256',$charge),
        hash('sha256','body_'.$charge),$gross,$gross-$net,$net,'Synthetic paid charge',
        'tr_fake',null,$kind==='deposit_refund'?'refunded':'paid','2026-10-01 10:00:00',null
    ]);
    $db->run('INSERT INTO argus_seller_ledger
        (id,account_id,operation_kind,operation_id,delta_available,delta_held,
         delta_debt,service_fee_cents,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[
        'mwl_'.bin2hex(random_bytes(16)),$owner,$kind,$charge,
        $kind==='deposit_paid'?$net:-$net,0,0,$gross-$net,$when
    ]);
};
$add($a,1000,900,'deposit_paid','2026-11-19 13:00:00'); // 10am São Paulo
$add($a,600,500,'deposit_paid','2026-11-18 12:00:00'); // yesterday, 9am
$add($a,400,300,'deposit_paid','2026-11-18 22:00:00'); // yesterday, 7pm
$add($a,500,400,'deposit_paid','2026-10-16 14:00:00');
$add($a,300,200,'deposit_refund','2026-11-19 18:00:00');
$add($b,2000,1900,'deposit_paid','2026-11-19 14:00:00');
$add($b,9000,8900,'deposit_paid','2026-11-19 20:00:00'); // future: ignore
// PDO drivers can expose exact integer cents as numeric scalars with distinct types.
// Normalize only in test assertions; the stored financial values are unchanged.
$own=R::build($db,$a,$now);
if($own['timezone']!=='America/Sao_Paulo'||$own['basis']!=='confirmed_pix_ledger')
    throw new RuntimeException('Timezone/settlement source not declared');
if((int)$own['periods']['today']['gross_cents']!==700||
   (int)$own['periods']['today']['net_cents']!==700||
   (int)$own['periods']['yesterday']['gross_cents']!==1000||
   (int)$own['periods']['today_benchmark']['gross_cents']!==600||
   (int)$own['periods']['month']['gross_cents']!==1700||
   (int)$own['periods']['previous_month']['gross_cents']!==500)
    throw new RuntimeException('Seller day/month paid/refund totals or cutoff wrong: '.json_encode($own['periods']));
if($own['comparison_today']['direction']!=='up'||$own['comparison_month']['direction']!=='up')
    throw new RuntimeException('Fair comparison of matched periods is incorrect');
if(count($own['daily'])!==14||count($own['sellers'])!==0)
    throw new RuntimeException('Seller leaked portfolio data or chart is not fourteen days');
$all=R::build($db,null,$now);
$byAccount=array_column($all['sellers'],null,'account_id');
if((int)$all['periods']['today']['gross_cents']-(int)$baseline['periods']['today']['gross_cents']!==2700||
   (int)$all['periods']['month']['gross_cents']-(int)$baseline['periods']['month']['gross_cents']!==3700||
   !isset($byAccount[$a],$byAccount[$b])||
   (int)$byAccount[$a]['month']['gross_cents']!==1700||
   (int)$byAccount[$b]['month']['gross_cents']!==2000||
   (int)$byAccount[$b]['today']['gross_cents']!==2000)
    throw new RuntimeException('Super Admin delta or individual seller partition incorrect: '.json_encode($all['periods']));
$refundDay=array_values(array_filter($own['daily'],static fn($r)=>$r['date']==='2026-11-19'));
if(count($refundDay)!==1||$refundDay[0]['refund_count']!==1)
    throw new RuntimeException('Refund day not accounted for');
$source=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$admin=(string)file_get_contents('/var/www/html/public/static/admin.html');
$client=(string)file_get_contents('/var/www/html/public/static/client.html');
$js=(string)file_get_contents('/var/www/html/public/static/revenue-dashboard.js');
foreach(['/api/portal/wallet/revenue','/api/admin/merchant-wallet/revenue',
    "RevenueReport::build(\$db,(string)\$account['id'])",
    'RevenueReport::build($db)'] as $needle){
    if(!str_contains($source,$needle))
        throw new RuntimeException('Revenue server auth routing missing: '.$needle);
}
if(!str_contains($gateway,"require_once __DIR__ . '/RevenueReport.php';")||
   !str_contains($admin,'id="page-revenue"')||
   !str_contains($admin,'data-nav="revenue"')||
   !str_contains($client,'revenue-dashboard.js?v=20261119-1')||
   !str_contains($js,"request('/api/portal/wallet/revenue')")||
   !str_contains($js,"api('/api/admin/merchant-wallet/revenue')"))
    throw new RuntimeException('Authenticated UI route missing');
echo "PASS: confirmed-Pix-only revenue, refunds, São Paulo timezone, same-time comparisons, admin totals, tenant isolation and responsive report navigation.\n";
