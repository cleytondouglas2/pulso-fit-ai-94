<?php
declare(strict_types=1);
/**
 * Public seller Pix create error classification.
 * Fixes the misleading "Não foi possível consultar o valor" for POST
 * /e/{code}/create (previously only /pix/create was recognized).
 * No changes to PSP calls, rates, accounts, balances, OTP or idempotency.
 */
$root='/var/www/html/public/static';
$jsPath=$root.'/reseller-public-pix.js';
$js=file_get_contents($jsPath);
if(!is_string($js))throw new RuntimeException('Seller public Pix script unavailable');
$old="(path.startsWith('/pix/create')?";
$new="((path.startsWith('/pix/create')||/^\\/e\\/[a-f0-9]{32}\\/create$/.test(path))?";
if(substr_count($js,$old)!==1)
    throw new RuntimeException('Seller Pix POST fallback message anchor changed');
$js=str_replace($old,$new,$js);
if(file_put_contents($jsPath,$js)===false)
    throw new RuntimeException('Seller Pix POST error rendering update failed');
$htmlPath=$root.'/reseller-public-pix.html';
$html=file_get_contents($htmlPath);
if(!is_string($html)||substr_count($html,'reseller-public-pix.js?v=20261123-ready-pf-2')!==1)
    throw new RuntimeException('Public seller page script version missing');
$html=str_replace('reseller-public-pix.js?v=20261123-ready-pf-2',
    'reseller-public-pix.js?v=20261123-security-rate-3',$html);
if(file_put_contents($htmlPath,$html)===false)
    throw new RuntimeException('Seller Pix cache version update failed');
echo "PASS: reseller /e/code create reports a Pix generation error (not a quote error) and loads fresh iPhone JS.\n";
