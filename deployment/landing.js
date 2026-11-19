/* ARGUS Pay public presentation.
 * Entirely client-side UI: no account, transaction, API key, tracking or
 * personal information is requested or transmitted from this marketing page.
 */
(()=>{
'use strict';
document.documentElement.classList.add('landing-js');
const $=selector=>document.querySelector(selector);
const menu=$('#mobile-menu');
const button=$('#menu-toggle');
if(menu&&button){
  const close=()=>{
    menu.hidden=true;
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-label','Abrir menu');
  };
  button.addEventListener('click',()=>{
    const isOpen=button.getAttribute('aria-expanded')==='true';
    menu.hidden=isOpen;
    button.setAttribute('aria-expanded',String(!isOpen));
    button.setAttribute('aria-label',isOpen?'Abrir menu':'Fechar menu');
  });
  menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&menu.hidden===false){close();button.focus();}
  });
  window.addEventListener('resize',()=>{
    if(window.innerWidth>820)close();
  },{passive:true});
  close();
}
const currency=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});
const qty=$('#simulation-qty'),ticket=$('#simulation-ticket');
if(qty&&ticket){
  const number=new Intl.NumberFormat('pt-BR');
  const update=()=>{
    const count=Math.min(1000,Math.max(20,Number(qty.value)||250));
    const price=Math.min(1000,Math.max(10,Number(ticket.value)||100));
    const volume=count*price;
    const qtyOutput=$('#simulation-qty-value');
    const ticketOutput=$('#simulation-ticket-value');
    const revenueOutput=$('#simulation-revenue');
    const volumeOutput=$('#simulation-volume');
    const countOutput=$('#simulation-count');
    if(qtyOutput)qtyOutput.textContent=number.format(count);
    if(ticketOutput)ticketOutput.textContent=currency.format(price);
    if(revenueOutput)revenueOutput.textContent=currency.format(volume);
    if(volumeOutput)volumeOutput.textContent=currency.format(volume);
    if(countOutput)countOutput.textContent=number.format(count);
  };
  qty.addEventListener('input',update);
  ticket.addEventListener('input',update);
  update();
}
const copy=$('#copy-example'),sample=$('#integration-code');
if(copy&&sample){
  const original=copy.textContent;
  copy.addEventListener('click',async()=>{
    const code=sample.textContent||'';
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(code);
      }else{
        const field=document.createElement('textarea');
        field.value=code;field.setAttribute('readonly','');field.style.position='fixed';
        field.style.left='-9999px';document.body.appendChild(field);
        field.select();const ok=document.execCommand('copy');field.remove();
        if(!ok)throw new Error('copy unsupported');
      }
      copy.textContent='Copiado ✓';
      copy.setAttribute('aria-label','Exemplo copiado');
    }catch(_){
      copy.textContent='Selecione o exemplo';
      copy.setAttribute('aria-label','Selecione e copie o exemplo manualmente');
    }
    // Reset on the next interaction instead of storing or transmitting anything.
    copy.addEventListener('blur',()=>{
      copy.textContent=original;
      copy.setAttribute('aria-label','Copiar exemplo de integração');
    },{once:true});
  });
}
// Keep accordions readable: opening one closes its siblings.
const details=[...document.querySelectorAll('.faq-grid details')];
details.forEach(d=>d.addEventListener('toggle',()=>{
  if(!d.open)return;
  for(const other of details)if(other!==d)other.open=false;
}));
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const reveal=[...document.querySelectorAll('[data-reveal]')];
if(reveal.length&&!reduced&&'IntersectionObserver' in window){
  document.documentElement.classList.add('landing-animate');
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  },{rootMargin:'0px 0px -35px 0px',threshold:0.045});
  reveal.forEach(element=>observer.observe(element));
}else reveal.forEach(element=>element.classList.add('is-visible'));
})();
