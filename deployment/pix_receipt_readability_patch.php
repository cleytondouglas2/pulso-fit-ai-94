<?php
declare(strict_types=1);
/* UI-only: keep the full Pix payload and QR/copy logic; show exactly one line. */
$d='/var/www/html/public/static/';
$j=file_get_contents($d.'quick-pix-receipt.js');
$c=file_get_contents($d.'quick-pix-receipt.css');
$h=file_get_contents($d.'admin.html');
if(!is_string($j)||!is_string($c)||!is_string($h))
 throw new RuntimeException('Pix assets missing');
foreach([
 "code.wrap='off';","code.rows=1;","code.setAttribute('wrap','off');",
 "code.setAttribute('rows','1');","code.style.height='54px';",
 "code.scrollTop=0;","code.scrollLeft=0;"
] as $anchor)
 if(substr_count($j,$anchor)!==1)
  throw new RuntimeException('Compact Pix receipt changed: '.$anchor);
$anchor="code.scrollTop=0;";
$helper=<<<'JS'
if(label && !qr('argus-pix-code-helper')){
 const tip=document.createElement('small');
 tip.id='argus-pix-code-helper';
 tip.className='argus-pix-code-helper';
 tip.textContent='O código Pix completo será copiado, sem cortes.';
 label.appendChild(tip);
}
JS;
$j=str_replace($anchor,$helper."\n     ".$anchor,$j);
$c.="\n".<<<'CSS'
/* Single horizontal line on iOS Safari and Android, even for long payloads.
   The original, complete textarea.value remains the source for copy and QR. */
.charge-result .argus-pix-receipt .argus-pix-code-label #charge-code{
 display:block!important;box-sizing:border-box!important;
 height:54px!important;min-height:54px!important;max-height:54px!important;
 overflow-x:auto!important;overflow-y:hidden!important;resize:none!important;
 white-space:nowrap!important;overflow-wrap:normal!important;
 word-break:normal!important;line-height:1.55!important;
 -webkit-overflow-scrolling:auto!important;
}
.charge-result .argus-pix-receipt .argus-pix-code-helper{
 display:block;font-size:11px;line-height:1.45;font-weight:500;
 color:#bbc5d3;margin-top:3px;
}
@media(max-width:430px){
 .charge-result .argus-pix-receipt .argus-pix-code-label #charge-code{
  height:52px!important;min-height:52px!important;max-height:52px!important;
  padding:12px!important;font-size:13px!important;
 }
}
CSS;
foreach(['quick-pix-receipt.js?v=3','quick-pix-receipt.css?v=3'] as $name)
 if(substr_count($h,$name)!==1)
  throw new RuntimeException('Pix cache anchor changed: '.$name);
$h=str_replace(
 ['quick-pix-receipt.js?v=3','quick-pix-receipt.css?v=3'],
 ['quick-pix-receipt.js?v=singleline-20261123-2','quick-pix-receipt.css?v=singleline-20261123-2'],$h);
foreach([$d.'quick-pix-receipt.js'=>$j,$d.'quick-pix-receipt.css'=>$c,$d.'admin.html'=>$h] as $f=>$v)
 if(file_put_contents($f,$v)===false)
  throw new RuntimeException('Could not write compact Pix UI');
echo "PASS: single-line Pix display with complete copy/QR payload and no money changes.\n";
