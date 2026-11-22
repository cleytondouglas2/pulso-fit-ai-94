<?php
declare(strict_types=1);
/**
 * Seller UI race recovery – post-build only. Rehomes existing interactive nodes.
 * Financial APIs, session permissions, balances and Pix submission are unchanged.
 */
$static='/var/www/html/public/static';
function stabilitySwap(string &$source,string $old,string $new,string $label):void {
    if(substr_count($source,$old)!==1)throw new RuntimeException('Seller UI stability: expected '.$label);
    $source=str_replace($old,$new,$source);
}
$dashboardPath=$static.'/reseller-dashboard.js';
$dashboard=file_get_contents($dashboardPath);
if(!is_string($dashboard)||!str_contains($dashboard,'structuralSelector='))throw new RuntimeException('Optimized dashboard not present');
stabilitySwap($dashboard,
 "#argus-seller-csv,#argus-notification-widget';",
 "#argus-seller-csv,#argus-notification-widget,#seller-deposit-form,.seller-panel';",
 'form creation observer');
stabilitySwap($dashboard,
 "  move(E('seller-payout-history'),E('res-payout-history'));",
 "  // Recover late-mounted Pix form even when its panel was already detached\n".
 "  // from the original merchant root; move nodes rather than cloning handlers.\n".
 "  move(E('seller-deposit-form')?.closest('.seller-panel'),E('res-charge-form'));\n".
 "  move(E('seller-withdraw-form')?.closest('.seller-panel'),E('res-payout-form'));\n".
 "  move(E('seller-payout-history'),E('res-payout-history'));",
 'recover form node');
stabilitySwap($dashboard,
 "  openDrawer(false);\n  if(focus){",
 "  openDrawer(false);\n".
 "  // Immediate reconciliation on every tab change (not after a wallet fetch).\n".
 "  schedule();\n".
 "  document.dispatchEvent(new CustomEvent('argus:reseller-view',{detail:{page:id}}));\n".
 "  if(focus){",
 'page navigation reconciliation');
if(file_put_contents($dashboardPath,$dashboard)===false)throw new RuntimeException('Cannot update dashboard UI');

$revenuePath=$static.'/revenue-dashboard.js';
$revenue=file_get_contents($revenuePath);
if(!is_string($revenue)||!str_contains($revenue,'sellerLoading=true;'))throw new RuntimeException('Revenue UI not present');
stabilitySwap($revenue,
 ' if(!dash||dash.hidden||!overview||overview.hidden)return null;',
 ' if(!dash||dash.hidden||!overview)return null;',
 'background seller revenue prefetch');
stabilitySwap($revenue,
 " sellerLoading=true;\n try{",
 " sellerLoading=true;\n".
 " // A slow network must never leave an unchanged generic loader indefinitely.\n".
 " const slowNotice=setTimeout(()=>{\n".
 "  if(sellerLoading&&host.isConnected&&!host.querySelector('[data-revenue-refresh]')){\n".
 "   host.innerHTML='<p class=\"ar-revenue-pending\" role=\"status\">Consultando faturamento confirmado. A resposta do servidor está demorando; nenhuma movimentação ou saldo foi alterado.</p>';\n".
 "  }\n".
 " },5500);\n".
 " try{",
 'revenue slow progress status');
stabilitySwap($revenue,
 ' finally{sellerLoading=false;}',
 ' finally{clearTimeout(slowNotice);sellerLoading=false;}',
 'revenue completed status');
stabilitySwap($revenue,
 " document.addEventListener('argus:reseller-stage',()=>refreshSeller(true));",
 " document.addEventListener('argus:reseller-stage',()=>refreshSeller(true));\n".
 " document.addEventListener('argus:reseller-view',event=>{\n".
 "  if(event.detail?.page==='overview')refreshSeller();\n".
 " });",
 'revenue navigation request');
if(file_put_contents($revenuePath,$revenue)===false)throw new RuntimeException('Cannot update revenue UI');
echo "PASS: late Pix form recovery, navigation reconciliation, revenue prefetch and slow-status fallback\n";
