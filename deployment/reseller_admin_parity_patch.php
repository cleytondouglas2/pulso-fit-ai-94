<?php
declare(strict_types=1);
/**
 * ARGUS — seller dashboard experience aligned with the Super Admin visual
 * system, while preserving customer auth, money segregation and KYC decisions.
 *
 * Runs at the very end of the Docker build, after the original security,
 * KYC, Portal session and Seller dashboard tests.
 */
$static='/var/www/html/public/static';
function resellerParityReplace(string &$source,string $before,string $after,string $label):void {
    if(substr_count($source,$before)!==1)
        throw new RuntimeException('Reseller experience: unexpected template at '.$label);
    $source=str_replace($before,$after,$source);
}
foreach(['reseller-admin-parity.css','reseller-experience.js'] as $asset){
    if(!is_file($static.'/'.$asset)||filesize($static.'/'.$asset)<3000)
        throw new RuntimeException('Missing reseller experience asset '.$asset);
}

/* Account state is derived from the authoritative API result; it must never
 * imply that identity approval also granted the regulated Pix/payout scope. */
$portalPath=$static.'/portal.js';
$portal=file_get_contents($portalPath);
if(!is_string($portal))throw new RuntimeException('Reseller portal JS missing');
resellerParityReplace($portal,
    " const labels={documents_required:'Documentos necessários',documents_under_review:'Em análise documental',approved:'Aprovada',suspended:'Suspensa',rejected:'Recusada'};",
    " const kycStage=account.kyc_studio||{};\n".
    " const identityApproved=account.status==='identity_verified'||account.status==='approved'||kycStage.identity_approved===true;\n".
    " const financeAuthorized=account.status==='approved'&&kycStage.financial_enabled===true;\n".
    " const labels={documents_required:'Documentos necessários',documents_under_review:'Em análise documental',identity_verified:'Identidade aprovada',approved:'Cadastro financeiro autorizado',suspended:'Suspensa',rejected:'Recusada'};",
    'approved identity status mapping');
resellerParityReplace($portal,
    " $('#status').textContent=labels[account.status]||'Em avaliação';",
    " $('#status').textContent=identityApproved&&!financeAuthorized?'Identidade aprovada':(labels[account.status]||'Cadastro em avaliação');",
    'customer status pill');
resellerParityReplace($portal,
    " $('#status-message').textContent=account.status==='approved'?'Seu cadastro está aprovado para os serviços autorizados.':'Envie os documentos solicitados. O uso financeiro depende de análise e liberação.';",
    " $('#status-message').textContent=financeAuthorized?'Cadastro financeiro autorizado. A disponibilidade do Pix e dos saques depende do serviço e do saldo.':\n".
    "  identityApproved?'Seus documentos e sua identidade foram aprovados. A liberação para Pix, API e saques depende de autorização financeira separada.':\n".
    "  account.status==='documents_under_review'?'Documentos recebidos. A análise de identidade está em andamento.':\n".
    "  account.status==='rejected'?'Cadastro não aprovado. Verifique o parecer da análise.':\n".
    "  account.status==='suspended'?'Conta suspensa. Entre em contato com o suporte.':\n".
    "  'Confira as etapas do cadastro e os documentos obrigatórios.';",
    'accurate document vs financial approval');
resellerParityReplace($portal,
    "'</span><b>Recebido · análise pendente</b></div>'",
    "'</span><b>'+(d.review_status==='approved'?'✓ Documento aprovado':d.review_status==='needs_changes'?'Correções solicitadas':d.review_status==='rejected'?'Documento recusado':'Recebido · aguardando análise')+'</b></div>'",
    'per-file approved status');
resellerParityReplace($portal,
    " loadKeys();\n}",
    "  const publicStage={status:account.status,identity_approved:identityApproved,financial_authorized:financeAuthorized};\n".
    "  window.ArgusResellerStage=publicStage;\n".
    "  document.dispatchEvent(new CustomEvent('argus:reseller-stage',{detail:publicStage}));\n".
    " loadKeys();\n}",
    'read-only account stage event');
if(file_put_contents($portalPath,$portal)===false)
    throw new RuntimeException('Cannot update customer status UI');

/* The seller wallet previously displayed "document review pending" on ANY
 * finance API failure (including provider not enabled or temporary 503).
 * That made approved customers look unapproved. Keep error states separate. */
$merchantPath=$static.'/merchant-portal.js';
$merchant=file_get_contents($merchantPath);
if(!is_string($merchant))throw new RuntimeException('Reseller wallet JS missing');
resellerParityReplace($merchant,
    'let working=false,active=false,at=0;',
    'let working=false,active=false,at=0,lastAccount=null;',
    'seller account stage tracking');
