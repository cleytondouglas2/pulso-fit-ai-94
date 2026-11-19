/* ARGUS KYC Studio - role protected via backend, interactive review and audit history. */
(()=>{
 'use strict';
 const E=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={identidade_frente:'Identidade · frente',identidade_verso:'Identidade · verso',selfie:'Selfie do responsável',cnpj_comprovante:'Comprovante CNPJ',contrato_social:'Contrato social',responsavel_legal:'Responsável legal'};
 const statuses={documents_required:'Aguardando documentos',documents_under_review:'Aguardando revisão',identity_verified:'KYC aprovado',approved:'Financeiro habilitado',rejected:'Rejeitado',suspended:'Suspenso'};
 let queue=[],selected='',loading=false;
 function staff(){return ['admin','superadmin'].includes(state?.user?.role)}
 function superuser(){return state?.user?.role==='superadmin'}
 function nav(){document.querySelectorAll('.kyc-staff-only').forEach(x=>{x.style.display=staff()?'flex':'none'})}
 function meta(a){
   const checked=a.kyc?.received?.length||0,total=a.kyc?.required?.length||0;
   const pct=Math.round(total?checked/total*100:0);
   return '<div class="kyc-progress"><span style="width:'+pct+'%"></span></div><small>'+checked+'/'+total+' arquivos · '+(a.kyc?.complete?'Pronto para análise':'Pendente')+'</small>';
 }
 function drawStats(){
   const wrap=E('kyc-stat-grid');if(!wrap)return;
   const values=[
     ['Total de cadastros',queue.length],
     ['Na fila',queue.filter(x=>x.status==='documents_under_review').length],
     ['Documentos pendentes',queue.filter(x=>x.status==='documents_required').length],
     ['KYC aprovados',queue.filter(x=>['approved','identity_verified'].includes(x.status)).length]
   ];
   wrap.innerHTML=values.map(v=>'<div class="kyc-stat"><span>'+esc(v[0])+'</span><strong>'+v[1]+'</strong></div>').join('');
 }
 function drawQueue(){
   const target=E('kyc-queue');if(!target)return;
   const term=(E('kyc-search')?.value||'').trim().toLowerCase(),filter=E('kyc-filter')?.value||'all';
   const filtered=queue.filter(x=>(filter==='all'||x.status===filter)&&
     (x.display_name+' '+x.email+' '+x.id).toLowerCase().includes(term));
   E('kyc-queue-count').textContent=filtered.length+' contas';
   target.innerHTML=filtered.map(a=>
     '<button class="kyc-queue-row '+(a.id===selected?'selected':'')+'" type="button" data-kyc-account="'+esc(a.id)+'">'+
     '<span class="kyc-queue-avatar">'+esc((a.display_name||'?')[0]).toUpperCase()+'</span>'+
     '<span class="kyc-queue-info"><strong>'+esc(a.display_name)+'</strong><small>'+esc(a.email)+'</small>'+
     '<em class="kyc-status '+esc(a.status)+'">'+esc(statuses[a.status]||a.status)+'</em>'+meta(a)+'</span>'+
     '<span class="kyc-queue-next" aria-hidden="true">›</span></button>'
   ).join('')||'<div class="kyc-empty">Nenhum cadastro encontrado neste filtro.</div>';
 }
 function detail(a){
   const target=E('kyc-dossier');if(!target)return;
   const k=a.kyc||{},req=k.required||[],present=new Set(k.received||[]),docs=k.documents||[];
   const rep=k.legal_representative;
   const events=(k.history||[]).filter(x=>x.event_type!=='document_viewed');
   let html='<div class="kyc-dossier-header"><div><span class="kyc-strap">DOSSIE DE IDENTIDADE · ARGUS</span><h2>'+esc(a.display_name)+'</h2>'+
     '<p>'+esc(a.email)+' · '+esc(a.account_type==='PJ'?'Pessoa jurídica':'Pessoa física')+'</p></div>'+
     '<span class="kyc-status '+esc(a.status)+'">'+esc(statuses[a.status]||a.status)+'</span></div>';
   html+='<div class="kyc-dossier-data">'+[
     ['Nome / razão social',a.display_name],['Tipo de conta',a.account_type],
     ['CPF/CNPJ cadastrado','•••• '+a.document_last4],['E-mail cadastrado',a.email],
     ['Solicitação criada',a.created_at],['Última alteração',a.updated_at],
     ['Recebedor financeiro',a.merchant_linked?'Vinculado':'Não autorizado'],
     ['Triagem cadastral',a.screening?.label||'Não realizada']
   ].map(x=>'<div><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>').join('')+'</div>';
   html+='<div class="kyc-reveal-panel"><button type="button" id="kyc-reveal-identity">Conferir CPF/CNPJ cadastrado</button><p id="kyc-revealed-document" class="kyc-privacy">O documento completo só aparece após autorização de acesso e fica registrado no histórico.</p></div>';
   if(a.account_type==='PJ')html+='<div class="kyc-representative-card"><h3>Responsável / sócio</h3>'+
     (rep?'<strong>'+esc(rep.full_name)+'</strong><p>CPF final '+esc(rep.cpf_last4)+' · '+esc(rep.capacity)+'</p>':
     '<p class="kyc-warning">Responsável ainda não informado.</p>')+'</div>';
   html+='<div class="kyc-dossier-heading"><h3>Evidências documentais</h3><span>'+present.size+'/'+req.length+' requisitos</span></div>';
   html+='<div class="kyc-review-docs">'+req.map(type=>{
     const isPresent=present.has(type);
     const d=docs.find(x=>x.document_type===type&&x.review_status!=='needs_changes');
     const canView=isPresent&&d;
     return '<div class="kyc-review-doc '+(isPresent?'ok':'missing')+'"><div><strong>'+esc(labels[type]||type)+'</strong>'+
       '<small>'+(isPresent?'✓ Protegido e disponível · '+esc(d?.created_at||''):
       (d?'⚠ Enviado anteriormente, mas sem cópia acessível na Central KYC. Solicite reenvio.':
       '⚠ Não recebido / correção pendente'))+'</small></div>'+
       (canView?'<button type="button" data-kyc-preview="'+esc(d.id)+'" data-kyc-mime="'+esc(d.mime)+'">Examinar arquivo</button>':'<span>Obrigatório</span>')+'</div>';
   }).join('')+'</div>';
   if(events.length)html+='<div class="kyc-timeline"><h3>Histórico de decisões</h3>'+events.slice(0,10).map(e=>
     '<div><small>'+esc(e.created_at)+'</small><b>'+esc(e.event_type==='identity_approved'?'KYC aprovado':e.event_type==='needs_changes'?'Correções solicitadas':'Rejeitado')+'</b><p>'+esc(e.note)+'</p></div>').join('')+'</div>';
   if(['documents_required','documents_under_review','identity_verified','rejected'].includes(a.status)){
     html+='<div class="kyc-decision"><h3>Decisão do analista</h3><p>Examine os arquivos originais antes de decidir. A aprovação de documentos não habilita Pix ou API.</p>'+
       '<form id="kyc-decision-form"><label>Resultado da análise<select name="decision" id="kyc-decision"><option value="approve_identity">Aprovar identidade / KYC</option>'+
       '<option value="needs_changes">Solicitar documentos corrigidos</option><option value="reject">Rejeitar cadastro</option></select></label>'+
       '<div id="kyc-checks"><label><input type="checkbox" name="documents_match"> Conferi os documentos e sua legibilidade</label>'+
       '<label><input type="checkbox" name="identity_matches"> Os documentos correspondem ao cadastro e à selfie</label>'+
       '<label><input type="checkbox" name="legal_representative_checked"> Confirmei o titular ou responsável autorizado da empresa</label></div>'+
       '<div id="kyc-requirements" hidden><p>Selecione os documentos que o cliente deve corrigir:</p>'+
       req.concat(a.account_type==='PJ'?['responsavel_legal']:[]).map(type=>
       '<label><input type="checkbox" name="requested_types" value="'+esc(type)+'"> '+esc(labels[type]||type)+'</label>').join('')+'</div>'+
       '<label>Justificativa da decisão<textarea name="reason" minlength="10" maxlength="650" rows="3" required placeholder="Descreva a consistência verificada ou o motivo da correção..."></textarea></label>'+
       '<button class="kyc-submit-review" type="submit">Registrar decisão com auditoria</button></form></div>';
   }
   if(superuser() && a.account_type==='PJ' && a.status==='identity_verified'){
     html+='<div class="kyc-finance-release"><h3>Liberação financeira · Super Admin</h3>'+
       '<p>Etapa independente do KYC. Não autorize recebimentos sem homologação do provedor e contrato aplicável.</p>'+
       '<form id="kyc-finance-form"><label>CNPJ cadastrado conferido<input type="text" name="cnpj" inputmode="numeric" required></label>'+
       '<label>E-mail do recebedor habilitado no provedor<input type="email" name="recipient_email" required></label>'+
       [['kyc_verified','Documentos aprovados'],['provider_approved','Provedor autorizou este recebedor'],['contract_signed','Contrato assinado'],['split_direction_confirmed','Regras de recebimento confirmadas']].map(x=>
       '<label class="kyc-confirm"><input type="checkbox" name="'+x[0]+'" required> '+x[1]+'</label>').join('')+
       '<button type="submit">Ativar somente se autorizado pelo provedor</button></form></div>';
   }
   html+='<p class="kyc-privacy">Apenas membros autorizados podem visualizar anexos. Downloads são auditados. Nenhuma validação pública de CPF comprova identidade ou propriedade da conta.</p>';
   target.innerHTML=html;
   E('kyc-reveal-identity')?.addEventListener('click',async()=>{
     const button=E('kyc-reveal-identity');button.disabled=true;
     try{
       const result=await api('/api/admin/kyc/applications/'+encodeURIComponent(selected)+'/identity');
       const el=E('kyc-revealed-document');
       if(el)el.textContent='CPF/CNPJ: '+(result.document_number||'—')+
         (result.representative_cpf?' · CPF do responsável: '+result.representative_cpf:'');
     }catch(e){toast(e.message,true)}
     finally{button.disabled=false}
   });
   E('kyc-decision')?.addEventListener('change',toggleDecision);
   E('kyc-decision-form')?.addEventListener('submit',decide);
   E('kyc-finance-form')?.addEventListener('submit',release);
   target.querySelectorAll('button[data-kyc-preview]').forEach(b=>b.addEventListener('click',preview));
   toggleDecision();
 }
 function toggleDecision(){
   const choice=E('kyc-decision')?.value;
   const checks=E('kyc-checks'),req=E('kyc-requirements');
   if(checks)checks.hidden=choice!=='approve_identity';
   if(req)req.hidden=choice!=='needs_changes';
 }
 async function preview(ev){
   if(!selected)return;
   const button=ev.currentTarget,id=button.dataset.kycPreview,mime=button.dataset.kycMime;
   button.disabled=true;
   const base='/api/admin/kyc/applications/'+encodeURIComponent(selected)+
     '/documents/'+encodeURIComponent(id);
   try{
     if(!['image/jpeg','image/png','application/pdf'].includes(mime))
       throw Error('Formato de documento não suportado');
     let pdf=null;
     if(mime==='application/pdf'){
       const response=await fetch(base+'?preview=metadata',{
         credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
       });
       if(!response.ok){
         let detail='';
         try{const json=await response.json();detail=String(json.message||json.error||'').slice(0,170)}
         catch(_){}
         throw Error(detail||('Não foi possível preparar PDF (HTTP '+response.status+').'));
       }
       const payload=await response.json();
       pdf=payload.pdf;
       if(!pdf||!Number.isSafeInteger(Number(pdf.pages))||Number(pdf.pages)<1||
          !Number.isSafeInteger(Number(pdf.preview_pages))||Number(pdf.preview_pages)<1)
         throw Error('O arquivo PDF não retornou páginas válidas para exame.');
     }
     let modal=E('kyc-document-viewer');
     if(!modal){
       modal=document.createElement('div');modal.id='kyc-document-viewer';
       modal.className='kyc-document-viewer';document.body.appendChild(modal);
     }
     modal.innerHTML='<div class="kyc-viewer-card" role="dialog" aria-modal="true" aria-label="Documento protegido">'+
       '<div class="kyc-viewer-head"><strong>Documento protegido · ARGUS</strong>'+
       '<button type="button" id="kyc-close-viewer">Fechar ×</button></div>'+
       '<p class="kyc-viewer-notice">Prévia restrita à equipe de análise KYC. O acesso é registrado.</p>'+
       (pdf?'<div class="kyc-pdf-controls"><button type="button" id="kyc-pdf-prev">Página anterior</button>'+
        '<span id="kyc-pdf-counter" aria-live="polite"></span>'+
        '<button type="button" id="kyc-pdf-next">Próxima página</button></div>':'')+
       '<div class="kyc-preview-stage"><p id="kyc-preview-loading" role="status">Carregando documento protegido...</p>'+
       '<img id="kyc-viewer-image" alt="Documento apresentado à equipe KYC"></div>'+
       '<p id="kyc-preview-error" class="kyc-preview-error" hidden role="alert"></p>'+
       (pdf?'<p class="kyc-pdf-download-note">Se a prévia não abrir no Safari, use o PDF original para conferência.'+
        (pdf.truncated?' Este documento possui mais páginas do que o limite de prévia. Confira todas as páginas no original.':'')+'</p>'+
        '<a id="kyc-viewer-file" href="'+base+'" download="documento-argus.pdf">Baixar PDF original</a>':'')+
       '</div>';
     const image=E('kyc-viewer-image'),loading=E('kyc-preview-loading'),error=E('kyc-preview-error');
     const close=()=>{
       image.onload=null;image.onerror=null;image.removeAttribute('src');modal.remove();
     };
     E('kyc-close-viewer').onclick=close;
     modal.onclick=e=>{if(e.target===modal)close()};
     const showPage=page=>{
       error.hidden=true;error.textContent='';loading.hidden=false;
       image.hidden=true;image.onload=null;image.onerror=null;
       if(pdf){
         const limit=Number(pdf.preview_pages);
         if(page<1||page>limit)return;
         E('kyc-pdf-counter').textContent='Página '+page+' de '+pdf.pages;
         E('kyc-pdf-prev').disabled=page===1;
         E('kyc-pdf-next').disabled=page===limit;
         E('kyc-pdf-prev').onclick=()=>showPage(page-1);
         E('kyc-pdf-next').onclick=()=>showPage(page+1);
       }
       image.onload=()=>{loading.hidden=true;image.hidden=false};
       image.onerror=()=>{
         loading.hidden=true;image.hidden=true;
         error.hidden=false;
         error.textContent=pdf?'Não foi possível renderizar esta página. Baixe o PDF original e confira todas as páginas.':
           'Não foi possível exibir a foto no Safari. Atualize a página e tente novamente.';
       };
       // Same-origin image URLs work with restrictive Content Security Policy;
       // the PDF was converted on the authenticated server to a safe PNG page.
       image.src=pdf?(base+'?preview=page&page='+page):base;
     };
     showPage(1);
     E('kyc-close-viewer').focus();
   }catch(error){toast(error.message,true)}
   finally{button.disabled=false}
 }
 async function decide(ev){
   ev.preventDefault();if(!staff()||!selected)return;
   const form=ev.currentTarget,data=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type=submit]');
   const selectedTypes=Array.from(form.querySelectorAll('[name=requested_types]:checked')).map(x=>x.value);
   data.requested_types=selectedTypes;
   for(const k of ['documents_match','identity_matches','legal_representative_checked'])
     data[k]=form.elements[k]?.checked===true;
   if(data.decision==='needs_changes'&&!selectedTypes.length){toast('Selecione os documentos que precisam ser reenviados.',true);return}
   if(data.decision==='approve_identity'&&!['documents_match','identity_matches','legal_representative_checked'].every(x=>data[x])){
     toast('Confirme as três verificações antes de aprovar.',true);return;
   }
   if(!confirm('Registrar esta decisão KYC? Ela será auditada e comunicada ao cliente.'))return;
   button.disabled=true;
   try{
     const res=await post('/api/admin/kyc/applications/'+encodeURIComponent(selected)+'/decision',data);
     toast(res.message);await loadQueue(selected);
   }catch(error){toast(error.message,true)}finally{button.disabled=false}
 }
 async function release(ev){
   ev.preventDefault();if(!superuser()||!selected)return;
   const form=ev.currentTarget,data=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type=submit]');
   data.decision='approve';
   for(const key of ['kyc_verified','provider_approved','contract_signed','split_direction_confirmed'])
     data[key]=form.elements[key].checked;
   if(!Object.keys(data).filter(k=>k.endsWith('_approved')||k.endsWith('_verified')||k.endsWith('_signed')||k.endsWith('_confirmed')).every(k=>data[k])){
     toast('Todas as confirmações operacionais são obrigatórias.',true);return;
   }
   if(!confirm('Confirmar autorização financeira com o provedor para este CNPJ?'))return;
   button.disabled=true;
   try{
     const res=await post('/api/admin/portal/applications/'+encodeURIComponent(selected)+'/decision',data);
     toast(res.message||'Decisão operacional registrada');await loadQueue(selected);
   }catch(error){toast(error.message,true)}finally{button.disabled=false}
 }
 async function loadQueue(focus){
   if(!staff()||loading)return;loading=true;
   const target=E('kyc-queue');if(target)target.innerHTML='<p class="kyc-loading">Atualizando fila protegida...</p>';
   try{
     const res=await api('/api/admin/kyc/queue');
     queue=res.applications||[];
     drawStats();
     if(focus && queue.some(x=>x.id===focus))selected=focus;
     else if(!queue.some(x=>x.id===selected))selected=queue[0]?.id||'';
     drawQueue();
     const a=queue.find(x=>x.id===selected);
     if(a)detail(a);
     else if(E('kyc-dossier'))E('kyc-dossier').innerHTML='<div class="kyc-empty">Nenhum cadastro enviado ainda.</div>';
   }catch(e){if(target)target.textContent=e.message;toast(e.message,true)}
   finally{loading=false}
 }
 function init(){
   nav();
   E('kyc-refresh')?.addEventListener('click',()=>loadQueue(selected));
   E('kyc-search')?.addEventListener('input',drawQueue);
   E('kyc-filter')?.addEventListener('change',drawQueue);
   E('kyc-queue')?.addEventListener('click',ev=>{
     const button=ev.target.closest('button[data-kyc-account]');if(!button)return;
     selected=button.dataset.kycAccount;
     drawQueue();const a=queue.find(x=>x.id===selected);if(a)detail(a);
   });
 }
 // Link all legacy review entry points to the same audited KYC dossier.
 window.argusOpenKycApplication=function(accountId){
   if(!staff()){toast('Somente revisores autorizados podem examinar documentos.',true);return}
   selected=typeof accountId==='string'&&/^[a-f0-9]{32}$/i.test(accountId)?accountId:'';
   navigate('kyc-studio');
   loadQueue(selected);
 };
 const oldLoad=loadPage;
 loadPage=async function(page){if(page==='kyc-studio')return loadQueue(selected);return oldLoad(page)};
 const oldNavigate=navigate;
 navigate=function(page){if(page==='kyc-studio'&&!staff())return;return oldNavigate(page)};
 const oldSignin=signin;
 signin=function(data){oldSignin(data);nav()};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
