(()=>{
'use strict';
const E=id=>document.getElementById(id),BRL=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(x)||0)/100);
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let working=false,active=false,at=0,financeBusy=false;
let ownCharges=new Map();
let modalCharge=null,modalTimer=null,checkingId=null;
const FEE=100;
const chargeLabels={paid:'Pago',pending:'Aguardando pagamento',expired:'Expirado',refunded:'Devolvido',unknown:'Em verificação',failed:'Não aprovado',creating:'Criando'};
const payoutLabels={review:'Em análise do Super Admin',requested:'Solicitado',processing:'Em processamento',queued:'Em fila',pending:'Aguardando confirmação',unknown:'Em verificação',paid:'Pago',completed:'Concluído',failed:'Falhou',rejected:'Recusado',refunded:'Estornado',cancelled:'Cancelado'};
const chargeDate=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
function formatChargeDate(value){
 const timestamp=String(value||'').replace(' ','T');
 const date=new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timestamp)?timestamp+'Z':timestamp);
 return Number.isNaN(date.getTime())?'':chargeDate.format(date);
}
function cents(raw){const str=String(raw??'').trim();if(!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(str))return null;const n=Number(str.replace(',','.'));return Number.isFinite(n)?Math.round(n*100):null}
function ensure(){
 if(E('argus-seller-root'))return;
 const top=E('dashboard')?.querySelector('.dash-top');if(!top)return;
 const root=document.createElement('section');root.id='argus-seller-root';root.className='argus-seller-root';
 root.innerHTML=[
  '<div class="seller-head"><div><small>ARGUS PAY · REVENDEDOR</small><h2>Minha conta financeira</h2><p>Suas vendas, chaves API e saldo individual.</p></div><button id="seller-refresh" type="button">Atualizar</button></div>',
  '<div class="seller-balances" id="seller-balances" aria-live="polite">Carregando...</div>',
  '<div class="seller-columns"><section class="seller-panel"><h3>Minhas chaves de integração</h3><p>Você mesmo gera suas chaves API e secreta, sem pedir autorização ao administrador a cada geração. As credenciais são exclusivas da sua conta.</p>',
  '<button id="seller-key-create" type="button">Gerar minhas chaves de API</button><div id="seller-key-status" class="seller-key-status" aria-live="polite">Conferindo autorização...</div><div id="seller-key-list"></div>',
  '<p><a href="/documentacao-api" target="_blank" rel="noopener">Abrir documentação API para sites e Telegram</a></p></section>',
  '<section class="seller-panel"><h3>Sacar meu saldo</h3><p>Informe a chave Pix de destino e confira o valor líquido antes de confirmar.</p>',
  '<form id="seller-withdraw-form" autocomplete="off"><label>Valor total a sacar (R$)<input name="amount" inputmode="decimal" placeholder="10,00" required></label>',
  '<label>Tipo da chave Pix<select name="pix_key_type"><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Celular</option><option value="evp">Chave aleatória</option></select></label>',
  '<label>Chave Pix<input name="pix_key" autocomplete="off" maxlength="190" required></label><div class="seller-quote" id="seller-quote">Informe o valor para calcular a reserva.</div>',
  '<label class="seller-checkbox"><input name="confirm" type="checkbox" required><span>Confirmo o destino, o valor e a taxa de serviço de R$ 1,00.</span></label>',
  '<button type="submit">Solicitar saque</button></form></section><section class="seller-panel" id="seller-payout-history"><h3>Meus saques</h3><div id="seller-withdrawals">Consultando solicitações…</div></section></div>',
  '<section class="seller-panel"><h3>Dados da cobrança</h3><p>Confira o valor e os dados do pagador antes de gerar o Pix.</p>',
  '<form id="seller-deposit-form" autocomplete="off"><label>Valor da cobrança (R$)<input name="amount" inputmode="decimal" placeholder="10,00" required></label>',
  '<label class="seller-checkbox"><input id="seller-self-payer" name="self_payer" type="checkbox" checked><span>Usar meus dados cadastrais verificados como pagador deste Pix.</span></label>',
  '<label>Nome completo do pagador<input name="payer_name" maxlength="120" autocomplete="off" required></label>',
  '<label>CPF/CNPJ do pagador<input name="payer_document" inputmode="numeric" maxlength="18" autocomplete="off" required></label>',
  '<label>Descrição da venda<input name="description" maxlength="120" value="Pagamento de produto ou serviço" required></label>',
  '<button type="submit">Gerar Pix</button></form><div id="seller-pix-result" aria-live="polite"></div></section>',
  '<section class="seller-panel"><h3>Cobranças recentes</h3>',
  '<div id="seller-sales">Consultando cobranças…</div></section>'
 ].join('');
 top.after(root);
 E('seller-refresh').onclick=()=>load(true);
 E('seller-key-create').onclick=createKey;
 E('seller-withdraw-form').onsubmit=withdraw;
 E('seller-withdraw-form').elements.amount.oninput=quote;
 E('seller-deposit-form').onsubmit=deposit;
 E('seller-self-payer').onchange=togglePayerMode;
 togglePayerMode();
 E('seller-sales').onclick=openSellerPix;
}
function togglePayerMode(){
 const form=E('seller-deposit-form');if(!form)return;
 const enabled=!!E('seller-self-payer')?.checked;
 for(const key of ['payer_name','payer_document']){
  const input=form.elements.namedItem(key);if(!input)continue;
  input.disabled=enabled;input.required=!enabled;
  input.closest('label').hidden=enabled;
  if(enabled)input.value='';
 }
}
const displayStatus=charge=>charge.display_status||charge.status;
const canShowCode=charge=>displayStatus(charge)==='pending'&&!!charge.pix_copy_paste;
const canCheck=charge=>['pending','unknown','expired'].includes(displayStatus(charge));
function pixDialog(){
 let dialog=E('seller-pix-dialog');
 if(dialog)return dialog;
 dialog=document.createElement('dialog');
 dialog.id='seller-pix-dialog';
 dialog.className='argus-pix-modal-card';
 dialog.setAttribute('aria-labelledby','seller-pix-dialog-title');
 dialog.innerHTML=[
  '<header class="argus-pix-modal-header"><div><h2 id="seller-pix-dialog-title">QR Code Pix</h2>',
  '<p>Compartilhe o QR Code ou o Pix Copia e Cola para receber o pagamento.</p></div>',
  '<button type="button" class="argus-pix-modal-close" aria-label="Fechar janela do Pix" autofocus>×</button></header>',
  '<div id="seller-active-pix"></div>',
  '<p id="seller-pix-feedback" role="status" aria-live="polite"></p>',
  '<button type="button" id="seller-pix-check" class="outline">Verificar pagamento</button>'
 ].join('');
 document.body.append(dialog);
 dialog.querySelector('.argus-pix-modal-close').onclick=()=>dialog.close();
 E('seller-pix-check').onclick=()=>checkPayment(true);
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>{
  if(dialog.open)return;
  clearInterval(modalTimer);
  modalCharge=null;
  E('seller-active-pix').replaceChildren();
  E('seller-pix-feedback').textContent='';
 });
 new MutationObserver(()=>{if(E('dashboard').hidden&&dialog.open)dialog.close();})
  .observe(E('dashboard'),{attributes:true,attributeFilter:['hidden']});
 return dialog;
}
function drawSellerPix(charge,host){
 host.replaceChildren();
 const amount=document.createElement('strong');
 amount.className='seller-pix-amount';amount.textContent=BRL(charge.amount_cents);
 const status=document.createElement('p');
 status.className='seller-pix-status';status.textContent=chargeLabels[displayStatus(charge)]||'Cobrança registrada';
 if(displayStatus(charge)==='paid')status.classList.add('is-paid');
 host.append(amount,status);
 if(canShowCode(charge)){
  const qr=document.createElement('div');
  qr.className='seller-qr-visual';qr.setAttribute('role','img');qr.setAttribute('aria-label','QR Code Pix');
  if(typeof QRCode==='function'){
   try{
    new QRCode(qr,{text:charge.pix_copy_paste,width:206,height:206,
     colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
   }catch(_){qr.textContent='Use o Pix Copia e Cola abaixo.';}
  }else qr.textContent='Use o Pix Copia e Cola abaixo.';
  const field=document.createElement('textarea');field.rows=2;field.readOnly=true;
  field.value=charge.pix_copy_paste;field.setAttribute('aria-label','Código Pix Copia e Cola');
  const copy=document.createElement('button');copy.type='button';copy.className='primary';
  copy.textContent='Copiar Pix Copia e Cola';
  copy.onclick=async()=>{
   try{await navigator.clipboard.writeText(field.value);E('seller-pix-feedback').textContent='Código Pix copiado.';}
   catch(_){field.focus();field.select();E('seller-pix-feedback').textContent='Texto selecionado para copiar.';}
  };
  host.append(qr,field,copy);
 }else if(displayStatus(charge)==='unknown'){
  const message=document.createElement('p');
  message.textContent='Aguardando o retorno do provedor. Acompanhe esta cobrança antes de gerar outra.';
  host.append(message);
 }
 const details=document.createElement('small');
 details.textContent='ID da cobrança '+charge.id;
 host.append(details);
}
function updatePixSummary(charge){
 const box=E('seller-pix-result');
 if(box.dataset.chargeId!==charge.id)return;
 const status=displayStatus(charge);
 if(box.dataset.chargeStatus===status&&box.firstChild)return;
 box.dataset.chargeStatus=status;
 const info=document.createElement('p');
 info.textContent=(chargeLabels[status]||'Cobrança registrada')+' · '+BRL(charge.amount_cents);
 box.replaceChildren(info);
 if(canShowCode(charge)){
  const open=document.createElement('button');
  open.type='button';open.className='outline';open.textContent='Abrir QR Code';
  open.onclick=()=>showPix(ownCharges.get(charge.id)||charge);
  box.append(open);
 }
}
function showPix(charge){
 const dialog=pixDialog();
 clearInterval(modalTimer);
 modalCharge=charge;
 E('seller-pix-feedback').textContent='';
 drawSellerPix(charge,E('seller-active-pix'));
 E('seller-pix-check').hidden=!canCheck(charge);
 E('seller-pix-check').disabled=checkingId===charge.id;
 if(!dialog.open)dialog.showModal();
 if(canCheck(charge))modalTimer=setInterval(()=>checkPayment(false),12000);
}
async function checkPayment(manual){
 const charge=modalCharge;
 if(!charge||!canCheck(charge)||checkingId||document.hidden)return;
 if(!/^mwc_[a-f0-9]{32}$/.test(charge.id))return;
 const check=E('seller-pix-check'),feedback=E('seller-pix-feedback');
 checkingId=charge.id;check.disabled=true;
 if(manual)feedback.textContent='Consultando pagamento…';
 try{
  const response=await request('/api/portal/wallet/charges/'+charge.id);
  const latest=response.charge;
  if(modalCharge?.id!==charge.id||latest?.id!==charge.id)return;
  modalCharge=latest;
  ownCharges.set(latest.id,latest);
  updatePixSummary(latest);
  if(displayStatus(latest)!==displayStatus(charge)||latest.pix_copy_paste!==charge.pix_copy_paste)
   drawSellerPix(latest,E('seller-active-pix'));
  const pending=canCheck(latest);
  check.hidden=!pending;
  if(!pending){
   clearInterval(modalTimer);
   feedback.textContent=displayStatus(latest)==='paid'?'Pagamento confirmado. Consulte o saldo atualizado.':'Situação da cobrança atualizada.';
   await activities();
  }else if(manual)feedback.textContent='Pagamento ainda não confirmado.';
 }catch(_){
  if(modalCharge?.id===charge.id)feedback.textContent='Não foi possível consultar agora. Tente novamente.';
 }finally{
  checkingId=null;
  check.disabled=false;
 }
}
function openSellerPix(event){
 const button=event.target.closest('[data-seller-open-pix]');if(!button)return;
 const charge=ownCharges.get(button.dataset.sellerOpenPix);
 if(!charge){notice('Cobrança indisponível. Atualize o histórico.',true);return}
 showPix(charge);
}
function quote(){
 const n=cents(E('seller-withdraw-form')?.elements.amount.value),host=E('seller-quote');if(!host)return;
 host.textContent=n===null||n<200||n>10000?'Saque permitido entre R$ 2,00 e R$ 100,00.':
  'Total debitado '+BRL(n)+' · Taxa de serviço '+BRL(FEE)+' · Pix líquido '+BRL(n-FEE);
}
function walletRender(w){
 if(!w){E('seller-balances').textContent='Aguardando validação documental e aprovação financeira. Nenhuma API, recebimento ou saque está habilitado.';return}
 const blocks=[['Disponível',w.available_cents],['Reservado em saques',w.reserved_cents],['Taxa de serviço',FEE]];
 E('seller-balances').innerHTML=blocks.map(v=>'<div class="seller-balance"><small>'+v[0]+'</small><strong>'+BRL(v[1])+'</strong></div>').join('')+
  (w.negative_adjustments_cents>0?'<p class="seller-warning">Reversão/contestação em análise. Saques bloqueados até regularização.</p>':'')+
  (!w.deposits_enabled?'<p class="seller-warning">'+
   (w.deposit_blocked_reason==='configuration_pending'?'Emissão Pix aguardando configuração do administrador.':'Recebimentos Pix aguardando habilitação financeira.')+
   '</p>':'')+
  (!w.withdrawals_enabled?'<p class="seller-warning">Saques aguardando habilitação financeira no provedor.</p>':'');
}
function keysRender(v){
 const keys=v?.keys||[];
 E('seller-key-create').disabled=!v?.can_issue;
 E('seller-key-status').textContent=v?.reason||'Verifique suas credenciais e o status de aprovação da conta.';
 const active=keys.filter(k=>!k.revoked_at).length;
 E('seller-key-list').innerHTML='<p>'+active+' chave(s) ativa(s). <a href="#api-panel">Ver minhas chaves e revogar</a></p>';
}
function activities(){
 return Promise.allSettled([request('/api/portal/wallet'),request('/api/portal/wallet/charges')]).then(arr=>{
  if(arr[0].status==='fulfilled'){
   walletRender(arr[0].value.wallet);
   const data=arr[0].value.withdrawals||[];
   E('seller-withdrawals').innerHTML=data.length?data.slice(0,12).map(r=>'<div class="seller-item"><b>Solicitado '+BRL(r.amount_cents)+'</b> · Pix líquido '+BRL(r.recipient_cents)+'<small>'+escapeText(payoutLabels[r.status]||r.status)+' · '+escapeText(r.pix_key_masked)+'</small></div>').join(''):
    '<p>Sem saques solicitados.</p>';
  }else{
   walletRender(null);
   E('seller-withdrawals').textContent='Não foi possível consultar os saques. Use Atualizar carteira para tentar novamente.';
  }
  if(arr[1].status==='fulfilled'){
   const rows=arr[1].value.charges||[];
   ownCharges=new Map(rows.map(r=>[r.id,r]));
   E('seller-sales').innerHTML=rows.length?rows.map(r=>
    '<div class="seller-item res-charge-row" data-charge-status="'+escapeText(r.display_status)+'">'+
    '<div class="res-charge-meta"><strong>'+BRL(r.amount_cents)+'</strong><small>'+escapeText(formatChargeDate(r.created_at))+'</small>'+
    '<code>'+escapeText(r.id)+'</code></div><div class="res-charge-actions"><span class="res-charge-state">'+
    escapeText(chargeLabels[r.display_status]||r.display_status)+'</span>'+
    '<button type="button" data-seller-open-pix="'+escapeText(r.id)+'">'+
    (canShowCode(r)?'Ver QR Code':'Ver cobrança')+'</button>'+
    '</div></div>').join(''):'<p>Nenhuma cobrança Pix encontrada.</p>';
   const latest=ownCharges.get(E('seller-pix-result').dataset.chargeId);
   if(latest)updatePixSummary(latest);
  }else{
   ownCharges.clear();
   E('seller-sales').textContent='Não foi possível consultar as cobranças. Use Atualizar carteira para tentar novamente.';
  }
 });
}
async function load(force=false){
 ensure();if(!E('argus-seller-root')||working||(!force&&Date.now()-at<8000))return;
 working=true;
 try{
  const session=await request('/api/portal/session');active=!!session.account;
  if(!active)return;
  const keys=await request('/api/portal/keys');keysRender(keys);
  await activities();at=Date.now();
 }catch(err){active=false;walletRender(null)}
 finally{working=false;}
}
function createKey(){
 const target=E('api-panel'),button=E('create-key');
 target?.scrollIntoView({behavior:'smooth',block:'start'});
 if(button&&!button.disabled)button.click();
 else notice('Consulte os requisitos de emissão de chaves na sua conta.',true);
}
async function withdraw(event){
 event.preventDefault();if(working||financeBusy)return;
 const form=event.currentTarget,v=new FormData(form),amount=cents(v.get('amount'));
 if(amount===null||amount<200||amount>10000||!v.get('confirm')){notice('Confira o valor e confirme a taxa de serviço.',true);return}
 if(!confirm('Valor total descontado do saldo: '+BRL(amount)+'\nTaxa de serviço: R$ 1,00\nValor do Pix: '+BRL(amount-FEE)+'\n\nConfirmar saque direto?'))return;
 working=true;financeBusy=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
 const idem=form.dataset.idem||crypto.randomUUID();form.dataset.idem=idem;
 try{
  await request('/api/portal/wallet/withdrawals',{method:'POST',body:{
   amount_cents:amount,pix_key_type:v.get('pix_key_type'),pix_key:v.get('pix_key'),
   description:'Saque de vendas ARGUS Pay',idempotency_key:idem,confirm:true}});
  delete form.dataset.idem;form.reset();quote();notice('Saque enviado para processamento. Acompanhe o status em Meus saques.');
  await activities();
 }catch(err){notice('Confira o status em Meus saques antes de tentar novamente: '+err.message,true);await activities()}
 finally{working=false;financeBusy=false;button.disabled=false;}
}
function sellerChargeFeedback(message,isError=false){
 const inline=E('seller-charge-feedback');
 if(inline){inline.textContent=message;inline.dataset.state=isError?'error':'info';}
 if(isError)notice(message,true);
}
async function deposit(event){
 event.preventDefault();
 if(financeBusy){
  sellerChargeFeedback('Já existe uma operação em andamento. Verifique o status antes de tentar novamente.',true);
  return;
 }
 const form=event.currentTarget,v=new FormData(form),amount=cents(v.get('amount'));
 if(amount===null||amount<100||amount>10000){
  sellerChargeFeedback('Informe um valor entre R$ 1,00 e R$ 100,00. Use os botões de valor rápido se preferir.',true);
  form.elements.namedItem('amount')?.focus();
  return;
 }
 const description=String(v.get('description')||'').trim();
 if(!description){
  sellerChargeFeedback('Informe a descrição da cobrança.',true);
  form.elements.namedItem('description')?.focus();
  return;
 }
 const button=form.querySelector('button[type="submit"]');
 financeBusy=true;button.disabled=true;
 const idem=form.dataset.idem||crypto.randomUUID();
 form.dataset.idem=idem;
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
  if(!charge?.id)throw new Error('O servidor não retornou uma cobrança válida. Consulte o histórico antes de tentar novamente.');
  const box=E('seller-pix-result');
  box.replaceChildren();box.dataset.chargeId=charge.id;
  ownCharges.set(charge.id,charge);
  updatePixSummary(charge);
  showPix(charge);
  delete form.dataset.idem;
  form.reset();togglePayerMode();
  sellerChargeFeedback('Cobrança criada. O QR Code está disponível para compartilhar.');
  notice('Cobrança registrada; o crédito depende da confirmação do pagamento.');
  await activities();
 }catch(err){
  sellerChargeFeedback('Não foi possível gerar o QR Code: '+String(err?.message||'falha na comunicação')+'. Consulte o histórico antes de tentar novamente.',true);
 }finally{
  button.disabled=false;
  financeBusy=false;
 }
}
function start(){ensure();setTimeout(()=>load(true),750);window.addEventListener('focus',()=>load());document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
 setInterval(()=>{if(!document.hidden&&!E('dashboard')?.hidden)load()},25000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();