/* Non-blocking, accessible preferences. Nothing optional is loaded here. */
(()=>{'use strict';
 const C=window.ArgusCookieConsentCore;if(!C||document.getElementById('argus-cookie-banner'))return;
 let memory=null,storageAvailable=true;
 function read(){
  if(!storageAvailable)return C.decode(JSON.stringify(memory));
  try{return C.decode(localStorage.getItem(C.KEY));}catch{storageAvailable=false;return C.decode(JSON.stringify(memory));}
 }
 function write(a,m){
  memory=C.choice(a,m);
  try{localStorage.setItem(C.KEY,JSON.stringify(memory));storageAvailable=true;}
  catch{storageAvailable=false;}
  window.dispatchEvent(new CustomEvent('argus:cookie-preferences',{detail:{analytics:a,marketing:m,version:C.VERSION}}));
 }
 Object.defineProperty(window,'ArgusCookieConsent',{value:Object.freeze({
  allows:purpose=>C.allows(read(),purpose),
  preferences:()=>{const s=read();return {essential:true,analytics:C.allows(s,'analytics'),marketing:C.allows(s,'marketing'),decided:!!s};}
 }),writable:false,configurable:false});
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const banner=make('section',null,'argus-cookie-banner');
 banner.id='argus-cookie-banner';banner.setAttribute('aria-labelledby','argus-cookie-title');
 banner.setAttribute('aria-describedby','argus-cookie-copy');banner.hidden=true;
 const title=make('h2','Sua privacidade na ArgusPay');title.id='argus-cookie-title';
 const copy=make('p','Usamos cookies essenciais para login, segurança e funcionamento. Medição e marketing opcionais dependem da sua escolha. Você pode rejeitar ou alterar sua preferência sem impedir pagamentos.');copy.id='argus-cookie-copy';
 const link=make('a','Política de cookies');link.href='/cookies';
 const actions=make('div',null,'argus-cookie-actions');
 function button(text,fn){const b=make('button',text,'argus-cookie-btn');b.type='button';b.addEventListener('click',fn);return b;}
 const prefs=make('div',null,'argus-cookie-details');prefs.id='argus-cookie-details';prefs.hidden=true;
 const explanation=make('p','As categorias opcionais começam desativadas. Este módulo não instala ferramentas de análise nem de publicidade.');
 const fieldset=make('fieldset');fieldset.append(make('legend','Categorias de cookies'));
 function option(name,desc,essential=false){
  const label=make('label',null,'argus-cookie-option');const input=make('input');input.type='checkbox';input.checked=essential;input.disabled=essential;
  const text=make('span');text.append(make('strong',name),make('small',desc));label.append(input,text);fieldset.append(label);return input;
 }
 option('Essenciais — sempre ativos','Autenticação, prevenção de fraude, segurança e memória da sua preferência.',true);
 const analytics=option('Análise de uso','Medição opcional de visitas e desempenho, se ferramentas forem integradas.');
 const marketing=option('Marketing','Publicidade e medição de campanhas, se ferramentas forem integradas.');
 const save=button('Salvar preferências',()=>finish(analytics.checked,marketing.checked));
 prefs.append(explanation,fieldset,save);
 const manage=button('Personalizar cookies',()=>{const s=read();analytics.checked=C.allows(s,'analytics');marketing.checked=C.allows(s,'marketing');prefs.hidden=!prefs.hidden;manage.setAttribute('aria-expanded',String(!prefs.hidden));if(!prefs.hidden)analytics.focus();});
 manage.setAttribute('aria-controls',prefs.id);manage.setAttribute('aria-expanded','false');
 const reject=button('Rejeitar opcionais',()=>finish(false,false));
 const accept=button('Aceitar todos',()=>finish(true,true));
 actions.append(reject,accept,manage);
 const status=make('p',null,'argus-cookie-status');status.setAttribute('role','status');
 banner.append(title,copy,link,actions,prefs,status);
 const reopen=button('Preferências de cookies',()=>show(true));reopen.className='argus-cookie-reopen';
 const nav=document.querySelector('.argus-legal-links');
 if(nav)nav.append(reopen);else document.body.append(reopen);
 document.body.append(banner);
 let restoreFocus=false;
 function show(focus){
  const s=read();analytics.checked=C.allows(s,'analytics');marketing.checked=C.allows(s,'marketing');
  prefs.hidden=true;manage.setAttribute('aria-expanded','false');banner.hidden=false;restoreFocus=focus;
  if(focus)reject.focus();
 }
 function finish(a,m){write(a,m);banner.hidden=true;prefs.hidden=true;status.textContent='';
  if(!storageAvailable){reopen.textContent='Preferências de cookies (apenas nesta visita)';}
  else reopen.textContent='Preferências de cookies';
  if(restoreFocus||banner.contains(document.activeElement))reopen.focus();restoreFocus=false;
 }
 if(!read())show(false);
 window.addEventListener('storage',event=>{
  if(event.key!==C.KEY&&event.key!==null)return;
  storageAvailable=true;memory=null;const s=read();
  if(s){banner.hidden=true;prefs.hidden=true;}else show(false);
  window.dispatchEvent(new CustomEvent('argus:cookie-preferences',{detail:window.ArgusCookieConsent.preferences()}));
 });
 // An open tab must not continue to authorize optional use after the preference expires.
 window.addEventListener('pageshow',()=>{if(!read())show(false);});
})();