"use strict";
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={account:null,busy:false};
let noticeTimer;
function notice(text,bad=false){const el=$('#notice');el.textContent=text;el.classList.toggle('bad',bad);el.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.hidden=true,8500)}
function csrf(){try{return decodeURIComponent((document.cookie.match(/(?:^|;\s*)arg_portal_csrf=([^;]*)/)||[])[1]||'')}catch{return ''}}
async function request(path,{method='GET',body}={}){
 const options={method,credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json','X-CSRF-Token':csrf()}};
 if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
 const response=await fetch(path,options);const value=await response.json().catch(()=>({detail:'Resposta inválida do serviço'}));
 if(!response.ok)throw Error(value.detail||'Falha na solicitação');return value;
}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
function tab(mode){$('#tab-login').classList.toggle('on',mode==='login');$('#tab-register').classList.toggle('on',mode==='register');$('#login-form').hidden=mode!=='login';$('#register-form').hidden=mode!=='register'}
$('#tab-login').onclick=()=>tab('login');$('#tab-register').onclick=()=>tab('register');$('#open-register').onclick=()=>tab('register');
$('#account-type').onchange=()=>{const pj=$('#account-type').value==='PJ';$('#doc-label').firstChild.textContent=pj?'CNPJ':'CPF';$('#name-label').firstChild.textContent=pj?'Razão social':'Nome completo'};
async function action(form,callback){
 if(state.busy)return;state.busy=true;const button=form.querySelector('button[type=submit]');button.disabled=true;
 try{await callback()}catch(e){notice(e.message,true)}finally{state.busy=false;button.disabled=false}
}
$('#register-form').onsubmit=e=>{e.preventDefault();action(e.target,async()=>{const data=formData(e.target);delete data[Object.keys(data).find(k=>k==='')];const result=await request('/api/portal/register',{method:'POST',body:data});notice(result.message);e.target.reset();tab('login');$('#login-form').querySelector('[name=email]').value=data.email})};
$('#login-form').onsubmit=e=>{e.preventDefault();action(e.target,async()=>{const result=await request('/api/portal/login',{method:'POST',body:formData(e.target)});e.target.reset();render(result.account);notice('Acesso realizado com segurança')})};
$('#logout').onclick=async()=>{try{await request('/api/portal/logout',{method:'POST',body:{}})}catch{}state.account=null;$('#dashboard').hidden=true;$('#auth').hidden=false;tab('login')};
function render(account){
 state.account=account;$('#dashboard').hidden=false;$('#auth').hidden=true;
 const greeting=new Date().getHours()<12?'Bom dia':new Date().getHours()<18?'Boa tarde':'Boa noite';
 $('#hello').textContent=greeting+', '+account.display_name.split(' ')[0];
 $('#account-kind').textContent=account.account_type==='PF'?'Pessoa física':'Pessoa jurídica';
 $('#account-email').textContent=account.email;$('#account-doc').textContent='•••• '+account.document_last4;
 $('#company-document').disabled=account.account_type!=='PJ';
 const labels={documents_required:'Documentos necessários',documents_under_review:'Em análise documental',approved:'Aprovada',suspended:'Suspensa',rejected:'Recusada'};
 $('#status').textContent=labels[account.status]||'Em avaliação';
 $('#status-message').textContent=account.status==='approved'?'Seu cadastro está aprovado para os serviços autorizados.':'Envie os documentos solicitados. O uso financeiro depende de análise e liberação.';
 $('#documents').innerHTML=(account.documents||[]).map(d=>'<div><span>'+esc(({identidade_frente:'Identidade — frente',identidade_verso:'Identidade — verso',selfie:'Selfie',contrato_social:'Contrato social'})[d.document_type]||d.document_type)+'</span><b>Recebido · análise pendente</b></div>').join('');
 const enabled=!!account.can_issue_live_keys;$('#create-key').disabled=!enabled;$('#api-gate').hidden=enabled;
 if(enabled)$('#api-gate').textContent='Credenciais liberadas. Mantenha a chave secreta no seu servidor.';
 else $('#api-gate').textContent='As credenciais reais só serão liberadas após validação documental, análise e aprovação operacional.';
 loadKeys();
}
async function loadKeys(){
 try{
  const result=await request('/api/portal/keys');
  $('#credentials').innerHTML=result.keys.length?result.keys.map(k=>'<div class="key-row"><span><b>'+esc(k.public_key)+'</b><small> · '+esc(k.created_at)+'</small> '+(k.revoked_at?'(revogada)':'')+'</span>'+(k.revoked_at?'':'<button type="button" class="outline" data-revoke="'+esc(k.id)+'">Revogar</button>')+'</div>').join(''):'<p class="muted">Nenhuma chave foi criada ainda.</p>';
 }catch(e){notice(e.message,true)}
}
$('#credentials').onclick=async e=>{const b=e.target.closest('button[data-revoke]');if(!b||!confirm('Revogar esta chave? Seus sistemas deixarão de conseguir utilizá-la.'))return;
 try{await request('/api/portal/keys/'+encodeURIComponent(b.dataset.revoke)+'/revoke',{method:'POST',body:{}});await loadKeys();notice('Chave revogada')}catch(e){notice(e.message,true)}};
$('#create-key').onclick=async()=>{if(!state.account?.can_issue_live_keys)return;
 const btn=$('#create-key');btn.disabled=true;
 try{const result=await request('/api/portal/keys',{method:'POST',body:{}});$('#once-key').value=result.api_key;$('#once-secret').value=result.api_secret;$('#secret-once').hidden=false;await loadKeys();notice('Chaves emitidas. Guarde a secreta em local seguro.')}catch(e){notice(e.message,true)}finally{btn.disabled=false}};
$('#copy-credentials').onclick=async()=>{try{await navigator.clipboard.writeText('ARGUS_API_KEY='+$('#once-key').value+'\nARGUS_API_SECRET='+$('#once-secret').value);notice('Credenciais copiadas')}catch{notice('Copie os campos manualmente',true)}};
$('#upload-form').onsubmit=e=>{e.preventDefault();action(e.target,async()=>{
 const form=e.target,file=form.elements.document_file.files[0];
 if(!file||file.size>3200000||file.size<1024){notice('Envie arquivo entre 1 KB e 3,2 MB',true);return}
 const b64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Arquivo não pode ser lido'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file)});
 const result=await request('/api/portal/documents',{method:'POST',body:{document_type:form.elements.document_type.value,file_base64:b64}});
 e.target.reset();notice(result.message);
 const res=await request('/api/portal/session');render(res.account);
})};
async function start(){
 const hash=location.hash.slice(1);if(hash==='cadastro')tab('register');
 try{const result=await request('/api/portal/session');render(result.account)}catch(e){if(!/Entre na sua conta|sessão expirou/.test(e.message))notice(e.message,true)}
}
start();