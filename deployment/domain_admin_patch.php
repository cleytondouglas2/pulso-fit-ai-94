<?php
declare(strict_types=1);
/** Install private Domain Management without modifying active hosts, payment flows or webhook URLs. */
$root='/var/www/html';
function domainPatch(string $path,string $old,string $new,string $label):void {
 $s=file_get_contents($path);
 if(!is_string($s)||substr_count($s,$old)!==1)
  throw new RuntimeException('Domain Management installer anchor changed: '.$label);
 if(file_put_contents($path,str_replace($old,$new,$s))===false)
  throw new RuntimeException('Domain Management installer write failed: '.$label);
}
domainPatch("$root/src/Gateway.php",
 "require_once __DIR__ . '/RevenueAwards.php';",
 "require_once __DIR__ . '/RevenueAwards.php';\nrequire_once __DIR__ . '/DomainControl.php';",
 'private DomainControl class registered');
$guard=<<<'PHP'
        // Custom domains require an authenticated Super Admin and MFA for all writes.
        if(str_starts_with($path,'/api/admin/domains/')){
            if(($actor['role']??'')!=='superadmin')
                self::fail('Somente o Super Admin pode gerenciar domínios',403);
            $payload=[];
            if($method==='POST'){
                self::writeAllowed($actor,true);
                $payload=self::input();
                self::verifyMfaCode($db,$actor,self::str($payload,'otp',6,6));
            }
            DomainControl::handle($db,$method,$path,$actor,$payload);
        }
PHP;
domainPatch("$root/src/Admin.php",
 "        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 $guard."\n        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 'Super Admin guarded routes and 2FA');
$admin="$root/public/static/admin.html";
domainPatch($admin,
 '<button class="menu-item super-only" data-nav="acquirer">',
 '<button class="menu-item super-only" data-nav="domains"><span>◎</span> Domínios do site</button>'.
 '<button class="menu-item super-only" data-nav="acquirer">',
 'domain navigation visible only to Super Admin');
$screen=<<<'HTML'
<section class="page" id="page-domains" hidden>
 <div id="argus-domain-shell" aria-label="Gestão de domínios do site">
  <div class="argus-domain-hero">
   <div><span class="argus-domain-kicker">ARGUS PAY · SUPER ADMIN · INFRAESTRUTURA</span>
    <h1>Domínios do site</h1>
    <p>Prepare e verifique um novo domínio sem desativar o endereço atual ou interromper Pix, cobranças, acessos e webhooks.</p></div>
   <button type="button" class="secondary" id="argus-domain-refresh">Atualizar situação</button>
  </div>
  <div class="argus-domain-grid">
   <section class="argus-domain-panel">
    <small>DOMÍNIO PREFERENCIAL CADASTRADO</small>
    <a class="argus-domain-value" id="argus-domain-active" href="https://arguspay.com.br" target="_blank" rel="noopener noreferrer">arguspay.com.br</a>
    <p id="argus-domain-mode">O domínio atual continua operando normalmente.</p>
    <p>Os domínios já cadastrados no Render não são removidos automaticamente. A troca de links e endereços de callback deve ser validada separadamente.</p>
   </section>
   <section class="argus-domain-panel">
    <small>NOVO DOMÍNIO EM PREPARAÇÃO</small>
    <strong class="argus-domain-value" id="argus-domain-staged">Nenhum domínio em preparação</strong>
    <span class="argus-domain-status" id="argus-domain-status">Aguardando consulta</span>
    <p id="argus-domain-connection">Conferindo a integração com o Render…</p>
    <p><a id="argus-domain-render" href="https://dashboard.render.com/web/srv-dbut6bu7bikc73auidf0" target="_blank" rel="noopener noreferrer">Abrir configuração de domínios no Render</a></p>
   </section>
   <section class="argus-domain-panel argus-domain-span">
    <h2>Cadastrar ou trocar o domínio</h2>
    <p>Exemplo: <strong>minhaempresa.com.br</strong> ou <strong>app.minhaempresa.com.br</strong>. O domínio atual permanecerá funcionando durante a preparação.</p>
    <label for="argus-domain-input">Novo domínio, sem https:// ou barras
     <input id="argus-domain-input" type="text" placeholder="app.novo-dominio.com.br" maxlength="253" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url"></label>
    <label for="argus-domain-otp">Código do autenticador 2FA do Super Admin
     <input id="argus-domain-otp" type="text" placeholder="000000" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code"></label>
    <div class="argus-domain-action">
     <button type="button" id="argus-domain-stage">1 · Salvar novo domínio</button>
     <button type="button" id="argus-domain-register" class="secondary" disabled>2 · Cadastrar no Render</button>
     <button type="button" id="argus-domain-verify" class="secondary" disabled>3 · Verificar DNS</button>
     <button type="button" id="argus-domain-activate" disabled>4 · Definir como preferencial</button>
    </div>
    <p class="argus-domain-notice">
     <strong>Segurança:</strong> todas as alterações exigem um novo código 2FA. A ativação só é permitida depois que o Render confirmar o domínio. O botão de preferência não executa redirecionamentos automáticos nem altera webhooks e callbacks existentes.
    </p>
    <p class="argus-domain-feedback" id="argus-domain-feedback" role="status" aria-live="polite">Carregando configurações…</p>
   </section>
   <section class="argus-domain-panel argus-domain-span" id="argus-domain-instructions" hidden>
    <h2>Configuração DNS e HTTPS</h2>
    <p>Depois de cadastrar o domínio no Render, configure o apontamento no seu provedor DNS.</p>
    <div class="argus-domain-dns">
     <div><small>Domínio</small><strong id="argus-domain-dns-host">—</strong></div>
     <div><small>Tipo de registro recomendado</small><strong id="argus-domain-dns-type">—</strong></div>
     <div><small>Destino do serviço no Render</small><strong id="argus-domain-dns-target">—</strong></div>
    </div>
    <ol class="argus-domain-checklist">
     <li>Cadastre o endereço no serviço correto do Render. Se houver cobrança adicional de domínio, confirme antes de prosseguir.</li>
     <li>Ajuste o DNS no provedor do domínio e remova registros conflitantes (inclusive AAAA, conforme documentação do Render).</li>
     <li>Verifique o domínio, confirme que o certificado HTTPS foi emitido e teste o novo endereço.</li>
     <li>Revise links públicos, aplicativos instalados, integrações, callback URLs e webhooks Pix. Mantenha o endereço antigo ativo até concluir a migração.</li>
    </ol>
   </section>
  </div>
 </div>
</section>
HTML;
domainPatch($admin,'<section class="page" id="page-acquirer" hidden>',
 $screen.'<section class="page" id="page-acquirer" hidden>',
 'isolated domain management page');
domainPatch($admin,'</head>',
 '<link rel="stylesheet" href="/static/domain-admin.css?v=20261123-1"></head>',
 'domain management stylesheet');
domainPatch($admin,'</body>',
 '<script defer src="/static/domain-admin.js?v=20261123-1"></script></body>',
 'domain management interactive JavaScript');
echo "PASS: Super Admin domain management, MFA-protected REST and passive Render registration; no routing, Pix, webhook or domain removal changes.\n";
