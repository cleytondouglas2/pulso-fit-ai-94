<?php
declare(strict_types=1);
/* Visual only; retains full Pix value, copy action, QR and provider reconciliation. */
$d='/var/www/html/public/static/';
$j=file_get_contents($d.'quick-pix-receipt.js');
$c=file_get_contents($d.'quick-pix-receipt.css');
$h=file_get_contents($d.'admin.html');
if(!is_string($j)||!is_string($c)||!is_string($h))throw new RuntimeException('Pix assets missing');
foreach([
 "code.wrap='off';"=>"code.wrap='soft';",
 "code.rows=1;"=>"code.rows=4;",
 "code.setAttribute('wrap','off');"=>"code.setAttribute('wrap','soft');",
 "code.setAttribute('rows','1');"=>"code.setAttribute('rows','4');",
 "code.style.height='54px';"=>"code.style.height='106px';"
] as $a=>$b){
 if(substr_count($j,$a)!==1)throw new RuntimeException('Pix JS selector changed: '.$a);
 $j=str_replace($a,$b,$j);
}
$anchor="code.scrollTop=0;";
if(substr_count($j,$anchor)!==1)throw new RuntimeException('Pix scroll anchor changed');
$helper=<<<'JS'
if(label && !qr('argus-pix-code-helper')){
 const tip=document.createElement('small');
 tip.id='argus-pix-code-helper';
 tip.className='argus-pix-code-helper';
 tip.textContent='Código completo: role para conferir ou toque em copiar ao lado.';
 label.appendChild(tip);
}
JS;
$j=str_replace($anchor,$helper."\n     ".$anchor,$j);
$c.="\n".<<<'CSS'
/* Full long Pix string remains selectable and readable on iPhone. */
.charge-result .argus-pix-receipt .argus-pix-code-label #charge-code{
 height:106px!important;min-height:106px!important;max-height:150px!important;
 overflow-x:hidden!important;overflow-y:auto!important;
 white-space:pre-wrap!important;overflow-wrap:anywhere!important;
 word-break:break-all!important;line-height:1.45!important;
 padding:12px!important;-webkit-overflow-scrolling:touch;
}
.charge-result .argus-pix-receipt .argus-pix-code-helper{
 display:block;font-size:11px;line-height:1.5;font-weight:500;
 color:#bbc5d3;margin-top:3px;overflow-wrap:anywhere;
}
CSS;
foreach(['quick-pix-receipt.js?v=3','quick-pix-receipt.css?v=3'] as $name)
 if(substr_count($h,$name)!==1)throw new RuntimeException('Pix cache anchor changed: '.$name);
$h=str_replace(['quick-pix-receipt.js?v=3','quick-pix-receipt.css?v=3'],
 ['quick-pix-receipt.js?v=readable-20261123-1','quick-pix-receipt.css?v=readable-20261123-1'],$h);
foreach([$d.'quick-pix-receipt.js'=>$j,$d.'quick-pix-receipt.css'=>$c,$d.'admin.html'=>$h] as $f=>$v)
 if(file_put_contents($f,$v)===false)throw new RuntimeException('Could not write UI');
echo "PASS: Pix text visible on multiple lines; existing copy and payment code unchanged.\n";
