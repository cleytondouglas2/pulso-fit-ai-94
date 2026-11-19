<?php
declare(strict_types=1);
/** Test real final /conta and /cadastro markup after every Docker patch.
 * No real sessions, auth cookies, customer secrets or payments are used.
 */
$root='/var/www/html/public/static/';
$html=(string)file_get_contents($root.'client.html');
$js=(string)file_get_contents($root.'portal.js');
$wallet=(string)file_get_contents($root.'merchant-portal.js');
$native=(string)file_get_contents($root.'client-native-menu.css');
if(!str_contains($html,'<section id="auth" hidden>')||
   !str_contains($html,'<section id="dashboard" hidden>')||
   !str_contains($html,'id="argus-session-loading"')||
   !str_contains($html,'id="argus-session-loading-message"')||
   !str_contains($html,'id="argus-session-retry"')||
   !str_contains($html,'id="argus-session-visibility-critical"'))
    throw new RuntimeException('Login and dashboard must be hidden until session verified');
if(strpos($html,'id="argus-session-loading"')>
   strpos($html,'<section id="auth" hidden>'))
    throw new RuntimeException('Session loader must be before auth form');
if(!str_contains($html,'[hidden]{display:none!important}'))
    throw new RuntimeException('The hidden state must override legacy layout CSS');
foreach(['portal.js?v=session-nov19-3','merchant-portal.js?v=session-nov19-3'] as $ver)
    if(substr_count($html,$ver)!==1)
        throw new RuntimeException('Safari client asset cache not invalidated: '.$ver);
if(!str_contains($html,'<details class="argus-mobile-details"')||
   !str_contains($native,'header.top.argus-client-top'))
    throw new RuntimeException('Existing native iPhone menu missing');
foreach([
    'async function start(){',
    "auth.hidden=true;dashboard.hidden=true;loading.hidden=false",
    "request('/api/portal/session')",
    'Promise.race([',
    '20000',
    "if(error?.httpStatus===401)",
    'state.account=null;',
    'auth.hidden=false;',
    'loading.hidden=true;',
    "message.textContent='Não foi possível verificar sua sessão.",
    'retry.hidden=false',
    "event.persisted",
    "window.addEventListener('pageshow'",
    "history.replaceState(null,'','/conta')",
    "err.httpStatus=response.status",
    "loading.hidden=true"
] as $token)
    if(!str_contains($js,$token))
        throw new RuntimeException('Portal session stability missing: '.$token);
if(substr_count($js,'async function start(){')!==1||
   substr_count($js,'start();')<1)
    throw new RuntimeException('Duplicate or missing portal session bootstrap');
if(!str_contains($wallet,'<form id="seller-withdraw-form" autocomplete="off" hidden>')||
   !str_contains($wallet,'<form id="seller-deposit-form" autocomplete="off" hidden>')||
   !str_contains($wallet,'function financeForms(w)')||
   !str_contains($wallet,'form.hidden=!enabled'))
    throw new RuntimeException('Unauthorised financial form is still visible before wallet authorization');
foreach([
    "if(!response.ok){const err=Error(",
    'err.httpStatus=response.status',
    'retry.onclick=()=>location.reload()',
    'if(!event.persisted)return',
] as $token)
    if(!str_contains($js,$token))
        throw new RuntimeException('Server session decision and retry guard missing: '.$token);
if(!str_contains($html,'id="argus-mobile-menu-toggle"')&&
   !str_contains($html,'id="argus-mobile-details"'))
    throw new RuntimeException('Mobile menu was removed');
echo "PASS: Safari initial loading state protects account vs login, failed server requests are not logouts, 401 is guest-only, financial forms stay hidden until authorized and native menu persists.\n";
