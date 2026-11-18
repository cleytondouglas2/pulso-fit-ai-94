<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\TraditionalQuickPix as Pix;

$expired=(new ReflectionMethod(Pix::class,'displayStatus'));
$summary=(new ReflectionMethod(Pix::class,'publicSummary'));
$created=gmdate('Y-m-d H:i:s',time()-120);
$start=strtotime($created.' UTC');
$pending=[
 'id'=>'qpx_'.str_repeat('a',32),'amount_cents'=>1000,'provider_id'=>'tr_sample',
 'qr_copy'=>'00020126580014br.gov.bcb.pix','created_at'=>$created,
 'checked_at'=>null,'status'=>'pending'
];
if($expired->invoke(null,$pending,$start+1799)!=='pending')
    throw new RuntimeException('QR expired before the 30-minute deadline');
if($expired->invoke(null,$pending,$start+1800)!=='expired')
    throw new RuntimeException('Unconfirmed QR did not expire at 30 minutes');
$paid=$pending;$paid['status']='paid';
if($expired->invoke(null,$paid,$start+86400)!=='paid')
    throw new RuntimeException('Verified paid charge must never become expired');
$failed=$pending;$failed['status']='failed';
if($expired->invoke(null,$failed,$start+86400)!=='failed')
    throw new RuntimeException('Failed status lost authoritative meaning');
$public=$summary->invoke(null,$pending);
if(isset($public['pix_copy_paste'])||isset($public['qr_copy']))
    throw new RuntimeException('Recent QR index must not expose full payment payload');
if(($public['expires_at_epoch']??0)!==$start+1800||
   ($public['can_reconcile']??false)!==true||
   ($public['can_view_qr']??false)!==true)
    throw new RuntimeException('Unexpired traditional Pix actions incorrect');
$nonTrad=$pending;$nonTrad['provider_id']='finance_123';
if(($summary->invoke(null,$nonTrad)['can_reconcile']??true)!==false)
    throw new RuntimeException('Legacy finance Pix may not use traditional reconciliation');
$src=(string)file_get_contents('/var/www/html/src/TraditionalQuickPix.php');
if(!str_contains($src,'WHERE actor_id=? ORDER BY created_at DESC LIMIT 150'))
    throw new RuntimeException('Recent QR history must scope to authenticated actor');
if(!str_contains($src,"\$display==='paid'||\$display==='expired'"))
    throw new RuntimeException('Paid / expired reconciliation must never call provider unnecessarily');
if(!str_contains($src,'self::reconcileRow($db,$row)'))
    throw new RuntimeException('Traditional authenticated provider check missing');
$admin=(string)file_get_contents('/var/www/html/src/Admin.php');
if(!str_contains($admin,'/api/admin/charges/(qpx_[a-f0-9]{32})/reconcile')||
   !str_contains($admin,"'/api/admin/quick-pix/'.\$legacy[1].'/reconcile'"))
    throw new RuntimeException('Old Pix reconciliation route was not redirected correctly');
$html=(string)file_get_contents('/var/www/html/public/static/admin.html');
foreach(['quick-pix-history.js?v=1','quick-pix-history.css?v=1',
         'quick-pix-popup.js?v=4','quick-pix-autostatus.js?v=4'] as $needle)
    if(!str_contains($html,$needle))
        throw new RuntimeException('Safari cache-busted history module missing '.$needle);
$history=(string)file_get_contents('/var/www/html/public/static/quick-pix-history.js');
foreach(['argus-pix-recent','Ver Pix','Conciliar','Aprovado','Expirado',
         "post('/api/admin/quick-pix/'",
         "api('/api/admin/quick-pix/'",
         'window.showChargeReceipt(shown)','handleOldPaymentAction','decoratePayments',
         "new MutationObserver(decoratePayments)",
         'argus:pix-qr-expired'] as $needle)
    if(!str_contains($history,$needle))throw new RuntimeException('Pix history view/route missing '.$needle);
$popup=(string)file_get_contents('/var/www/html/public/static/quick-pix-popup.js');
if(!str_contains($popup,"data._fromHistory===true")||
   !str_contains($popup,"argus:pix-qr-expired"))
    throw new RuntimeException('Same QR popup must support paid history and expiry');
$auto=(string)file_get_contents('/var/www/html/public/static/quick-pix-autostatus.js');
if(!str_contains($auto,"data._fromHistory===true"))
    throw new RuntimeException('Historical paid views must not celebrate a second time');
echo "PASS: recent Pix statuses, paid precedence, 30min expiry, scoped QR list, correct Finance/traditional reconciliation, shared popup.\n";
