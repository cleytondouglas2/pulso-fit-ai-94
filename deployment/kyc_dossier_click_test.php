<?php
declare(strict_types=1);
/**
 * UI regression for manual selection in the Super Admin's Central KYC.
 * Static assertions only: no customer documents or real KYC decisions read.
 */
$path='/var/www/html/public/static/';
$html=(string)file_get_contents($path.'admin.html');
$js=(string)file_get_contents($path.'kyc-studio.js');
$css=(string)file_get_contents($path.'kyc-studio.css');
if(!str_contains($html,'<section id="kyc-dossier" class="kyc-dossier-panel" aria-live="polite" hidden>'))
    throw new RuntimeException('Identity dossier must be initially hidden');
foreach(['kyc-studio.js?v=click-20261119-2','kyc-studio.css?v=click-20261119-2'] as $asset)
    if(substr_count($html,$asset)!==1)
        throw new RuntimeException('Admin KYC JS/CSS was not cache-busted: '.$asset);
foreach([
    'function closeDossier(){',
    'target.hidden=true;target.replaceChildren()',
    'function detail(a){',
    'target.hidden=false',
    "classList.add('kyc-has-selection')",
    'data-kyc-account',
    'aria-expanded',
    'aria-controls="kyc-dossier"',
    "else if(!queue.some(x=>x.id===selected))selected='';",
    'else closeDossier();',
    'if(selected===id){selected=',
    "E('kyc-close-dossier')?.addEventListener('click'",
    'const clearForFilter=()=>{selected=',
    "E('kyc-search')?.addEventListener('input',clearForFilter)",
    "E('kyc-filter')?.addEventListener('change',clearForFilter)",
    "requestAnimationFrame(()=>E('kyc-dossier')?.scrollIntoView",
    'window.argusOpenKycApplication=function(accountId)',
    "E('kyc-decision-form')?.addEventListener('submit',decide)",
    "E('kyc-finance-form')?.addEventListener('submit',release)"
] as $token)
    if(!str_contains($js,$token))
        throw new RuntimeException('KYC manually-opened dossier behavior missing: '.$token);
if(str_contains($js,"selected=queue[0]?.id||''"))
    throw new RuntimeException('KYC dossier must never auto-open the first reseller');
foreach([
    '.kyc-dossier-panel[hidden]{display:none!important}',
    '.kyc-workbench:not(.kyc-has-selection)',
    '#kyc-close-dossier',
    '@media(max-width:950px)'
] as $token)
    if(!str_contains($css,$token))
        throw new RuntimeException('KYC dossier hide/layout rule missing: '.$token);
if(substr_count($css,'{')!==substr_count($css,'}'))
    throw new RuntimeException('KYC styles have unmatched brackets');
echo "PASS: Central KYC dossier only opens on explicit reseller selection, closes on second tap/search/filter, iPhone scrolls to chosen dossier, original KYC decisions preserved.\n";
