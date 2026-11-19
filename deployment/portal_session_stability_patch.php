<?php
declare(strict_types=1);
/**
 * ARGUS iOS Safari: avoid repeated flashes of the login page while an
 * authenticated account is being checked and after browser back/forward.
 *
 * Browser visibility never decides authorization: the existing server-side
 * session, CSRF, finance and KYC checks are unchanged.
 */
$root='/var/www/html/public/static';
$clientPath=$root.'/client.html';
$html=file_get_contents($clientPath);
if(!is_string($html)||substr_count($html,'</head>')!==1||
   substr_count($html,'<main class="wrap">')!==1||
   substr_count($html,'<section id="auth">')!==1||
   substr_count($html,'<section id="dashboard" hidden>')!==1)
    throw new RuntimeException('Session stabilization: unexpected client HTML structure');
$critical=<<<'CSS'
<style id="argus-session-visibility-critical">
[hidden]{display:none!important}
#argus-session-loading{max-width:690px;margin:26px auto 34px;padding:26px 21px;text-align:center;
 border:1px solid #595044;border-radius:16px;background:linear-gradient(125deg,#1b222d,#141b25);
 box-shadow:0 10px 34px rgba(0,0,0,.15);color:#ebd7b7}
#argus-session-loading .argus-loading-symbol{display:inline-flex;justify-content:center;align-items:center;
 width:46px;height:46px;border:2px solid #c49c69;border-top-color:transparent;
 border-radius:50%;animation:argus-session-spin 1.2s linear infinite;margin-bottom:12px}
#argus-session-loading p{font-size:14px;line-height:1.6;margin:5px 0 13px;color:#d5dbdf}
#argus-session-loading button{border:1px solid #d1a66c;background:#372e23;border-radius:9px;
 color:#f2deb7;min-height:42px;padding:9px 14px;font:inherit}
