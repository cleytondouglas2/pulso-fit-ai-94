<?php
declare(strict_types=1);
/**
 * Cache version bump after every prior KYC/SPA patch.
 * Presentation only. Never changes approvals, balances, provider credentials
 * or bank onboarding; PF activation remains blocked until PSP homologation.
 */
$admin='/var/www/html/public/static/admin.html';
$html=file_get_contents($admin);
if(!is_string($html))throw new RuntimeException('Financial eligibility admin markup missing');
foreach(['js','css'] as $ext){
    $from='/static/kyc-studio.'.$ext.'?v=click-20261119-2';
    $to='/static/kyc-studio.'.$ext.'?v=finance-20261119-1';
    if(substr_count($html,$from)!==1)
        throw new RuntimeException('Unexpected KYC '.$ext.' cached asset');
    $html=str_replace($from,$to,$html);
}
if(file_put_contents($admin,$html)===false)
    throw new RuntimeException('Could not update admin KYC cache versions');
echo "PASS: new KYC financial status UI assets published without altering provider or payment routes.\n";
