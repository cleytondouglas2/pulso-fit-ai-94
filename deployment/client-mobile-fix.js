/* ARGUS Pay client-only mobile navigation.
 * Tightly scoped to client.html, never reads payment data or credentials.
 */
(()=>{
 'use strict';
 const init=()=>{
  const top=document.querySelector('header.top');
  if(!top||top.classList.contains('argus-client-top'))return;
  const nav=top.querySelector('nav');
  if(!nav)return;
  top.classList.add('argus-client-top');
  nav.classList.add('argus-client-nav');
  nav.id='argus-client-nav';
  const toggle=document.createElement('button');
  toggle.id='argus-mobile-menu-toggle';
  toggle.type='button';
  toggle.textContent='☰';
  toggle.setAttribute('aria-controls','argus-client-nav');
  toggle.setAttribute('aria-expanded','false');
  toggle.setAttribute('aria-label','Abrir navegação');
  top.insertBefore(toggle,nav);
  let open=false;
  const mobile=()=>window.matchMedia('(max-width:760px)').matches;
  const render=()=>{
   const isMobile=mobile();
   nav.hidden=isMobile?!open:false;
   toggle.hidden=!isMobile;
   toggle.textContent=open&&isMobile?'✕':'☰';
   toggle.setAttribute('aria-expanded',String(open&&isMobile));
   toggle.setAttribute('aria-label',open&&isMobile?'Fechar navegação':'Abrir navegação');
  };
  toggle.addEventListener('click',()=>{open=!open;render()});
  nav.addEventListener('click',event=>{
   if(event.target.closest('a')&&mobile()){open=false;render();}
  });
  window.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&open){open=false;render();toggle.focus();}
  });
  let wasMobile=mobile();
  window.addEventListener('resize',()=>{
   const now=mobile();
   if(now!==wasMobile){wasMobile=now;open=false}
   render();
  },{passive:true});
  render();
 };
 if(document.readyState==='loading')
   document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
