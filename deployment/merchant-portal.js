(()=>{
'use strict';
const E=id=>document.getElementById(id),BRL=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(x)||0)/100);
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let working=false,active=false,at=0;
let ownCharges=new Map();
const FEE=100;
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
  '<section class="seller-panel"><h3>Sacar meu saldo</h3><p>Saque diretamente para sua chave Pix, sem autorização do administrador. R$ 1,00 de taxa já descontado do total.</p>',
  '<form id="seller-withdraw-form" autocomplete="off"><label>Valor total a sacar (R$)<input name="amount" inputmode="decimal" placeholder="10,00" required></label>',
  '<label>Tipo da chave Pix<select name="pix_key_type"><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Celular</option><option value="evp">Chave aleatória</option></select></label>',
  '<label>Chave Pix<input name="pix_key" autocomplete="off" maxlength="190" required></label><div class="seller-quote" id="seller-quote">Informe o valor para calcular a reserva.</div>',
  '<label class="seller-checkbox"><input name="confirm" type="checkbox" required><span>Confirmo o destino, o valor e a taxa de serviço de R$ 1,00.</span></label>',
  '<button type="submit">Solicitar saque</button></form><h4>Meus saques</h4><div id="seller-withdrawals"></div></section></div>',
  '<section class="seller-panel"><h3>Gerar Pix / depósito</h3><p>Receba diretamente na sua carteira. A taxa de serviço de R$ 1,00 é aplicada uma única vez após o pagamento.</p>',
  '<form id="seller-deposit-form" autocomplete="off"><label>Valor da cobrança (R$)<input name="amount" inputmode="decimal" placeholder="10,00" required></label>',
  '<label class="seller-checkbox"><input id="seller-self-payer" name="self_payer" type="checkbox" checked><span>Usar meus dados cadastrais verificados como pagador deste Pix.</span></label>',
  '<label>Nome completo do pagador<input name="payer_name" maxlength="120" autocomplete="off" required></label>',
  '<label>CPF/CNPJ do pagador<input name="payer_document" inputmode="numeric" maxlength="18" autocomplete="off" required></label>',
  '<label>Descrição da venda<input name="description" maxlength="120" value="Pagamento de produto ou serviço" required></label>',
  '<button type="submit">Gerar Pix</button></form><div id="seller-pix-result" aria-live="polite"></div></section>',
  '<section class="seller-panel"><h3>Minhas cobranças e QR Codes</h3><p>Os Pix gerados pelo seu site, aplicativo ou Telegram aparecem aqui automaticamente. Somente pagamentos confirmados pela MisticPay entram no seu saldo.</p>',
  '<div id="seller-active-pix" aria-live="polite"></div><div id="seller-sales"></div></section>'
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
function drawSellerPix(charge){
 const host=E('seller-active-pix');if(!host)return;
 host.replaceChildren();
 if(!charge?.pix_copy_paste){host.textContent='Nenhum QR Code Pix ativo no momento.';return}
 const header=document.createElement('div');header.className='seller-qr-head';
 const title=document.createElement('strong');title.textContent='QR Code Pix · '+BRL(charge.amount_cents);
 const status=document.createElement('small');status.textContent='Aguardando pagamento · '+charge.id;
 header.append(title,status);
 const qr=document.createElement('div');qr.className='seller-qr-visual';qr.setAttribute('aria-label','QR Code da cobrança Pix '+charge.id);
 if(typeof QRCode==='function'){
  try{
   new QRCode(qr,{text:charge.pix_copy_paste,width:206,height:206,
    colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  }catch(_){qr.textContent='Use o Pix Copia e Cola abaixo';}
 }else qr.textContent='Use o Pix Copia e Cola abaixo';
 const field=document.createElement('textarea');field.rows=4;field.readOnly=true;
 field.value=charge.pix_copy_paste;field.setAttribute('aria-label','Código Pix Copia e Cola');
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar Pix Copia e Cola';
 copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(field.value);notice('Código Pix copiado')}
  catch(_){field.focus();field.select();notice('Selecione o texto para copiar manualmente')}
 };
 const details=document.createElement('small');details.textContent='Cobrança '+charge.id+' · '+charge.status+
  ' · crédito previsto após confirmação '+BRL(charge.net_cents);
 host.append(header,qr,field,copy,details);
}
function openSellerPix(event){
 const button=event.target.closest('[data-seller-open-pix]');if(!button)return;
 const charge=ownCharges.get(button.dataset.sellerOpenPix);
 if(!charge||!charge.pix_copy_paste){notice('QR Code indisponível ou expirado',true);return}
 drawSellerPix(charge);
 E('seller-active-pix')?.scrollIntoView({behavior:'smooth',block:'nearest'});
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
  (!w.deposits_enabled?'<p class="seller-warning">Depósitos aguardando homologação financeira do recebimento.</p>':'')+
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
   E('seller-withdrawals').innerHTML=data.length?data.slice(0,12).map(r=>'<div class="seller-item"><b>Solicitado '+BRL(r.amount_cents)+'</b> · Pix líquido '+BRL(r.recipient_cents)+'<small>'+escapeText(r.status)+' · '+escapeText(r.pix_key_masked)+'</small></div>').join(''):
    '<p>Sem saques solicitados.</p>';
  }else walletRender(null);
  if(arr[1].status==='fulfilled'){
   const rows=arr[1].value.charges||[];
   ownCharges=new Map(rows.map(r=>[r.id,r]));
   const labels={paid:'Aprovado',pending:'Aguardando',expired:'Expirado',refunded:'Devolvido',unknown:'Conferindo',failed:'Não aprovado',creating:'Criando'};
   E('seller-sales').innerHTML=rows.length?rows.slice(0,15).map(r=>
    '<div class="seller-item"><strong>'+BRL(r.amount_cents)+'</strong> · Taxa de serviço '+BRL(r.service_fee_cents)+
    ' <small>'+escapeText(labels[r.display_status]||r.display_status)+' · '+escapeText(r.id)+'</small>'+
    (r.pix_copy_paste&&r.display_status==='pending'?'<button type="button" data-seller-open-pix="'+escapeText(r.id)+'">Ver QR Code Pix</button>':'')+
    '</div>').join(''):'<p>Nenhuma cobrança Pix deste revendedor.</p>';
   const available=rows.find(r=>r.pix_copy_paste&&r.display_status==='pending');
   drawSellerPix(available);
  }else E('seller-sales').textContent='Histórico de vendas indisponível.';
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
 event.preventDefault();if(working)return;
 const form=event.currentTarget,v=new FormData(form),amount=cents(v.get('amount'));
 if(amount===null||amount<200||amount>10000||!v.get('confirm')){notice('Confira o valor e confirme a taxa de serviço.',true);return}
 if(!confirm('Valor total descontado do saldo: '+BRL(amount)+'\nTaxa de serviço: R$ 1,00\nValor do Pix: '+BRL(amount-FEE)+'\n\nConfirmar saque direto?'))return;
 working=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
 const idem=form.dataset.idem||crypto.randomUUID();form.dataset.idem=idem;
 try{
  await request('/api/portal/wallet/withdrawals',{method:'POST',body:{
   amount_cents:amount,pix_key_type:v.get('pix_key_type'),pix_key:v.get('pix_key'),
   description:'Saque de vendas ARGUS Pay',idempotency_key:idem,confirm:true}});
  delete form.dataset.idem;form.reset();quote();notice('Saque enviado para processamento. Acompanhe o status em Meus saques.');
  await activities();
 }catch(err){notice('Confira o status em Meus saques antes de tentar novamente: '+err.message,true);await activities()}
 finally{working=false;button.disabled=false;}
}
async function deposit(event){
 event.preventDefault();if(working)return;
 const form=event.currentTarget,v=new FormData(form),amount=cents(v.get('amount'));
 if(amount===null||amount<100||amount>10000){notice('Depósito permitido entre R$ 1,00 e R$ 100,00.',true);return}
 const button=form.querySelector('button[type="submit"]');button.disabled=true;working=true;
 const idem=form.dataset.idem||crypto.randomUUID();form.dataset.idem=idem;
 try{
  const selfPayer=!!E('seller-self-payer')?.checked;
  const payment={amount_cents:amount,description:String(v.get('description')||'').trim(),idempotency_key:idem};
  if(selfPayer){payment.payer_mode='registered_seller';payment.seller_is_payer=true}
  else{
   payment.payer_name=String(v.get('payer_name')||'').trim();
   payment.payer_document=String(v.get('payer_document')||'');
  }
  const response=await request('/api/portal/wallet/charges',{method:'POST',body:payment});
  const charge=response.charge,box=E('seller-pix-result');box.replaceChildren();
  const label=document.createElement('p');
  label.textContent='Cobrança '+BRL(charge.amount_cents)+' · crédito após pagamento '+BRL(charge.net_cents)+' · status '+charge.status;
  box.append(label);
  if(charge.pix_copy_paste){
   const field=document.createElement('textarea');field.rows=4;field.readOnly=true;field.value=charge.pix_copy_paste;
   const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar Pix';
   copy.onclick=()=>navigator.clipboard?.writeText(field.value).catch(()=>field.select());
   box.append(field,copy);
  }else{
   const p=document.createElement('p');p.textContent='Cobrança pendente de resposta do provedor. Não crie outra cobrança para a mesma venda.';box.append(p);
  }
  delete form.dataset.idem;form.reset();togglePayerMode();notice('Cobrança registrada; o crédito depende da confirmação do pagamento.');
  await activities();
 }catch(err){notice('Verifique o histórico antes de tentar novamente: '+err.message,true)}
 finally{button.disabled=false;working=false;}
}
function start(){ensure();setTimeout(()=>load(true),750);window.addEventListener('focus',()=>load());document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
 setInterval(()=>{if(!document.hidden&&!E('dashboard')?.hidden)load()},25000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();