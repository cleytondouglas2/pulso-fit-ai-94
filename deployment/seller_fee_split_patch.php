<?php
declare(strict_types=1);
/**
 * Versioned seller 50c/50c split bound to the existing Super Admin fee policy.
 * Execute AFTER platform_fee_treasury_patch.php. No real Pix calls here.
 */
$root='/var/www/html';
function sellerSplitReplace(string $file,string $before,string $after,string $label):void {
    $source=file_get_contents($file);
    if(!is_string($source)||substr_count($source,$before)!==1)
        throw new RuntimeException('Seller fee integration anchor mismatch: '.$label);
    if(file_put_contents($file,str_replace($before,$after,$source))===false)
        throw new RuntimeException('Seller fee integration write failed: '.$label);
}
sellerSplitReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/PlatformFeeTreasury.php';",
    "require_once __DIR__ . '/PlatformFeeTreasury.php';\nrequire_once __DIR__ . '/SellerFeeSplit.php';",
    'load merchant fee split');

// Policy defaults and historic manual settings remain versioned and immutable.
// Only system-seeded version 1 receives the one-time 50c ARGUS migration.
sellerSplitReplace($root.'/src/FeePolicy.php',
    "        if($path!=='/api/admin/fees')self::fail('Rota de taxas não encontrada',404);",
    "        if($path!=='/api/admin/fees')self::fail('Rota de taxas não encontrada',404);\n        SellerFeeSplit::bootstrapPolicy($db);",
    'bootstrap intended tariff defaults on admin fee page');

// Attribute only the ARGUS portion. An existing operation without an immutable
// split is legacy: keep its original journal unchanged, pending separate audit.
sellerSplitReplace($root.'/src/PlatformFeeTreasury.php',
    <<<'PHP'
        $fee=(int)$row['service_fee_cents'];
        $gross=(int)$row['amount_cents'];
PHP,
    <<<'PHP'
        $fee=(int)$row['service_fee_cents'];
        $gross=(int)$row['amount_cents'];
        $snapshot=SellerFeeSplit::get($db,
            $kind==='withdraw_paid'?'withdraw':'deposit',$opId);
        if($snapshot){
            if($snapshot['account_id']!==$accountId||
               $snapshot['total_fee_cents']!==$fee||
               $snapshot['gross_cents']!==$gross)
                self::fail('Divisão de tarifa incompatível com o lançamento original',409);
            $fee=$snapshot['argus_fee_cents'];
        }
PHP,
    'only ARGUS share becomes platform revenue');
