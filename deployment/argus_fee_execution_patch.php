<?php
declare(strict_types=1);
/**
 * Transaction-level binding of already-configured fee policy.
 * Applied after all other ARGUS patches. No provider cost is manually debited.
 */
$root='/var/www/html';
function feeTxnReplace(string $file,string $old,string $new,string $purpose):void{
    $src=file_get_contents($file);
    if(!is_string($src)||substr_count($src,$old)!==1)
        throw new RuntimeException('Fee execution patch anchor not unique: '.$purpose);
    if(file_put_contents($file,str_replace($old,$new,$src))===false)
        throw new RuntimeException('Fee execution patch failed to write: '.$purpose);
}
feeTxnReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/FeePolicy.php';",
    "require_once __DIR__ . '/FeePolicy.php';\nrequire_once __DIR__ . '/FeeExecution.php';",
    'load accounting ledger');

$quick=$root.'/src/TraditionalQuickPix.php';
// Bind the exact fee version when a new QR is created, and do so BEFORE calling
// the financial provider; the row and the fee snapshot are atomic.
$old=<<<'PHP'
            try{
                $db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    [$id,$actor['id'],$hash,$bodyHash,$cents,$desc,null,null,'creating',gmdate('Y-m-d H:i:s'),null]);
            }catch(\PDOException $e){
PHP;
$new=<<<'PHP'
            $quote=FeeExecution::quote($db,'deposit',$cents);
            FeeExecution::install($db);
            try{
                $db->transaction(static function(Database $db) use($id,$actor,$hash,$bodyHash,$cents,$desc,$quote){
                    $db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                        [$id,$actor['id'],$hash,$bodyHash,$cents,$desc,null,null,'creating',gmdate('Y-m-d H:i:s'),null]);
                    FeeExecution::reserve($db,'deposit',$id,$quote);
                });
            }catch(\PDOException $e){
PHP;
feeTxnReplace($quick,$old,$new,'atomic fee snapshot before Pix request');
// A CREATE response is never proof of a settlement. Only reconciled deposits
// may be recognized in the fee ledger.
feeTxnReplace($quick,
    "[$created['provider_id'],$created['copy'],$created['status'],gmdate('Y-m-d H:i:s'),$id,'creating']);",
    "[$created['provider_id'],$created['copy'],$created['status']==='paid'?'pending':$created['status'],gmdate('Y-m-d H:i:s'),$id,'creating']);",
    'no settlement from QR creation response');
feeTxnReplace($quick,
    "if(\$new==='paid'&&\$updated->rowCount()>0){\n                try{Notifications::adminPixReceived",
    "if(\$new==='paid'&&\$updated->rowCount()>0){\n                FeeExecution::depositPaid(\$db,(string)\$row['id']);\n                try{Notifications::adminPixReceived",
    'post fee only on authenticated paid payment');
feeTxnReplace($quick,
    "        error_log('ARGUS traditional Pix reconciliation cycle: checked='.$stats['checked'].' paid='.$stats['paid'].' errors='.$stats['errors']);",
    "        FeeExecution::settlePaidSnapshots(\$db);\n        error_log('ARGUS traditional Pix reconciliation cycle: checked='.$stats['checked'].' paid='.$stats['paid'].' errors='.$stats['errors']);",
    'idempotent background catch-up for fees');
// Separate quotes on new QR creation, but never change QR amount or send fees
// as a second network transaction.
$old=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/quick-pix/config') {
PHP;
$new=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/quick-pix/fee-quote'){
            $cents=filter_var($_GET['amount_cents']??null,FILTER_VALIDATE_INT);
            if(!is_int($cents)||$cents<100||$cents>10000)
                self::fail('Informe o valor da cobrança entre R$ 1,00 e R$ 100,00',422);
            self::reply(['fee'=>FeeExecution::quote($db,'deposit',$cents)]);
        }
        if($method==='GET'&&$path==='/api/admin/quick-pix/config') {
PHP;
feeTxnReplace($quick,$old,$new,'authenticated deposit fee quote');

// Admin payouts: do not debit the provider's R$ 0,50 again. Only the ARGUS
// commercial rate is withheld from the requested GROSS to determine the
// amount actually sent to the recipient, and only after explicit approval.
$admin=$root.'/src/Admin.php';
$old=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/payouts/readiness'){
PHP;
$new=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/payouts/fee-quote'){
            self::writeAllowed($actor,true);self::payoutAvailable($db);
            $cents=filter_var($_GET['amount_cents']??null,FILTER_VALIDATE_INT);
            if(!is_int($cents)||$cents<100||$cents>10000)
                self::fail('Valor de saque fora do limite permitido',422);
            self::reply(['fee'=>FeeExecution::quote($db,'withdraw',$cents)]);
        }
        if($method==='GET'&&$path==='/api/admin/payouts/readiness'){
PHP;
feeTxnReplace($admin,$old,$new,'protected payout live quote');
$old=<<<'PHP'
        if(str_starts_with($path,'/api/admin/fees'))
            FeePolicy::admin($db,$method,$path,$actor);
PHP;
$new=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/fees/operations'){
            self::writeAllowed($actor,true);
            self::reply(['operations'=>FeeExecution::summary($db)]);
        }
        if(str_starts_with($path,'/api/admin/fees'))
            FeePolicy::admin($db,$method,$path,$actor);
