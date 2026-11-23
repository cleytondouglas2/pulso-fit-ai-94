<?php
declare(strict_types=1);
$d='/var/www/html/public/static/';
$j=(string)file_get_contents($d.'quick-pix-receipt.js');
$c=(string)file_get_contents($d.'quick-pix-receipt.css');
$h=(string)file_get_contents($d.'admin.html');
foreach(["code.wrap='soft'","code.rows=4","code.style.height='106px'",
"argus-pix-code-helper","code.select()","code.setSelectionRange(0,code.value.length)",
"width:210,height:210","window.showChargeReceipt=formatted"] as $x)
 if(!str_contains($j,$x))throw new RuntimeException('Pix JS regression: '.$x);
foreach(['height:106px!important','overflow-y:auto!important','white-space:pre-wrap!important','word-break:break-all!important'] as $x)
 if(!str_contains($c,$x))throw new RuntimeException('Pix CSS missing: '.$x);
foreach(['quick-pix-receipt.js?v=readable-20261123-1','quick-pix-receipt.css?v=readable-20261123-1'] as $x)
 if(substr_count($h,$x)!==1)throw new RuntimeException('Admin Pix resources not updated');
if(str_contains($j,'/api/admin/quick-pix')||
 str_contains($j,'window.location.reload('))throw new RuntimeException('Receipt must not issue Pix');
echo "PASS: full Pix code is scrollable and selection, QR and copy remain unchanged.\n";
