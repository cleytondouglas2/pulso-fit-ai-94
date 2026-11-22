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
 const label=document.createElement('label');
 label.className='seller-mfa-code-label';
 label.textContent='Código de 6 dígitos do aplicativo autenticador';
 const inp=document.createElement('input');
 inp.name='mfa_code';inp.inputMode='numeric';inp.autocomplete='one-time-code';inp.maxLength=6;
 inp.pattern='[0-9]{6}';inp.placeholder='000000';inp.required=true;
 label.append(inp);
 form.insertBefore(label,form.querySelector('button[type="submit"]'));
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
const observer=new MutationObserver(()=>{if(!rendered&&by('seller-withdraw-form'))init();});
observer.observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.addEventListener('pageshow',()=>{if(rendered)refresh();});
})();
