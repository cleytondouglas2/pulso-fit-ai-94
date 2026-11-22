<?php
declare(strict_types=1);
/**
 * ARGUS seller navigation performance patch.
 * Installed after strict legacy build tests; no payment API, ledger,
 * withdrawal, fee, session authorization or wallet calculations are changed.
 */
$dir='/var/www/html/public/static';
function argusPerfReplace(string &$content, string $from, string $to, string $name):void {
 if(substr_count($content,$from)!==1){
  throw new RuntimeException('Navigation performance: unexpected '.$name);
 }
 $content=str_replace($from,$to,$content);
}
function argusPerfSection(string &$content,string $start,string $end,string $replace,string $name):void {
 $a=strpos($content,$start);
 $b=($a===false)?false:strpos($content,$end,$a);
 if($a===false||$b===false||strpos($content,$start,$a+1)!==false){
  throw new RuntimeException('Navigation performance: cannot locate '.$name);
 }
 $content=substr($content,0,$a).$replace.substr($content,$b);
}

$merchantPath=$dir.'/merchant-portal.js';
$merchant=file_get_contents($merchantPath);
if(!is_string($merchant) || !str_contains($merchant,'sellerChargeBusy=false;')
   || !str_contains($merchant,'lastAccount=session.account;')){
 throw new RuntimeException('Navigation performance: the released seller Pix and account guards must be installed first');
}
$load=<<<'JS'
async function load(force=false){
 ensure();
 if(!E('argus-seller-root')||working||(!force&&Date.now()-at<12000))return;
 working=true;
 try{
  // The account, API keys and read-only wallet/history are independent
  // authenticated GET requests. Fetch them together rather than one after
  // another; the server continues to enforce authorization on every route.
  const [sessionResult,keysResult,activityResult]=await Promise.allSettled([
   request('/api/portal/session'),request('/api/portal/keys'),activities()
  ]);
  if(sessionResult.status!=='fulfilled')throw sessionResult.reason;
  const session=sessionResult.value;
  active=!!session.account;
  if(!active)return;
  lastAccount=session.account;
  if(state.account&&(state.account.status!==lastAccount.status||
     !!state.account.kyc_studio?.identity_approved!==!!lastAccount.kyc_studio?.identity_approved||
     !!state.account.kyc_studio?.financial_enabled!==!!lastAccount.kyc_studio?.financial_enabled)){
   render(lastAccount);
  }
  if(keysResult.status==='fulfilled')keysRender(keysResult.value);
  else{
   const message=E('seller-key-status');
   if(message)message.textContent='Não foi possível atualizar suas chaves agora. Use Atualizar para tentar novamente.';
  }
  if(activityResult.status==='rejected')throw activityResult.reason;
  at=Date.now();
 }catch(err){
  if(err?.httpStatus===401)active=false;
  // Keep the last successful authenticated wallet display if only a
  // background refresh fails. Never replace a known value with a false zero.
  const balances=E('seller-balances');
  if(balances&&!balances.querySelector('.seller-balance'))walletRender(null);
 }
 finally{working=false;}
}
JS;
argusPerfSection($merchant,'async function load(force=false){',"\nfunction createKey(){",$load,'seller read-only load()');
argusPerfReplace($merchant,'setTimeout(()=>load(true),750)','setTimeout(()=>load(true),75)','seller initial fetch delay');
if(!str_contains($merchant,'Promise.allSettled([') ||
   !str_contains($merchant,"request('/api/portal/wallet/charges',{method:'POST'") ||
   !str_contains($merchant,'sellerChargeBusy=false')){
 throw new RuntimeException('Navigation performance: seller Pix flow changed unexpectedly');
}
if(file_put_contents($merchantPath,$merchant)===false)throw new RuntimeException('Navigation performance: seller JS save failed');

$dashboardPath=$dir.'/reseller-dashboard.js';
$dashboard=file_get_contents($dashboardPath);
if(!is_string($dashboard))throw new RuntimeException('Navigation performance: reseller workspace missing');
$previous='const observer=new MutationObserver(schedule);';
$optimized=<<<'JS'
  // Rerender the workspace only for structural changes. The legacy observer
  // used to re-run rearrangement on *every* hidden attribute and all row
  // mutations, even while typing, changing a tab, or rendering a QR modal.
  const structuralSelector='#argus-seller-root,#seller-balances,#seller-pix-result,#seller-payout-history,#argus-reseller-approval,#kyc-client-root,#ar-seller-revenue,#argus-portal-ai,#argus-seller-csv,#argus-notification-widget';
  const observer=new MutationObserver(records=>{
   for(const change of records){
    if(change.type==='attributes'){
     if(change.target===dashboard){schedule();return;}
     continue;
    }
    if(change.target?.id==='seller-sales' ||
       change.target?.id==='seller-pix-result' ||
       change.target?.id==='argus-notification-widget'){
     schedule();return;
    }
    for(const node of change.addedNodes){
     if(node.nodeType===1 &&
        (node.matches?.(structuralSelector)||node.querySelector?.(structuralSelector))){
      schedule();return;
     }
    }
   }
  });
JS;
argusPerfReplace($dashboard,$previous,$optimized,'workspace observer');
if(!str_contains($dashboard,'function select(id,')||!str_contains($dashboard,'filterCharges();')){
 throw new RuntimeException('Navigation performance: workspace navigation mismatch');
}
if(file_put_contents($dashboardPath,$dashboard)===false)throw new RuntimeException('Navigation performance: workspace JS save failed');

$revenuePath=$dir.'/revenue-dashboard.js';
$revenue=file_get_contents($revenuePath);
if(!is_string($revenue))throw new RuntimeException('Navigation performance: revenue UI missing');
argusPerfReplace($revenue,
 ' if(!dash||dash.hidden||!overview)return null;',
 ' if(!dash||dash.hidden||!overview||overview.hidden)return null;',
 'avoid revenue polling while on unrelated tab');
if(file_put_contents($revenuePath,$revenue)===false)throw new RuntimeException('Navigation performance: revenue JS save failed');
echo "PASS: seller read-only requests parallel, navigation observer scoped, offscreen revenue not refreshed\n";
