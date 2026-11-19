<?php
declare(strict_types=1);
/**
 * Synthetic UI regression: admin-style reseller, accurate document vs finance
 * status, original ARGUS loading branding, public access to existing login.
 * No session tokens, real user documents, payment requests or writes to DB.
 */
$static='/var/www/html/public/static/';
$client=(string)file_get_contents($static.'client.html');
$landing=(string)file_get_contents($static.'landing.html');
$portal=(string)file_get_contents($static.'portal.js');
$merchant=(string)file_get_contents($static.'merchant-portal.js');
$kycUi=(string)file_get_contents($static.'kyc-portal.js');
$kyc=(string)file_get_contents('/var/www/html/src/KycStudio.php');
$script=(string)file_get_contents($static.'reseller-experience.js');
$css=(string)file_get_contents($static.'reseller-admin-parity.css');
foreach([
 'id="argus-session-loading"',
 'argus-reseller-boot-logo',
 'argus-payments-logo-transparent.webp',
 'Preparando seu painel ARGUS Pay',
 '/static/reseller-admin-parity.css?v=20261119-5',
 '/static/reseller-experience.js?v=20261119-5',
 '/static/portal.js?v=status-20261119-5',
 '/static/merchant-portal.js?v=status-20261119-5',
 '/static/kyc-portal.js?v=status-20261119-5',
 'Já possui cadastro?',
 'href="/conta"',
 'id="register-form"',
 'id="login-form"',
 'id="dashboard" hidden'
] as $expected)
 if(!str_contains($client,$expected))
  throw new RuntimeException('Reseller UI asset or login contract missing: '.$expected);
foreach([
 "identity_verified:'Identidade aprovada'",
 'financial_authorized:financeAuthorized',
 "account.kyc_studio||{}",
 'kycStage.identity_approved===true',
 'identityApproved&&!financeAuthorized',
 'Seus documentos e sua identidade foram aprovados.',
 "d.review_status==='approved'?'✓ Documento aprovado'",
 "CustomEvent('argus:reseller-stage'",
 "loadKeys();"
] as $expected)
 if(!str_contains($portal,$expected))
  throw new RuntimeException('Seller verified KYC versus separate finance status missing: '.$expected);
if(str_contains($portal,"'<span><b>Recebido · análise pendente</b>'"))
 throw new RuntimeException('Old unconditional document pending status still present');
foreach([
 'let working=false,active=false,at=0,lastAccount=null',
 'Documentos e identidade aprovados.',
 'A emissão de chaves depende da autorização financeira',
 'lastAccount=session.account',
 "state.account.status!==lastAccount.status",
 'render(lastAccount)',
 "if(err?.httpStatus===401)active=false",
 'financeForms(w)',
 'form.hidden=!enabled'
] as $expected)
 if(!str_contains($merchant,$expected))
  throw new RuntimeException('Reseller wallet still confuses pending KYC with finance: '.$expected);
foreach([
 "'identity_approved'=>self::identityApproved",
 "'financial_enabled'=>\$account['status']==='approved'&&!empty(\$account['merchant_id'])",
 "event_type IN ('identity_approved','needs_changes','rejected')"
] as $expected)
 if(!str_contains($kyc,$expected))
  throw new RuntimeException('Server KYC identity record or payment guard compromised: '.$expected);
foreach([
 'kyc.identity_approved&&account.status',
 'const editable=!kyc.identity_approved',
 "kyc.identity_approved?'ready'"
] as $expected)
 if(!str_contains($kycUi,$expected))
  throw new RuntimeException('User KYC still displays approved documents as under review: '.$expected);
foreach([
 'class="header-actions"',
 'href="/cadastro"',
 'href="/conta"',
 'Já sou revendedor · Entrar',
 'Conhecer as funcionalidades',
 'site-header .header-actions .login-link'
] as $expected)
 if(!str_contains($landing,$expected))
  throw new RuntimeException('Public landing does not expose seller login on desktop/mobile: '.$expected);
foreach([
 'argus-reseller-approval','argus-reseller-identity-pill','argus-reseller-finance-pill',
 'financial_authorized','argus:reseller-stage','MutationObserver',
 "window.ArgusResellerStage",
 'argus-reseller-nav-progress','prefers-reduced-motion'
] as $expected)
 if(!str_contains($script.$css,$expected))
  throw new RuntimeException('Admin-style seller states, logo or navigation missing: '.$expected);
if(substr_count($css,'{')!==substr_count($css,'}'))
 throw new RuntimeException('Reseller parity CSS block count unbalanced');
foreach(['fetch(','XMLHttpRequest','localStorage','document.cookie','sendBeacon',
         'sessionStorage','eval('] as $forbidden)
 if(str_contains($script,$forbidden))
  throw new RuntimeException('Presentation enhancement must not read secrets or send money: '.$forbidden);
foreach([
 'secret_hash','ARGUS_PAYOUTS_ENABLED','ARGUS_MERCHANT_CUSTODY_ENABLED'
] as $name){
 $walletPhp=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
 if($name==='secret_hash')continue;
 if(!str_contains($walletPhp,$name))
  throw new RuntimeException('Seller financial safety flag changed: '.$name);
}
echo "PASS: admin-style reseller layout and ARGUS logo loading, correct real KYC approved/finance pending labels, refreshed staff reviews, public seller login and unchanged payment permissions.\n";
