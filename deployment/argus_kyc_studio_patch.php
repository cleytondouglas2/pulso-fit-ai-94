<?php
declare(strict_types=1);
/** Applied last, after existing account, notifications, QR, and KYC patches. */
$root='/var/www/html';
function kycReplace(string $file,string $find,string $replacement,string $label):void{
    $source=file_get_contents($file);
    if(!is_string($source)||substr_count($source,$find)!==1)
        throw new RuntimeException('KYC wiring mismatch: '.$label);
    if(file_put_contents($file,str_replace($find,$replacement,$source))===false)
        throw new RuntimeException('KYC wiring could not update '.$label);
}
kycReplace("$root/src/Gateway.php",
    "require_once __DIR__ . '/IdentityProfile.php';",
    "require_once __DIR__ . '/IdentityProfile.php';\nrequire_once __DIR__ . '/KycStudio.php';",
    'include KYC service');

$portal="$root/src/Portal.php";
kycReplace($portal,
    "'identity_profile'=>IdentityProfile::public(\$db,'portal',(string)\$a['id']),",
    "'identity_profile'=>IdentityProfile::public(\$db,'portal',(string)\$a['id']),\n            'kyc_studio'=>KycStudio::summary(\$db,\$a),",
    'customer KYC dossier status');
kycReplace($portal,
    "if(\$method==='POST'&&\$path==='/api/portal/documents')self::upload(\$db,\$account,self::body(4600000));",
    "if(str_starts_with(\$path,'/api/portal/kyc/'))KycStudio::portal(\$db,\$method,\$path,\$account);\n        if(\$method==='POST'&&\$path==='/api/portal/documents')KycStudio::upload(\$db,\$account);",
    'secure customer KYC uploads and representative route');
kycReplace($portal,
    "if(\$decision!=='approve')self::fail('Decisão inválida',422);",
    "if(\$decision!=='approve')self::fail('Decisão inválida',422);\n            if(!KycStudio::identityApproved(\$db,(string)\$a['id']))self::fail('KYC ainda não aprovado por um revisor autorizado',403);",
    'financial authorization requires independent KYC approval');

$old=<<<'PHP'
            self::out(['ok'=>true,'message'=>'Conta criada. A triagem cadastral automática foi solicitada; identidade e pagamentos dependem de revisão.','status'=>'documents_required'],201);
PHP;
$new=<<<'PHP'
            // Let the new customer enter the read-only dashboard immediately, without
            // receiving an API key or payment privilege. Session and CSRF are random.
            $token=bin2hex(random_bytes(32));$csrf=bin2hex(random_bytes(32));$expires=time()+28800;
            $db->run('INSERT INTO argus_portal_sessions(token_hash,account_id,csrf_hash,expires_at,created_at) VALUES (?,?,?,?,?)',
                [hash('sha256',$token),$id,hash('sha256',$csrf),$expires,self::now()]);
            self::cookie($token,$expires);self::csrfCookie($csrf,$expires);
            $fresh=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$id]);
            self::out(['ok'=>true,'message'=>'Cadastro realizado. Entre no painel e envie sua documentação para análise.',
                'status'=>'documents_required','account'=>self::summary($db,$fresh),'csrf_token'=>$csrf],201);
PHP;
kycReplace($portal,$old,$new,'immediate restricted dashboard after registration');

$admin="$root/src/Admin.php";
$find="if(str_starts_with(\$path,'/api/admin/portal/')){self::writeAllowed(\$actor,true);Portal::admin(\$db,\$method,\$path);}";
kycReplace($admin,$find,
    "if(str_starts_with(\$path,'/api/admin/kyc/'))KycStudio::admin(\$db,\$method,\$path,\$actor);\n        ".$find,
    'staff and superadmin protected KYC routes');

$client="$root/public/static/client.html";
kycReplace($client,'</head>',
    '<link rel="stylesheet" href="/static/kyc-portal.css?v=1"></head>',
    'KYC onboarding stylesheet');
kycReplace($client,'</body>',
    '<script src="/static/kyc-portal.js?v=1" defer></script></body>',
    'KYC onboarding controls');
$adminHtml="$root/public/static/admin.html";
kycReplace($adminHtml,
    '<button class="menu-item super-only" data-nav="applications">',
    '<button class="menu-item kyc-staff-only" data-nav="kyc-studio"><span>◈</span> Central KYC</button><button class="menu-item super-only" data-nav="applications">',
    'KYC analyst navigation');
$studio=<<<'HTML'
<section class="page" id="page-kyc-studio" hidden>
  <div class="kyc-studio-root" id="kyc-studio-root">
    <div class="kyc-studio-top">
      <div><p class="kyc-strap">ARGUS · CONFORMIDADE</p><h1>Central KYC</h1>
        <p>Conferência humana de documentos e habilitação segura das contas.</p></div>
      <button type="button" class="btn secondary" id="kyc-refresh">Atualizar solicitações</button>
    </div>
    <div class="kyc-stat-grid" id="kyc-stat-grid" aria-live="polite"></div>
    <div class="kyc-workbench">
      <aside class="kyc-queue-panel">
        <div class="kyc-queue-head"><h2>Fila de análise</h2><span id="kyc-queue-count">—</span></div>
        <div class="kyc-filters">
          <input id="kyc-search" type="search" placeholder="Buscar nome, e-mail ou ID" autocomplete="off" aria-label="Buscar cadastros">
          <select id="kyc-filter" aria-label="Filtrar situação">
            <option value="all">Todos os cadastros</option>
            <option value="documents_under_review">Aguardando análise</option>
            <option value="documents_required">Documentos pendentes</option>
            <option value="identity_verified">KYC aprovado</option>
            <option value="rejected">Rejeitados</option>
            <option value="approved">Financeiramente habilitados</option>
          </select>
        </div>
        <div id="kyc-queue" class="kyc-queue-list" aria-live="polite"></div>
      </aside>
      <section id="kyc-dossier" class="kyc-dossier-panel" aria-live="polite">
        <div class="kyc-empty"><span>◈</span><h2>Selecione um cadastro</h2>
          <p>Examine dados, documentos, verificações e histórico antes de registrar sua decisão.</p></div>
      </section>
    </div>
    <p class="kyc-footer-note">A validação de formato e a consulta pública de CNPJ não comprovam identidade. A aprovação KYC não autoriza Pix ou API sem homologação financeira.</p>
  </div>
</section>
HTML;
kycReplace($adminHtml,
    '<section class="page" id="page-applications" hidden>',
    $studio.'<section class="page" id="page-applications" hidden>',
    'interactive review workspace');
kycReplace($adminHtml,'</head>',
    '<link rel="stylesheet" href="/static/kyc-studio.css?v=1"></head>',
    'KYC analyst styles');
kycReplace($adminHtml,'</body>',
    '<script src="/static/kyc-studio.js?v=1" defer></script></body>',
    'KYC analyst controls');
echo "ARGUS KYC: protected uploads, immediate restricted portal access, staff review and independent financial guard wired.\n";
