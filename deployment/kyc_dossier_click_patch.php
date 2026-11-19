<?php
declare(strict_types=1);
/**
 * A KYC dossier must never be visible before a reviewer has chosen a seller.
 * This is a presentation-only fix. Staff permissions, PDF previews, KYC review
 * approvals and payment authorization gates are unchanged.
 * Run after all existing KYC/UI patches and tests.
 */
$adminPath='/var/www/html/public/static/admin.html';
$html=file_get_contents($adminPath);
if(!is_string($html))throw new RuntimeException('KYC dossier: admin UI is missing');
$old='<section id="kyc-dossier" class="kyc-dossier-panel" aria-live="polite">';
$new='<section id="kyc-dossier" class="kyc-dossier-panel" aria-live="polite" hidden>';
if(substr_count($html,$old)!==1)
    throw new RuntimeException('KYC dossier: original UI container changed');
$html=str_replace($old,$new,$html);
foreach([
  'kyc-studio.js?v=1'=>'kyc-studio.js?v=click-20261119-2',
  'kyc-studio.css?v=1'=>'kyc-studio.css?v=click-20261119-2'
] as $from=>$to){
    if(substr_count($html,$from)!==1)
        throw new RuntimeException('KYC dossier: versioned asset not found: '.$from);
    $html=str_replace($from,$to,$html);
}
if(file_put_contents($adminPath,$html)===false)
    throw new RuntimeException('KYC dossier: cannot publish corrected admin page');
echo "PASS: hidden-by-default KYC dossier and versioned admin JS/CSS, without changing KYC authorization or document APIs.\n";