sellerSplitReplace($root.'/src/PlatformFeeTreasury.php',
    <<<'PHP'
        return [
          'owner_email'=>self::OWNER,
PHP,
    <<<'PHP'
        $provider=SellerFeeSplit::providerCostSummary($db);
        $legacy=$db->one("SELECT COUNT(*) AS n FROM argus_platform_fee_journal j
          WHERE NOT EXISTS (SELECT 1 FROM argus_seller_fee_snapshots s
            WHERE s.operation_id=j.operation_id AND s.account_id=j.seller_account_id)");
        return [
          'provider_cost_estimate_cents'=>$provider['estimated_provider_cost_cents'],
          'split_fee_operations'=>$provider['split_fee_operations'],
          'provider_cost_mode'=>$provider['provider_cost_mode'],
          'legacy_unsplit_journal_events'=>(int)($legacy['n']??0),
          'owner_email'=>self::OWNER,
PHP,
    'provider cost separate from platform revenue');

// Existing isolated merchant wallet is the same custody ledger; only NEW
// operations get new prices. Their historical amounts never change.
$wallet=$root.'/src/MerchantWallet.php';
sellerSplitReplace($wallet,
    "    private const FEE=100;\n",
    '',
    'eliminate hard-coded R$ 1,00 price');
sellerSplitReplace($wallet,
    <<<'PHP'
            'service_fee_deposit_cents'=>self::FEE,'service_fee_withdraw_cents'=>self::FEE,
PHP,
    <<<'PHP'
            'service_fee_deposit_cents'=>SellerFeeSplit::quote($db,'deposit',10000)['total_fee_cents'],
            'service_fee_withdraw_cents'=>SellerFeeSplit::quote($db,'withdraw',10000)['total_fee_cents'],
            'fee_policy_version'=>FeePolicy::current($db)['version'],
            'fee_note'=>'Taxa por operação: custo MisticPay mais tarifa ARGUS; percentuais variam conforme o valor. Confirme a cotação antes de sacar.',
PHP,
    'seller wallet current fee display');
sellerSplitReplace($wallet,
    <<<'PHP'
        $id=self::uid('mwc');
        $db->run('INSERT INTO argus_seller_charges
            (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,
            net_cents,description,provider_id,copy_paste,status,created_at,checked_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
            $id,$accountId,$account['merchant_id'],$idem,$bodyHash,$gross,self::FEE,
            max(0,$gross-self::FEE),$desc,null,null,'creating',self::now(),null
        ]);
PHP,
    <<<'PHP'
        $quote=SellerFeeSplit::quote($db,'deposit',$gross);
        $id=self::uid('mwc');
        $db->transaction(static function(Database $db)use($id,$accountId,$account,$idem,$bodyHash,$gross,$quote,$desc){
            if(FeePolicy::current($db)['version']!==$quote['policy_version'])
                self::fail('Tabela de tarifas mudou antes do Pix; atualize a cotação',409);
            $db->run('INSERT INTO argus_seller_charges
                (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,
                net_cents,description,provider_id,copy_paste,status,created_at,checked_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
                $id,$accountId,$account['merchant_id'],$idem,$bodyHash,$gross,
                $quote['total_fee_cents'],$quote['net_cents'],$desc,null,null,'creating',self::now(),null
            ]);
            SellerFeeSplit::reserve($db,'deposit',$id,$accountId,$quote);
        });
PHP,
    'freeze deposit total and each beneficiary before calling PSP');
sellerSplitReplace($wallet,
    <<<'PHP'
        if(!is_int($amount)||$amount<200||$amount>10000)
            self::fail('Saque permitido: R$ 2,00 a R$ 100,00, com R$ 1,00 de serviço descontado do total',422);
        if(($data['confirm']??null)!==true)self::fail('Confirme o valor do saque e a taxa de serviço de R$ 1,00');
PHP,
    <<<'PHP'
        if(!is_int($amount)||$amount<200||$amount>10000)
            self::fail('Saque permitido: R$ 2,00 a R$ 100,00',422);
        if(($data['confirm']??null)!==true)
            self::fail('Confirme o valor do saque e a taxa de serviço vigente',422);
PHP,
    'remove fixed-fee withdrawal promise');
sellerSplitReplace($wallet,
    <<<'PHP'
        $debit=$amount;$id=self::uid('mww');
PHP,
    <<<'PHP'
        $quote=SellerFeeSplit::quote($db,'withdraw',$amount);
        if(array_key_exists('fee_version',$data)&&
           (!is_int($data['fee_version'])||$data['fee_version']!==$quote['policy_version']))
            self::fail('A tarifa mudou. Atualize a cotação e confirme novamente.',409);
        $debit=$amount;$id=self::uid('mww');
PHP,
    'validate quote and locked fee version');
sellerSplitReplace($wallet,
    <<<'PHP'
        $db->transaction(static function(Database $db)use($id,$accountId,$idemHash,$bodyHash,$amount,
                                                     $type,$masked,$sealed,$desc,$debit){
            $w=self::lock($db,$accountId);
PHP,
    <<<'PHP'
        $db->transaction(static function(Database $db)use($id,$accountId,$idemHash,$bodyHash,$amount,
                                                     $type,$masked,$sealed,$desc,$debit,$quote){
            if(FeePolicy::current($db)['version']!==$quote['policy_version'])
                self::fail('Tarifa atualizada durante o saque; confirme novamente',409);
            $w=self::lock($db,$accountId);
PHP,
    'reject payout if prices change before fund reservation');
sellerSplitReplace($wallet,
    <<<'PHP'
                $id,$accountId,$idemHash,$bodyHash,$amount,self::FEE,$debit,$type,
                $masked,$sealed,$desc,null,null,'requested',self::now(),null
            ]);
            self::journal($db,$accountId,'withdraw_hold',$id,-$debit,$debit,0,self::FEE);
PHP,
    <<<'PHP'
                $id,$accountId,$idemHash,$bodyHash,$amount,$quote['total_fee_cents'],$debit,$type,
                $masked,$sealed,$desc,null,null,'requested',self::now(),null
            ]);
            SellerFeeSplit::reserve($db,'withdraw',$id,$accountId,$quote);
            self::journal($db,$accountId,'withdraw_hold',$id,-$debit,$debit,0,$quote['total_fee_cents']);
PHP,
    'reserve payout with immutable ARGUS/Mistic split');
sellerSplitReplace($wallet,
    <<<'PHP'
        if($method==='POST'&&$path==='/api/v2/wallet/withdrawals'){
            $input=self::prepareApiWithdraw($db,$account,self::body(),self::idem());
PHP,
    <<<'PHP'
        if($method==='POST'&&$path==='/api/v2/wallet/withdrawals'){
            $body=self::body();
            if(!is_int($body['fee_version']??null))
                self::fail('Confirme a versão da tarifa obtida na cotação antes de sacar',409);
            $input=self::prepareApiWithdraw($db,$account,$body,self::idem());
PHP,
    'API callers must acknowledge current fee version');
sellerSplitReplace($wallet,
    <<<'PHP'
            'amount_cents'=>$body['amount_cents']??null,
            'confirm'=>$body['confirm']??false,
PHP,
    <<<'PHP'
            'amount_cents'=>$body['amount_cents']??null,
            'confirm'=>$body['confirm']??false,
            'fee_version'=>$body['fee_version']??null,
PHP,
    'pass external API payout consent version');
sellerSplitReplace($wallet,
    <<<'PHP'
            $withdrawInput=self::body();
            SellerMfa::requireCode($db,$account,$withdrawInput);
PHP,
    <<<'PHP'
            $withdrawInput=self::body();
            if(!is_int($withdrawInput['fee_version']??null))
                self::fail('Confirme a cotação atualizada antes de sacar',409);
            SellerMfa::requireCode($db,$account,$withdrawInput);
PHP,
    'portal payout consent version retains mandatory 2FA');
sellerSplitReplace($wallet,
    <<<'PHP'
        if($method==='GET'&&$path==='/api/v2/wallet/balance')
PHP,
    <<<'PHP'
        if($method==='GET'&&$path==='/api/v2/wallet/fee-quote'){
            $amount=filter_var($_GET['amount_cents']??null,FILTER_VALIDATE_INT);
            if(!is_int($amount)||$amount<100||$amount>10000)
                self::fail('Valor da cotação inválido',422);
            $kind=(string)($_GET['direction']??'withdraw');
            self::out(['fee'=>SellerFeeSplit::quote($db,$kind,$amount)]);
        }
        if($method==='GET'&&$path==='/api/v2/wallet/balance')
PHP,
    'authenticated API quotes from central fee table');
sellerSplitReplace($wallet,
    <<<'PHP'
        if($method==='GET'&&$path==='/api/portal/wallet'){
PHP,
    <<<'PHP'
        if($method==='GET'&&$path==='/api/portal/wallet/fee-quote'){
            $amount=filter_var($_GET['amount_cents']??null,FILTER_VALIDATE_INT);
            if(!is_int($amount)||$amount<100||$amount>10000)
                self::fail('Valor da cotação inválido',422);
            $kind=(string)($_GET['direction']??'withdraw');
            self::out(['fee'=>SellerFeeSplit::quote($db,$kind,$amount)]);
        }
        if($method==='GET'&&$path==='/api/portal/wallet'){
PHP,
    'portal quote before OTP and payout');

// UI is a view of the same server fee policy. Do NOT trust cached fee from JS
// for accounting: the server rejects any stale policy_version.
$js=$root.'/public/static/merchant-portal.js';
sellerSplitReplace($js,
    'const FEE=100;',
    'let FEE=100; let withdrawalFeeVersion=null; let quoteSequence=0;',
    'remove permanent JS fee constant');
sellerSplitReplace($js,
    'Confirmo o destino, o valor e a taxa de serviço de R$ 1,00.',
    'Confirmo o destino, o valor e a taxa de serviço apresentada na cotação.',
    'seller informed dynamic consent');
sellerSplitReplace($js,
    <<<'JS'
function quote(){
 const n=cents(E('seller-withdraw-form')?.elements.amount.value),host=E('seller-quote');if(!host)return;
 host.textContent=n===null||n<200||n>10000?'Saque permitido entre R$ 2,00 e R$ 100,00.':
  'Total debitado '+BRL(n)+' · Taxa de serviço '+BRL(FEE)+' · Pix líquido '+BRL(n-FEE);
}
JS,
    <<<'JS'
async function quote(){
 const n=cents(E('seller-withdraw-form')?.elements.amount.value),host=E('seller-quote');if(!host)return;
 const sequence=++quoteSequence;withdrawalFeeVersion=null;
 if(n===null||n<200||n>10000){host.textContent='Saque permitido entre R$ 2,00 e R$ 100,00.';return;}
 host.textContent='Consultando taxa de serviço atual...';
 try{
  const data=await request('/api/portal/wallet/fee-quote?direction=withdraw&amount_cents='+n);
  if(sequence!==quoteSequence)return;
  const fee=data?.fee;
  if(!fee||fee.gross_cents!==n||!Number.isInteger(fee.policy_version))
   throw new Error('Cotação inválida');
  FEE=fee.total_fee_cents;withdrawalFeeVersion=fee.policy_version;
  host.textContent='Total debitado '+BRL(n)+' · Taxa de serviço '+BRL(FEE)+
   ' · Pix líquido '+BRL(fee.net_cents);
 }catch(_){if(sequence===quoteSequence)host.textContent='Não foi possível consultar a tarifa; saque temporariamente indisponível.';}
}
JS,
    'live fee quote for current withdrawal amount');
sellerSplitReplace($js,
    <<<'JS'
 const blocks=[['Disponível',w.available_cents],['Reservado em saques',w.reserved_cents],['Taxa de serviço',FEE]];
JS,
    <<<'JS'
 FEE=Number.isInteger(w.service_fee_withdraw_cents)?w.service_fee_withdraw_cents:FEE;
 const blocks=[['Disponível',w.available_cents],['Reservado em saques',w.reserved_cents],['Taxa de saque (R$ 100)',FEE]];
JS,
    'dynamic admin-controlled wallet labels');
sellerSplitReplace($js,
    <<<'JS'
  let otp=null;
  try{
    otp=await window.ArgusSellerWithdrawModal.request({
      amountCents:amount,feeCents:FEE,pixKeyType:String(v.get('pix_key_type')||''),
JS,
    <<<'JS'
  let otp=null,liveFee=null;
  try{
    const fresh=await request('/api/portal/wallet/fee-quote?direction=withdraw&amount_cents='+amount);
    liveFee=fresh?.fee;
    if(!liveFee||liveFee.gross_cents!==amount||!Number.isInteger(liveFee.policy_version))
      throw new Error('Cotação de saque não disponível');
    FEE=liveFee.total_fee_cents;
    otp=await window.ArgusSellerWithdrawModal.request({
      amountCents:amount,feeCents:FEE,pixKeyType:String(v.get('pix_key_type')||''),
JS,
    'refresh exact server quote immediately before TOTP');
sellerSplitReplace($js,
    <<<'JS'
   description:'Saque de vendas ARGUS Pay',idempotency_key:idem,mfa_code:otp,confirm:true
JS,
    <<<'JS'
   description:'Saque de vendas ARGUS Pay',idempotency_key:idem,mfa_code:otp,confirm:true,
   fee_version:liveFee.policy_version
JS,
    'tie payout to confirmed fee version');

// The independent AI-assisted seller payout uses the SAME server quote and
// mandatory second factor; model text can never choose or change the fee.
$chat=$root.'/public/static/chat-payout.js';
sellerSplitReplace($chat,
    'const MIN=200,MAX=10000,FEE=100;',
    'const MIN=200,MAX=10000;let FEE=100;',
    'AI payout dynamic price');
sellerSplitReplace($chat,
    'Revisei a chave de destino, o valor e a taxa de serviço de R$ 1,00. Autorizo esta solicitação.',
    'Revisei a chave, o valor e a taxa de serviço apresentada na cotação atual.',
    'AI payout consent wording');
sellerSplitReplace($chat,
    <<<'JS'
 const update=()=>{
  const v=safeCents(amount.value);
  const valid=v!==null&&v>=MIN&&v<=MAX;
  quote.textContent=!valid?'O saque deve ficar entre R$ 2,00 e R$ 100,00.':
   'Debitado '+brl(v)+' · Taxa de serviço '+brl(FEE)+' · Pix ao destinatário '+brl(v-FEE);
  send.disabled=started||finished||!enabled||!valid||v>available||!key.value.trim()||!/^\d{6}$/.test(otp.value.trim())||!confirmCheck.checked;
  if(valid && v>available)quote.textContent+=' · Saldo disponível insuficiente.';
 };
JS,
    <<<'JS'
 let currentQuote=null,lastAmount=null,quoteSeq=0;
 const update=()=>{
  const v=safeCents(amount.value);
  const valid=v!==null&&v>=MIN&&v<=MAX;
  if(!valid){lastAmount=null;currentQuote=null;quoteSeq++;}
  quote.textContent=!valid?'O saque deve ficar entre R$ 2,00 e R$ 100,00.':
   currentQuote?.gross_cents===v?
   'Debitado '+brl(v)+' · Taxa de serviço '+brl(currentQuote.total_fee_cents)+
   ' · Pix ao destinatário '+brl(currentQuote.net_cents):
   'Consultando tarifa atual do saque...';
  send.disabled=started||finished||!enabled||!valid||v>available||!key.value.trim()||
   !/^\d{6}$/.test(otp.value.trim())||!confirmCheck.checked||currentQuote?.gross_cents!==v;
  if(valid && v>available)quote.textContent+=' · Saldo disponível insuficiente.';
  if(valid&&v!==lastAmount){
   lastAmount=v;currentQuote=null;
   const seq=++quoteSeq;
   request('/api/portal/wallet/fee-quote?direction=withdraw&amount_cents='+v)
    .then(data=>{
     if(seq!==quoteSeq||finished)return;
     if(!data?.fee||data.fee.gross_cents!==v||!Number.isInteger(data.fee.policy_version))
      throw new Error('Cotação inválida');
     currentQuote=data.fee;FEE=currentQuote.total_fee_cents;update();
    }).catch(()=>{if(seq===quoteSeq)quote.textContent='Tarifa indisponível. Saque bloqueado até consultar o servidor.';});
  }
 };
JS,
    'AI payout live fee before enabling submission');
sellerSplitReplace($chat,
    <<<'JS'
  if(!window.confirm('Confirmar solicitação de saque de '+brl(value)+'?\nTaxa de serviço: '+brl(FEE)+'\nValor líquido do Pix: '+brl(value-FEE)+'\n\nConfira a chave no formulário antes de continuar.'))return;
JS,
    <<<'JS'
  let freshQuote;
  try{
   const response=await request('/api/portal/wallet/fee-quote?direction=withdraw&amount_cents='+value);
   freshQuote=response?.fee;
   if(!freshQuote||freshQuote.gross_cents!==value||!Number.isInteger(freshQuote.policy_version))
    throw new Error('Cotação indisponível');
  }catch(_){note.textContent='Não foi possível validar a tarifa vigente; nenhum Pix foi solicitado.';return;}
  if(!window.confirm('Confirmar solicitação de saque de '+brl(value)+'?\nTaxa de serviço: '+brl(freshQuote.total_fee_cents)+'\nValor líquido do Pix: '+brl(freshQuote.net_cents)+'\n\nConfira a chave antes de continuar.'))return;
JS,
    'AI chat final fee confirmation');
sellerSplitReplace($chat,
    <<<'JS'
    description:'Saque de vendas ARGUS Pay',idempotency_key:idempotency,mfa_code:otp.value.trim(),confirm:true
JS,
    <<<'JS'
    description:'Saque de vendas ARGUS Pay',idempotency_key:idempotency,mfa_code:otp.value.trim(),
    confirm:true,fee_version:freshQuote.policy_version
JS,
    'AI chat versioned fee agreement');

// Existing admin preview still describes direct admin operations. Clarify
// seller fees: provider + ARGUS are both included in the ONE service fee.
$admin=$root.'/public/static/admin.html';
sellerSplitReplace($admin,
    'Os valores anteriores são preservados no histórico.',
    'Os valores anteriores são preservados no histórico. Para novas operações dos revendedores, a taxa de serviço é a soma de MisticPay + ARGUS.',
    'fee setting change explanation');
$panel=$root.'/public/static/admin-platform-fees.js';
sellerSplitReplace($panel,
    <<<'JS'
   ['Taxas dos saques pagos',cash(fees.withdrawal_fees_cents)],
JS,
    <<<'JS'
   ['Taxas dos saques pagos',cash(fees.withdrawal_fees_cents)],
   ['Custo MisticPay previsto',cash(fees.provider_cost_estimate_cents)],
   ['Operações com tarifa dividida',String(fees.split_fee_operations||0)],
JS,
    'admin distinct provider cost and platform revenue');
sellerSplitReplace($panel,
    'Saldo de taxas reconhecidas contabilmente. Este relatório não envia Pix, não constitui saldo bancário disponível e não autoriza saques automáticos.',
    'Somente a parcela ARGUS é receita própria nos novos lançamentos. O custo MisticPay é provisão calculada pela tabela do admin; o débito real é feito pelo provedor conforme contrato. Lançamentos antigos sem discriminação requerem revisão. Este relatório não envia Pix nem constitui saldo bancário disponível.',
    'accurate accounting and provider settlement disclosure');

// Publish the new fee-quote/consent contract to site and Telegram API users.
$docs=$root.'/public/static/merchant-docs.js';
sellerSplitReplace($docs,
    'Uma solicitação de saque exige Idempotency-Key e confirmação explícita, só permite saldo próprio disponível e retorna status para acompanhamento.',
    'Uma solicitação de saque exige Idempotency-Key, confirmação explícita e fee_version da cotação autenticada GET /api/v2/wallet/fee-quote?direction=withdraw&amp;amount_cents=1000. Se o Super Admin mudar a tabela, faça nova cotação antes do POST; nunca reenvie automaticamente a transferência.',
    'API docs required fee version');
sellerSplitReplace($docs,
    <<<'DOC'
   ' -d \'{"amount_cents":1000,"confirm":true}\'',
DOC,
    <<<'DOC'
   ' -d \'{"amount_cents":1000,"fee_version":2,"confirm":true}\'',
DOC,
    'sample API payout includes policy version');
sellerSplitReplace($docs,
    'A cada depósito confirmado há uma taxa de serviço de R$ 1,00.',
    'A taxa de serviço de cada depósito é definida pela tabela do Super Admin (inicialmente R$ 1,00: R$ 0,50 MisticPay e R$ 0,50 ARGUS).',
    'dynamic merchant deposit documentation');
sellerSplitReplace($docs,
    <<<'DOC'
  '<tr><td>POST</td><td><code>/api/v2/wallet/withdrawals</code></td><td>Solicitar saque pela chave que tenha permissão; Pix para CPF/CNPJ cadastrado</td></tr>',
DOC,
    <<<'DOC'
  '<tr><td>GET</td><td><code>/api/v2/wallet/fee-quote</code></td><td>Cotar tarifa e receber fee_version para confirmar o saque</td></tr>',
  '<tr><td>POST</td><td><code>/api/v2/wallet/withdrawals</code></td><td>Solicitar saque com fee_version vigente; Pix para CPF/CNPJ cadastrado</td></tr>',
DOC,
    'API fee quote endpoint documented');

// Cache-bust seller and AI payout scripts so that the versioned fee consent
// reaches mobile devices after deployment (without caching a stale R$1 form).
$client=$root.'/public/static/client.html';
$clientHtml=file_get_contents($client);
if(!is_string($clientHtml))throw new RuntimeException('Client markup is missing');
foreach(['merchant-portal.js','chat-payout.js'] as $asset){
    $count=0;
    $clientHtml=preg_replace(
        '~(/static/'.preg_quote($asset,'~').'\?v=)[A-Za-z0-9._-]+~',
        '$1seller-fee-split-20261122-1',$clientHtml,1,$count
    );
    if(!is_string($clientHtml)||$count!==1)
        throw new RuntimeException('Seller fee cache update missing: '.$asset);
}
if(file_put_contents($client,$clientHtml)===false)
    throw new RuntimeException('Client fee cache update failed');

// Existing Fee Studio is the central source for merchant tariffs and PSP cost.
$studio=$root.'/public/static/fee-studio.js';
sellerSplitReplace($studio,
    <<<'JS'
       '<div class="argus-fee-result-row emphasized"><span>Receita ARGUS estimada</span><strong>'+fmt(q.revenue)+'</strong></div>'+
JS,
    <<<'JS'
       '<div class="argus-fee-result-row"><span>Taxa total ao revendedor (MisticPay + ARGUS)</span><strong>'+fmt(q.revenue+q.provider)+'</strong></div>'+
       '<div class="argus-fee-result-row"><span>Valor líquido ao revendedor</span><b>'+fmt(amount-q.revenue-q.provider)+'</b></div>'+
       '<div class="argus-fee-result-row emphasized"><span>Parcela própria da ARGUS</span><strong>'+fmt(q.revenue)+'</strong></div>'+
JS,
    'fee simulator shows separate buyer charge and administrator share');
sellerSplitReplace($studio,
    'Margem por operação · estimativa',
    'Margem em operações diretas do admin · estimativa',
    'distinguish the admin fee preview from seller fee split');
sellerSplitReplace($root.'/src/FeePolicy.php',
    'Tabela de custos e precificação. Ainda não altera o valor de QR Code, o saque, o saldo ou o ledger de clientes.',
    'Para novas operações dos revendedores, a taxa de serviço debitada soma o custo MisticPay previsto e a parcela comercial ARGUS; o PSP cobra seus custos conforme o contrato. Operações existentes não mudam.',
    'accurate admin fee API notice');
sellerSplitReplace($admin,
    'Modo configuração e simulação:',
    'Tabela vinculada às novas operações dos revendedores:',
    'admin fee banner reflects live merchant pricing');
sellerSplitReplace($admin,
    'os valores não alteram transações, QR Codes, saques ou saldos existentes. A cobrança efetiva depende da integração ao fluxo de liquidação e da divulgação prévia das tarifas aos clientes.',
    'novas cobranças e saques consultam esta versão antes de reservar o valor. Os dados financeiros das operações antigas permanecem imutáveis; a MisticPay retém/cobra seu custo conforme o contrato, sem Pix extra originado pelo ARGUS.',
    'current fee user disclosure');

echo "PASS: fee schedule drives new merchant Pix and payouts, immutable 50/50 split, provider provision, ARGUS-only earned journal, seller OTP quote version, no second PSP transfer\n";
