<?php
declare(strict_types=1);
/**
 * Seller-only sign-in/enrolment visual parity with Admin. Runs at the very end
 * of the image build and never touches endpoints, KYC, balance or PSP logic.
 */
$dir='/var/www/html/public/static';
$htmlFile=$dir.'/client.html';
$original=file_get_contents($htmlFile);
if(!is_string($original))throw new RuntimeException('Seller entry: client page unavailable');
foreach(['reseller-entry-admin.css','reseller-entry-admin.js'] as $asset){
    if(!is_file($dir.'/'.$asset)||filesize($dir.'/'.$asset)<4000)
        throw new RuntimeException('Seller entry: asset unavailable '.$asset);
}
foreach([
    '<section id="auth" hidden>',
    'id="login-form"',
    'id="register-form"',
    'id="tab-login"',
    'id="tab-register"',
    'action="/api/portal/login"',
    'action="/api/portal/register"',
    'id="dashboard"',
    'id="argus-reseller-workspace"'
] as $needle){
    // The workspace id is created dynamically in JS and is not required in HTML.
    if($needle==='id="argus-reseller-workspace"')continue;
    if(!str_contains($original,$needle))
        throw new RuntimeException('Seller entry: source login/account structure changed: '.$needle);
}
if(substr_count($original,'</head>')!==1||substr_count($original,'</body>')!==1||
   str_contains($original,'/static/reseller-entry-admin.css')||
   str_contains($original,'/static/reseller-entry-admin.js'))
    throw new RuntimeException('Seller entry: page markers missing or duplicate assets');
$version='v=admin-entry-20261119-1';
$html=str_replace('</head>',
    '<link rel="stylesheet" href="/static/reseller-entry-admin.css?'.$version.'"></head>',
    $original);
$html=str_replace('</body>',
    '<script defer src="/static/reseller-entry-admin.js?'.$version.'"></script></body>',
    $html);
if(file_put_contents($htmlFile,$html)===false)
    throw new RuntimeException('Seller entry: cannot save screen');
echo "PASS: Admin-matching seller sign-in/signup visuals installed without replacing portal authentication, signup, KYC or account views.\n";
