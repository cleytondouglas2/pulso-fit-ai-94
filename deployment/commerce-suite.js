/* ARGUS COMMERCE SUITE — reseller's real product/offer pages + offline sandbox.
 * Financial values remain read-only suggestions; Pix is handled ONLY by /e/{code}. */
(()=>{'use strict';
if(window.__argusCommerceSuite)return;window.__argusCommerceSuite=true;
const E=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(x)||0)/100);
let pages=[],account='',activeId='',busy=false,loading=false,loadedAt=0;
const logged=()=>typeof state!=='undefined'&&!!state?.account?.id&&!!E('dashboard')&&!E('dashboard').hidden;
function say(msg,bad=false){const z=E('argus-commerce-feedback');if(z){z.textContent=msg;z.dataset.error=bad?'yes':'no';}}
function formValues(){
 const form=E('argus-commerce-form');if(!form)return null;
 const data=new FormData(form);
 const n=String(data.get('amount')||'').trim().replace(',','.');
 const price=Math.round(Number(n)*100);
 if(!/^\d{1,2}(?:[,.]\d{1,2})?$/.test(String(data.get('amount')||''))||!Number.isInteger(price)||price<100||price>9000)
  throw Error('Informe um valor comercial sugerido entre R$ 1,00 e R$ 90,00.');
 return {title:String(data.get('title')||''),description:String(data.get('description')||''),
  suggested_amount_cents:price,image_url:String(data.get('image_url')||''),
  accent_color:String(data.get('accent_color')||'#e9bc74'),
  call_to_action:String(data.get('call_to_action')||'Continuar para o Pix'),
  expires_at:String(data.get('expires_at')||'')||null};
}
function preview(){
 let data;try{data=formValues()}catch(_){data=null}
 const dest=E('argus-commerce-preview');if(!dest||!data)return;
 const title=E('argus-commerce-form')?.elements.title?.value||'Sua oferta';
 dest.replaceChildren();
 const art=document.createElement('article');art.className='argus-commerce-preview-card';
 art.style.setProperty('--accent',/^#[a-f0-9]{6}$/i.test(data.accent_color)?data.accent_color:'#e9bc74');
 if(data.image_url&&/^https:\/\//.test(data.image_url)){
  const img=document.createElement('img');img.alt='Imagem ilustrativa';img.loading='lazy';img.src=data.image_url;art.append(img);
 }
 const h=document.createElement('h3');h.textContent=title;art.append(h);
 const p=document.createElement('p');p.textContent=data.description;art.append(p);
 const amount=document.createElement('strong');amount.textContent='Valor sugerido '+money(data.suggested_amount_cents);art.append(amount);
 const btn=document.createElement('div');btn.className='argus-commerce-demo-button';btn.textContent=data.call_to_action;art.append(btn);
 const foot=document.createElement('small');foot.textContent='Prévia comercial. Valor e taxas serão confirmados no checkout Pix.';art.append(foot);
 dest.append(art);
}
function list(){
 const target=E('argus-commerce-list');if(!target)return;
 target.innerHTML=pages.length?pages.map(p=>{
  const status=p.status==='published'?'Publicado':p.status==='archived'?'Arquivado':'Rascunho';
  const link='/c/'+p.public_code;
  return '<article class="argus-commerce-list-card"><div class="argus-commerce-item-meta"><span class="argus-commerce-status is-'+esc(p.status)+'">'+esc(status)+'</span>'+
  '<small>'+esc(p.expires_at?'Expira '+p.expires_at:'Sem expiração')+'</small></div>'+
  '<h4>'+esc(p.title)+'</h4><p>'+esc(p.description)+'</p>'+
  '<strong>Valor sugerido '+money(p.suggested_amount_cents)+'</strong>'+
  '<div class="argus-commerce-actions">'+
  '<button type="button" data-com-edit="'+esc(p.id)+'">Editar</button>'+
  (p.status==='published'?'<a href="'+link+'" target="_blank" rel="noopener noreferrer">Abrir página</a>':
   '<button type="button" data-com-publish="'+esc(p.id)+'">Publicar</button>')+
  (p.status!=='archived'?'<button class="muted" type="button" data-com-archive="'+esc(p.id)+'">Arquivar</button>':'')+
  '<button class="muted" type="button" data-com-copy="'+esc(p.id)+'">Copiar link</button></div></article>';
 }).join(''):'<p class="argus-commerce-empty">Você ainda não criou uma página. Preencha os campos acima para começar.</p>';
 E('argus-commerce-count').textContent=pages.length+' páginas';
}
async function fetchPages(force=false){
 if(!logged()||loading)return;
 if(!force&&Date.now()-loadedAt<45000)return;
 loading=true;
 try{
  const response=await request('/api/portal/commerce/pages');
  pages=response.pages||[];loadedAt=Date.now();list();
 }catch(e){say(e.message,true)}finally{loading=false}
}
function edit(id){
 const p=pages.find(x=>x.id===id);if(!p)return;
 activeId=id;
 const form=E('argus-commerce-form');
 ['title','description','image_url','accent_color','call_to_action','expires_at'].forEach(k=>{
  form.elements[k].value=p[k]||(['accent_color'].includes(k)?'#e9bc74':'');
 });
 form.elements.amount.value=(Number(p.suggested_amount_cents)/100).toFixed(2).replace('.',',');
 E('argus-commerce-submit').textContent='Salvar alteração como rascunho';
 E('argus-commerce-cancel').hidden=false;
 preview();form.scrollIntoView({behavior:'smooth',block:'center'});
}
function newDraft(){
 activeId='';const form=E('argus-commerce-form');form?.reset();
 E('argus-commerce-submit').textContent='Criar rascunho';
 E('argus-commerce-cancel').hidden=true;preview();
}
async function mutate(action,id='',body={}){
 if(busy||!logged())return;
 busy=true;E('argus-commerce-submit').disabled=true;
 try{
  const path='/api/portal/commerce/pages'+(id?'/'+id:'')+(action==='publish'||action==='archive'?'/'+action:'');
  const result=await request(path,{method:'POST',body});
  say(result.message||'Atualização salva.');
  if(action==='create'||action==='edit')newDraft();
  loadedAt=0;await fetchPages(true);
 }catch(e){say(e.message,true)}
 finally{busy=false;E('argus-commerce-submit').disabled=false;}
}
async function submit(e){
 e.preventDefault();try{
  const body=formValues();
  await mutate(activeId?'edit':'create',activeId,body);
 }catch(err){say(err.message,true)}
}
async function sandbox(e){
 e.preventDefault();if(!logged())return;
 const form=e.currentTarget;const scenario=form.elements.scenario.value;
 const n=String(form.elements.amount.value||'').replace(',','.');
 const amount=Math.round(Number(n)*100);
 if(!Number.isInteger(amount)||amount<100||amount>1000000){say('Informe um valor de teste válido.',true);return}
 const button=form.querySelector('button');button.disabled=true;
 try{
  const r=await request('/api/portal/commerce/sandbox',{method:'POST',body:{scenario,amount_cents:amount}});
  const output=E('argus-commerce-sandbox-result');
  output.textContent=JSON.stringify(r,null,2);
  say('Simulação gerada. Nenhum Pix ou saldo real foi criado.');
 }catch(ex){say(ex.message,true)}
 finally{button.disabled=false}
}
function setup(){
 const root=E('argus-commerce-root');if(!root)return;
 E('argus-commerce-form').addEventListener('submit',submit);
 E('argus-commerce-form').addEventListener('input',preview);
 E('argus-commerce-cancel').addEventListener('click',newDraft);
 E('argus-commerce-refresh').addEventListener('click',()=>{loadedAt=0;fetchPages(true)});
 E('argus-commerce-list').addEventListener('click',event=>{
  const b=event.target.closest('[data-com-edit],[data-com-publish],[data-com-archive],[data-com-copy]');
  if(!b)return;
  const id=b.dataset.comEdit||b.dataset.comPublish||b.dataset.comArchive||b.dataset.comCopy;
  const p=pages.find(x=>x.id===id);if(!p)return;
  if(b.hasAttribute('data-com-edit'))edit(id);
  else if(b.hasAttribute('data-com-publish')){
   if(confirm('Publicar esta página comercial? O Pix só será disponibilizado se o revendedor e a adquirente estiverem homologados.'))mutate('publish',id);
  }else if(b.hasAttribute('data-com-archive')){
   if(confirm('Arquivar esta página e interromper seu acesso público?'))mutate('archive',id);
  }else{
   const url=location.origin+'/c/'+p.public_code;
   if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(()=>say('Link copiado.'),()=>say(url));
   else say(url);
  }
 });
 E('argus-commerce-sandbox-form').addEventListener('submit',sandbox);
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-reseller-view="commerce"]'))setTimeout(()=>fetchPages(true),80);
 });
 setInterval(()=>{
  const id=logged()?String(state.account.id):'';
  if(id!==account){account=id;pages=[];loadedAt=0;newDraft();list();
   E('argus-commerce-sandbox-result').textContent='Nenhum teste executado nesta sessão.';
  }
  if(id&&E('argus-reseller-page-commerce')&&!E('argus-reseller-page-commerce').hidden)fetchPages();
 },5000);
 preview();list();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();