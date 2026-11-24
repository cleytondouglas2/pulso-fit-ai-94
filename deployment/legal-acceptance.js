(()=>{'use strict';
const dashboard=document.getElementById('dashboard'),register=document.getElementById('register-form');
if(!dashboard||!register)return;
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
const link=(href,text)=>{const a=el('a',text);a.href=href;a.target='_blank';a.rel='noopener';return a};
const box=el('section');box.className='argus-compliance-panel';box.hidden=true;dashboard.prepend(box);
function csrf(){try{return decodeURIComponent((document.cookie.match(/(?:^|;\s*)arg_portal_csrf=([^;]*)/)||[])[1]||'')}catch{return ''}}
let epoch=0,controller=null,sessionKey=null,visible=false;
function reset(){epoch++;if(controller)controller.abort();controller=null;box.hidden=true;box.replaceChildren();}
function current(n,key){return n===epoch&&!dashboard.hidden&&key===csrf();}
async function load(){
 reset();if(dashboard.hidden)return;const n=epoch,key=csrf();sessionKey=key;
 controller=new AbortController();
 try{
  const response=await fetch('/api/portal/legal',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('Consulta indisponível');const v=await response.json();if(!current(n,key))return;
  box.replaceChildren(el('h2','Documentos legais'));box.hidden=false;
  if(!v.document.active){box.append(el('p','Documentos em revisão. Nenhum aceite será registrado.'));return;}
  if(v.accepted){box.append(el('p','Termos aceitos em '+v.acceptance.accepted_at+' · versão '+v.acceptance.version));return;}
  const form=el('form'),terms=el('input'),privacy=el('input');terms.type=privacy.type='checkbox';terms.required=privacy.required=true;
  const a=el('label');a.append(terms,document.createTextNode(' Aceito os '),link('/termos','Termos de Uso'));
  const b=el('label');b.append(privacy,document.createTextNode(' Li a '),link('/privacidade','Política de Privacidade'));
  const btn=el('button','Registrar aceite');btn.type='submit';const status=el('p','Versão '+v.document.version);form.append(a,b,btn,status);box.append(form);
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!current(n,key)||!terms.checked||!privacy.checked)return;btn.disabled=true;
   try{
    const r=await fetch('/api/portal/legal',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':key},body:JSON.stringify({accepted_terms:true,read_privacy:true,legal_digest:v.document.digest})});
    if(!current(n,key))return;if(!r.ok)throw Error('Não foi possível registrar. Atualize a página e tente novamente.');
    const result=await r.json();if(!current(n,key))return;if(!result.accepted)throw Error('Aceite não confirmado');await load();
   }catch(e){if(current(n,key))status.textContent=e.message}finally{if(current(n,key))btn.disabled=false}
  });
 }catch(e){if(current(n,key)&&e.name!=='AbortError'){box.replaceChildren(el('p','Não foi possível consultar o aceite.'));const retry=el('button','Tentar novamente');retry.type='button';retry.addEventListener('click',load);box.append(retry);box.hidden=false;}}
}
function check(){const now=!dashboard.hidden,key=csrf();if(!now){if(visible||controller)reset();}else if(!visible||sessionKey!==key)load();visible=now;}
new MutationObserver(check).observe(dashboard,{attributes:true,attributeFilter:['hidden']});
window.addEventListener('pageshow',()=>{if(!dashboard.hidden)load();});
check();
// Registration: pending manifest must never be treated as approved; server independently validates.
const field=el('fieldset');field.className='argus-compliance-panel';field.id='argus-register-legal';
field.append(el('legend','Documentos legais'));
const msg=el('p','Consultando versão vigente…');msg.setAttribute('role','status');field.append(msg);
const terms=el('input'),privacy=el('input'),digest=el('input');
terms.type=privacy.type='checkbox';terms.name='accepted_terms';privacy.name='read_privacy';terms.value=privacy.value='1';digest.type='hidden';digest.name='legal_digest';
const ta=el('label'),pa=el('label');ta.append(terms,document.createTextNode(' Aceito os '),link('/termos','Termos de Uso'));pa.append(privacy,document.createTextNode(' Li a '),link('/privacidade','Política de Privacidade'));field.append(ta,pa,digest);
const retry=el('button','Recarregar documentos');retry.type='button';field.append(retry);
const submit=register.querySelector('button[type=submit]');register.insertBefore(field,submit);
let ready=false,active=false,requestId=0;
function disableOptional(){terms.disabled=privacy.disabled=digest.disabled=true;terms.required=privacy.required=false;ta.hidden=pa.hidden=true;}
async function refresh(){
 const n=++requestId;ready=false;active=false;disableOptional();msg.textContent='Consultando versão vigente…';retry.hidden=true;
 try{
  const r=await fetch('/api/public/legal',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('Indisponível');const v=await r.json();if(n!==requestId)return;
  if(v.active===true&&typeof v.digest==='string'&&/^[a-f0-9]{64}$/.test(v.digest)){
   active=true;terms.checked=privacy.checked=false;terms.disabled=privacy.disabled=digest.disabled=false;terms.required=privacy.required=true;ta.hidden=pa.hidden=false;digest.value=v.digest;msg.textContent='Versão '+v.version;ready=true;
  }else if(v.active===false&&v.registration_required!==true){msg.textContent='Documentos ainda em revisão. Nenhum aceite jurídico será registrado.';ready=true;}
  else throw Error('Documentos aguardam aprovação.');
 }catch{if(n===requestId){msg.textContent='Não foi possível confirmar os documentos. Recarregue para prosseguir.';retry.hidden=false;}}
}
retry.addEventListener('click',refresh);
register.addEventListener('submit',e=>{if(!ready||(active&&(!terms.checked||!privacy.checked||!digest.value))){e.preventDefault();e.stopImmediatePropagation();msg.textContent='Confirme os documentos antes de continuar.';retry.hidden=false;}},true);
new MutationObserver(()=>{if(!register.hidden)refresh();}).observe(register,{attributes:true,attributeFilter:['hidden']});
if(!register.hidden)refresh();else disableOptional();
})();