<?php
declare(strict_types=1);
$root='/var/www/html';
$source=(string)file_get_contents($root.'/src/TraditionalQuickPix.php');
$worker=(string)file_get_contents('/usr/local/share/argus/notify_worker.php');
$js=(string)file_get_contents($root.'/public/static/quick-pix-autostatus.js');
$popup=(string)file_get_contents($root.'/public/static/quick-pix-popup.js');
$css=(string)file_get_contents($root.'/public/static/quick-pix-popup.css');
$html=(string)file_get_contents($root.'/public/static/admin.html');

if(substr_count($source,"\$cutoff=gmdate('Y-m-d H:i:s',time()-1800);")!==1)
    throw new RuntimeException('The worker must track Pix for 30 minutes from creation.');
if(str_contains($source,"time()-7*86400"))
    throw new RuntimeException('Old 7-day Pix monitoring limit still present.');
if(!str_contains($worker,"TraditionalQuickPix::worker")||
   !str_contains($worker,"getenv('ARGUS_QUICK_PIX_PROVIDER')==='traditional'"))
    throw new RuntimeException('The background monitor is not connected to traditional Pix.');
if(!str_contains($source,'self::reconcileRow($db,$row)')||
   !str_contains($source,"\$new==='paid'&&\$updated->rowCount()>0"))
    throw new RuntimeException('Pix confirmation must remain authenticated and verified.');
foreach(["started+30*60*1000","withinWindow()","expiryFromCharge(data)",
         "expiryFromCharge(r)>Date.now()","if(!withinWindow())return",
         "n.textContent='';n.hidden=true;"] as $needle)
    if(!str_contains($js,$needle))
        throw new RuntimeException('Missing silent client-side 30min check: '.$needle);
if(str_contains($js,'Verificação automática ativa: consultando a MisticPay a cada 20 segundos enquanto esta tela estiver aberta.'))
    throw new RuntimeException('The automatic-check notice must stay hidden.');
if(!str_contains($popup,'hideGenericPixUnavailableNotice')||
   !str_contains($popup,'A emissão Pix está indisponível no momento.')||
   !str_contains($popup,'new MutationObserver(clean)'))
    throw new RuntimeException('Generic unavailable banner suppression missing.');
foreach(["#page-charge-create #argus-payer-details",
         "#page-charge-create #argus-payer-summary",
         "#page-charge-create #argus-edit-profile"] as $needle)
    if(!str_contains($css,$needle))
        throw new RuntimeException('Redundant automatic profile details still visible: '.$needle);
if(!str_contains($html,'quick-pix-autostatus.js?v=3')||
   !str_contains($html,'quick-pix-popup.js?v=3')||
   !str_contains($html,'quick-pix-popup.css?v=2'))
    throw new RuntimeException('iPhone assets need cache-busted versions.');
if(!str_contains($popup,"addEventListener('click',closePopup)"))
    throw new RuntimeException('QR popup must still close.');
if(str_contains($popup,'TraditionalQuickPix::worker')||
   str_contains($popup,'clearInterval(timer)'))
    throw new RuntimeException('Closing QR popup must not stop background monitor.');
echo "PASS: Pix reconciliation continues independently of QR popup for 30min; notices hidden; original provider verification retained.\n";