resellerParityReplace($merchant,
    " if(!w){E('seller-balances').textContent='Identidade em análise ou operações financeiras ainda não autorizadas. Você pode acompanhar o cadastro e o histórico sem gerar Pix ou saques.';return}",
    " if(!w){\n".
    "  const approved=lastAccount&&(lastAccount.status==='identity_verified'||lastAccount.status==='approved'||lastAccount.kyc_studio?.identity_approved===true);\n".
    "  E('seller-balances').textContent=lastAccount?.status==='approved'?'Cadastro autorizado. Não foi possível consultar a carteira agora; utilize Atualizar.':approved?'Documentos e identidade aprovados. O recebimento Pix e os saques aguardam habilitação financeira ou consulta ao provedor.':lastAccount?.status==='documents_under_review'?'Documentos recebidos. A análise de identidade está em andamento.':lastAccount?.status==='rejected'?'Cadastro não aprovado; consulte o parecer.':'Acompanhando o cadastro. As operações financeiras dependem de autorização.';\n".
    "  return;\n".
    " }",
    'wallet read error not equal documentary rejection');
resellerParityReplace($merchant,
    " E('seller-key-status').textContent=v?.reason||'Verifique suas credenciais e o status de aprovação da conta.';",
    "  const kycDone=lastAccount&&(lastAccount.status==='identity_verified'||lastAccount.kyc_studio?.identity_approved===true);\n".
    "  E('seller-key-status').textContent=!v?.can_issue&&kycDone&&lastAccount?.status!=='approved'?'Identidade aprovada. A emissão de chaves depende da autorização financeira da conta.':(v?.reason||'Verifique suas credenciais e o status de aprovação da conta.');",
    'seller API key stage');
resellerParityReplace($merchant,
    "   const session=await request('/api/portal/session');active=!!session.account;\n   if(!active)return;",
    "   const session=await request('/api/portal/session');active=!!session.account;\n".
    "   if(!active)return;\n".
    "   lastAccount=session.account;\n".
    "   if(state.account&&(state.account.status!==lastAccount.status||\n".
    "      !!state.account.kyc_studio?.identity_approved!==!!lastAccount.kyc_studio?.identity_approved||\n".
    "      !!state.account.kyc_studio?.financial_enabled!==!!lastAccount.kyc_studio?.financial_enabled)){\n".
    "     render(lastAccount);\n".
    "   }",
    'recheck staff approval without refreshing the tab');
resellerParityReplace($merchant,
    " }catch(err){active=false;walletRender(null)}",
    "  }catch(err){if(err?.httpStatus===401)active=false;walletRender(null)}",
    'do not confuse transient wallet failure with logout');
if(file_put_contents($merchantPath,$merchant)===false)
    throw new RuntimeException('Cannot update seller wallet statuses');

/* The client KYC screen must respect the reviewed event even when an older
 * account status is awaiting the separate finance-release process. */
$kycUiPath=$static.'/kyc-portal.js';
$kycUi=file_get_contents($kycUiPath);
if(!is_string($kycUi))throw new RuntimeException('KYC customer UI missing');
resellerParityReplace($kycUi,
    "    const title=texts[account.status]||['Cadastro em avaliação','Aguarde a conferência da equipe ARGUS.'];",
    "    const title=kyc.identity_approved&&account.status!=='rejected'&&account.status!=='suspended'?\n".
    "      (account.status==='approved'?texts.approved:texts.identity_verified):\n".
    "      (texts[account.status]||['Cadastro em avaliação','Aguarde a conferência da equipe ARGUS.']);",
    'KYC user interface reflects signed reviewer approval');
resellerParityReplace($kycUi,
    "    const editable=['documents_required','documents_under_review'].includes(account.status);",
    "    const editable=!kyc.identity_approved&&['documents_required','documents_under_review'].includes(account.status);",
    'approved KYC files are not presented as awaiting replacement');
resellerParityReplace($kycUi,
    "(['identity_verified','approved'].includes(account.status)?'ready':'')",
    "(['identity_verified','approved'].includes(account.status)||kyc.identity_approved?'ready':'')",
    'KYC progress bar marks approval');
if(file_put_contents($kycUiPath,$kycUi)===false)
    throw new RuntimeException('Cannot update reviewed-identity customer display');

/* The KYC read-only summary exposes approval of identity as a distinct,
 * independently recorded state. It does NOT update the account status, link
 * a beneficiary, issue credentials or authorize any money movement. */
$kycPath='/var/www/html/src/KycStudio.php';
$kyc=file_get_contents($kycPath);
if(!is_string($kyc))throw new RuntimeException('KYC server not found');
resellerParityReplace($kyc,
    "            'status'=>\$account['status'],\n            'financial_enabled'=>\$account['status']==='approved'&&!empty(\$account['merchant_id']),",
    "            'status'=>\$account['status'],\n".
    "            'identity_approved'=>self::identityApproved(\$db,(string)\$account['id']),\n".
    "            'financial_enabled'=>\$account['status']==='approved'&&!empty(\$account['merchant_id']),",
    'KYC identity approval as read-only truth');