PHP;
feeTxnReplace($admin,$old,$new,'staff-only fee operations statement');

// Return already-recorded fee details for historical payouts. Never reprice
// a submitted transfer when a Super Admin changes the table.
$old=<<<'PHP'
            self::reply($db->all('SELECT id,amount_cents,pix_key_type,pix_key_masked,provider_tx_id,provider_job_id,status,created_at,checked_at FROM admin_payouts ORDER BY created_at DESC LIMIT 150'));
PHP;
$new=<<<'PHP'
            $payouts=$db->all('SELECT id,amount_cents,pix_key_type,pix_key_masked,provider_tx_id,provider_job_id,status,created_at,checked_at FROM admin_payouts ORDER BY created_at DESC LIMIT 150');
            self::reply(array_map(static function(array $row)use($db){
                $row['fees']=FeeExecution::get($db,'withdraw',(string)$row['id']);
                return $row;
            },$payouts));
PHP;
feeTxnReplace($admin,$old,$new,'historical payout fee details');
$old=<<<'PHP'
            if($existing){if(!hash_equals($requestHash,$existing['body_hash']))self::fail('Chave de idempotência usada com outros dados',409);self::reply(['id'=>$existing['id'],'status'=>$existing['status'],'provider_tx_id'=>$existing['provider_tx_id'],'already_submitted'=>true]);}
PHP;
$new=<<<'PHP'
            if($existing){if(!hash_equals($requestHash,$existing['body_hash']))self::fail('Chave de idempotência usada com outros dados',409);self::reply(['id'=>$existing['id'],'status'=>$existing['status'],'provider_tx_id'=>$existing['provider_tx_id'],'already_submitted'=>true,'fees'=>FeeExecution::get($db,'withdraw',(string)$existing['id'])]);}
            $feeQuote=FeeExecution::quote($db,'withdraw',$amount);
            // Reject stale quotes and invisible commercial fees before consuming OTP.
            if($feeQuote['argus_fee_cents']>0){
                if(($data['fee_acknowledged']??null)!==true ||
                   !isset($data['fee_version'])||!is_int($data['fee_version'])||
                   $data['fee_version']!==$feeQuote['policy_version'])
                    self::fail('Taxa ARGUS alterada ou não confirmada. Atualize a prévia e confirme o valor líquido.',409);
            }
            $providerNet=$feeQuote['recipient_cents'];
