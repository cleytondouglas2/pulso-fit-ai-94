/* KYC do cliente: cadastro entra diretamente no painel restrito. */
(()=>{
 'use strict';
 const E=id=>document.getElementById(id);
 const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={identidade_frente:'Documento pessoal: frente',identidade_verso:'Documento pessoal: verso',selfie:'Selfie do titular ou sócio',cnpj_comprovante:'Comprovante de inscrição no CNPJ',contrato_social:'Contrato social / quadro societário'};
 let busy=false;
 const on=()=>state?.account?.kyc_studio;
 function ensure(){
   if(E('kyc-client-root'))return;
   const dashboard=E('dashboard'),head=dashboard?.querySelector('.dash-top');
   if(!head)return;
   const panel=document.createElement('section');panel.id='kyc-client-root';panel.className='kyc-client-root';
   head.after(panel);
   const old=E('upload-form')?.closest('article');
   if(old){
     old.hidden=true;
     old.style.display='none';
     // The former 2-column dashboard must become one full-width account card
     // when the legacy document-upload card is replaced by KYC Studio.
     const grid=old.closest('.grid');
     if(grid)grid.classList.add('argus-kyc-legacy-hidden');
   }
 }
 function renderKyc(account){
   ensure();
   const root=E('kyc-client-root'),kyc=account?.kyc_studio;
   if(!root||!kyc)return;
   const texts={documents_required:['Documentos necessários','Envie os documentos indicados para iniciar sua análise.'],
     documents_under_review:['Dados em análise','Recebemos seus documentos. Nossa equipe fará a conferência e informará a decisão.'],
     identity_verified:['Identidade aprovada','Sua documentação foi validada. Aguardando autorização para as operações financeiras.'],
     approved:['Conta habilitada','Sua conta está habilitada para os serviços financeiros autorizados.'],
     rejected:['Cadastro não aprovado','Consulte o motivo informado pela equipe de análise.'],
     suspended:['Conta suspensa','Suas operações permanecem bloqueadas até nova autorização.']};
   const title=texts[account.status]||['Cadastro em avaliação','Aguarde a conferência da equipe ARGUS.'];
   const required=kyc.required||[],missing=new Set(kyc.missing||[]);
   const complete=required.filter(t=>!missing.has(t)).length;
   const editable=['documents_required','documents_under_review'].includes(account.status);
   const blocked=!kyc.financial_enabled;
   let html='<div class="kyc-customer-head"><div><small>ARGUS · CONFORMIDADE E SEGURANÇA</small><h2>'+safe(title[0])+'</h2><p>'+safe(title[1])+'</p></div><span class="kyc-pill">'+safe(account.account_type)+' · '+complete+'/'+required.length+' documentos</span></div>';
   html+='<div class="kyc-customer-stages"><span>✓ Cadastro</span><span class="'+(kyc.complete?'ready':'')+'">2. Documentos</span><span class="'+(['identity_verified','approved'].includes(account.status)?'ready':'')+'">3. Análise</span><span class="'+(!blocked?'ready':'')+'">4. Operação</span></div>';
   if(blocked)html+='<div class="kyc-lock"><strong>🔒 Pix e API ainda não habilitados</strong><p>Você pode acessar o painel e acompanhar sua solicitação. O recebimento e o envio de Pix e as chaves API só serão autorizados após as validações necessárias.</p></div>';
   if(editable){
     html+='<div class="kyc-customer-form"><h3>Envie sua documentação</h3><p>Arquivos nítidos JPG, PNG ou PDF (até 3,2 MB). Selfie somente como foto.</p><div class="kyc-cards">';
     required.forEach(t=>{
       const isMissing=missing.has(t);
       html+='<article class="kyc-card '+(isMissing?'missing':'received')+'"><div class="kyc-card-status">'+(isMissing?'◷ Pendente':'✓ Recebido')+'</div><strong>'+safe(names[t]||t)+'</strong><p>'+(isMissing?'Documento obrigatório para concluir o envio.':'Arquivo protegido recebido. Pode substituir antes da decisão.')+'</p>';
       if(t==='selfie'){
         html+='<button type="button" class="kyc-upload-btn kyc-face-start" data-kyc-face-open="1">'+
           (isMissing?'Iniciar verificação facial':'Refazer captura facial')+'</button>'+
           '<p class="kyc-face-status">Câmera frontal · piscar · mover o rosto. Não use foto da galeria.</p>';
       }else{
         html+='<label class="kyc-upload-btn">'+(isMissing?'Selecionar documento':'Substituir documento')+
          '<input type="file" data-kyc-upload="'+safe(t)+'" accept="image/png,image/jpeg,application/pdf"></label>';
       }
       html+='</article>';
     });
     html+='</div>';
     const face=kyc.face_capture||{};
     html+='<p class="kyc-info">'+(face.guided_capture_completed?
       '✓ Captura facial guiada recebida. Aguardando comparação humana com o documento.':
       'Verificação facial guiada pendente. Usamos a câmera frontal e movimentos orientados; a equipe KYC ainda verificará a identidade.')+'</p>';
     if(account.account_type==='PJ'){
       const rep=kyc.legal_representative;
       html+='<section class="kyc-owner"><h3>Proprietário ou sócio responsável</h3><p>Preencha os dados do representante cuja identidade será enviada.</p>';
       if(rep)html+='<p class="kyc-owner-verified">✓ '+safe(rep.full_name)+' · CPF final '+safe(rep.cpf_last4)+' · '+safe(rep.capacity)+'</p>';
       else html+='<form id="kyc-owner-form"><label>Nome completo<input name="full_name" minlength="5" maxlength="180" autocomplete="name" required></label><label>CPF do responsável<input name="cpf" inputmode="numeric" maxlength="19" required></label><label>Vínculo<select name="capacity" required><option value="">Selecione</option><option value="proprietario">Proprietário</option><option value="socio">Sócio</option><option value="administrador">Administrador</option></select></label><button type="submit">Registrar responsável</button></form>';
       html+='</section>';
     }
     html+='<p class="kyc-info">Os arquivos são criptografados e disponibilizados somente à equipe autorizada. Nenhum documento é automaticamente aprovado por uma simples validação de formato.</p></div>';
   }
   const history=(kyc.history||[]).filter(x=>x.event_type!=='document_viewed');
   if(history.length){
     html+='<section class="kyc-history"><h3>Histórico de análise</h3>';
     history.slice(0,7).forEach(e=>html+='<div><small>'+safe(e.created_at)+'</small><strong>'+safe(e.event_type==='needs_changes'?'Correções solicitadas':e.event_type==='identity_approved'?'Identidade aprovada':'Decisão registrada')+'</strong><p>'+safe(e.note)+'</p></div>');
     html+='</section>';
   }
   root.innerHTML=html;
   root.querySelectorAll('input[data-kyc-upload]').forEach(input=>input.addEventListener('change',upload));
   root.querySelectorAll('[data-kyc-face-open]').forEach(b=>b.onclick=()=>{
     if(window.ArgusFaceCapture?.open)window.ArgusFaceCapture.open(update);
     else notice('A câmera de verificação ainda não carregou. Atualize a página.',true);
   });
   E('kyc-owner-form')?.addEventListener('submit',owner);
   if(E('status-message'))E('status-message').textContent=title[1];
 }
 async function update(){const data=await request('/api/portal/session');render(data.account)}
 async function upload(ev){
   if(busy)return;
   const input=ev.currentTarget,file=input.files?.[0];
   if(!file)return;
   if(file.size<1024||file.size>3200000){notice('Arquivo deve ter entre 1 KB e 3,2 MB.',true);input.value='';return;}
   if(!['image/jpeg','image/png','application/pdf'].includes(file.type)){notice('Envie JPG, PNG ou PDF.',true);input.value='';return;}
   busy=true;input.disabled=true;
   try{
     const b64=await new Promise((ok,no)=>{const r=new FileReader();r.onerror=()=>no(Error('Falha ao ler o arquivo'));r.onload=()=>ok(String(r.result).split(',')[1]);r.readAsDataURL(file)});
     const result=await request('/api/portal/kyc/upload',{method:'POST',body:{document_type:input.dataset.kycUpload,file_base64:b64}});
     input.value='';notice(result.message);await update();
   }catch(e){notice(e.message,true)}
   finally{busy=false;input.disabled=false}
 }
 async function owner(ev){
   ev.preventDefault();if(busy)return;busy=true;
   const form=ev.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;
   try{
     const input=Object.fromEntries(new FormData(form));
     const response=await request('/api/portal/kyc/representative',{method:'POST',body:input});
     form.reset();notice(response.message);await update();
   }catch(e){notice(e.message,true)}finally{busy=false;button.disabled=false}
 }
 // Replace the registration handler only. Existing login / password policy remains unchanged.
 const reg=E('register-form');
 if(reg)reg.onsubmit=e=>{
   e.preventDefault();action(e.target,async()=>{
     const data=Object.fromEntries(new FormData(e.target));
     const response=await request('/api/portal/register',{method:'POST',body:data});
     e.target.reset();
     if(response.account){render(response.account);notice('Cadastro criado. Envie seus documentos para análise da ARGUS.')}
     else {tab('login');E('login-form').elements.email.value=data.email;notice(response.message)}
   });
 };
 const prior=render;
 render=function(account){prior(account);renderKyc(account)};
 if(state?.account)renderKyc(state.account);
})();
