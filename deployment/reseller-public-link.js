(()=>{
'use strict';
const rootId='argus-reseller-public-link';
const $=id=>document.getElementById(id);
const canShow=()=>{const d=$('dashboard');return !!d&&!d.hidden&&getComputedStyle(d).display!=='none';};
let loading=false,loaded=false,activeUrl='';
const markup=[
'<div class="argus-rpl-symbol" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10V5.5A2.5 2.5 0 0 1 5.5 3h4.8"/><path d="M21 10V5.5A2.5 2.5 0 0 0 18.5 3h-4.8"/><path d="M3 14v4.5A2.5 2.5 0 0 0 5.5 21h4.8"/><path d="M21 14v4.5A2.5 2.5 0 0 1 18.5 21h-4.8"/><path d="M7 12h10M12 7v10"/></svg></div>',
'<div class="argus-rpl-body"><div class="argus-rpl-eyebrow">ARGUS PAY · MEU CHECKOUT</div>',
'<h2>Meu link público de Pix</h2><p>Receba pagamentos de clientes usando sua página exclusiva. A taxa total aparece antes do pagamento.</p>',
'<div class="argus-rpl-url"><input id="argus-rpl-input" type="text" aria-label="Link público exclusivo do seu Pix" readonly placeholder="Gerando seu endereço seguro..." autocapitalize="off" spellcheck="false"><button type="button" id="argus-rpl-copy" aria-label="Copiar link público" title="Copiar link público">Copiar</button></div>',
'<div class="argus-rpl-actions"><a id="argus-rpl-open" class="argus-rpl-primary" href="#" target="_blank" rel="noopener noreferrer" aria-disabled="true">Abrir minha página Pix <span aria-hidden="true">↗</span></a><button id="argus-rpl-share" type="button" class="argus-rpl-secondary">Compartilhar link</button></div>',
'<div id="argus-rpl-message" class="argus-rpl-message" role="status" aria-live="polite">Preparando seu endereço exclusivo...</div></div>'
].join('');
function ensure(){
 if(!canShow())return null;
 // The new reseller workspace hides the legacy .dash-top. Mount INSIDE
 // the visible "Visão geral" tab, directly under its primary Pix action.
 const overview=$('argus-reseller-page-overview');
 const top=overview?.querySelector('#argus-reseller-overview-top');
 const dashboard=$('dashboard');
 const modern=!!overview&&!!top&&overview.closest('#argus-reseller-workspace');
 const parent=modern?overview:dashboard;
 if(!parent)return null;
 let root=$(rootId);
 if(!root){
  root=document.createElement('section');root.id=rootId;root.className='argus-rpl-card';
  root.setAttribute('aria-labelledby','argus-rpl-heading');
  root.innerHTML=markup;
  root.querySelector('h2').id='argus-rpl-heading';
  $('argus-rpl-copy').addEventListener('click',copy);
  $('argus-rpl-share').addEventListener('click',share);
 }
 if(modern){
  // Move the SAME element if it was previously inserted into the old,
  // hidden dashboard. Do not duplicate the card or its event listeners.
  if(root.parentElement!==overview||root.nextElementSibling!==top)
   overview.insertBefore(root,top);
 }else if(root.parentElement!==dashboard){
  const header=dashboard.querySelector('.dash-top');
  if(header)header.insertAdjacentElement('afterend',root);
  else dashboard.prepend(root);
 }
 return root;
}
function notice(message,isError=false){const area=$('argus-rpl-message');if(!area)return;area.textContent=message;area.dataset.kind=isError?'error':'normal';}
async function copy(){
 if(!activeUrl)return;
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(activeUrl);
  else{
   const el=$('argus-rpl-input');el.select();
   if(!document.execCommand('copy'))throw new Error('Clipboard unavailable');
  }
  notice('Link copiado! Compartilhe com seus clientes.');
 }catch(_){notice('Copie o endereço selecionando o campo.',true);$('argus-rpl-input')?.select();}
}
async function share(){
 if(!activeUrl)return;
 if(navigator.share){
  try{await navigator.share({title:'Meu Pix · ARGUS Pay',text:'Pague com Pix pela minha página ARGUS Pay',url:activeUrl});return;}
  catch(err){if(err?.name==='AbortError')return;}
 }
 await copy();
}
async function load(){
 if(!ensure()||loading||loaded)return;
 loading=true;
 try{
  const response=await fetch('/api/portal/public-pix-link',{credentials:'same-origin',headers:{'Accept':'application/json'},cache:'no-store'});
  if(response.status===401||response.status===403){loaded=false;notice('Entre na sua conta para acessar seu link público.',true);return;}
  const result=await response.json();
  if(!response.ok||!/^\/e\/[a-f0-9]{32}$/.test(String(result.public_path||'')))throw new Error('Endereço ainda indisponível');
  activeUrl=location.origin+result.public_path;
  $('argus-rpl-input').value=activeUrl;
  $('argus-rpl-open').href=result.public_path;
  $('argus-rpl-open').removeAttribute('aria-disabled');
  $('argus-rpl-copy').disabled=false;
  $('argus-rpl-share').disabled=false;
  notice(result.available?'Sua página já está pronta para receber Pix.':
    'Seu link já foi criado. O recebimento de Pix será liberado após aprovação financeira.');
  loaded=true;
 }catch(_){notice('Não foi possível consultar o link público. Atualize a página e tente novamente.',true);}
 finally{loading=false;}
}
function tick(){
 if(!canShow()){loaded=false;activeUrl='';const el=$(rootId);if(el)el.remove();return;}
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick);
else tick();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
window.addEventListener('focus',tick);
setInterval(tick,2500);
})();