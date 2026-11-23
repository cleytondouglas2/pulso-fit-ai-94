<?php
declare(strict_types=1);
/**
 * Show the EXISTING public /pix checkout on the Super Admin overview.
 * Presentation only. No financial route, PSP API or ledger change.
 */
$dir='/var/www/html/public/static/';
$path=$dir.'admin.html';
$html=file_get_contents($path);
if(!is_string($html) || substr_count($html,'</head>')!==1 ||
   substr_count($html,'</body>')!==1 ||
   str_contains($html,'argus-admin-public-link.js'))
    throw new RuntimeException('Admin Pix card: expected unique insertion points');
foreach(['admin-public-link.js','reseller-public-link.css'] as $asset){
    if(!is_file($dir.$asset) || filesize($dir.$asset)<1000)
        throw new RuntimeException('Admin Pix card: missing asset '.$asset);
}
$html=str_replace('</head>',
    '<link rel="stylesheet" href="/static/reseller-public-link.css?v=admin-link-20261123-1">'.
    '<style>#argus-admin-public-link{box-sizing:border-box;width:100%;max-width:100%;margin:16px 0 24px}'.
    '#argus-admin-public-link .argus-rpl-url{max-width:100%}'.
    '#argus-admin-public-link .argus-rpl-primary,#argus-admin-public-link .argus-rpl-secondary{text-align:center}'.
    '@media(max-width:630px){#argus-admin-public-link{margin:14px 0 20px}}'.
    '</style></head>',$html);
$html=str_replace('</body>',
    '<script defer src="/static/admin-public-link.js?v=admin-link-20261123-1"></script></body>',$html);
if(file_put_contents($path,$html)===false)
    throw new RuntimeException('Admin Pix card: cannot write administration page');
echo "PASS: Super Admin overview uses own /pix card, without payment-flow changes.\n";
