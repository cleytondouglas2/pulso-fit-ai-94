/* ARGUS identity profile: legal type and name captured once, only amount on Pix screen.
   CPF/CNPJ never included in session data, DOM state, localStorage, query params, or Pix requests.
   This controller only receives last four digits from the protected status endpoint. */
(() => {
 'use strict';
 window.argusRequirePixProfile=true;
 window.argusProfileReady=false;
 let loaded=false, pendingPrompt=false, verifying=false;
 const summary=()=>document.getElementById('argus-payer-summary');
 const panel=()=>document.getElementById('argus-payer-details');
 const btn=()=>document.getElementById('charge-submit');
 function label(type){return type==='PJ'?'Razão social / nome da empresa':'Nome completo';}
 function docLabel(type){return type==='PJ'?'CNPJ':'CPF';}
 function profileDialog(profile){
   if(pendingPrompt || !state.user?.mfa_verified || state.user?.must_change_password)return;
   pendingPrompt=true;
   const initialType=profile.account_type||'PF';
   const html='<p class="muted">Para proteger sua conta e evitar digitar CPF/CNPJ em cada Pix, confirme os dados cadastrais. Os documentos serão armazenados criptografados e não aparecerão na geração de cobrança.</p>'+
    '<form id="argus-profile-form" class="modal-form" method="post">'+
    '<label>Tipo de cadastro<select name="account_type" id="argus-profile-type" required>'+
    '<option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select></label>'+
    '<label id="argus-profile-name-label">Nome completo<input type="text" name="legal_name" minlength="3" maxlength="180" autocomplete="name" required></label>'+
    '<label id="argus-profile-doc-label">CPF<input type="text" name="document_number" inputmode="numeric" autocomplete="off" maxlength="22" required placeholder="Somente números ou formatado"></label>'+
    '<p class="muted">CPF: 11 dígitos. CNPJ: 14 dígitos. A verificação matemática não comprova titularidade. Ao salvar, o documento não será exibido novamente.</p>'+
    '<div class="modal-actions"><button class="btn primary" type="submit">Salvar dados cadastrais</button></div>'+
    '</form>';
   dialog('Complete seu cadastro PF ou PJ',html,'SEGURANÇA CADASTRAL');
   document.getElementById('modal').addEventListener('close',()=>{pendingPrompt=false;},{once:true});
   const type=document.getElementById('argus-profile-type'),name=document.querySelector('#argus-profile-form [name=legal_name]'),
     doc=document.querySelector('#argus-profile-form [name=document_number]');
   type.value=initialType;name.value=profile.legal_name||'';
   const update=()=>{
     const pj=type.value==='PJ';
     document.getElementById('argus-profile-name-label').firstChild.textContent=label(type.value);
     document.getElementById('argus-profile-doc-label').firstChild.textContent=docLabel(type.value);
     doc.placeholder=pj?'00.000.000/0000-00':'000.000.000-00';
     doc.maxLength=pj?22:16;doc.value='';
   };
   type.onchange=update;update();
   document.getElementById('argus-profile-form').onsubmit=async event=>{
     event.preventDefault();
     const form=event.target,save=form.querySelector('button[type=submit]'),data=Object.fromEntries(new FormData(form));
     save.disabled=true;save.setAttribute('aria-busy','true');
     try{
       // No localStorage, URL, console logging or any persisted browser copy.
       const response=await post('/api/admin/account-profile',data);
       form.reset();closeDialog();pendingPrompt=false;
       window.argusProfileReady=!!response.profile?.complete;
       show(response.profile);toast('Cadastro PF/PJ confirmado com segurança.');
     }catch(error){toast(error.message||'Não foi possível salvar os dados',true);}
     finally{save.disabled=false;save.removeAttribute('aria-busy');}
   };
 }
 function show(profile){
   const ready=!!profile?.complete;
   window.argusProfileReady=ready;
   const p=panel(),s=summary();
   if(p)p.hidden=false;
   if(s){
     s.textContent=ready ?
       (profile.account_type==='PJ'?'Pessoa jurídica':'Pessoa física')+' · '+
       (profile.legal_name||'')+' · '+docLabel(profile.account_type)+' final '+(profile.document_last4||'—') :
       'Cadastro PF/PJ obrigatório. Complete seu perfil para emitir cobranças Pix.';
   }
   const edit=document.getElementById('argus-edit-profile');
   if(edit)edit.onclick=()=>profileDialog(profile||{});
   if(typeof refreshPixButton==='function')refreshPixButton();
 }
 async function refresh(openPrompt=false){
   if(verifying)return;
   if(!state.user?.mfa_verified || state.user?.must_change_password)return;
   verifying=true;
   try{
     const result=await api('/api/admin/account-profile');
     loaded=true;
     show(result.profile);
     if(!result.profile?.complete && openPrompt)profileDialog(result.profile);
   }catch(error){
     loaded=true;window.argusProfileReady=false;
     if(summary())summary().textContent='Não foi possível validar o cadastro. O Pix permanecerá bloqueado.';
     if(typeof refreshPixButton==='function')refreshPixButton();
   }finally{verifying=false}
 }
 window.argusProfileRefresh=()=>refresh(false);
 const previousSignin=signin;
 signin=function(data){
   previousSignin(data);
   if(data?.user?.mfa_verified && !data.user.must_change_password){
     loaded=false;window.argusProfileReady=false;
     setTimeout(()=>refresh(true),200);
   }
 };
 // Staff can keep the dashboard open; only Pix creation is blocked until profile complete.
 document.addEventListener('DOMContentLoaded',()=>{
   const edit=document.getElementById('argus-edit-profile');
   if(edit)edit.onclick=()=>refresh(true);
   const go=document.querySelector('[data-nav="charge-create"]');
   if(go)go.addEventListener('click',()=>refresh(true));
   document.addEventListener('visibilitychange',()=>{if(!document.hidden&&loaded)refresh(false)});
 });
})();