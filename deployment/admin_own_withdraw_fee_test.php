<?php
declare(strict_types=1);
/** All checks isolated in local build-test database. Never transfers a Pix. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\FeePolicy as Policy;
use ArgusPayments\FeeExecution as Fees;
use ArgusPayments\ApiError;
$db=new DB(require '/var/www/html/config.php');$db->installAndSeed();Fees::install($db);
$before=Policy::current($db);
// On the Super Admin's own account, reseller pricing must have no effect
// even when commercial ARGUS settings change to extreme nonzero values.
$db->run('UPDATE argus_fee_policy SET argus_withdraw_fixed_cents=50,
 argus_withdraw_bps=1000 WHERE id=1');
$q=Fees::quote($db,'withdraw',100);
if($q['gross_cents']!==100||$q['recipient_cents']!==100||
   $q['provider_amount_cents']!==100||
   $q['argus_fee_cents']!==0||$q['argus_fixed_cents']!==0||
   $q['argus_percent_cents']!==0||
   $q['commercial_net_cents']!==100||
   $q['mistic_cost_estimate_cents']!==(int)$before['mistic_withdraw_cents']||
   $q['provider_fee_charged_here']!==false)
 throw new RuntimeException('Super Admin R$ 1 Pix cannot have ARGUS fee or receive under R$ 1');
$ten=Fees::quote($db,'withdraw',1000);
if($ten['provider_amount_cents']!==1000||$ten['argus_fee_cents']!==0)
 throw new RuntimeException('Super Admin R$ 10 Pix was commercially charged');
$policy=Policy::current($db);
$providerUpdated=min(10000,$policy['mistic_withdraw_cents']+25);
$db->run('UPDATE argus_fee_policy SET mistic_withdraw_cents=?,version=version+1 WHERE id=1',
 [$providerUpdated]);
$updated=Fees::quote($db,'withdraw',100);
if($updated['mistic_cost_estimate_cents']!==$providerUpdated||
   $updated['policy_version']===$q['policy_version']||
   $updated['recipient_cents']!==100||
   $updated['argus_fee_cents']!==0)
 throw new RuntimeException('Super Admin Mistic cost changes must affect new quote but not outgoing Pix value');
$op='payout_admin_test_'.bin2hex(random_bytes(12));
$oldSnapshot=Fees::reserve($db,'withdraw',$op,$q);
if($oldSnapshot['mistic_cost_estimate_cents']!==(int)$before['mistic_withdraw_cents']||
   $oldSnapshot['policy_version']!==$q['policy_version']||
   $oldSnapshot['provider_amount_cents']!==100)
 throw new RuntimeException('Fee snapshot was silently repriced after a settings change');
$depo=Fees::quote($db,'deposit',1000);
if($depo['argus_fee_cents']!==Policy::quote(Policy::current($db),1000,'deposit')['argus_total_fee_cents'])
 throw new RuntimeException('Deposit commercial accounting unexpectedly changed');
$db->run('DELETE FROM argus_fee_operations WHERE operation_id=?',[$op]);
// Restore test-only policy; never alter the real configured Super Admin rates.
$db->run('UPDATE argus_fee_policy SET argus_withdraw_fixed_cents=?,
 argus_withdraw_bps=?,mistic_withdraw_cents=?,version=? WHERE id=1',[
 $before['argus_withdraw_fixed_cents'],$before['argus_withdraw_bps'],
 $before['mistic_withdraw_cents'],$before['version']]);
$admin=(string)file_get_contents('/var/www/html/src/Admin.php');
$fees=(string)file_get_contents('/var/www/html/src/FeeExecution.php');
$otp=(string)file_get_contents('/var/www/html/public/static/admin-pix-stepup.js');
$ops=(string)file_get_contents('/var/www/html/public/static/fee-operations.js');
$html=(string)file_get_contents('/var/www/html/public/static/admin.html');
foreach([
 'if(($data[\'fee_acknowledged\']??null)!==true',
 "'fee_version'",
 'O custo da MisticPay foi atualizado.',
 'FeeExecution::reserve($db,\'withdraw\',$id,$feeQuote)',
 'withdraw($providerNet,$type,$key,$description,$idem)'
] as $token)
 if(!str_contains($admin,$token))
  throw new RuntimeException('Admin treasury reconciliation / fee-version guard missing: '.$token);
foreach(['$ownTreasury=$kind===\'withdraw\'',
 '$argusFee=$ownTreasury?0',
 '$net=$gross-$argusFee',
 "'mistic_cost_estimate_cents'=>(int)\$calc['mistic_provider_cost_cents']"
] as $token)
 if(!str_contains($fees,$token))
  throw new RuntimeException('Admin own-fee quote invariant missing: '.$token);
foreach(['Taxa MisticPay (adquirente)','feeQuote.argus_fee_cents!==0',
 'feeQuote.recipient_cents!==amountCents','item.showModal()'] as $token)
 if(!str_contains($otp,$token))
  throw new RuntimeException('Admin new OTP fee modal missing: '.$token);
if(str_contains($otp,'data-argus-fee')||str_contains($ops,'Taxa ARGUS descontada'))
 throw new RuntimeException('Admin payout must not display a commercial ARGUS fee');
if(!str_contains($ops,'Taxa MisticPay (custo da adquirente)')||
   !str_contains($ops,'Saque do Super Admin sem taxa comercial ARGUS'))
 throw new RuntimeException('Wrong admin payout fee preview labels');
foreach(['admin-pix-stepup.js?v=20261123-ownadmin-1',
 'fee-operations.js?v=20261123-ownadmin-1'] as $token)
 if(!str_contains($html,$token))
  throw new RuntimeException('Safari admin fee UI stale cache: '.$token);
echo "PASS: Admin R$ 1 payout sends R$ 1, no ARGUS fee; R$ 0.50 Mistic cost separate/configurable; version-locked 2FA, immutable snapshots, no reseller rate changes or real Pix.\n";
