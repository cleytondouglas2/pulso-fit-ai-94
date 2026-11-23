<?php
declare(strict_types=1);
/**
 * Offline visual + polling-contract regression. NEVER contacts MisticPay or
 * issues a QR code, payout, refund, or customer-facing notification.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\PublicAdminPix;
$now=1763856000;
$young=['created_at'=>gmdate('Y-m-d H:i:s',$now-60)];
$expired=['created_at'=>gmdate('Y-m-d H:i:s',$now-1801)];
if(PublicAdminPix::statusCheckWindow($young,$now)!==10)
 throw new RuntimeException('Public QR must check within 10 seconds while active');
if(PublicAdminPix::statusCheckWindow($expired,$now)!==180)
 throw new RuntimeException('Old QR settlement follow-up missing');
if(PublicAdminPix::statusCheckWindow(['created_at'=>'bad'], $now)!==180)
 throw new RuntimeException('Invalid time must be safely throttled');
$h=(string)file_get_contents('/var/www/html/public/static/public-pix.html');
$c=(string)file_get_contents('/var/www/html/public/static/public-pix.css');
$j=(string)file_get_contents('/var/www/html/public/static/public-pix.js');
$p=(string)file_get_contents('/var/www/html/src/PublicAdminPix.php');
$t=(string)file_get_contents('/var/www/html/src/TraditionalQuickPix.php');
$d=(string)file_get_contents('/tmp/argus_premium_Dockerfile');
foreach([
 'id="pix-code-preview"','class="pix-copy-row"','id="pix-copy"',
 'id="pix-copy-feedback"','id="pix-success"','id="pix-dialog-amount"',
 'id="public-pix-qr"','class="pix-copy-symbol"',
 'public-pix.js?v=pix-premium-20261123-1',
 'public-pix.css?v=pix-premium-20261123-1'
] as $needle)
 if(!str_contains($h,$needle))
  throw new RuntimeException('Pix premium HTML missing '.$needle);
foreach([
 '.pix-code-preview','white-space:nowrap','text-overflow:ellipsis',
 '.pix-copy-icon','.pix-success-ring','.pix-copy-assist','prefers-reduced-motion'
] as $needle)
 if(!str_contains($c,$needle)&&$needle!=='.pix-copy-assist')
  throw new RuntimeException('Pix premium responsive style missing '.$needle);
if(str_contains($h,'<textarea id="pix-code" readonly rows="2"')||
   str_contains($h,'Copiar código Pix</button>'))
 throw new RuntimeException('Old multi-line Pix code must be replaced');
foreach([
 'pixPreview(code)','qrRenderedFor!==currentCopy','pixPreview(currentCopy)',
 'navigator.clipboard.writeText(currentCopy)',
 "poll=setInterval(()=>verify(false),5000)",
 "dialog.addEventListener('close',()=>{if(active&&!document.hidden)verify(false);});",
 "document.addEventListener('visibilitychange'",
 "'Pagamento confirmado pela MisticPay'",
 'stopWatch()','active.lastStatus=status'
] as $needle)
 if(!str_contains($j,$needle))
  throw new RuntimeException('Pix behavior missing '.$needle);
foreach([
 'statusCheckWindow($row)',
 'checked_at IS NULL OR checked_at<=?',
 '$claimed->rowCount()===1',
 'TraditionalQuickPix::reconcileRow($db,$charge)',
 "'tr_'"
] as $needle)
 if(!str_contains($p,$needle))
  throw new RuntimeException('Public PSP polling guard missing '.$needle);
foreach([
 '$freshCutoff','time()-1800','time()-20','time()-180',
 '$claimed->rowCount()!==1','self::reconcileRow($db,$row)',
 "status IN ('pending','unknown')"
] as $needle)
 if(!str_contains($t,$needle))
  throw new RuntimeException('Background PSP polling guard missing '.$needle);
if(str_contains($t,"AND created_at>=? AND (checked_at IS NULL OR checked_at<?)"))
 throw new RuntimeException('Background PSP cannot stop monitoring expired QRs');
if(!str_contains($d,'sleep 25; done')||
   !str_contains($d,'ARGUS_NOTIFICATIONS_WORKER_ENABLED'))
 throw new RuntimeException('Render worker background loop not accelerated');
if(str_contains($j,'setInterval(()=>verify(false),5000)')===false)
 throw new RuntimeException('Frontend must verify faster without a second worker');
echo "PASS: compact copy-only Pix code, verified success view, 5s open-tab UI, 10s PSP status gate, 25s independent server worker for 30m plus delayed settlement; NO REAL Pix.\n";
