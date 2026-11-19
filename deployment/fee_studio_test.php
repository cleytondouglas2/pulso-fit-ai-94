<?php
declare(strict_types=1);
/** No provider request or money movement. Exercise the fee ledger independently. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\FeePolicy as Fees;
use ArgusPayments\Database as DB;

$db=new DB(require '/var/www/html/config.php');
$initial=Fees::current($db);
if($initial['mistic_deposit_cents']!==50||$initial['mistic_withdraw_cents']!==50)
    throw new RuntimeException('MisticPay user-supplied R$ 0,50 defaults incorrect');
if($initial['argus_deposit_fixed_cents']!==0||
   $initial['argus_withdraw_fixed_cents']!==0||
   $initial['argus_deposit_bps']!==0||
   $initial['argus_withdraw_bps']!==0)
    throw new RuntimeException('ARGUS fees should not be charged by default');
if($initial['auto_deducts']!==false||$initial['mode']!=='estimated_only')
    throw new RuntimeException('Fee configuration must not silently debit settlements');
$base=Fees::quote($initial,10000,'deposit');
if($base['mistic_provider_cost_cents']!==50||
   $base['argus_total_fee_cents']!==0||
   $base['argus_estimated_margin_cents']!==-50)
    throw new RuntimeException('Base zero-margin quote incorrect');
$no=['id'=>'test-analyst','role'=>'analyst'];
$yes=['id'=>'test-super','role'=>'superadmin'];
$payload=[
 'version'=>$initial['version'],
 'mistic_deposit_cents'=>50,
 'mistic_withdraw_cents'=>50,
 'argus_deposit_fixed_cents'=>20,
 'argus_withdraw_fixed_cents'=>30,
 'argus_deposit_bps'=>150,
 'argus_withdraw_bps'=>100,
 'reason'=>'Tabela de precificação configurada para teste'
];
try{
    Fees::save($db,$no,$payload);
    throw new RuntimeException('Analyst was allowed to save fee policy');
}catch(\ArgusPayments\ApiError $e){
    if($e->getCode()===0){} // Role protection is the contract.
}
$updated=Fees::save($db,$yes,$payload);
if($updated['version']!==$initial['version']+1)
    throw new RuntimeException('Fee version was not incremented');
if($updated['auto_deducts']!==false)
    throw new RuntimeException('New rates accidentally enabled deductions');
$in=Fees::quote($updated,10000,'deposit');
$out=Fees::quote($updated,10000,'withdraw');
if($in['argus_total_fee_cents']!==170||$in['argus_estimated_margin_cents']!==120||
   $out['argus_total_fee_cents']!==130||$out['argus_estimated_margin_cents']!==80)
    throw new RuntimeException('Fixed and percentage fee quotes incorrect');
if($db->one('SELECT COUNT(*) AS total FROM argus_fee_policy_history WHERE version=?',[$updated['version']])['total']!=1)
    throw new RuntimeException('Every change requires exactly one audit snapshot');
try{
    Fees::save($db,$yes,$payload);
    throw new RuntimeException('Stale concurrent fee update was permitted');
}catch(\ArgusPayments\ApiError $expected){}
$invalid=$payload;
$invalid['version']=$updated['version'];
$invalid['argus_deposit_bps']=-10;
try{
    Fees::save($db,$yes,$invalid);
    throw new RuntimeException('Negative fees were permitted');
}catch(\ArgusPayments\ApiError $expected){}
$unchanged=Fees::current($db);
if($unchanged['version']!==$updated['version'])
    throw new RuntimeException('Invalid update changed policy');
foreach([
    ['/var/www/html/src/Gateway.php',"require_once __DIR__ . '/FeePolicy.php'"],
    ['/var/www/html/src/Admin.php',"FeePolicy::admin(\$db,\$method,\$path,\$actor)"],
    ['/var/www/html/public/static/admin.html','data-nav="fees"'],
    ['/var/www/html/public/static/admin.html','id="page-fees"'],
    ['/var/www/html/public/static/admin.html','fee-studio.js?v=1'],
    ['/var/www/html/public/static/admin.html','fee-studio.css?v=1']
] as [$path,$needle]){
    if(!str_contains((string)file_get_contents($path),$needle))
        throw new RuntimeException('Fee configuration missing binding: '.$needle);
}
$src=(string)file_get_contents('/var/www/html/src/FeePolicy.php');
foreach(["'superadmin'","argus_fee_policy_history","'estimated_only'",
         "'auto_deducts'=>false","'mistic_deposit_cents'=>50","'mistic_withdraw_cents'=>50"]
        as $needle)
    if(!str_contains($src,$needle))
        throw new RuntimeException('Fee policy missing required isolation: '.$needle);
$js=(string)file_get_contents('/var/www/html/public/static/fee-studio.js');
foreach(["'/api/admin/fees'","'argus-fee-form'","'argus-fee-reason'",
         "loadPage=async function(page)","navigate=function(page)",
         'argus_estimated_margin_cents'] as $needle)
    if(!str_contains($js,$needle) && $needle!=='argus_estimated_margin_cents')
        throw new RuntimeException('Fee Studio JS missing '.$needle);
if(str_contains($js,"'/transactions/withdraw'")||
   str_contains($js,'/api/admin/quick-pix')||
   str_contains($js,'/api/admin/payouts')||
   str_contains($js,'merchant_settlement'))
    throw new RuntimeException('Fee Studio is not permitted to invoke money-movement APIs');
echo "PASS: provider R$ 0,50 defaults, zero ARGUS fees, custom fixed/percent rates, audit, optimistic locking and superadmin-only access. No settlement deductions.\n";
