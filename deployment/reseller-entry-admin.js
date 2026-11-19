/* ARGUS Payments: Admin-equivalent entry and enrolment presentation.
 * Strictly cosmetic: original portal login/register handlers and forms stay intact.
 */
(()=>{
 'use strict';
 if(window.__argusResellerEntry)return;
 window.__argusResellerEntry=true;
 const E=id=>document.getElementById(id),auth=E('auth');
 if(!auth)return;
 const sheet=auth.querySelector('.sheet'),intro=auth.querySelector('.intro');
 if(!sheet||!intro||!E('login-form')||!E('register-form'))return;
 const logo='/static/assets/argus-payments-logo-transparent.webp';
 const hero=document.createElement('div');
 hero.className='argus-entry-brand';
 hero.innerHTML='<a href="/" aria-label="Página inicial ARGUS Payments"><img src="'+logo+'" alt="ARGUS Payments" width="235" height="75"></a>'+
   '<span class="argus-entry-brand-label">PAINEL DO REVENDEDOR</span>';
 intro.prepend(hero);
 const strip=document.createElement('div');strip.className='argus-entry-highlights';
 strip.innerHTML='<span><b aria-hidden="true">◈</b> Identidade protegida</span>'+
 '<span><b aria-hidden="true">▣</b> Pix e saldo individual</span>'+
 '<span><b aria-hidden="true">⌘</b> Integrações próprias</span>';
 intro.append(strip);
 const heading=document.createElement('div');
 heading.className='argus-entry-sheet-heading';
 heading.innerHTML='<div class="argus-entry-sheet-logo"><img src="'+logo+'" alt="ARGUS Payments" width="160" height="56"></div>'+
 '<span>ACESSO SEGURO · ARGUS PAYMENTS</span><strong id="argus-entry-sheet-title">Entrar na conta</strong>'+
 '<p id="argus-entry-sheet-description">Acompanhe suas vendas e gerencie seu negócio.</p>';
 sheet.prepend(heading);
 const caption=document.createElement('p');
 caption.className='argus-entry-bottom';
 caption.innerHTML='Sua sessão é protegida. <a href="/">Conhecer a plataforma</a> · <a href="/documentacao-api">Documentação</a>';
 sheet.append(caption);
 const login=E('login-form'),register=E('register-form');
 const pageState=()=>{
   const mode=!register.hidden?'register':'login';
   const headline=E('argus-entry-sheet-title'),sub=E('argus-entry-sheet-description');
   if(headline)headline.textContent=mode==='register'?'Criar conta de revendedor':'Entrar na conta';
   if(sub)sub.textContent=mode==='register'?
    'Preencha seus dados para iniciar a análise cadastral.':'Acesse seu painel com e-mail e senha.';
   sheet.dataset.mode=mode;
   for(const id of ['tab-login','tab-register']){
      const button=E(id);
      if(!button)continue;
      const selected=id==='tab-register'?mode==='register':mode==='login';
      button.setAttribute('aria-selected',selected?'true':'false');
      button.setAttribute('role','tab');
   }
   sheet.querySelector('.tabs')?.setAttribute('role','tablist');
   login.setAttribute('aria-labelledby','tab-login');
   register.setAttribute('aria-labelledby','tab-register');
 };
 for(const input of auth.querySelectorAll('input[type="password"]')){
   if(input.closest('.argus-entry-password'))continue;
   const wrapper=document.createElement('div');wrapper.className='argus-entry-password';
   input.parentNode.insertBefore(wrapper,input);wrapper.appendChild(input);
   const toggle=document.createElement('button');
   toggle.type='button';toggle.className='argus-entry-password-toggle';
   toggle.textContent='Mostrar';toggle.setAttribute('aria-label','Mostrar senha');
   toggle.setAttribute('aria-pressed','false');
   toggle.addEventListener('click',()=>{
     const revealed=input.type==='password';
     input.type=revealed?'text':'password';
     toggle.textContent=revealed?'Ocultar':'Mostrar';
     toggle.setAttribute('aria-label',revealed?'Ocultar senha':'Mostrar senha');
     toggle.setAttribute('aria-pressed',revealed?'true':'false');
     input.focus({preventScroll:true});
   });
   wrapper.append(toggle);
 }
 function visibility(){
   document.body.classList.toggle('argus-entry-active',!auth.hidden);
   if(!auth.hidden)pageState();
 }
 const observer=new MutationObserver(visibility);
 observer.observe(auth,{attributes:true,attributeFilter:['hidden']});
 for(const id of ['tab-login','tab-register','open-register']){
   E(id)?.addEventListener('click',()=>queueMicrotask(pageState));
 }
 window.addEventListener('pageshow',visibility);
 visibility();
})();
