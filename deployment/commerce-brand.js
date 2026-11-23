/* ARGUS Commerce branding extension: account-scoped, no financial calls. */
(()=>{'use strict';
if(window.__argusBrandExtension)return;window.__argusBrandExtension=true;
const $=id=>document.getElementById(id);
const DEFAULT='/static/assets/argus-payments-logo-transparent.webp';
let booted=false,owner='',hasLogo=false,savedUrl=DEFAULT,pending=null,busy=false,reading=false,checkedAt=0,toastTimeout=0;
const logged=()=>typeof state!=='undefined'&&!!state?.account?.id&&!!$('dashboard')&&!$('dashboard').hidden;
function inform(msg,bad=false){
 const local=$('argus-commerce-logo-status');
 if(local){local.textContent=msg;local.dataset.error=bad?'yes':'no';}
 let t=$('argus-commerce-toast');
 if(!t){t=document.createElement('div');t.id='argus-commerce-toast';
  t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.append(t);}
 t.textContent=msg;t.dataset.error=bad?'yes':'no';t.hidden=false;
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>t.hidden=true,6500);
}
function display(){
 const current=pending||savedUrl;
 const img=$('argus-commerce-brand-image');
 if(img){img.onerror=()=>{img.onerror=null;img.src=DEFAULT;};img.src=current||DEFAULT;}
 const btn=$('argus-commerce-logo-remove');if(btn)btn.hidden=!hasLogo;
 const art=$('argus-commerce-preview')?.querySelector('.argus-commerce-preview-card');
 if(art){
  let logo=art.querySelector('.argus-commerce-preview-logo');
  if(!logo){logo=document.createElement('img');logo.className='argus-commerce-preview-logo';
   logo.alt='Logomarca da loja';art.prepend(logo);}
  if(logo.getAttribute('src')!==current)logo.src=current||DEFAULT;
 }
}
async function loadLogo(force=false){
 if(!logged()||reading||busy)return;
 if(!force&&Date.now()-checkedAt<60000)return;
 reading=true;
 const expected=String(state.account.id);
 try{
  const r=await request('/api/portal/commerce/logo');
  if(!r||typeof r.has_logo!=='boolean')throw Error('Resposta inválida do serviço.');
  if(expected!==String(state?.account?.id||''))return;
  hasLogo=r.has_logo;
  savedUrl=hasLogo&&r.preview_url?
   r.preview_url+'?rev='+encodeURIComponent(String(r.updated_at||Date.now())):DEFAULT;
  checkedAt=Date.now();display();
  const local=$('argus-commerce-logo-status');
  if(local&&!pending)local.textContent=hasLogo?
   'Sua logomarca aparecerá nas páginas comerciais publicadas e no seu Pix público.':
   'Marca padrão Argus Pay. Envie sua logomarca para substituí-la.';
 }catch(e){inform('Não foi possível carregar sua marca: '+e.message,true)}
 finally{reading=false}
}
function choose(file){
 if(!file){pending=null;display();return}
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<40||file.size>10*1024*1024){
  pending=null;const i=$('argus-commerce-logo-input');if(i)i.value='';
  inform('Use PNG, JPG ou WEBP de até 10 MB.',true);return;
 }
 const reader=new FileReader();
 const accountId=owner;
 reader.onload=()=>{
  if(accountId!==owner)return;
  const value=String(reader.result||'');
  if(!/^data:image\/(?:png|jpeg|webp);base64,/.test(value)){
   inform('Não foi possível validar a imagem selecionada.',true);return;
  }
  pending=value;display();
  const local=$('argus-commerce-logo-status');
  if(local)local.textContent='Prévia selecionada. Clique em Salvar logomarca para publicar.';
 };
 reader.onerror=()=>inform('Erro na leitura da imagem.',true);
 reader.readAsDataURL(file);
}
async function save(){
 if(busy||!logged())return;
 if(!pending){inform('Escolha sua imagem antes de salvar.',true);return;}
 busy=true;const b=$('argus-commerce-logo-upload');if(b)b.disabled=true;
 const accountId=owner;
 try{
  const r=await request('/api/portal/commerce/logo',{method:'POST',body:{image_data_url:pending}});
  if(accountId!==owner)return;
  pending=null;const inp=$('argus-commerce-logo-input');if(inp)inp.value='';
  hasLogo=true;savedUrl='/api/portal/commerce/logo/image?v='+Date.now();
  checkedAt=Date.now();display();
  inform(r.message||'Logomarca salva com sucesso.');
 }catch(e){inform('Falha ao salvar logomarca: '+e.message,true)}
 finally{busy=false;if(b)b.disabled=false}
}
async function remove(){
 if(busy||!logged())return;
 if(!hasLogo&&!pending)return;
 if(!confirm('Remover sua logomarca? Suas páginas voltarão a exibir Argus Pay.'))return;
 busy=true;const b=$('argus-commerce-logo-remove');if(b)b.disabled=true;
 const accountId=owner;
 try{
  const r=await request('/api/portal/commerce/logo/remove',{method:'POST',body:{remove:true}});
  if(accountId!==owner)return;
  pending=null;hasLogo=false;savedUrl=DEFAULT;checkedAt=Date.now();
  const inp=$('argus-commerce-logo-input');if(inp)inp.value='';
  display();inform(r.message||'Logomarca removida.');
 }catch(e){inform('Não foi possível remover logomarca: '+e.message,true)}
 finally{busy=false;if(b)b.disabled=false}
}
function init(){
 if(booted||!$('argus-commerce-brand-image')||!$('argus-commerce-logo-input')||!$('argus-commerce-logo-upload')||
    !$('argus-commerce-logo-remove'))return;
 booted=true;
 $('argus-commerce-logo-input').addEventListener('change',e=>choose(e.target.files?.[0]));
 $('argus-commerce-logo-upload').addEventListener('click',save);
 $('argus-commerce-logo-remove').addEventListener('click',remove);
 const preview=$('argus-commerce-preview');
 if(preview&&typeof MutationObserver!=='undefined'){
  const obs=new MutationObserver(()=>display());
  obs.observe(preview,{childList:true,subtree:false});
 }
 setInterval(()=>{
  const id=logged()?String(state.account.id):'';
  if(id!==owner){
   owner=id;pending=null;hasLogo=false;savedUrl=DEFAULT;checkedAt=0;
   const input=$('argus-commerce-logo-input');if(input)input.value='';
   display();
  }
  if(id&&$('argus-reseller-page-commerce')&&!$('argus-reseller-page-commerce').hidden)loadLogo();
 },5000);
 display();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
setInterval(()=>{if(!booted)init()},1200);
})();