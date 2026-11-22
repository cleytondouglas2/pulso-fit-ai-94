/* ARGUS Pay | Super Admin: 2FA after requesting a real Pix transfer.
 * No network calls here. Existing POST /api/admin/payouts + server MFA remain
 * the ONLY mechanism that may create a transfer.
 */
(()=>{
'use strict';
if(window.ArgusAdminPixStepUp)return;
const cash=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const typeLabels={CPF:'CPF',CNPJ:'CNPJ',EMAIL:'E-mail',TELEFONE:'Telefone',CHAVE_ALEATORIA:'Chave aleatória'};
function dialog(){
 let element=document.getElementById('argus-admin-pix-otp-dialog');
 if(element)return element;
 element=document.createElement('dialog');
 element.id='argus-admin-pix-otp-dialog';
 element.setAttribute('aria-labelledby','argus-admin-pix-otp-title');
 element.setAttribute('aria-describedby','argus-admin-pix-otp-intro');
 element.innerHTML=[
  '<header class="argus-admin-otp-header">',
  '<img src="/static/assets/argus-payments-logo-transparent.webp" alt="Argus Payments" width="144" height="60">',
  '<button type="button" data-argus-otp-cancel aria-label="Fechar confirmação">×</button>',
  '</header><div class="argus-admin-otp-content">',
  '<span class="argus-admin-otp-mark" aria-hidden="true">✧</span>',
  '<p class="argus-admin-otp-eyebrow">TESOURARIA • OPERAÇÃO PROTEGIDA</p>',
  '<h2 id="argus-admin-pix-otp-title">Confirmar transferência Pix</h2>',
  '<p id="argus-admin-pix-otp-intro">Confira os valores cotados e informe um NOVO código do autenticador para autorizar a transferência real.</p>',
  '<section class="argus-admin-otp-summary" aria-label="Resumo financeiro">',
  '<div><span>Valor solicitado</span><strong data-argus-gross></strong></div>',
  '<div><span>Taxa ARGUS</span><strong data-argus-fee></strong></div>',
  '<div class="argus-admin-otp-net"><span>Pix líquido ao destinatário</span><strong data-argus-net></strong></div>',
  '<div><span>Custo MisticPay (referência)</span><strong data-argus-cost></strong></div>',
  '<div><span>Chave Pix de destino</span><strong data-argus-pix-target></strong></div>',
  '<div><span>Descrição</span><strong data-argus-description></strong></div>',
  '</section>',
  '<p class="argus-admin-otp-note">O custo MisticPay informado é de referência e não será descontado novamente pela ARGUS. A transferência pode entrar em processamento.</p>',
  '<form id="argus-admin-pix-otp-form" autocomplete="off">',
  '<label for="argus-admin-pix-otp-code">Código de segurança</label>',
  '<input id="argus-admin-pix-otp-code" name="otp" type="text" inputmode="numeric" ',
  'autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" ',
  'placeholder="000000" required spellcheck="false" aria-describedby="argus-admin-otp-help">',
  '<small id="argus-admin-otp-help">Abra seu aplicativo autenticador. O código tem 6 dígitos e não pode ser reutilizado.</small>',
  '<p role="alert" class="argus-admin-otp-error" data-argus-otp-error hidden></p>',
  '<div class="argus-admin-otp-buttons">',
  '<button type="button" class="argus-admin-otp-back" data-argus-otp-cancel>Cancelar</button>',
  '<button type="submit" class="argus-admin-otp-approve">Confirmar e enviar Pix</button>',
  '</div></form></div>'
 ].join('');
 document.body.appendChild(element);
 return element;
}
window.ArgusAdminPixStepUp={
 request({amountCents,feeQuote,pixKeyType,pixKey,description}){
  // Refuse to display a confirmation built on invalid/expired/unquoted amounts.
  if(!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>10000||
     !feeQuote||feeQuote.gross_cents!==amountCents||
     !Number.isSafeInteger(feeQuote.argus_fee_cents)||
     !Number.isSafeInteger(feeQuote.recipient_cents)||
     !Number.isSafeInteger(feeQuote.mistic_cost_estimate_cents)||
     !Number.isInteger(feeQuote.policy_version)||
     feeQuote.recipient_cents<0||feeQuote.argus_fee_cents<0||
     feeQuote.recipient_cents+feeQuote.argus_fee_cents!==amountCents||
     !String(pixKey||'').trim()){
    return Promise.resolve(null);
  }
  const item=dialog();
  if(item.open)return Promise.resolve(null);
  const put=(selector,value)=>{item.querySelector(selector).textContent=value;};
  put('[data-argus-gross]',cash(amountCents));
  put('[data-argus-fee]',cash(feeQuote.argus_fee_cents));
  put('[data-argus-net]',cash(feeQuote.recipient_cents));
  put('[data-argus-cost]',cash(feeQuote.mistic_cost_estimate_cents));
  const key=String(pixKey||'').trim();
  put('[data-argus-pix-target]',(typeLabels[pixKeyType]||'Chave Pix')+' · '+(key.length>4?'•••• '+key.slice(-4):'••••'));
  put('[data-argus-description]',String(description||'Transferência ARGUS Payments').slice(0,120));
  const form=item.querySelector('#argus-admin-pix-otp-form');
  const input=item.querySelector('#argus-admin-pix-otp-code');
  const error=item.querySelector('[data-argus-otp-error]');
  input.value='';error.textContent='';error.hidden=true;
  return new Promise(resolve=>{
   let finished=false;
   const end=code=>{
    if(finished)return;finished=true;
    item.removeEventListener('close',onClose);
    item.removeEventListener('cancel',onCancel);
    item.removeEventListener('click',onBackdrop);
    form.removeEventListener('submit',onSubmit);
    item.querySelectorAll('[data-argus-otp-cancel]').forEach(b=>b.removeEventListener('click',onCancel));
    input.value='';
    if(item.open)item.close();
    resolve(code);
   };
   const onClose=()=>end(null);
   const onCancel=event=>{event?.preventDefault();end(null);};
   const onBackdrop=event=>{if(event.target===item)end(null);};
   const onSubmit=event=>{
    event.preventDefault();
    const code=input.value.trim();
    if(!/^[0-9]{6}$/.test(code)){
     error.textContent='Informe um código de 6 dígitos válido.';
     error.hidden=false;input.focus();return;
    }
    end(code);
   };
   item.addEventListener('close',onClose);
   item.addEventListener('cancel',onCancel);
   item.addEventListener('click',onBackdrop);
   form.addEventListener('submit',onSubmit);
   item.querySelectorAll('[data-argus-otp-cancel]').forEach(b=>b.addEventListener('click',onCancel));
   try{item.showModal();input.focus({preventScroll:true});}
   catch(_){end(null);}
  });
 }
};
})();