<?php
declare(strict_types=1);
/** Visual regression only: never creates Pix, never calls PSP. */
$d='/var/www/html/public/static/';
$j=(string)file_get_contents($d.'quick-pix-receipt.js');
$c=(string)file_get_contents($d.'quick-pix-receipt.css');
$h=(string)file_get_contents($d.'admin.html');
foreach([
 "code.wrap='off'","code.rows=1","code.setAttribute('wrap','off')",
 "code.setAttribute('rows','1')","code.style.height='54px'",
 'argus-pix-code-helper','O código Pix completo será copiado, sem cortes.',
 'code.select()','code.setSelectionRange(0,code.value.length)',
 'width:210,height:210','window.showChargeReceipt=formatted'
] as $x)
 if(!str_contains($j,$x))
  throw new RuntimeException('Pix JS single-line regression: '.$x);
foreach([
 'height:54px!important','overflow-x:auto!important','overflow-y:hidden!important',
 'white-space:nowrap!important','overflow-wrap:normal!important','word-break:normal!important'
] as $x)
 if(!str_contains($c,$x))
  throw new RuntimeException('Pix CSS single-line regression: '.$x);
foreach([
 'quick-pix-receipt.js?v=singleline-20261123-2',
 'quick-pix-receipt.css?v=singleline-20261123-2'
] as $x)
 if(substr_count($h,$x)!==1)
  throw new RuntimeException('Admin cache version missing: '.$x);
if(str_contains($j,"code.wrap='soft'")||
 str_contains($j,"code.style.height='106px'")||
 str_contains($c,'white-space:pre-wrap!important')||
 str_contains($c,'word-break:break-all!important'))
 throw new RuntimeException('Multiline Pix regression detected');
if(str_contains($j,'/api/admin/quick-pix')||
 str_contains($j,'window.location.reload('))
 throw new RuntimeException('Receipt must not issue Pix or reload');
echo "PASS: Pix one-line display on mobile, full original QR/copy, cache bust, no payment action.\n";
