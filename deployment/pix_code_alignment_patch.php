<?php
declare(strict_types=1);
/**
 * UI-only, scoped post-install patch for BOTH Pix confirmation dialogs.
 * Retains identical Pix payload, QR generation, copy handlers and status polls.
 */
$static='/var/www/html/public/static/';
$sellerPath=$static.'merchant-portal.js';
$adminPath=$static.'quick-pix-receipt.js';
$adminHtmlPath=$static.'admin.html';
$sellerHtmlPath=$static.'client.html';
$seller=file_get_contents($sellerPath);
$admin=file_get_contents($adminPath);
$aHtml=file_get_contents($adminHtmlPath);
$sHtml=file_get_contents($sellerHtmlPath);
foreach([$seller,$admin,$aHtml,$sHtml] as $content)
 if(!is_string($content))throw new RuntimeException('Pix layout asset missing');
function pixReplaceOnce(string $content,string $find,string $replace,string $label):string{
 if(substr_count($content,$find)!==1)
  throw new RuntimeException('Pix code alignment anchor changed: '.$label);
 return str_replace($find,$replace,$content);
}
// Seller: one-line, readonly input retaining full original payload; copy action
// keeps using field.value and remains manually selectable on clipboard failure.
$seller=pixReplaceOnce($seller,
 "const field=document.createElement('textarea');field.rows=2;field.readOnly=true;",
 "const field=document.createElement('input');field.type='text';field.readOnly=true;\n".
 "   field.className='seller-pix-code-single';\n".
 "   field.setAttribute('autocomplete','off');field.setAttribute('spellcheck','false');",
 'seller multiline textarea');
$seller=pixReplaceOnce($seller,
 "copy.textContent='Copiar Pix Copia e Cola';",
 "copy.className='seller-pix-copy-icon';\n".
 "   copy.setAttribute('aria-label','Copiar código Pix completo');\n".
 "   copy.title='Copiar Pix Copia e Cola';\n".
 "   copy.innerHTML='<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\" width=\"23\" height=\"23\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3\"/></svg>';",
 'seller copy icon');
$seller=pixReplaceOnce($seller,
 "host.append(qr,field,copy);",
 "const label=document.createElement('label');label.className='seller-pix-code-label';\n".
 "   label.textContent='Pix Copia e Cola';label.appendChild(field);\n".
 "   const row=document.createElement('div');row.className='seller-pix-code-row';\n".
 "   row.append(label,copy);\n".
 "   const helper=document.createElement('small');helper.className='seller-pix-code-helper';\n".
 "   helper.textContent='O código completo será copiado, sem cortes.';\n".
 "   host.append(qr,row,helper);",
 'seller copy button aligned with code');
// Admin: separate title + helper from the horizontal input/button row.
// Reposition after original one-line read-only layout is decorated.
$fragment=<<<'JS'
const alignedRow=qr('argus-pix-code-row');
     if(alignedRow){
       let title=qr('argus-pix-code-title');
       if(!title){
         title=document.createElement('div');
         title.id='argus-pix-code-title';
         title.className='argus-pix-code-title';
         alignedRow.before(title);
       }
       title.textContent='Chave PIX / Pix Copia e Cola';
       if(label?.firstChild?.nodeType===3)label.firstChild.textContent='';
       const help=qr('argus-pix-code-helper');
       if(help && help.previousElementSibling!==alignedRow)alignedRow.after(help);
     }
JS;
$admin=pixReplaceOnce($admin,
 "code.scrollTop=0;",
 $fragment."\n     code.scrollTop=0;",
 'admin title/help row separation');
$aHtml=pixReplaceOnce($aHtml,
 '</head>','<link rel="stylesheet" href="/static/pix-code-alignment.css?v=20261123-3"></head>',
 'admin layout stylesheet');
$sHtml=pixReplaceOnce($sHtml,
 '</head>','<link rel="stylesheet" href="/static/pix-code-alignment.css?v=20261123-3"></head>',
 'seller layout stylesheet');
$aHtml=pixReplaceOnce($aHtml,
 'quick-pix-receipt.js?v=singleline-20261123-2',
 'quick-pix-receipt.js?v=aligned-20261123-3',
 'admin JS cache refresh');
$sHtml=preg_replace('~merchant-portal\.js\?v=[a-zA-Z0-9._-]+~',
  'merchant-portal.js?v=aligned-20261123-3',$sHtml,1,$count);
if(!is_string($sHtml)||$count!==1)
 throw new RuntimeException('Seller Pix JS version anchor missing');
foreach([$sellerPath=>$seller,$adminPath=>$admin,$adminHtmlPath=>$aHtml,$sellerHtmlPath=>$sHtml] as $path=>$content)
 if(file_put_contents($path,$content)===false)
  throw new RuntimeException('Pix layout asset update failed');
echo "PASS: seller Pix single-line input, full-value copy icon and admin copy alignment; payment and PSP code unchanged.\n";
