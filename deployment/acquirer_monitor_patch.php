<?php
declare(strict_types=1);
/**
 * Install restricted acquirer health tab and encrypted credential control.
 * No payment, payout, webhook or account operation is triggered by this installer.
 */
$root='/var/www/html';
function acqPatch(string $path,string $old,string $new,string $name):void {
    $s=file_get_contents($path);
    if(!is_string($s)||substr_count($s,$old)!==1)
        throw new RuntimeException('Acquirer install anchor changed: '.$name);
    if(file_put_contents($path,str_replace($old,$new,$s))===false)
        throw new RuntimeException('Acquirer install write: '.$name);
}
acqPatch("$root/src/Gateway.php",
 "require_once __DIR__ . '/FinanceOperations.php';",
 "require_once __DIR__ . '/FinanceOperations.php';\nrequire_once __DIR__ . '/AcquirerControl.php';",
 'protected backend class');
$anchor="        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){";
$handler=<<<'CODE'
        // Financial PSP management is an exclusively Super Admin route.
        if(str_starts_with($path,'/api/admin/acquirer/')){
            if(($actor['role']??'')!=='superadmin')
                self::fail('Somente o Super Admin pode gerenciar adquirentes',403);
            $payload=[];
            if($method==='POST'){
                self::writeAllowed($actor,true);
                $payload=self::input();
                self::verifyMfaCode($db,$actor,self::str($payload,'otp',6,6));
            }
            AcquirerControl::handle($db,$method,$path,$actor,$payload);
        }
CODE;
acqPatch("$root/src/Admin.php",$anchor,$handler."\n".$anchor,'Super Admin guarded routes');
foreach([
 'TraditionalQuickPix.php','MerchantWallet.php','ResellerPublicPix.php',
 'PixDiagnostics.php','LivePix.php','Integrations/MisticPayFinance.php',
 'Integrations/MisticPayPayout.php','Admin.php','PublicAdminPix.php'
] as $filename){
 $path="$root/src/$filename";
 $s=file_get_contents($path);
 if(!is_string($s))throw new RuntimeException("Missing acquirer source $filename");
 $old=$s;
 foreach([
   'ARGUS_TRADITIONAL_PIX_CLIENT_ID','ARGUS_TRADITIONAL_PIX_CLIENT_SECRET',
   'ARGUS_FINANCE_QR_CLIENT_ID','ARGUS_FINANCE_QR_CLIENT_SECRET',
   'ARGUS_MISTICPAY_PAYOUT_PK','ARGUS_MISTICPAY_PAYOUT_SK'
 ] as $env){
     $s=str_replace("getenv('$env')",
         "\\ArgusPayments\\AcquirerControl::effective('$env')",$s);
 }
 if($s!==$old && file_put_contents($path,$s)===false)
     throw new RuntimeException("Could not enable centralized credentials for $filename");
}
$admin="$root/public/static/admin.html";
$menu='<button class="menu-item super-only" data-nav="operations">';
acqPatch($admin,$menu,
 '<button class="menu-item super-only" data-nav="acquirer"><span>◈</span> Integração adquirente</button>'.$menu,
 'private Super Admin navigation');
$screen=<<<'HTML'
<section class="page" id="page-acquirer" hidden>
 <div class="argus-acq-shell">
  <div class="argus-acq-hero">
   <div><span class="argus-acq-eyebrow">ARGUS PAY · SUPER ADMIN · INTEGRAÇÕES</span>
    <h1>Conexão com a adquirente</h1>
    <p>Monitore o Pix, o Finance opcional e os saques de forma independente. Consulte permissões e conexão sem gerar cobranças ou movimentar saldo.</p></div>
   <button class="btn secondary" type="button" id="argus-acq-refresh">Verificar todas</button>
  </div>
  <div class="argus-acq-note" id="argus-acq-status" role="status">Carregando monitoramento seguro…</div>
  <div class="argus-acq-cards" id="argus-acq-cards"></div>
  <section class="argus-acq-editor" id="argus-acq-editor" hidden>
   <h2 id="argus-acq-heading">Configuração da integração</h2>
   <p id="argus-acq-current"></p>
   <p>Os campos são usados para preparar uma troca de chaves. A versão ativa permanece até haver teste autenticado e aprovação 2FA.</p>
   <form id="argus-acq-form" autocomplete="off">
    <input id="argus-acq-slot" name="slot" type="hidden">
    <div class="argus-acq-form-grid">
     <label>Adquirente
      <select id="argus-acq-provider" name="provider"><option value="misticpay">MisticPay (integrada)</option><option value="other">Outra adquirente (rascunho)</option></select>
     </label>
     <label id="argus-acq-other" hidden>Nome da nova adquirente
      <input id="argus-acq-other-name" name="provider_label" maxlength="80" autocomplete="off">
     </label>
     <label>Nova API Key
      <input id="argus-acq-key" name="api_key" autocomplete="off" spellcheck="false" maxlength="256" required>
     </label>
     <label>Novo API Secret
      <input id="argus-acq-secret" name="api_secret" type="password" autocomplete="new-password" spellcheck="false" maxlength="256" required>
     </label>
     <label>Código atual do autenticador 2FA
      <input id="argus-acq-otp" name="otp" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
     </label>
    </div>
    <div class="argus-acq-form-actions">
     <button type="submit" class="btn" id="argus-acq-save" disabled title="Editor exige habilitação do cliente autenticado">Salvar rascunho</button>
     <button type="button" class="btn secondary" id="argus-acq-test-draft" disabled>Testar rascunho</button>
     <button type="button" class="btn secondary" id="argus-acq-activate" disabled>Ativar nova chave</button>
     <button type="button" class="btn secondary" id="argus-acq-close" onclick="this.closest('section').hidden=true">Fechar</button>
    </div>
   </form>
   <p class="argus-acq-warn">As ações de alteração permanecem desabilitadas até o editor autenticado ser disponibilizado. Outras adquirentes exigem integração técnica homologada.</p>
   <p id="argus-acq-feedback" class="argus-acq-feedback" role="status" aria-live="polite">As credenciais atuais nunca são exibidas.</p>
  </section>
 </div>
</section>
HTML;
acqPatch($admin,'<section class="page" id="page-operations" hidden>',
 $screen.'<section class="page" id="page-operations" hidden>',
 'isolated acquisition management page');
acqPatch($admin,'</head>',
 '<link rel="stylesheet" href="/static/acquirer-monitor.css?v=1"></head>',
 'acquirer CSS');
acqPatch($admin,'</body>',
 '<script defer src="/static/acquirer-monitor.js?v=1"></script></body>',
 'acquirer JS');
echo "PASS: read-only acquirer monitor mounted with protected API; credential draft actions fail closed until authenticated editor is available.\n";
