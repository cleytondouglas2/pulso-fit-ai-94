<?php
declare(strict_types=1);
/**
 * The merchant entry is PRESENTATION ONLY. The original session handlers,
 * identity enrolment, KYC, finance protections and account screens must remain.
 */
$static='/var/www/html/public/static/';
$html=(string)file_get_contents($static.'client.html');
$portal=(string)file_get_contents($static.'portal.js');
$css=(string)file_get_contents($static.'reseller-entry-admin.css');
$js=(string)file_get_contents($static.'reseller-entry-admin.js');
foreach([
  'id="auth" hidden','id="tab-login"','id="tab-register"',
  'id="login-form"','id="register-form"',
  'action="/api/portal/login"','action="/api/portal/register"',
  'name="account_type"','name="display_name"','name="document_number"',
  'name="email"','name="password"',
  'id="dashboard" hidden','id="argus-session-loading"',
  '/static/reseller-entry-admin.css?v=admin-entry-20261119-1',
  '/static/reseller-entry-admin.js?v=admin-entry-20261119-1',
] as $required){
    if(!str_contains($html,$required))
        throw new RuntimeException('Seller entry required element missing: '.$required);
}
foreach([
    "request('/api/portal/login'",
    "request('/api/portal/register'",
    "request('/api/portal/session'",
    "request('/api/portal/logout'",
    "tab('register')",
] as $required){
    if(!str_contains($portal,$required))
        throw new RuntimeException('Original reseller authentication flow missing: '.$required);
}
foreach([
    '#auth .sheet','#auth .tabs','#auth .form',
    '.argus-entry-password-toggle','@media(max-width:560px)',
    '#auth .argus-entry-sheet-heading'
] as $required){
    if(!str_contains($css,$required))
        throw new RuntimeException('Seller responsive theme missing: '.$required);
}
foreach([
   'window.__argusResellerEntry','getElementById','MutationObserver',
   'input.type=revealed','argus-entry-sheet-title','argus-entry-brand',
   'pageState()','aria-selected'
] as $required){
   if(!str_contains($js,$required))
       throw new RuntimeException('Seller entry client interaction missing: '.$required);
}
foreach(['/api/portal/login','/api/portal/register','/api/portal/kyc/'] as $sensitive){
    if(str_contains($js,$sensitive))
        throw new RuntimeException('Presentation file must not implement auth or KYC API: '.$sensitive);
}
if(!str_contains($html,'reseller-admin-parity.css')||
   !str_contains($html,'reseller-dashboard.js')||
   !str_contains($html,'revenue-dashboard.js'))
    throw new RuntimeException('Seller workspace or financial dashboard was removed');
echo "PASS: visual admin alignment, working login/signup tabs, PF/PJ original registration, iOS adaptive form, password visibility and untouched secure endpoints.\n";