#argus-session-loading button[hidden]{display:none!important}
@keyframes argus-session-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){#argus-session-loading .argus-loading-symbol{animation:none;border-top-color:#c49c69}}
</style>
CSS;
$html=str_replace('</head>',$critical.'</head>',$html);
$loading=<<<'HTML'
<div id="argus-session-loading" role="status" aria-live="polite">
 <span class="argus-loading-symbol" aria-hidden="true"></span>
 <p id="argus-session-loading-message">Verificando sua conta com segurança…</p>
 <button id="argus-session-retry" type="button" hidden>Tentar novamente</button>
 <noscript><p>Ative JavaScript e recarregue a página para acessar sua conta.</p></noscript>
</div>
HTML;
$html=str_replace('<main class="wrap">','<main class="wrap">'.$loading,$html);
$html=str_replace('<section id="auth">','<section id="auth" hidden>',$html);
if(substr_count($html,'/static/portal.js?v=mobile-nov19-2')!==1||
   substr_count($html,'/static/merchant-portal.js?v=mobile-nov19-2')!==1)
    throw new RuntimeException('Session stabilization: cached portal/merchant asset versions changed');
$html=str_replace('/static/portal.js?v=mobile-nov19-2',
    '/static/portal.js?v=session-nov19-3',$html);
$html=str_replace('/static/merchant-portal.js?v=mobile-nov19-2',
    '/static/merchant-portal.js?v=session-nov19-3',$html);
if(file_put_contents($clientPath,$html)===false)
    throw new RuntimeException('Session stabilization: cannot persist fail-closed initial markup');

$portalPath=$root.'/portal.js';
$portal=file_get_contents($portalPath);
$old="if(!response.ok)throw Error(value.detail||'Falha na solicitação');return value;";
$new="if(!response.ok){const err=Error(value.detail||'Falha na solicitação');err.httpStatus=response.status;throw err}return value;";
if(!is_string($portal)||substr_count($portal,$old)!==1)
    throw new RuntimeException('Session stabilization: request error mapping changed');
$portal=str_replace($old,$new,$portal);

$start='async function start(){';
$end="\nstart();";
if(substr_count($portal,$start)!==1||substr_count($portal,$end)!==1)
    throw new RuntimeException('Session stabilization: startup boundaries not unique');
$before=strpos($portal,$start);
$after=strpos($portal,$end,$before);
if($before===false||$after===false)
    throw new RuntimeException('Session stabilization: cannot locate session startup');
$replacement=<<<'JS'
async function start(){
 // The HTML starts with BOTH login and account panels hidden. This prevents
 // the Safari login/dashboard flash until the server has verified the cookie.
 const auth=$('#auth'),dashboard=$('#dashboard');
 const loading=$('#argus-session-loading');
 const message=$('#argus-session-loading-message');
 const retry=$('#argus-session-retry');
 if(!auth||!dashboard||!loading||!message||!retry)return;
 auth.hidden=true;dashboard.hidden=true;loading.hidden=false;retry.hidden=true;
 message.textContent='Verificando sua conta com segurança…';
 retry.onclick=()=>location.reload();
 const wantSignup=location.pathname==='/cadastro'||location.hash.slice(1)==='cadastro';
 if(wantSignup)tab('register');
 let timeout;
 try{
   // A delayed/cold-start Render response should show progress, not a
   // misleading login. A timeout is safe because this is a read-only GET.
   const session=await Promise.race([
     request('/api/portal/session'),
     new Promise((_,reject)=>{
       timeout=setTimeout(()=>reject(Error('Tempo esgotado ao verificar a conta')),20000);
     })
   ]);
   if(!session||!session.account)throw Error('Resposta de sessão incompleta');
   render(session.account);
   if(location.pathname==='/cadastro'){
     history.replaceState(null,'','/conta');
     window.scrollTo(0,0);
   }
   loading.hidden=true;
 }catch(error){
   // A 401 from the authenticated endpoint means no active customer session.
   // Every other failure must remain a recoverable error, not become a
   // temporary login screen or cause an unnecessary account logout.
   if(error?.httpStatus===401){
     state.account=null;
     dashboard.hidden=true;
     loading.hidden=true;
     auth.hidden=false;
     return;
   }
   state.account=null;
   auth.hidden=true;
   dashboard.hidden=true;
   message.textContent='Não foi possível verificar sua sessão. Sua conta não foi desconectada. Verifique a conexão e tente novamente.';
   retry.hidden=false;
 }finally{
   if(timeout)clearTimeout(timeout);
 }
}
// On Safari back/forward cache restoration, re-check the server before
// presenting potentially outdated customer account and financial state.
window.addEventListener('pageshow',event=>{
 if(!event.persisted)return;
 $('#secret-once').hidden=true;
 $('#once-key').value='';
 $('#once-secret').value='';
 start();
});
JS;
$portal=substr($portal,0,$before).$replacement.substr($portal,$after);
if(file_put_contents($portalPath,$portal)===false)
    throw new RuntimeException('Session stabilization: cannot persist session verification UI');

$merchantPath=$root.'/merchant-portal.js';
$merchant=file_get_contents($merchantPath);
if(!is_string($merchant))throw new RuntimeException('Session stabilization: seller wallet missing');
// The existing financeForms(w) function checks authorization from /wallet.
// However forms were visible briefly during the first 750ms and while the
// wallet response was pending. Hide them in the initial DOM at all times.
foreach([
    '<form id="seller-withdraw-form" autocomplete="off">' =>
        '<form id="seller-withdraw-form" autocomplete="off" hidden>',
    '<form id="seller-deposit-form" autocomplete="off">' =>
        '<form id="seller-deposit-form" autocomplete="off" hidden>'
] as $from=>$to){
    if(substr_count($merchant,$from)!==1)
        throw new RuntimeException('Session stabilization: initial finance form anchor changed');
    $merchant=str_replace($from,$to,$merchant);
}
if(!str_contains($merchant,'function financeForms(w)')||
   !str_contains($merchant,'form.hidden=!enabled'))
    throw new RuntimeException('Session stabilization: financial enablement guard missing');
if(file_put_contents($merchantPath,$merchant)===false)
    throw new RuntimeException('Session stabilization: cannot persist finance form gate');

echo "PASS: iOS initial login/account flicker eliminated with verified server session, 401-only guest state, retryable transport errors, BFCache refresh and hidden unauthorized Pix/withdraw forms.\n";
