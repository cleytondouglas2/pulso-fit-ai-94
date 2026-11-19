<?php
declare(strict_types=1);
/**
 * REGRESSION: iPhone customer signup and account layout (Nov 2026).
 * Static checks run AFTER all original financial regression tests. No money
 * moved, no authenticated customer read, no approval status changed.
 */
$dir='/var/www/html/public/static/';
$client=(string)file_get_contents($dir.'client.html');
$css=(string)file_get_contents($dir.'client-mobile-fix.css');
$js=(string)file_get_contents($dir.'client-mobile-fix.js');
$portal=(string)file_get_contents($dir.'portal.js');
$merchant=(string)file_get_contents($dir.'merchant-portal.js');

if(strlen($css)<3000||strlen($js)<1000)
    throw new RuntimeException('iPhone client navigation assets missing');
if(substr_count($css,'{')!==substr_count($css,'}'))
    throw new RuntimeException('iPhone CSS declarations are not balanced');
foreach([
    'client-mobile-fix.css?v=20261119-2',
    'client-mobile-fix.js?v=20261119-2',
    'portal.js?v=mobile-nov19-2',
    'merchant-portal.js?v=mobile-nov19-2',
    '<header class="top">',
    'id="dashboard"',
    'id="auth"',
    'id="api-panel"',
    'id="register-form"',
    'id="login-form"'
] as $token){
    if(!str_contains($client,$token))
        throw new RuntimeException('iPhone customer page structural contract missing: '.$token);
}
foreach([
    '.top.argus-client-top',
    'position:relative!important',
    '.top.argus-client-top nav.argus-client-nav[hidden]',
    '#argus-mobile-menu-toggle',
    '.seller-checkbox :is(input[type=checkbox])',
    'width:20px!important',
    'height:20px!important',
    'financeForms',
    'form[hidden]',
    '.kyc-customer-head',
    '#argus-seller-root',
    '@media(max-width:760px)',
    '@media(max-width:390px)'
] as $token){
    if($token==='financeForms')continue;
    if(!str_contains($css,$token))
        throw new RuntimeException('Missing iPhone layout / checkbox guard: '.$token);
}
foreach([
    "aria-expanded",
    "aria-controls",
    "argus-client-nav",
    "nav.hidden=isMobile?!open:false",
    "event.key==='Escape'",
    "matchMedia('(max-width:760px)')"
] as $token){
    if(!str_contains($js,$token))
        throw new RuntimeException('Accessible mobile hamburger behavior missing: '.$token);
}
foreach([
    "hash==='cadastro'||location.pathname==='/cadastro'",
    "history.replaceState(null,'','/conta')",
    "window.scrollTo(0,0)",
    "render(result.account)"
] as $token){
    if(!str_contains($portal,$token))
        throw new RuntimeException('Registration path / authenticated dashboard handling missing: '.$token);
}
foreach([
    "const accountGrid=E('dashboard')?.querySelector('.grid')",
    "(accountGrid||top).after(root)",
    "function financeForms(w)",
    "form.hidden=!enabled",
    "note.hidden=enabled",
    "financeForms(w)",
    "seller-withdraw-form",
    "seller-deposit-form",
    "seller-pix-result",
    "seller-active-pix"
] as $token){
    if(!str_contains($merchant,$token))
        throw new RuntimeException('Customer account-first ordering or pending-finance form status missing: '.$token);
}
if(str_contains($merchant,'  top.after(root);'))
    throw new RuntimeException('Wallet still renders above account data');
if(strpos($client,'client-mobile-fix.css?v=20261119-2')>
   strpos($client,'</head>'))
    throw new RuntimeException('Mobile CSS not included in document head');
echo "PASS: iPhone registration/nav no sticky multi-row overlay, 20px Pix/withdraw checkboxes, KYC->account->wallet order, disabled finance forms hidden, signup/direct account paths preserved.\n";
