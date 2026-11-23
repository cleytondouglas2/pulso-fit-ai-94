/* ARGUS Pay | Super Admin homepage: public Pix link only.
 * Reuses the seller card appearance, but points to the EXISTING admin /pix
 * checkout. No payment, identity, fees, credentials or wallet API calls.
 */
(()=>{
'use strict';
if(window.__argusAdminPublicLink)return;
window.__argusAdminPublicLink=true;
const ID='argus-admin-public-link';
const URL_PATH='/pix';
const allowed=()=>typeof state!=='undefined' && state?.user?.role==='superadmin';
const by=id=>document.getElementById(id);
const publicUrl=()=>new URL(URL_PATH,location.origin).href;
const pages=['page-overview','page-dashboard','page-home','page-summary','page-inicio','page-resumo'];
function overview(){
 for(const id of pages){const el=by(id);if(el)return el;}
 return [...document.querySelectorAll('section.page, main .page')].find(el=>{
  const heading=el.querySelector('h1,h2,.page-title,.page-heading');
  return /^(visão geral|visao geral|painel geral|dashboard|resumo)(\s|$)/i.test((heading?.textContent||'').trim());
 })||null;
}
const markup=[
 '<div class="argus-rpl-symbol" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10V5.5A2.5 2.5 0 0 1 5.5 3h4.8"/><path d="M21 10V5.5A2.5 2.5 0 0 0 18.5 3h-4.8"/><path d="M3 14v4.5A2.5 2.5 0 0 0 5.5 21h4.8"/><path d="M21 14v4.5A2.5 2.5 0 0 1 18.5 21h-4.8"/><path d="M7 12h10M12 7v10"/></svg></div>',
 '<div class="argus-rpl-body"><div class="argus-rpl-eyebrow">ARGUS PAY · MEU CHECKOUT</div>',
 '<h2 id="argus-admin-public-link-heading">Meu link público de Pix</h2>',
 '<p>Receba pagamentos na página pública exclusiva da administração. O valor e a taxa são apresentados antes da confirmação.</p>',
 '<div class="argus-rpl-url"><input id="argus-admin-public-url" type="text" aria-label="Endereço público Pix do administrador" readonly autocapitalize="off" spellcheck="false"><button id="argus-admin-public-copy" type="button">Copiar</button></div>',
 '<div class="argus-rpl-actions"><a id="argus-admin-public-open" class="argus-rpl-primary" href="/pix" target="_blank" rel="noopener noreferrer">Abrir minha página Pix <span aria-hidden="true">↗</span></a>',
 '<button id="argus-admin-public-share" class="argus-rpl-secondary" type="button">Compartilhar link</button></div>',
 '<div id="argus-admin-public-message" class="argus-rpl-message" role="status" aria-live="polite">Página pública disponível para compartilhar. A emissão depende da disponibilidade financeira da plataforma.</div></div>'
].join('');
function notice(message,error=false){
 const el=by('argus-admin-public-message');
 if(el){el.textContent=message;el.dataset.kind=error?'error':'normal';}
}
async function copy(){
 const url=publicUrl();
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(url);
  else{
   const field=by('argus-admin-public-url');
   field.focus();field.select();
   if(!document.execCommand('copy'))throw new Error('not copied');
  }
  notice('Link copiado! Você pode enviá-lo aos seus clientes.');
 }catch(_){
  const field=by('argus-admin-public-url');
  field?.focus();field?.select();
  notice('Selecione o endereço e use Copiar.',true);
 }
}
async function share(){
 const url=publicUrl();
 if(navigator.share){
  try{await navigator.share({title:'Meu Pix · ARGUS Pay',text:'Pague com Pix pela minha página ARGUS Pay',url});return;}
  catch(e){if(e?.name==='AbortError')return;}
 }
 await copy();
}
function choosePosition(page,card){
 const children=[...page.children].filter(el=>el!==card);
 const action=children.find(el=>/nova cobrança pix|cobrar com pix/i.test(el.textContent||'') &&
  (el.textContent||'').length<260);
 const header=children.find(el=>el.matches('.page-header,.section-top,.dashboard-header,.dash-top,header'));
 const anchor=action||header||children[0]||null;
 if(anchor)anchor.insertAdjacentElement('afterend',card);
 else page.prepend(card);
}
function tick(){
 if(!allowed()){
  by(ID)?.remove();
  return;
 }
 const page=overview();
 if(!page)return;
 let card=by(ID);
 if(!card){
  card=document.createElement('section');
  card.id=ID;card.className='argus-rpl-card';
  card.setAttribute('aria-labelledby','argus-admin-public-link-heading');
  card.innerHTML=markup;
  card.querySelector('#argus-admin-public-url').value=publicUrl();
  card.querySelector('#argus-admin-public-copy').addEventListener('click',copy);
  card.querySelector('#argus-admin-public-share').addEventListener('click',share);
 }
 if(card.parentElement!==page)choosePosition(page,card);
 // Follow the logged-in host rather than hard-coding the deployment hostname.
 const url=publicUrl();
 if(card.querySelector('#argus-admin-public-url').value!==url)
  card.querySelector('#argus-admin-public-url').value=url;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick,{once:true});
else tick();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
document.addEventListener('click',event=>{
 if(event.target.closest('[data-nav]'))queueMicrotask(tick);
});
window.addEventListener('focus',tick);
setInterval(()=>{if(!document.hidden)tick();},1700);
})();
