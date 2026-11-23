<?php
declare(strict_types=1);
/**
 * Public-content-only ARGUS Site Studio integration.
 * Existing financial APIs, Pix, payers, risk rules, documents, private balances,
 * webhook destinations, domains, keys and auth are never changed by this patch.
 */
$root='/var/www/html';
function studioPatch(string $file,string $find,string $replace,string $name):void {
 $content=file_get_contents($file);
 if(!is_string($content)||substr_count($content,$find)!==1)
  throw new RuntimeException('Site Studio installation anchor changed: '.$name);
 if(file_put_contents($file,str_replace($find,$replace,$content))===false)
  throw new RuntimeException('Site Studio cannot update: '.$name);
}
studioPatch("$root/src/Gateway.php",
 "require_once __DIR__ . '/DomainControl.php';",
 "require_once __DIR__ . '/DomainControl.php';\nrequire_once __DIR__ . '/SiteStudio.php';",
 'site content service class');
$public=<<<'PHP'
            // Public content is read-only and contains no secrets or drafts.
            if($method==='GET'&&$path==='/api/public/site-studio'){
                SiteStudio::respondPublic($db);
            }
PHP;
studioPatch("$root/src/Gateway.php",
 "            // Only expressly opted-in seller recognition is public.",
 $public."\n            // Only expressly opted-in seller recognition is public.",
 'safe public published settings endpoint');
$protected=<<<'PHP'
        // Only the Super Admin may manage the public site.
        // Mutating requests require a valid, fresh authenticator code.
        if(str_starts_with($path,'/api/admin/site-studio/')){
            if(($actor['role']??'')!=='superadmin')
                self::fail('Somente o Super Admin pode administrar as páginas do site',403);
            $payload=[];
            if($method==='POST'){
                self::writeAllowed($actor,true);
                $payload=self::input();
                self::verifyMfaCode($db,$actor,self::str($payload,'otp',6,6));
            }
            SiteStudio::handle($db,$method,$path,$actor,$payload);
        }
PHP;
studioPatch("$root/src/Admin.php",
 "        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 $protected."\n        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 'Super Admin MFA and studio REST');
$admin="$root/public/static/admin.html";
studioPatch($admin,
 '<button class="menu-item super-only" data-nav="domains">',
 '<button class="menu-item super-only" data-nav="site-studio"><span>✦</span> Personalizar site</button>'.
 '<button class="menu-item super-only" data-nav="domains">',
 'new admin site designer menu');
$view=<<<'HTML'
<section class="page" id="page-site-studio" hidden>
 <div id="argus-studio-shell" aria-label="Central de personalização do site">
  <header class="argus-studio-head">
   <div><span class="argus-studio-eyebrow">ARGUS PAY · SUPER ADMIN · SITE STUDIO</span>
    <h1>Central de personalização</h1>
    <p>Um estúdio completo para cuidar da identidade, das informações e da experiência do seu site. Visualize, salve o rascunho e publique com segurança.</p>
   </div>
   <div class="argus-studio-head-icon" aria-hidden="true">✦</div>
  </header>
  <div class="argus-studio-topbar">
   <div class="argus-studio-topbar-left">
    <span class="argus-studio-pill" id="argus-studio-published-version">Versão pública 0</span>
    <span class="argus-studio-pill" id="argus-studio-dirty">Conferindo conteúdo…</span>
    <span class="argus-studio-pill" id="argus-studio-site-label">ARGUS Pay</span>
   </div>
   <div class="argus-studio-topbar-actions">
    <button class="argus-studio-btn secondary" type="button" id="argus-studio-reload">↻ Recarregar</button>
    <button class="argus-studio-btn secondary" type="button" id="argus-studio-reset">↶ Voltar à publicação</button>
    <button class="argus-studio-btn" type="button" id="argus-studio-save" disabled>☑ Salvar rascunho</button>
    <button class="argus-studio-btn" type="button" id="argus-studio-publish" disabled>✦ Publicar site</button>
   </div>
  </div>
  <div class="argus-studio-loading" id="argus-studio-loading">Preparando a central de personalização…</div>
  <div id="argus-studio-editor" hidden>
   <div class="argus-studio-main">
    <nav class="argus-studio-nav" aria-label="Categorias de personalização">
     <div class="argus-studio-nav-title">EDITAR SITE</div>
     <div id="argus-studio-categories"></div>
    </nav>
    <section class="argus-studio-editor-pane" aria-label="Campos do site">
     <div class="argus-studio-editor-tools">
      <input class="argus-studio-search" id="argus-studio-search" type="search"
       placeholder="Buscar textos, cores, links, seções…" aria-label="Buscar campo de edição">
      <span class="argus-studio-field-count" id="argus-studio-field-count">0</span>
     </div>
     <div id="argus-studio-fields"></div>
    </section>
    <section class="argus-studio-preview-pane" aria-label="Pré-visualização do site">
     <div class="argus-studio-preview-head">
      <h2>◉ Pré-visualização em tempo real</h2>
      <button type="button" class="argus-studio-btn secondary" id="argus-studio-preview-size">▣ Celular</button>
     </div>
     <div class="argus-studio-frame-wrap" id="argus-studio-frame-wrap">
      <iframe id="argus-studio-preview" title="Prévia do site público"
       loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
     </div>
     <p class="argus-studio-preview-caption">As alterações na prévia não afetam o site público antes de publicar.</p>
    </section>
   </div>
   <div class="argus-studio-bottom">
    <section class="argus-studio-approval" aria-label="Salvar e publicar">
     <h3>✦ Publicação protegida</h3>
     <p>Use um código atual do seu autenticador para salvar o rascunho, publicar ou restaurar uma versão. A publicação muda somente o conteúdo visual do site, não operações financeiras.</p>
     <label for="argus-studio-otp">Código de autenticação 2FA
      <input id="argus-studio-otp" type="text" placeholder="000000"
       inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6"
       autocomplete="one-time-code">
     </label>
     <div class="argus-studio-approval-actions">
      <button class="argus-studio-btn secondary" type="button" onclick="document.getElementById('argus-studio-save').click()">Salvar rascunho</button>
      <button class="argus-studio-btn" type="button" onclick="document.getElementById('argus-studio-publish').click()">Publicar alterações</button>
     </div>
     <p class="argus-studio-feedback" id="argus-studio-feedback" role="status" aria-live="polite">Selecione uma categoria para começar.</p>
    </section>
    <section class="argus-studio-history" id="argus-studio-history" aria-label="Histórico e restauração">
     <h3>Histórico de versões</h3>
     <p>Suas publicações ficarão registradas aqui.</p>
    </section>
   </div>
  </div>
 </div>
</section>
HTML;
studioPatch($admin,'<section class="page" id="page-domains" hidden>',
 $view.'<section class="page" id="page-domains" hidden>',
 'site studio editor area');
studioPatch($admin,'</head>',
 '<link rel="stylesheet" href="/static/site-studio-admin.css?v=20261123-1"></head>',
 'studio editor styles');
studioPatch($admin,'</body>',
 '<script defer src="/static/site-studio-admin.js?v=20261123-1"></script></body>',
 'studio editor JavaScript');
$landing="$root/public/static/landing.html";
studioPatch($landing,'</head>',
 '<link rel="stylesheet" href="/static/site-studio-public.css?v=20261123-1"></head>',
 'site presentation stylesheet');
studioPatch($landing,'</body>',
 '<script defer src="/static/site-studio-public.js?v=20261123-1"></script></body>',
 'safe published site content renderer');
echo "PASS: Super Admin site designer mounted, published-only public API, versioned 2FA editing and safe iframe preview.\n";
