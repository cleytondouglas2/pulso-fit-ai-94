(()=>{
'use strict';
const $=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
let quote=null,canGenerate=false,sequence=0,busy=false,active=null,poll=null,polling=false;
const form=$('public-pix-form'),amount=$('pix-amount'),agree=$('pix-agree');
const button=$('pix-generate'),alert=$('public-pix-error'),dialog=$('pix-dialog');
function cents(value){
 const digits=String(value??'').replace(/\D/g,'');
 if(!digits)return null;
 const n=Number(digits);
 return Number.isSafeInteger(n)?n:null;
}
function maskCents(value){
 const digits=String(value??'').replace(/\D/g,'').slice(0,7);
 if(!digits)return '';
 const whole=Math.floor(Number(digits)/100).toLocaleString('pt-BR');
 return whole+','+digits.padStart(2,'0').slice(-2);
}
function failure(message){
 alert.hidden=false;alert.textContent=message;
}
function clearFailure(){alert.hidden=true;alert.textContent='';}
async function api(path,options={}){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),17000);
 try{
  const response=await fetch(path,{credentials:'omit',cache:'no-store',headers:{'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{})},signal:controller.signal,...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const raw=data?.message??data?.error?.message??(typeof data?.error==='string'?data.error:null);
   const msg=typeof raw==='string'&&raw.length<250?raw:
     (path.startsWith('/pix/create')?
       'Não foi possível gerar o Pix. A integração de recebimento está indisponível.' :
       'Não foi possível consultar o valor do Pix.');
   throw new Error(msg);
  }
  return data;
 }finally{clearTimeout(timeout)}
}
function updateButton(){
 const v=cents(amount.value);
 const enabled=!busy&&canGenerate&&quote&&v===quote.base_amount_cents&&agree.checked;
 button.disabled=!enabled;
 button.firstElementChild.textContent=quote?'Gerar Pix de '+money(quote.total_amount_cents):'Digite o valor do Pix';
}
const INITIAL_HINT='Limite de R$ 100,00 incluindo a taxa da adquirente.';
function resetSummary(base=null){
 $('summary-base').textContent=base===null?'—':money(base);
 $('summary-fee').textContent='—';
 $('summary-total').textContent='—';
 $('summary-net').textContent='—';
}
async function price(){
 const seq=++sequence;
 quote=null;canGenerate=false;clearFailure();
 const v=cents(amount.value);
 const hint=$('limit-hint');
 if(v===null){
  resetSummary();
  hint.textContent=INITIAL_HINT;
  updateButton();
  return;
 }
 if(v<100||v>10000){
  resetSummary(v);
  hint.textContent=v<100?'O valor mínimo é R$ 1,00.':INITIAL_HINT;
  updateButton();
  return;
 }
 resetSummary(v);
 $('summary-fee').textContent='Calculando…';
 $('summary-total').textContent='Calculando…';
 hint.textContent=INITIAL_HINT;
 updateButton();
 try{
  const data=await api('/pix/quote?amount_cents='+encodeURIComponent(v));
  if(seq!==sequence||cents(amount.value)!==v)return;
  const q=data?.quote;
  if(!q||q.base_amount_cents!==v||!Number.isInteger(q.policy_version)||
     !Number.isInteger(q.provider_fee_cents)||!Number.isInteger(q.total_amount_cents))
   throw new Error('Cotação incompleta.');
  quote=q;
  canGenerate=data.can_generate===true;
  $('summary-fee').textContent=money(q.provider_fee_cents);
  $('summary-total').textContent=money(q.total_amount_cents);
  $('summary-net').textContent=money(q.admin_expected_net_cents);
  hint.textContent=canGenerate?INITIAL_HINT:
    'Recebimento Pix indisponível no momento. Confira mais tarde ou entre em contato com o suporte.';
 }catch(e){
  if(seq!==sequence||cents(amount.value)!==v)return;
  resetSummary(v);
  hint.textContent='Cotação indisponível no momento. Edite o valor para tentar novamente.';
  // Only show an error after an explicit submit, not on first load or typing.
  clearFailure();
 }finally{
  if(seq===sequence)updateButton();
 }
}
function identity(){
 const name=$('payer-name').value.trim().replace(/\s+/g,' ');
 const doc=$('payer-document').value.replace(/\D/g,'');
 if(name.length<3||name.length>120)throw new Error('Informe o nome completo de quem fará o pagamento.');
 if(![11,14].includes(doc.length))throw new Error('Informe o CPF ou CNPJ válido do pagador.');
 return {name,doc};
}
function randomToken(){
 const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
 return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
function showStatus(charge){
 const status=charge.display_status||charge.status;
 const names={paid:'Pagamento confirmado pela MisticPay',pending:'Aguardando pagamento',creating:'Criando cobrança…',
  unknown:'Emissão não confirmada. Consulte o status antes de tentar de novo.',
  expired:'QR Code expirado. Não pague este código.',
  failed:'Pagamento não aprovado',refunded:'Pagamento devolvido',cancelled:'Pagamento cancelado'};
 $('pix-status').textContent=names[status]||'Conferindo pagamento';
 $('pix-status').dataset.kind=status==='paid'?'paid':(['failed','refunded','cancelled','expired'].includes(status)?'failed':'pending');
 $('pix-dialog-amount').textContent=money(charge.total_amount_cents);
 const copy=charge.pix_copy_paste||'';
 $('pix-code').value=copy;
 $('pix-copy').disabled=!copy;
 const qr=$('public-pix-qr');qr.replaceChildren();
 if(status==='paid'){
  qr.textContent='✓';qr.style.fontSize='80px';qr.style.color='#16875f';
 }else if(copy&&typeof QRCode==='function'){
  qr.style.fontSize='';qr.style.color='';
  try{new QRCode(qr,{text:copy,width:188,height:188,colorDark:'#101822',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}
  catch(_){qr.textContent='Use o código Pix Copia e Cola.';}
 }else{qr.style.fontSize='14px';qr.textContent=status==='expired'?'QR Code expirado': 'Aguardando resposta da adquirente…';}
 const deadline=Number(charge.expires_at_epoch||0);
 $('pix-expiry').textContent=deadline>0&&status==='pending'?
   'Este QR Code expira em '+new Date(deadline*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.':
   status==='paid'?'Este Pix foi confirmado.':'Acompanhe a situação antes de gerar outra cobrança.';
 const final=['paid','failed','refunded','cancelled','expired'].includes(status);
 if(final){clearInterval(poll);poll=null;}
}
async function verify(){
 if(!active||polling)return;
 polling=true;const button=$('pix-verify');button.disabled=true;
 try{
  const result=await api('/pix/status',{method:'POST',body:JSON.stringify({id:active.id,receipt_token:active.token})});
  if(result.charge?.id===active.id)showStatus(result.charge);
 }catch(_){$('pix-status').textContent='Não foi possível consultar agora. O Pix continua aguardando confirmação.';}
 finally{polling=false;button.disabled=false;}
}
function openCharge(charge,token){
 active={id:charge.id,token};
 showStatus(charge);
 if(!dialog.open)dialog.showModal();
 clearInterval(poll);
 if(!['paid','failed','refunded','cancelled','expired'].includes(charge.display_status))
  poll=setInterval(()=>{if(!document.hidden)verify()},12000);
}
form.addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;clearFailure();
 try{
  if(!agree.checked)throw new Error('Confirme o total e a taxa antes de gerar seu Pix.');
  const {name,doc}=identity();
  const value=cents(amount.value);
  if(!quote||quote.base_amount_cents!==value||!canGenerate)throw new Error('Emissão de Pix temporariamente indisponível.');
  // Keep the exact same idempotency and receipt token after uncertain outcomes.
  if(form.dataset.amount!==String(value)||form.dataset.person!==doc){
   delete form.dataset.idem;delete form.dataset.token;
  }
  const idem=form.dataset.idem||(form.dataset.idem=crypto.randomUUID());
  const token=form.dataset.token||(form.dataset.token=randomToken());
  form.dataset.amount=String(value);form.dataset.person=doc;
  busy=true;updateButton();
  const fresh=await api('/pix/quote?amount_cents='+value);
  const q=fresh?.quote;
  if(!q||q.policy_version!==quote.policy_version||q.total_amount_cents!==quote.total_amount_cents)
   throw new Error('A taxa mudou. Confira os valores atualizados antes de gerar o código.');
  const response=await api('/pix/create',{method:'POST',body:JSON.stringify({
   amount_cents:value,policy_version:q.policy_version,payer_name:name,payer_document:doc,
   idempotency_key:idem,receipt_token:token
  })});
  if(!response?.charge?.id)throw new Error('O provedor não confirmou a emissão. Consulte o atendimento antes de tentar novamente.');
  openCharge(response.charge,token);
 }catch(error){
  failure((error?.message||'Falha de comunicação.')+
    ' Se o pedido tiver sido enviado, não gere outra cobrança sem verificar o protocolo.');
 }finally{busy=false;updateButton();}
});
let debounce;
amount.addEventListener('input',()=>{
 const masked=maskCents(amount.value);
 if(amount.value!==masked)amount.value=masked;
 clearTimeout(debounce);
 ++sequence;quote=null;canGenerate=false;clearFailure();updateButton();
 debounce=setTimeout(price,230);
});
agree.addEventListener('change',updateButton);
$('payer-document').addEventListener('input',e=>{
 const field=e.target;field.value=field.value.replace(/\D/g,'').slice(0,14);
});
$('pix-copy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('pix-code').value);$('pix-copy').textContent='Código copiado ✓';}
 catch(_){$('pix-code').focus();$('pix-code').select();$('pix-copy').textContent='Código selecionado';}
 setTimeout(()=>$('pix-copy').textContent='Copiar código Pix',2400);
});
$('pix-verify').addEventListener('click',verify);
$('pix-close').addEventListener('click',()=>dialog.close());
$('pix-new').addEventListener('click',()=>{
 dialog.close();active=null;delete form.dataset.idem;delete form.dataset.token;
 delete form.dataset.amount;delete form.dataset.person;clearInterval(poll);poll=null;
 price();$('payer-name').focus();
});
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
dialog.addEventListener('close',()=>{clearInterval(poll);poll=null;});
price();
})();