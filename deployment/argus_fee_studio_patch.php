<?php
declare(strict_types=1);
/** Super Admin-only ARGUS/MisticPay fee schedule. No financial transaction changes. */
$root='/var/www/html';
function feeReplace(string $file,string $anchor,string $replacement,string $label):void{
    $text=file_get_contents($file);
    if(!is_string($text)||substr_count($text,$anchor)!==1)
        throw new RuntimeException('ARGUS fee page anchor mismatch: '.$label);
    if(file_put_contents($file,str_replace($anchor,$replacement,$text))===false)
        throw new RuntimeException('ARGUS fee page cannot save: '.$label);
}
$gateway="$root/src/Gateway.php";
feeReplace($gateway,
    "require_once __DIR__ . '/KycStudio.php';",
    "require_once __DIR__ . '/KycStudio.php';\nrequire_once __DIR__ . '/FeePolicy.php';",
    'backend dependency');
$admin="$root/src/Admin.php";
$existing=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/payouts/readiness'){
PHP;
$replacement=<<<'PHP'
        if(str_starts_with($path,'/api/admin/fees'))
            FeePolicy::admin($db,$method,$path,$actor);
        if($method==='GET'&&$path==='/api/admin/payouts/readiness'){
PHP;
feeReplace($admin,$existing,$replacement,'authenticated superadmin API');

$html="$root/public/static/admin.html";
feeReplace($html,
    '<button class="menu-item super-only" data-nav="users">',
    '<button class="menu-item super-only" data-nav="fees"><span>◈</span> Configuração de taxas</button><button class="menu-item super-only" data-nav="users">',
    'admin navigation');
$section=<<<'HTML'
<section class="page" id="page-fees" hidden>
 <div class="argus-fee-studio" id="argus-fee-studio">
  <div class="argus-fee-top">
   <div><p class="argus-fee-eyebrow">SUPER ADMIN · GESTÃO FINANCEIRA</p>
    <h1>Configuração de taxas</h1>
    <p>Defina os custos da MisticPay e a precificação do ARGUS Pay separadamente, com histórico e prévia do resultado.</p></div>
   <div class="argus-fee-top-actions">
    <span id="argus-fee-version" class="argus-fee-version">Versão —</span>
    <button id="argus-fee-reload" class="btn secondary" type="button">Atualizar tabela</button>
   </div>
  </div>
  <div class="argus-fee-banner" role="note">
   <span aria-hidden="true">ⓘ</span>
   <p><strong>Modo configuração e simulação:</strong> os valores não alteram transações, QR Codes, saques ou saldos existentes. A cobrança efetiva depende da integração ao fluxo de liquidação e da divulgação prévia das tarifas aos clientes.</p>
  </div>
  <form id="argus-fee-form" autocomplete="off">
   <div class="argus-fee-grid">
    <section class="argus-fee-card">
     <div class="argus-fee-card-heading"><span class="argus-fee-icon">M</span><div><p>PROCESSADOR DE PAGAMENTOS</p><h2>Taxas MisticPay</h2></div></div>
     <p class="argus-fee-card-description">Custos pagos à MisticPay por operação. Valores iniciais conforme informados, ajustáveis quando seu contrato mudar.</p>
     <div class="argus-fee-field-grid">
      <label>Depósito Pix <small>custo por recebimento (R$)</small>
       <input name="mistic_deposit_cents" type="text" inputmode="decimal" value="0,50" placeholder="0,50" maxlength="8" required aria-label="Custo de depósito da MisticPay em reais"></label>
      <label>Saque Pix <small>custo por transferência (R$)</small>
       <input name="mistic_withdraw_cents" type="text" inputmode="decimal" value="0,50" placeholder="0,50" maxlength="8" required aria-label="Custo de saque da MisticPay em reais"></label>
     </div>
     <p class="argus-fee-footnote">Valores de referência cadastrados pelo operador, não tarifas confirmadas automaticamente pela API da MisticPay.</p>
    </section>
    <section class="argus-fee-card">
     <div class="argus-fee-card-heading"><span class="argus-fee-icon">A</span><div><p>PRECIFICAÇÃO DO GATEWAY</p><h2>Taxas ARGUS Pay</h2></div></div>
     <p class="argus-fee-card-description">Defina os valores que pretende cobrar pelo ARGUS Pay. É possível combinar uma taxa fixa com outra percentual.</p>
     <div class="argus-fee-group"><h3>Depósito Pix</h3><div class="argus-fee-field-grid">
      <label>Taxa fixa <small>R$ por depósito</small><input name="argus_deposit_fixed_cents" type="text" inputmode="decimal" placeholder="0,00" maxlength="8" required></label>
      <label>Taxa percentual <small>% por depósito</small><input name="argus_deposit_bps" type="text" inputmode="decimal" placeholder="0,00" maxlength="6" required></label>
     </div></div>
     <div class="argus-fee-group"><h3>Saque Pix</h3><div class="argus-fee-field-grid">
      <label>Taxa fixa <small>R$ por saque</small><input name="argus_withdraw_fixed_cents" type="text" inputmode="decimal" placeholder="0,00" maxlength="8" required></label>
      <label>Taxa percentual <small>% por saque</small><input name="argus_withdraw_bps" type="text" inputmode="decimal" placeholder="0,00" maxlength="6" required></label>
     </div></div>
     <p class="argus-fee-footnote">As taxas ARGUS começam em R$ 0,00 e 0%, até serem definidas pelo Super Admin.</p>
    </section>
   </div>
   <section class="argus-fee-simulator">
    <div class="argus-fee-simulator-head"><div><p class="argus-fee-eyebrow">SIMULADOR · TEMPO REAL</p><h2>Como ficam os valores?</h2>
     <p>Comparação de custo MisticPay, receita ARGUS e margem projetada por operação.</p></div>
     <label>Valor da transação <small>R$</small><input id="argus-fee-sample-amount" type="text" inputmode="decimal" value="100,00" maxlength="14" aria-label="Valor para simular taxas"></label>
    </div>
    <div class="argus-fee-sim-cards" id="argus-fee-sim-cards" aria-live="polite"></div>
    <p class="argus-fee-sim-note">Simulação antes de impostos, outras despesas e condições específicas do provedor. Não representa saldo disponível nem desconto realizado.</p>
   </section>
   <section class="argus-fee-save">
    <div><h2>Registrar nova tabela</h2><p>Toda alteração cria uma nova versão auditável. Os valores anteriores são preservados no histórico.</p>
     <label>Motivo da alteração <input id="argus-fee-reason" name="reason" minlength="8" maxlength="240" placeholder="Ex.: reajuste do custo do provedor" required></label></div>
    <button id="argus-fee-save" class="btn primary" type="submit" disabled>Salvar taxas</button>
   </section>
  </form>
  <section class="argus-fee-audit">
   <div class="argus-fee-history-head"><div><h2>Histórico de alterações</h2><p>Versões, responsáveis e justificativas</p></div><span>Últimas 20 alterações</span></div>
   <div id="argus-fee-history" class="argus-fee-history" aria-live="polite"><p>Carregando...</p></div>
  </section>
 </div>
</section>
HTML;
feeReplace($html,
    '<section class="page" id="page-users" hidden>',
    $section.'<section class="page" id="page-users" hidden>',
    'fee settings page');
feeReplace($html,'</head>',
    '<link rel="stylesheet" href="/static/fee-studio.css?v=1"></head>',
    'fee styles');
feeReplace($html,'</body>',
    '<script src="/static/fee-studio.js?v=1" defer></script></body>',
    'fee behavior');
echo "ARGUS fee studio: superadmin settings, separate provider/ARGUS rates, previews and audit installed. No settlement changes.\n";
