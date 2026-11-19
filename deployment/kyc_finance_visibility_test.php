<?php
declare(strict_types=1);
/**
 * Explicit Super Admin finance status for both account types.
 * No approval request or external payment API is sent in this build test.
 */
$root='/var/www/html/public/static/';
$admin=(string)file_get_contents($root.'admin.html');
$js=(string)file_get_contents($root.'kyc-studio.js');
$css=(string)file_get_contents($root.'kyc-studio.css');
$portal=(string)file_get_contents('/var/www/html/src/Portal.php');
foreach(['js','css'] as $ext)
 if(substr_count($admin,'/static/kyc-studio.'.$ext.'?v=finance-20261119-1')!==1)
    throw new RuntimeException('Staff KYC assets not updated: '.$ext);
foreach([
 'if(staff()){',
 'const verified=a.kyc?.identity_approved===true',
 'if(!superuser()){',
 "else if(a.account_type==='PF'){",
 "else if(a.account_type==='PJ'&&a.status==='identity_verified'){",
 "else if(!verified){",
 'KYC aprovado, autorização financeira pendente.',
 'não possui ativação financeira de recebedores PF',
 'Não use o CNPJ do administrador para aprovar este CPF.',
 "a.status==='approved'&&a.merchant_linked",
 "E('kyc-finance-form')?.addEventListener('submit',release)",
 "data.decision='approve';",
 "form id=\"kyc-finance-form\"",
 "id=\"kyc-finance-status\""
] as $expected)
 if(!str_contains($js,$expected))
    throw new RuntimeException('Finance review UX/permission missing: '.$expected);
if(str_contains($js,"if(superuser() && a.account_type==='PJ' && a.status==='identity_verified')"))
    throw new RuntimeException('Finance eligibility section still hidden for PF');
foreach([
 '#kyc-finance-status',
 '.kyc-finance-warning',
 '.kyc-finance-success',
 '@media(max-width:600px)'
] as $expected)
 if(!str_contains($css,$expected))
    throw new RuntimeException('Mobile finance section CSS missing: '.$expected);
if(substr_count($css,'{')!==substr_count($css,'}'))
    throw new RuntimeException('Malformed KYC finance CSS');
if(!str_contains($portal,"if(\$a['account_type']==='PF'){")||
   !str_contains($portal,"'status'=>'identity_verified'")||
   !str_contains($portal,"if(!LivePix::readiness(\$db)['ready'])")||
   !str_contains($portal,"'provider_approved','contract_signed','split_direction_confirmed'"))
    throw new RuntimeException('Provider/onboarding financial safeguards changed');
echo "PASS: PF and PJ financial eligibility visible; PF remains blocked, PJ activation still requires Super Admin + verified KYC + provider validation; no financial privileges changed.\n";
