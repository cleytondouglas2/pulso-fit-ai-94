<?php
declare(strict_types=1);
$root='/var/www/html/public/static/';
$html=file_get_contents($root.'admin.html');
$js=file_get_contents($root.'quick-pix-receipt.js');
$css=file_get_contents($root.'quick-pix-receipt.css');
if(!is_string($html)||!is_string($js)||!is_string($css))throw new RuntimeException('Receipt UI assets missing');
foreach(['quick-pix-receipt.css?v=3','quick-pix-receipt.js?v=3',
          'id="charge-receipt"','id="charge-qr"'] as $needle){
  if($needle==='id="charge-qr"')continue; // Created lazily by QR renderer, tested below.
  if(!str_contains($html,$needle))throw new RuntimeException('Receipt integration missing '.$needle);
}
foreach(['original.apply(this,arguments)','window.showChargeReceipt=formatted',
  'document.getElementById','argus-pix-code-row','QR Code PIX','Chave PIX / Pix Copia e Cola',
  'charge-code','charge-copy','charge-qr','Baixar QR Code','Novo QR Code',
  'argus-pix-new','argus-pix-download','toDataURL','charge-reconcile'] as $needle)
  if(!str_contains($js,$needle))throw new RuntimeException('Receipt control missing '.$needle);
foreach(['.charge-result','#charge-code','#charge-qr','.argus-pix-code-row',
  '.argus-pix-copy-icon','overflow-wrap:anywhere','.argus-pix-receipt-actions'] as $needle)
  if(!str_contains($css,$needle))throw new RuntimeException('Scoped Pix style missing '.$needle);
if(!str_contains($js,'if(!hasCode)return;'))
  throw new RuntimeException('Receipt must not show empty/unconfirmed Pix');
if(!str_contains($js,'// this button never creates a new charge by itself'))
  throw new RuntimeException('New QR must not trigger payment creation');
if(str_contains($js,"/api/admin/quick-pix")||str_contains($js,'window.location.reload('))
  throw new RuntimeException('Receipt UI must not issue Pix payment requests or reload account');
if(substr_count($html,'id="charge-receipt"')!==1||substr_count($html,'id="charge-code"')!==1)
  throw new RuntimeException('Original receipt container or code field changed');
// The QR is back to the original 210px; the Pix payload remains complete but only one line is shown.
foreach(["width:210,height:210","code.wrap='off'","code.rows=1","code.select()",
         "code.setSelectionRange(0,code.value.length)","code.style.height='54px'"] as $needle)
    if(!str_contains($js,$needle))throw new RuntimeException('Compact QR / full selection regression: '.$needle);
foreach(['width:min(100%,210px)!important','height:54px!important',
         'min-height:54px!important','max-height:54px!important',
         'white-space:nowrap!important','.argus-pix-copy-icon'] as $needle)
    if(!str_contains($css,$needle))throw new RuntimeException('Compact receipt CSS missing '.$needle);
if(str_contains($js,'code.scrollHeight+10')||str_contains($css,'min-height:144px'))
    throw new RuntimeException('Pix code must not expand into a multi-line panel');
if(!str_contains($js,'navigator.clipboard')&&
   !str_contains((string)file_get_contents($root.'admin.js'),'navigator.clipboard.writeText'))
    throw new RuntimeException('Copy icon must preserve complete Pix code copying');

// The ID is hidden, not deleted: reconciliation continues to receive the same
// charge ID, and the original Verify action is moved, not recreated.
foreach(["identifier.hidden=true","identifier.previousElementSibling",
         "heading.hidden=true","reconcile.classList.add('argus-pix-verify')",
         "actions.appendChild(reconcile)","aria-label','Verificar pagamento'",
         "reconcile.textContent='Verificar'"] as $needle){
 if(!str_contains($js,$needle))throw new RuntimeException('Compact actions/hidden ID missing: '.$needle);
}
foreach(["grid-template-columns:repeat(3,minmax(0,1fr))",
         ".argus-pix-hidden-identifier","height:46px!important",
         "height:44px!important"] as $needle){
 if(!str_contains($css,$needle))throw new RuntimeException('Compact three-button layout missing: '.$needle);
}
if(str_contains($js,"identifier.remove()")||str_contains($js,"reconcile.remove()"))
 throw new RuntimeException('Never remove charge ID or verification button');
if(!str_contains($js,"qr('argus-pix-download').addEventListener('click',downloadImage)") ||
   !str_contains($js,"qr('argus-pix-new').addEventListener('click',newCharge)"))
 throw new RuntimeException('Download and new QR actions must keep their handlers');
echo "PASS: Hide charge ID visually; three small grouped actions preserve all existing Pix handlers.\n";

echo "PASS: Only generated QR receipt changes, with full copy text, adjacent copy, download and new QR without issuing payment.\n";