PHP;
feeTxnReplace($admin,$old,$new,'explicit server-side payout fee acknowledgement');
$old=<<<'PHP'
            $db->run('INSERT INTO admin_payouts(id,actor_id,idempotency_hash,body_hash,amount_cents,pix_key_type,pix_key_masked,pix_key_digest,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[$id,$actor['id'],$idemHash,$requestHash,$amount,$type,$masked,$digest,'creating',self::now()]);
PHP;
$new=<<<'PHP'
            FeeExecution::install($db);
            $db->transaction(function(Database $db)use($id,$actor,$idemHash,$requestHash,$amount,$type,$masked,$digest,$feeQuote){
                $db->run('INSERT INTO admin_payouts(id,actor_id,idempotency_hash,body_hash,amount_cents,pix_key_type,pix_key_masked,pix_key_digest,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[$id,$actor['id'],$idemHash,$requestHash,$amount,$type,$masked,$digest,'creating',self::now()]);
                FeeExecution::reserve($db,'withdraw',$id,$feeQuote);
            });
PHP;
feeTxnReplace($admin,$old,$new,'atomic payout idempotent fee snapshot');
feeTxnReplace($admin,
    '$result=self::payoutClient()->withdraw($amount,$type,$key,$description,$idem);',
    '$result=self::payoutClient()->withdraw($providerNet,$type,$key,$description,$idem);',
    'send net recipient amount, gross remains recorded');
$old=<<<'PHP'
                self::reply(['id'=>$id,'status'=>'queued','provider_tx_id'=>$result['transaction_id']],202);
PHP;
$new=<<<'PHP'
                FeeExecution::payoutSubmitted($db,$id);
                self::reply(['id'=>$id,'status'=>'queued','provider_tx_id'=>$result['transaction_id'],
                    'fees'=>FeeExecution::get($db,'withdraw',$id)],202);
PHP;
feeTxnReplace($admin,$old,$new,'payout fee ledger submitted');
$old=<<<'PHP'
            $db->run('UPDATE admin_payouts SET status=?,checked_at=? WHERE id=?',[$status,self::now(),$row['id']]);
PHP;
$new=<<<'PHP'
            $db->run('UPDATE admin_payouts SET status=?,checked_at=? WHERE id=?',[$status,self::now(),$row['id']]);
            FeeExecution::payoutReconciled($db,(string)$row['id'],$status);
PHP;
feeTxnReplace($admin,$old,$new,'reconcile fee only from PSP response');
// Server-issued quote is mandatory in the payout confirmation, not just a
// decorative cost label. Existing OTP and idempotency remain fully intact.
$js=$root.'/public/static/admin.js';
$old=<<<'JS'
 if(!confirm('Confirma a transferência de '+fmt(amount)+' para chave informada? Essa ação movimenta dinheiro real.'))return;
JS;
$new=<<<'JS'
 let feeQuote;
 try{
  const quoted=await api('/api/admin/payouts/fee-quote?amount_cents='+encodeURIComponent(amount));
  feeQuote=quoted?.fee;
  if(!feeQuote||feeQuote.gross_cents!==amount||!Number.isInteger(feeQuote.policy_version))
    throw new Error('Cotação das taxas indisponível. Nenhuma transferência foi enviada.');
 }catch(err){toast('Saque bloqueado até confirmar as taxas: '+err.message,true);return}
 const feeText='Valor solicitado: '+fmt(amount)+
   '\nTaxa ARGUS: '+fmt(feeQuote.argus_fee_cents)+
   '\nPIX que será enviado ao destinatário: '+fmt(feeQuote.recipient_cents)+
   '\nCusto MisticPay de referência: '+fmt(feeQuote.mistic_cost_estimate_cents)+
   ' (cobrado pelo provedor; não descontado novamente pela ARGUS).';
 if(!confirm(feeText+'\n\nConfirma esta transferência REAL para a chave informada?'))return;
JS;
feeTxnReplace($js,$old,$new,'explicit payout quote before transfer confirmation');
$old=<<<'JS'
const response=await post('/api/admin/payouts',{amount_cents:amount,pix_key_type:raw.pix_key_type,pix_key:raw.pix_key,description:raw.description,otp:raw.otp,confirm:true,idempotency_key});
JS;
$new=<<<'JS'
const response=await post('/api/admin/payouts',{amount_cents:amount,pix_key_type:raw.pix_key_type,pix_key:raw.pix_key,description:raw.description,otp:raw.otp,confirm:true,idempotency_key,fee_acknowledged:true,fee_version:feeQuote.policy_version});
JS;
feeTxnReplace($js,$old,$new,'transaction receipt binds original fee version');
$old=<<<'JS'
'<td>'+fmt(r.amount_cents)+'</td>'
JS;
$new=<<<'JS'
'<td>'+fmt(r.amount_cents)+(r.fees?'<small>Taxa ARGUS '+fmt(r.fees.argus_fee_cents)+' · Enviado '+fmt(r.fees.provider_amount_cents)+'</small>':'')+'</td>'
JS;
feeTxnReplace($js,$old,$new,'payout history shows net recipient and charge');

// Account for payments only after verified completion. Additional accounting
// records do not make the provider debit the MisticPay fee a second time.
$html=$root.'/public/static/admin.html';
feeTxnReplace($html,
    '<link rel="stylesheet" href="/static/fee-studio.css?v=1"></head>',
    '<link rel="stylesheet" href="/static/fee-studio.css?v=1"><link rel="stylesheet" href="/static/fee-operations.css?v=1"></head>',
    'new accounting UI styles');
feeTxnReplace($html,
    '<script src="/static/fee-studio.js?v=1" defer></script></body>',
    '<script src="/static/fee-studio.js?v=1" defer></script><script src="/static/fee-operations.js?v=1" defer></script></body>',
    'net quote and fee ledger frontend');
$ledger=<<<'HTML'
  <section class="argus-fee-operations-panel">
    <div class="argus-fee-history-head"><div><h2>Taxas por transação</h2>
      <p>Taxas efetivamente vinculadas aos depósitos verificados e saques solicitados</p></div>
      <button type="button" class="btn secondary" id="argus-fees-operations-refresh">Atualizar operações</button>
    </div>
    <div class="argus-fee-operations-list" id="argus-fee-operations-list" aria-live="polite">
      <p>Aguardando a consulta ao histórico.</p>
    </div>
  </section>
HTML;
$find=<<<'HTML'
   <div id="argus-fee-history" class="argus-fee-history" aria-live="polite"><p>Carregando...</p></div>
  </section>
 </div>
</section>
HTML;
$replacement=<<<'HTML'
   <div id="argus-fee-history" class="argus-fee-history" aria-live="polite"><p>Carregando...</p></div>
  </section>
HTML;
feeTxnReplace($html,$find,$replacement.$ledger." </div>\n</section>",'fee ledger inserted in superadmin page');
feeTxnReplace($html,
    '<strong>Modo configuração e simulação:</strong> os valores não alteram transações, QR Codes, saques ou saldos existentes.',
    '<strong>Integração operacional:</strong> novas cobranças Pix e novos saques recebem uma tabela de taxas fixa por operação. Depósitos só geram apuração após confirmação bancária; saques descontam a taxa ARGUS do valor enviado ao destinatário após sua confirmação. Operações antigas não são recalculadas.',
    'explain live fee behavior correctly');
echo "ARGUS fee execution: paid-only deposit ledger and explicit net payouts installed, provider cost never debited twice.\n";