if(file_put_contents($kycPath,$kyc)===false)
    throw new RuntimeException('Cannot update KYC status projection');

/* Replace the generic spinner with the ORIGINAL public ARGUS Payments mark,
 * centered and animated like an administrative dashboard startup. */
$clientPath=$static.'/client.html';
$client=file_get_contents($clientPath);
if(!is_string($client))throw new RuntimeException('Reseller HTML not found');
resellerParityReplace($client,
    '<span class="argus-loading-symbol" aria-hidden="true"></span>',
    '<div class="argus-reseller-boot-logo" aria-hidden="true">'.
    '<img src="/static/assets/argus-payments-logo-transparent.webp" width="236" height="90" alt="">'.
    '<span class="argus-reseller-boot-track"><i></i></span></div>',
    'brand-first account loader');
resellerParityReplace($client,
    'Verificando sua conta com segurança…',
    'Preparando seu painel ARGUS Pay com segurança…',
    'reseller startup message');
resellerParityReplace($client,
    '<form method="post" action="/api/portal/register" id="register-form" class="form" hidden><h2>Comece com a ARGUS</h2>',
    '<form method="post" action="/api/portal/register" id="register-form" class="form" hidden><h2>Comece com a ARGUS</h2>'.
    '<p class="argus-signup-login">Já possui cadastro? <a href="/conta">Entrar no painel do revendedor</a></p>',
    'obvious customer sign-in from signup page');
resellerParityReplace($client,
    '</head>',
    '<link rel="stylesheet" href="/static/reseller-admin-parity.css?v=20261119-5"></head>',
    'final admin-matching stylesheet');
resellerParityReplace($client,
    '</body>',
    '<script defer src="/static/reseller-experience.js?v=20261119-5"></script></body>',
    'final admin-like transitions');
resellerParityReplace($client,
    '/static/kyc-portal.js?v=3',
    '/static/kyc-portal.js?v=status-20261119-5',
    'refresh approved KYC client assets on Safari');
resellerParityReplace($client,
    '/static/portal.js?v=session-nov19-3',
    '/static/portal.js?v=status-20261119-5',
    'bust stale KYC state on Safari');
resellerParityReplace($client,
    '/static/merchant-portal.js?v=session-nov19-3',
    '/static/merchant-portal.js?v=status-20261119-5',
    'bust stale seller wallet status on Safari');
if(file_put_contents($clientPath,$client)===false)
    throw new RuntimeException('Cannot install brand-first seller workspace');

/* Public landing: sign-in must be visible, especially on phones, not hidden
 * behind a hamburger or only offered after the long marketing content. */
$landingPath=$static.'/landing.html';
$landing=file_get_contents($landingPath);
if(!is_string($landing))throw new RuntimeException('ARGUS public page missing');
resellerParityReplace($landing,
    '<a class="btn btn-outline btn-large" href="#plataforma">Explorar a plataforma <span aria-hidden="true">↓</span></a>',
    '<a class="btn btn-outline btn-large" href="/conta">Já sou revendedor · Entrar <span aria-hidden="true">↗</span></a>',
    'public hero existing seller login');
resellerParityReplace($landing,
    '<p class="hero-footnote">A ativação financeira depende da aprovação cadastral e da disponibilidade da integração com o provedor.</p>',
    '<p class="argus-landing-features-link"><a href="#plataforma">Conhecer as funcionalidades ↓</a></p>'.
    '<p class="hero-footnote">A ativação financeira depende da aprovação cadastral e da disponibilidade da integração com o provedor.</p>',
    'keep product discovery linked');
resellerParityReplace($landing,
    '</head>',
    '<style>.argus-landing-features-link{font-size:12px;margin:13px 0 0;color:#e8c38d;font-weight:750}'.
    '.argus-landing-features-link a{text-decoration:underline;text-underline-offset:4px}'.
    '@media(max-width:820px){.site-header .header-actions .login-link{display:inline-flex!important;'.
    'font-size:12px;padding:8px 10px;border:1px solid #816746;border-radius:8px;white-space:nowrap}}'.
    '@media(max-width:390px){.site-header .brand{max-width:118px}.site-header .brand img{width:118px}}</style></head>',
    'public mobile sign-in always visible');
if(file_put_contents($landingPath,$landing)===false)
    throw new RuntimeException('Cannot expose existing reseller login on landing');
echo "PASS: real identity approval no longer appears as pending docs; financial status stays separate, logo-first account loading, reseller login CTA public, and admin-style presentation assets installed.\n";
