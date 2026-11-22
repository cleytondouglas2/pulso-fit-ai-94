<?php
declare(strict_types=1);

/**
 * Update only the shipped seller charge handler AFTER all legacy build patches.
 * No PSP, wallet, ledger, money transfer, fee or API modification.
 */
$target = '/var/www/html/public/static/merchant-portal.js';
$js = file_get_contents($target);
if (!is_string($js) || strlen($js) < 1500) {
    throw new RuntimeException('Seller Pix UI: merchant-portal.js not found');
}
$startToken = 'async function deposit(event){';
$endToken = "\nfunction start(){";
$start = strpos($js, $startToken);
$end = $start === false ? false : strpos($js, $endToken, $start);
if ($start === false || $end === false || strpos($js, $startToken, $start + 1) !== false) {
    throw new RuntimeException('Seller Pix UI: cannot safely locate unique deposit handler');
}
$newHandler = <<<'JS'
let sellerChargeBusy=false;
function sellerChargeFeedback(message,isError=false){
 const inline=E('seller-charge-feedback');
 if(inline){inline.textContent=message;inline.dataset.state=isError?'error':'info';}
 if(isError)notice(message,true);
}
async function deposit(event){
 event.preventDefault();
 if(sellerChargeBusy || E('seller-withdraw-form')?.querySelector('button[type="submit"]')?.disabled){
  sellerChargeFeedback('Já existe uma operação financeira em andamento. Confira o status antes de repetir.',true);
  return;
 }
 const form=event.currentTarget,v=new FormData(form),amount=cents(v.get('amount'));
 if(amount===null||amount<100||amount>10000){
  sellerChargeFeedback('Informe um valor entre R$ 1,00 e R$ 100,00. Você pode usar os valores rápidos.',true);
  form.elements.namedItem('amount')?.focus();
  return;
 }
 const description=String(v.get('description')||'').trim();
 if(!description){
  sellerChargeFeedback('Informe a descrição da cobrança.',true);
  form.elements.namedItem('description')?.focus();
  return;
 }
 sellerChargeBusy=true;
 const button=form.querySelector('button[type="submit"]');
 button.disabled=true;
 const idem=form.dataset.idem||crypto.randomUUID();form.dataset.idem=idem;
 sellerChargeFeedback('Gerando QR Code Pix…');
 try{
  const selfPayer=!!E('seller-self-payer')?.checked;
  const payment={amount_cents:amount,description,idempotency_key:idem};
  if(selfPayer){payment.payer_mode='registered_seller';payment.seller_is_payer=true;}
  else{
   payment.payer_name=String(v.get('payer_name')||'').trim();
   payment.payer_document=String(v.get('payer_document')||'');
  }
  const response=await request('/api/portal/wallet/charges',{method:'POST',body:payment});
  const charge=response?.charge;
  if(!charge?.id)throw new Error('O servidor não retornou uma cobrança válida; confira o histórico.');
  const box=E('seller-pix-result');
  box.replaceChildren();box.dataset.chargeId=charge.id;
  ownCharges.set(charge.id,charge);
  updatePixSummary(charge);
  showPix(charge);
  delete form.dataset.idem;form.reset();togglePayerMode();
  sellerChargeFeedback('Cobrança criada. QR Code disponível para compartilhamento.');
  notice('Cobrança registrada; o crédito depende da confirmação do pagamento.');
  await activities();
 }catch(err){
  sellerChargeFeedback('Não foi possível gerar o Pix: '+String(err?.message||'falha na comunicação')+'. Consulte o histórico antes de tentar novamente.',true);
 }finally{
  button.disabled=false;
  sellerChargeBusy=false;
 }
}
JS;
$patched = substr($js, 0, $start).$newHandler.substr($js, $end);
if (strpos($patched,'let sellerChargeBusy=false;')===false ||
    strpos($patched,"request('/api/portal/wallet/charges'")===false ||
    strpos($patched,'async function withdraw(event){')===false ||
    strpos($patched,'function start(){')===false) {
    throw new RuntimeException('Seller Pix UI: post-patch validation failed');
}
if (file_put_contents($target,$patched)===false) {
    throw new RuntimeException('Seller Pix UI: could not write shipped charge handler');
}
echo "PASS: Seller Pix charge handler patched after legacy build checks\n";
