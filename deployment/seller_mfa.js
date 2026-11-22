/* ARGUS Pay | Seller authenticator enrolment; no secrets in localStorage or chat. */
(()=>{
'use strict';
if(window.__argusSellerMfa)return;
window.__argusSellerMfa=true;
const by=id=>document.getElementById(id);
let rendered=false;
async function refresh(){
 if(!by('seller-mfa-enrollment'))return;
 try{
  const s=await request('/api/portal/security/mfa/status');
  by('seller-mfa-config').hidden=s.enabled===true;
  by('seller-mfa-active').hidden=s.enabled!==true;
  by('seller-mfa-status').textContent=s.enabled?'Autenticador ativado. Informe um código novo a cada saque.':'Configure antes de solicitar seu próximo saque.';
 }catch(e){by('seller-mfa-status').textContent='Não foi possível verificar a segurança do autenticador: '+String(e.message||e);}
}
function init(){
 if(rendered||!by('seller-withdraw-form'))return;
 rendered=true;
 const form=by('seller-withdraw-form');
 const card=document.createElement('section');card.id='seller-mfa-enrollment';
 card.className='seller-panel seller-mfa-card';
 card.innerHTML=[
  '<h3><span aria-hidden="true">🛡️</span> Proteção de saques</h3>',
  '<p>O saque Pix agora exige um código temporário do aplicativo autenticador. Configure uma vez e use um código diferente em cada solicitação, inclusive no chat Argus IA.</p>',
  '<p id="seller-mfa-active" hidden>Autenticador ativado ✓</p>',
  '<div id="seller-mfa-config">',
  '<label>Senha atual<input id="seller-mfa-password" type="password" autocomplete="current-password" maxlength="200"></label>',
  '<button id="seller-mfa-begin" type="button">Configurar aplicativo autenticador</button>',
  '<div id="seller-mfa-activation" hidden>',
  '<p>Cadastre esta chave no Google Authenticator, Microsoft Authenticator ou aplicativo compatível:</p>',
  '<label>Chave secreta (não compartilhe)<input id="seller-mfa-secret" readonly autocomplete="off"></label>',
  '<label>Código de 6 dígitos<input id="seller-mfa-enable-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>',
  '<button id="seller-mfa-enable" type="button">Ativar proteção</button>',
  '</div></div>',
  '<p id="seller-mfa-status" role="status" aria-live="polite"></p>'
 ].join('');
 form.parentNode.insertBefore(card,form);
 by('seller-mfa-begin').addEventListener('click',async()=>{
  const button=by('seller-mfa-begin'),password=by('seller-mfa-password').value;
  if(!password){by('seller-mfa-status').textContent='Digite sua senha para começar.';return;}
  button.disabled=true;
  try{
   const x=await request('/api/portal/security/mfa/setup',{method:'POST',body:{password}});
   by('seller-mfa-secret').value=x.secret;
   by('seller-mfa-activation').hidden=false;
   by('seller-mfa-status').textContent='Chave disponível por 10 minutos. Cadastre-a no seu autenticador e confirme o código.';
  }catch(e){by('seller-mfa-status').textContent=String(e.message||e);}
  finally{by('seller-mfa-password').value='';button.disabled=false;}
 });
 by('seller-mfa-enable').addEventListener('click',async()=>{
  const button=by('seller-mfa-enable'),code=by('seller-mfa-enable-code').value.trim();
  if(!/^\d{6}$/.test(code)){by('seller-mfa-status').textContent='Informe os seis dígitos do aplicativo.';return;}
  button.disabled=true;
  try{
   await request('/api/portal/security/mfa/enable',{method:'POST',body:{code}});
   by('seller-mfa-secret').value='';by('seller-mfa-enable-code').value='';
   by('seller-mfa-activation').hidden=true;
   await refresh();
   by('seller-mfa-status').textContent='Autenticador ativado! Aguarde um código novo antes de sacar.';
  }catch(e){by('seller-mfa-status').textContent=String(e.message||e);}
  finally{button.disabled=false;}
 });
 refresh();
}

/**
 * One-time code is requested only AFTER the seller selects "Solicitar saque".
 * The existing server-side SellerMfa::requireCode is still the authorization
 * gate. This component never calls the Pix / withdrawal endpoint.
 */
function makeWithdrawalDialog(){
 let dialog=by('argus-seller-otp-dialog');
 if(dialog)return dialog;
 dialog=document.createElement('dialog');
 dialog.id='argus-seller-otp-dialog';
 dialog.setAttribute('aria-labelledby','argus-otp-heading');
 dialog.setAttribute('aria-describedby','argus-otp-description');
 dialog.innerHTML=[
  '<div class="argus-otp-heading-band">',
  '<img src="/static/assets/argus-payments-logo-transparent.webp" width="138" height="56" alt="Argus Payments">',
  '<button type="button" class="argus-otp-x" data-otp-cancel aria-label="Fechar">×</button></div>',
  '<div class="argus-otp-body">',
  '<div class="argus-otp-symbol" aria-hidden="true">✦</div>',
  '<h2 id="argus-otp-heading">Autorizar saque Pix</h2>',
  '<p id="argus-otp-description">Confirme os dados da transferência e insira o código temporário do seu aplicativo autenticador.</p>',
  '<div class="argus-otp-summary" aria-label="Resumo do saque">',
  '<div><span>Valor do saque</span><strong data-otp-gross></strong></div>',
  '<div><span>Taxa de serviço</span><strong data-otp-fee></strong></div>',
  '<div class="argus-otp-net"><span>Valor líquido do Pix</span><strong data-otp-net></strong></div>',
  '<div><span>Destino Pix</span><strong data-otp-target></strong></div></div>',
  '<form id="argus-otp-form" autocomplete="off">',
  '<label for="argus-otp-code">Código de segurança</label>',
  '<input id="argus-otp-code" name="otp" inputmode="numeric" type="text" ',
  'autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" ',
  'placeholder="000000" spellcheck="false" required aria-describedby="argus-otp-help">',
  '<small id="argus-otp-help">Código de 6 dígitos. Ele muda a cada 30 segundos e só pode ser utilizado uma vez.</small>',
  '<p class="argus-otp-error" role="alert" data-otp-error hidden></p>',
  '<div class="argus-otp-actions">',
  '<button type="button" data-otp-cancel class="argus-otp-back">Cancelar</button>',
  '<button type="submit" class="argus-otp-approve">Confirmar saque</button>',
  '</div></form></div>'
 ].join('');
 document.body.appendChild(dialog);
 return dialog;
}
window.ArgusSellerWithdrawModal={
 request({amountCents,feeCents,pixKeyType,pixKey}){
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||!Number.isSafeInteger(feeCents)||
     feeCents<0||feeCents>=amountCents)return Promise.resolve(null);
  const dialog=makeWithdrawalDialog();
  if(dialog.open)return Promise.resolve(null);
  const money=amount=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(amount/100);
  const types={cpf:'CPF',cnpj:'CNPJ',email:'E-mail',phone:'Celular',evp:'Aleatória'};
  const target=String(pixKey||'').trim();
  if(!target)return Promise.resolve(null);
  dialog.querySelector('[data-otp-gross]').textContent=money(amountCents);
  dialog.querySelector('[data-otp-fee]').textContent=money(feeCents);
  dialog.querySelector('[data-otp-net]').textContent=money(amountCents-feeCents);
  const masked=target.length<=4?'••••':('•••• '+target.slice(-4));
  dialog.querySelector('[data-otp-target]').textContent=(types[pixKeyType]||'Chave Pix')+' · '+masked;
  const form=dialog.querySelector('#argus-otp-form');
  const input=dialog.querySelector('#argus-otp-code');
  const error=dialog.querySelector('[data-otp-error]');
  input.value='';error.hidden=true;error.textContent='';
  return new Promise(resolve=>{
   let settled=false;
   const finish=value=>{
    if(settled)return;
    settled=true;
    dialog.removeEventListener('close',onClose);
    dialog.removeEventListener('cancel',onCancel);
    dialog.removeEventListener('click',onBackdrop);
    form.removeEventListener('submit',onSubmit);
    for(const button of dialog.querySelectorAll('[data-otp-cancel]'))
     button.removeEventListener('click',onCancel);
    input.value='';
    if(dialog.open)dialog.close();
    resolve(value);
   };
   const onClose=()=>finish(null);
   const onCancel=event=>{event?.preventDefault();finish(null);};
   const onBackdrop=event=>{if(event.target===dialog)finish(null);};
   const onSubmit=event=>{
    event.preventDefault();
    const value=input.value.trim();
    if(!/^[0-9]{6}$/.test(value)){
     error.textContent='Informe os 6 dígitos do seu aplicativo autenticador.';
     error.hidden=false;input.focus();return;
    }
    finish(value);
   };
   dialog.addEventListener('close',onClose);
   dialog.addEventListener('cancel',onCancel);
   dialog.addEventListener('click',onBackdrop);
   form.addEventListener('submit',onSubmit);
   for(const button of dialog.querySelectorAll('[data-otp-cancel]'))
    button.addEventListener('click',onCancel);
   try{
    dialog.showModal();
    input.focus({preventScroll:true});
   }catch(_){finish(null);}
  });
 }
};

const observer=new MutationObserver(()=>{if(!rendered&&by('seller-withdraw-form'))init();});
observer.observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.addEventListener('pageshow',()=>{if(rendered)refresh();});
})();
