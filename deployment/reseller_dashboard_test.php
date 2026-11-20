<?php
declare(strict_types=1);
/** ARGUS seller-only admin look & feel; structural regression on final image. */
$root='/var/www/html/public/static/';
$html=(string)file_get_contents($root.'client.html');
$js=(string)file_get_contents($root.'reseller-dashboard.js');
$css=(string)file_get_contents($root.'reseller-dashboard.css');
$portal=(string)file_get_contents($root.'portal.js');
$wallet=(string)file_get_contents($root.'merchant-portal.js');
$kyc=(string)file_get_contents($root.'kyc-portal.js');
if(substr_count($html,'/static/reseller-dashboard.css?v=admin-v1-20261119')!==1||
   substr_count($html,'/static/reseller-dashboard.js?v=admin-v1-20261119')!==1||
   substr_count($html,'<section id="auth" hidden>')!==1||
   substr_count($html,'<section id="dashboard" hidden>')!==1||
   substr_count($html,'<div class="dash-top"><div>')!==1)
    throw new RuntimeException('Customer dashboard assets/auth visibility not installed correctly');
if(!str_contains($html,'class="res-api-permission"')||
   !str_contains($html,'id="allow-api-withdraw" type="checkbox"')||
   substr_count($html,'id="create-key"')!==1)
    throw new RuntimeException('Reseller integrations must keep a single key form and wrap the payout permission');
if(substr_count($css,'{')!==substr_count($css,'}'))
    throw new RuntimeException('Reseller dashboard CSS unmatched braces');
foreach([
  'body.argus-reseller-ready',
  'body.argus-reseller-ready>.top{display:none!important}',
  '.argus-reseller-sidebar',
  '.argus-reseller-toolbar',
  '.argus-reseller-drawer-backdrop:not([hidden])',
  '.argus-reseller-nav button.selected',
  'argus-reseller-page[hidden]',
  '@media(max-width:999px)',
  '@media(max-width:610px)',
  'seller-checkbox input[type=checkbox]',
  'prefers-reduced-motion'
] as $needle)if(!str_contains($css,$needle))
    throw new RuntimeException('Reseller admin-style responsive styles incomplete: '.$needle);
foreach([
 'argus-reseller-workspace',
 'argus-reseller-sidebar',
 'argus-reseller-toolbar',
 'argus-reseller-menu-button',
 'argus-reseller-toolbar-actions',
 'argus-reseller-page-overview',
 "page('registration'", "page('charges'", "page('wallet'", "page('integrations'",
 "page('history'", "page('statement'", "page('assistant'",
 'data-reseller-view=', 'history.pushState', 'res-mobile-nav', 'filterCharges',
 "move(E('argus-seller-csv')", "move(E('argus-portal-ai')",
 "move(E('kyc-client-root')",
 "move(E('api-panel')",
 "merchant.querySelectorAll('.seller-panel')",
 "res-integration-grid",
 "res-profile-verification",
 "section.querySelector('#seller-withdraw-form')",
 "section.querySelector('#seller-deposit-form')",
 "section.querySelector('#seller-sales')",
 "dashboard.hidden",
 "MutationObserver",
 "event.key==='Escape'",
 "hashchange"
] as $needle)if(!str_contains($js,$needle))
    throw new RuntimeException('Reseller workspace missing navigation or original-function integration: '.$needle);
foreach(['fetch(','XMLHttpRequest','document.cookie','localStorage','sessionStorage','eval('] as $needle)
    if(str_contains($js,$needle))
        throw new RuntimeException('Dashboard presentation must not fetch/rewrite user financial state '.$needle);
if(substr_count($js,'wrapper.innerHTML=')!==1||
   str_contains($js,"E('seller-sales').innerHTML")||
   str_contains($js,"E('seller-balances').innerHTML")||
   str_contains($js,"E('seller-withdrawals').innerHTML"))
    throw new RuntimeException('Only static dashboard HTML may be constructed');
foreach([
 "request('/api/portal/session')",
 "if(error?.httpStatus===401)",
 "request('/api/portal/login'",
 "render(session.account)"
] as $needle)if(!str_contains($portal,$needle))
    throw new RuntimeException('Original session/login logic missing '.$needle);
foreach([
 "request('/api/portal/wallet')",
 "request('/api/portal/wallet/charges')",
 "request('/api/portal/wallet/withdrawals'",
 "request('/api/portal/wallet/charges',{method:'POST'",
 "request('/api/portal/keys')",
 "financeForms(w)",
 "dialog.showModal()",
 "request('/api/portal/wallet/charges/'+charge.id)",
 "data-charge-status"
] as $needle)if(!str_contains($wallet,$needle))
    throw new RuntimeException('Original seller finance protection changed '.$needle);
foreach(["function renderKyc(account)","id='kyc-client-root'","const prior=render;"] as $needle)
    if(!str_contains($kyc,$needle))
        throw new RuntimeException('Original KYC customer widget missing '.$needle);
echo "PASS: eight reseller areas and account routing, original DOM handlers and authorized account/session, KYC/Pix/withdraw/API routes preserved.\n";
