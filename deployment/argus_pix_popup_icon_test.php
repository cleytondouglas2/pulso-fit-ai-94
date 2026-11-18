<?php
declare(strict_types=1);
$root='/var/www/html/public/static';
$html=file_get_contents("$root/admin.html");
$js=file_get_contents("$root/quick-pix-popup.js");
$css=file_get_contents("$root/quick-pix-popup.css");
$auto=file_get_contents("$root/quick-pix-autostatus.js");
if(!is_string($html)||!is_string($js)||!is_string($css)||!is_string($auto))
    throw new RuntimeException('Pix modal assets missing');
foreach(['quick-pix-popup.js?v=2','quick-pix-popup.css?v=1','quick-pix-receipt.js?v=3'] as $str)
    if(substr_count($html,$str)!==1)throw new RuntimeException('Pix dialog script missing or duplicated: '.$str);
foreach(['window.showChargeReceipt=wrapped','original.apply(this,arguments)',
          "host.appendChild(receipt)","receiptHome.appendChild(receipt)",
          'argus-pix-modal-receipt-host','argus-pix-popup-overlay',
          'argus:pix-paid','argus-pix-success-overlay','Parabéns! 🎉',
          'Seu Pix foi recebido e confirmado pela ARGUS Pay.',
          'argus-pix-success-ok','OK'] as $s)
    if(!str_contains($js,$s))throw new RuntimeException('Pix modal or congratulation regression: '.$s);
if(str_contains($js,'/api/admin/quick-pix')||str_contains($js,'fetch(')||str_contains($js,"status='paid'"))
    throw new RuntimeException('Client modal must not create Pix or manufacture payment status');
if(!str_contains($auto,"if(status==='paid')")||
   !str_contains($auto,"new CustomEvent('argus:pix-paid'")||
   !str_contains($auto,"lastCelebratedCharge!==chargeId"))
    throw new RuntimeException('Congratulations may only follow confirmed payment once per charge');
foreach(['.argus-pix-overlay[hidden]','.argus-pix-modal-card',
          '.argus-pix-success-card','.argus-pix-modal-close',
          '@media(max-width:430px)'] as $s)
    if(!str_contains($css,$s))throw new RuntimeException('Mobile popup styling missing '.$s);
$manifest=json_decode((string)file_get_contents("$root/manifest.webmanifest"),true,32,JSON_THROW_ON_ERROR);
foreach(['admin.html','client.html','install.html','docs.html'] as $file){
    $content=(string)file_get_contents("$root/$file");
    foreach(['apple-touch-icon-argus-a-v6.png','argus-a-192-v6.png',
             'manifest.webmanifest?v=6'] as $s)
        if(!str_contains($content,$s))throw new RuntimeException('Incorrect Apple home icon on '.$file);
}
if(($manifest['short_name']??'')!=='ARGUS')throw new RuntimeException('PWA label changed');
foreach(['180','192','512'] as $sz){
    $file=$sz==='180'?'/var/www/html/public/apple-touch-icon-argus-a-v6.png':"$root/assets/argus-a-{$sz}-v6.png";
    $dims=@getimagesize($file);
    if(!$dims||$dims[0]!=(int)$sz||$dims[1]!=(int)$sz||$dims[2]!==IMAGETYPE_PNG||filesize($file)<2500)
        throw new RuntimeException('Missing or invalid Apple A PNG: '.$sz);
}
if(!str_contains((string)file_get_contents("$root/assets/argus-letter-a-icon.svg"),'M256 94 L391 411'))
    throw new RuntimeException('Versioned icon does not contain explicit central letter A');
echo "PASS: QR opens in modal with original controls; paid-only congratulations OK; opaque A icons at 180/192/512px and cache-proof metadata.\n";
