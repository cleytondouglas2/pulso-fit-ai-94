/* ARGUS administrator: real revendedor API keys, no plaintext secret persistence. */
(()=>{
'use strict';
const E=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let installed=false,busy=false,accountRows=[],keyRows=[],durable=false;

function findKeysPage(){
 const sections=[...document.querySelectorAll('section.page')];
 let page=sections.find(section=>/chaves\s+de\s+api/i.test(
  [...section.querySelectorAll('h1,h2')].map(h=>h.textContent).join(' ')));
 if(!page)page=E('page-keys')||E('page-api-keys');
 return page||null;
}
function mountDocsLink(){
 const nav=[...document.querySelectorAll('[data-nav]')].find(e=>/chaves\s+de\s+api/i.test(e.textContent||''));
 if(!nav||E('argus-admin-doc-nav'))return;
 const a=document.createElement('a');a.id='argus-admin-doc-nav';
 a.className='menu-item argus-api-nav-link';a.href='/documentacao-api';a.target='_blank';a.rel='noopener';
 a.textContent='Documentação API';a.title='Guia de integração API V2, sites e Telegram';
 nav.insertAdjacentElement('afterend',a);
}
function mount(){
 mountDocsLink();
 if(installed)return;
 const page=findKeysPage();if(!page)return;
 const root=document.createElement('section');root.id='argus-admin-keys-console';
 root.className='argus-admin-keys-console';root.setAttribute('aria-label','Gerador de chaves de API para revendedores');
 root.innerHTML=[
  '<div class="argus-api-head"><div><strong>Credenciais para revendedores</strong>',
  '<p>Gere um par de API Key e chave secreta para uma conta aprovada. O segredo aparece apenas uma vez.</p></div>',
  '<div class="argus-api-actions"><button type="button" id="argus-admin-generate-key">Gerar nova chave</button>',
  '<a class="argus-api-docs" href="/documentacao-api" target="_blank" rel="noopener">Ver documentação API V2</a></div></div>',
  '<form id="argus-admin-key-form" hidden autocomplete="off">',
  '<label>Revendedor aprovado<select id="argus-admin-key-account" required><option value="">Selecione um revendedor</option></select></label>',
  '<label>Código de 6 dígitos do autenticador 2FA<input id="argus-admin-key-otp" type="text" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" placeholder="000000" required></label>',
  '<div class="argus-api-actions"><button type="submit">Confirmar geração</button>',
  '<button id="argus-admin-key-cancel" type="button" class="secondary">Cancelar</button></div></form>',
  '<p id="argus-admin-key-hint" class="argus-api-hint" role="status" aria-live="polite">Carregando contas autorizadas...</p>',
  '<div id="argus-admin-key-once" hidden class="argus-api-secret" aria-live="polite">',
  '<strong>Credencial emitida — copie agora!</strong><p>A chave secreta é mostrada uma única vez. Guarde-a no servidor da integração.</p>',
  '<label>Chave API<textarea id="argus-admin-public" readonly rows="2"></textarea></label>',
  '<label>Chave secreta<textarea id="argus-admin-secret" readonly rows="3"></textarea></label>',
  '<div class="argus-api-actions"><button type="button" data-argus-copy="argus-admin-public">Copiar API Key</button>',
  '<button type="button" data-argus-copy="argus-admin-secret">Copiar chave secreta</button>',
  '<button type="button" id="argus-admin-secret-close" class="secondary">Ocultar segredo</button></div></div>',
  '<div class="argus-api-list-head"><strong>Chaves emitidas para revendedores</strong>',
  '<button type="button" id="argus-admin-refresh-keys" class="secondary">Atualizar lista</button></div>',
  '<div id="argus-admin-keys-list" aria-live="polite">Consultando chaves...</div>'
 ].join('');
 const anchor=page.querySelector('.section-top')||page.querySelector('.page-header')||
   page.querySelector('h1')?.parentElement||page.firstElementChild;
 if(anchor&&anchor.parentElement===page)anchor.insertAdjacentElement('afterend',root);
 else page.prepend(root);
 installed=true;
 E('argus-admin-generate-key').addEventListener('click',()=>{
   const form=E('argus-admin-key-form');
   if(!accountRows.length||!durable){setHint(!durable?'Armazenamento financeiro persistente não está disponível.':'Nenhum revendedor aprovado para emissão de chaves.',true);return}
   form.hidden=false;E('argus-admin-key-otp').value='';E('argus-admin-key-account').focus();
 });
 E('argus-admin-key-cancel').addEventListener('click',()=>{E('argus-admin-key-form').hidden=true;E('argus-admin-key-otp').value=''});
 E('argus-admin-key-form').addEventListener('submit',issue);
 E('argus-admin-refresh-keys').addEventListener('click',load);
 E('argus-admin-keys-list').addEventListener('click',revoke);
 E('argus-admin-key-once').addEventListener('click',async event=>{
  const b=event.target.closest('[data-argus-copy]');if(!b)return;
  const el=E(b.dataset.argusCopy);
  try{await navigator.clipboard.writeText(el.value);setHint('Copiado com segurança. Guarde no seu servidor.')}
  catch{el.focus();el.select();setHint('Selecione e copie a chave manualmente.')}
 });
 E('argus-admin-secret-close').addEventListener('click',hideSecret);
 load();
}
function hideSecret(){
 E('argus-admin-key-once').hidden=true;
 E('argus-admin-public').value='';E('argus-admin-secret').value='';
}
function setHint(message,bad=false){
 const node=E('argus-admin-key-hint');if(!node)return;
 node.textContent=message;node.classList.toggle('is-error',!!bad);
}
function render(){
 const select=E('argus-admin-key-account');
 select.replaceChildren(new Option('Selecione um revendedor',''));
 for(const a of accountRows){
  select.add(new Option(a.display_name+' · '+a.email,a.id));
 }
 E('argus-admin-generate-key').disabled=!durable||!accountRows.length;
 E('argus-admin-key-form').hidden=!durable||!accountRows.length||E('argus-admin-key-form').hidden;
 const host=E('argus-admin-keys-list');
 if(!keyRows.length){host.textContent='Nenhuma chave de revendedor emitida até agora.';return;}
 host.innerHTML=keyRows.map(k=>'<article class="argus-api-row">'+
  '<div><b>'+esc(k.display_name)+'</b><small>'+esc(k.email)+'</small></div>'+
  '<div class="argus-api-row-key"><code>'+esc(k.public_key)+'</code>'+
  '<small>Emitida em '+esc(k.created_at)+' · '+(k.revoked_at?'Revogada':'Ativa')+'</small></div>'+
  (k.revoked_at?'<span class="argus-api-revoked">Revogada</span>':
  '<button type="button" class="secondary" data-argus-revoke="'+esc(k.id)+'">Revogar</button>')+
  '</article>').join('');
}
async function load(){
 if(!installed||busy)return;
 busy=true;E('argus-admin-refresh-keys').disabled=true;
 try{
  const res=await api('/api/admin/merchant-api-keys');
  accountRows=Array.isArray(res.accounts)?res.accounts:[];
  keyRows=Array.isArray(res.keys)?res.keys:[];
  durable=!!res.storage_persistent;render();
  if(!durable)setHint('Geração indisponível: o servidor precisa utilizar banco financeiro persistente.',true);
  else if(!accountRows.length)setHint('Nenhum revendedor aprovado. Finalize a validação documental e financeira antes de gerar chaves.');
  else setHint(accountRows.length+' revendedor(es) autorizado(s) para receber um par de credenciais.');
 }catch(error){setHint('Não foi possível carregar as credenciais: '+error.message,true);
  E('argus-admin-keys-list').textContent='Erro na consulta. Tente atualizar.';}
 finally{busy=false;E('argus-admin-refresh-keys').disabled=false;}
}
async function issue(event){
 event.preventDefault();if(busy)return;
 const id=E('argus-admin-key-account').value,otp=E('argus-admin-key-otp').value.trim();
 if(!accountRows.some(a=>a.id===id)||!/^\d{6}$/.test(otp)){setHint('Selecione um revendedor e informe o código 2FA válido.',true);return;}
 if(!confirm('Gerar credenciais de integração para este revendedor? A chave secreta será mostrada apenas uma vez.'))return;
 busy=true;const submit=E('argus-admin-key-form').querySelector('[type=submit]');submit.disabled=true;
 try{
  const result=await post('/api/admin/merchant-api-keys',{account_id:id,otp});
  hideSecret();
  E('argus-admin-public').value=result.api_key;
  E('argus-admin-secret').value=result.api_secret;
  E('argus-admin-key-once').hidden=false;
  E('argus-admin-key-form').hidden=true;E('argus-admin-key-otp').value='';
  setHint('Par de credenciais emitido. Copie o segredo antes de fechar ou atualizar.');
 }catch(error){E('argus-admin-key-otp').value='';setHint('Não foi possível gerar a chave: '+error.message,true)}
 finally{busy=false;submit.disabled=false;}
 // Refresh does not clear one-time secret on this page.
 await load();
}
async function revoke(event){
 const b=event.target.closest('[data-argus-revoke]');if(!b||busy)return;
 if(!confirm('Revogar esta chave? As integrações que usam esta credencial deixarão de funcionar.'))return;
 const otp=prompt('Informe um código NOVO de 6 dígitos do autenticador do Super Admin:');
 if(!otp||!/^\d{6}$/.test(otp)){setHint('Código 2FA inválido. A chave não foi alterada.',true);return;}
 busy=true;b.disabled=true;
 try{await post('/api/admin/merchant-api-keys/'+encodeURIComponent(b.dataset.argusRevoke)+'/revoke',{otp});
  hideSecret();setHint('Chave revogada. A integração não poderá mais usar esse par.');}
 catch(error){setHint('Falha ao revogar: '+error.message,true)}
 finally{busy=false;b.disabled=false;}
 await load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
else mount();
const observer=new MutationObserver(mount);
observer.observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('click',event=>{
 const menu=event.target.closest('[data-nav]');if(menu&&installed&&!findKeysPage()?.contains(E('argus-admin-keys-console')))hideSecret();
});
})();
