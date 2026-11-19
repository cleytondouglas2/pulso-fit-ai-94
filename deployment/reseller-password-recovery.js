/* ARGUS Pay: forgot-password entry, email request and one-time token form. */
(()=>{
'use strict';
if(window.__argusSellerPasswordRecovery)return;
window.__argusSellerPasswordRecovery=true;
const E=id=>document.getElementById(id);
const login=E('login-form'),auth=E('auth');
if(!login||!auth)return;
const entry=document.createElement('div');entry.className='argus-forgot-row';
entry.innerHTML='<button type="button" id="argus-forgot-password">Esqueci minha senha</button>';
const submit=login.querySelector('button[type="submit"]');
if(!submit)return;
submit.before(entry);
const root=document.createElement('div');
root.id='argus-password-recovery';root.hidden=true;
root.innerHTML=[
'<div class="argus-recovery-scrim" data-reset-close></div>',
'<section class="argus-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="argus-recovery-heading">',
'<button class="argus-recovery-close" type="button" data-reset-close aria-label="Fechar recuperação">×</button>',
'<img class="argus-recovery-logo" src="/static/assets/argus-payments-logo-transparent.webp" alt="ARGUS Payments" width="175" height="68">',
'<small class="argus-recovery-eyebrow">ACESSO SEGURO · REVENDEDOR</small>',
'<h2 id="argus-recovery-heading">Redefinir senha</h2>',
'<p id="argus-recovery-subtitle">Informe o e-mail de cadastro para receber um link de redefinição.</p>',
'<form id="argus-recovery-request" autocomplete="on">',
'<label>E-mail cadastrado<input type="email" name="email" autocomplete="email" maxlength="190" required placeholder="seuemail@exemplo.com"></label>',
'<button type="submit" class="argus-recovery-primary">Enviar link de redefinição</button></form>',
'<form id="argus-recovery-confirm" autocomplete="off" hidden>',
'<label>Nova senha<input type="password" name="password" minlength="14" maxlength="200" autocomplete="new-password" required></label>',
'<label>Confirmar nova senha<input type="password" name="repeat_password" minlength="14" maxlength="200" autocomplete="new-password" required></label>',
'<p class="argus-recovery-advice">Pelo menos 14 caracteres, com letras maiúsculas, minúsculas e números.</p>',
'<button type="submit" class="argus-recovery-primary">Salvar nova senha</button></form>',
'<p id="argus-recovery-response" class="argus-recovery-response" role="status" aria-live="polite" hidden></p>',
'<button class="argus-recovery-back" type="button" data-reset-close>Voltar para entrar</button>',
'</section>'
].join('');
document.body.append(root);
let token='',busy=false,previousFocus=null;
const message=(value,bad=false)=>{
 const box=E('argus-recovery-response');
 box.hidden=false;box.textContent=value;box.classList.toggle('is-error',bad);
};
function mode(reset=false){
 const heading=E('argus-recovery-heading'),subtitle=E('argus-recovery-subtitle');
 E('argus-recovery-request').hidden=reset;
 E('argus-recovery-confirm').hidden=!reset;
 heading.textContent=reset?'Criar nova senha':'Redefinir senha';
 subtitle.textContent=reset?'Escolha uma nova senha para sua conta. O link só pode ser usado uma vez.':
  'Informe o e-mail cadastrado. Se ele existir, enviaremos um link válido por 20 minutos.';
 E('argus-recovery-response').hidden=true;
}
function show(reset=false){
 previousFocus=document.activeElement;
 root.hidden=false;document.body.classList.add('argus-recovery-open');
 mode(reset);
 const form=E(reset?'argus-recovery-confirm':'argus-recovery-request');
 if(!reset){
  const email=login.elements.namedItem('email')?.value||'';
  form.elements.email.value=email;
 }
 form.querySelector('input')?.focus();
}
function close(){
 if(busy)return;
 root.hidden=true;document.body.classList.remove('argus-recovery-open');token='';
 E('argus-recovery-confirm').reset();
 if(previousFocus?.isConnected)previousFocus.focus();
}
for(const node of root.querySelectorAll('[data-reset-close]'))node.addEventListener('click',close);
E('argus-forgot-password').addEventListener('click',()=>show());
document.addEventListener('keydown',event=>{
 if(root.hidden)return;
 if(event.key==='Escape'){event.preventDefault();close();return;}
 if(event.key!=='Tab')return;
 const nodes=[...root.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden])')]
  .filter(el=>el.getClientRects().length);
 if(!nodes.length)return;
 const first=nodes[0],last=nodes[nodes.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
});
E('argus-recovery-request').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const form=event.currentTarget,button=form.querySelector('[type=submit]');
 const email=String(form.elements.email.value||'').trim();
 if(!email)return;
 busy=true;button.disabled=true;message('Verificando solicitação…');
 try{
  const result=await request('/api/portal/password-reset/request',{method:'POST',body:{email}});
  message(result.message||'Se a conta existir, o e-mail de recuperação será enviado.');
 }catch(error){message(error.message||'Não foi possível solicitar a recuperação.',true)}
 finally{button.disabled=false;busy=false;}
});
E('argus-recovery-confirm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!token)return;
 const form=event.currentTarget;
 const password=form.elements.password.value,repeat=form.elements.repeat_password.value;
 if(password!==repeat){message('As duas senhas não correspondem.',true);return;}
 if(password.length<14||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)){
  message('Use ao menos 14 caracteres, letras maiúsculas, minúsculas e números.',true);return;
 }
 busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
 try{
  const result=await request('/api/portal/password-reset/confirm',
     {method:'POST',body:{token,password}});
  token='';form.reset();
  E('argus-recovery-confirm').hidden=true;
  E('argus-recovery-subtitle').textContent='A senha foi alterada. Entre novamente.';
  message(result.message||'Senha redefinida. Entre com a nova senha.');
  // Recovery invalidates every former session on the server. Never leave a
  // stale authenticated view visible in this browser.
  const dash=E('dashboard');if(dash)dash.hidden=true;
  auth.hidden=false;
  if(typeof tab==='function')tab('login');
 }catch(error){message(error.message||'Link inválido ou expirado.',true);}
 finally{button.disabled=false;busy=false;}
});
const raw=decodeURIComponent(location.hash.slice(1));
const found=/^redefinir=([a-f0-9]{64})$/i.exec(raw);
if(found){
 token=found[1].toLowerCase();
 history.replaceState(null,'',location.pathname+location.search);
 show(true);
}
})();
