<?php
declare(strict_types=1);
/** Offline UI regression. No Pix creation, no payout, no PSP network call. */
$root='/var/www/html/public/static/';
$seller=(string)file_get_contents($root.'merchant-portal.js');
$admin=(string)file_get_contents($root.'quick-pix-receipt.js');
$adminHtml=(string)file_get_contents($root.'admin.html');
$sellerHtml=(string)file_get_contents($root.'client.html');
$css=(string)file_get_contents($root.'pix-code-alignment.css');
foreach([
 'seller one-line readonly input'=>"field.type='text';field.readOnly=true;",
 'seller full source intact'=>'field.value=charge.pix_copy_paste',
 'seller full QR intact'=>'text:charge.pix_copy_paste',
 'seller copy intact'=>'navigator.clipboard.writeText(field.value)',
 'seller line flex'=>'row.append(label,copy);',
 'seller copy accessibility'=>"copy.setAttribute('aria-label','Copiar código Pix completo')",
 'seller code label'=>"label.textContent='Pix Copia e Cola'"
] as $label=>$term)
 if(!str_contains($seller,$term))throw new RuntimeException('Seller Pix layout regression: '.$label);
if(str_contains($seller,"document.createElement('textarea');field.rows=2"))
 throw new RuntimeException('Reseller still creates multiline Pix field');
foreach([
 'admin full copy icon'=>'Copiar código Pix completo',
 'admin code row'=>"qr('argus-pix-code-row')",
 'admin separated title'=>"qr('argus-pix-code-title')",
 'admin helper outside field'=>"alignedRow.after(help)",
 'admin QR intact'=>"text:code.value",
 'admin one line'=>"code.setAttribute('rows','1')",
 'admin payload intact'=>'code.value'
] as $label=>$term)
 if(!str_contains($admin,$term))throw new RuntimeException('Admin Pix layout regression: '.$label);
foreach([
 'seller input CSS'=>'#seller-pix-dialog #seller-active-pix .seller-pix-code-single',
 'seller no wrapping'=>'white-space:nowrap!important',
 'seller icon dimension'=>'flex:0 0 54px!important',
 'admin aligned button'=>'.argus-pix-code-row .argus-pix-copy-icon',
 'admin title detached'=>'#argus-pix-code-title',
 'admin helper detached'=>'#argus-pix-code-helper'
] as $label=>$term)
 if(!str_contains($css,$term))throw new RuntimeException('Pix alignment CSS regression: '.$label);
foreach([$adminHtml,$sellerHtml] as $file)
 if(!str_contains($file,'pix-code-alignment.css?v=20261123-3'))
  throw new RuntimeException('Cache-busted layout CSS missing');
if(!str_contains($adminHtml,'quick-pix-receipt.js?v=aligned-20261123-3')||
 !str_contains($sellerHtml,'merchant-portal.js?v=aligned-20261123-3'))
 throw new RuntimeException('Cache-busted Pix UI JS missing');
if(str_contains($seller,'/api/admin/quick-pix')){
 throw new RuntimeException('Seller must not trigger Admin Pix operation');
}
echo "PASS: reseller Pix single-line, full code copying, same original QR, admin aligned copy button, mobile CSS, no financial operations.\n";
