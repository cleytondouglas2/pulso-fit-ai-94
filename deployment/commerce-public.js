/* Published commerce pages are read-only. No Pix is issued from this view. */
(()=>{'use strict';
const root=document.getElementById('argus-cp-main');
const id=location.pathname.match(/^\/c\/([a-f0-9]{32})\/?$/)?.[1];
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(c)/100);
function show(d){
 root.replaceChildren();
 const card=document.createElement('article');card.className='argus-cp-card';
 card.style.setProperty('--accent',/^#[a-f0-9]{6}$/i.test(d.accent_color)?d.accent_color:'#e9bc74');
 if(d.image_url&&/^https:\/\//.test(d.image_url)){
  const img=document.createElement('img');img.src=d.image_url;img.alt='Imagem da oferta';img.loading='lazy';card.append(img);
 }
 const body=document.createElement('div');body.className='argus-cp-body';
 const eyebrow=document.createElement('div');eyebrow.className='argus-cp-eyebrow';eyebrow.textContent=d.seller_name||'ARGUS Pay';body.append(eyebrow);
 const title=document.createElement('h1');title.textContent=d.title;body.append(title);
 const description=document.createElement('p');description.textContent=d.description;body.append(description);
 const value=document.createElement('strong');value.textContent='Valor sugerido: '+money(d.suggested_amount_cents);body.append(value);
 const ready=d.checkout?.available&&/^\/e\/[a-f0-9]{32}$/.test(d.checkout?.public_path||'');
 const btn=document.createElement(ready?'a':'div');btn.className='argus-cp-button'+(ready?'':' is-disabled');
 btn.textContent=ready?d.call_to_action:'Pagamento indisponível neste momento';
 if(ready)btn.href=d.checkout.public_path;body.append(btn);
 const info=document.createElement('small');info.textContent=d.price_note+' A ARGUS Pay confirmará o valor efetivo no checkout antes da criação de qualquer Pix.';body.append(info);
 card.append(body);root.append(card);
}
async function load(){
 if(!id){root.textContent='Página comercial inválida.';return}
 try{
  const response=await fetch('/api/public/commerce/'+id,{credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Oferta indisponível');
  const data=await response.json();
  if(!data.not_a_receipt)throw Error('Resposta não reconhecida.');
  show(data);
 }catch(_){
  root.replaceChildren();
  const div=document.createElement('div');div.className='argus-cp-placeholder';
  const h=document.createElement('h1');h.textContent='Página não disponível';
  const p=document.createElement('p');p.textContent='Esta oferta pode ter expirado, sido arquivada ou estar temporariamente indisponível.';div.append(h,p);
  root.append(div);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();