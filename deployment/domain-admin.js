/* ARGUS Pay Super Admin: staged domain migration with DNS/Render verification. */
(()=>{'use strict';
const E=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c]));
let status=null,busy=false;
function feedback(text,bad=false){const e=E('argus-domain-feedback');if(!e)return;e.textContent=text;e.classList.toggle('is-error',!!bad)}
function display(s){
 status=s;
 const active=E('argus-domain-active');
 if(active){
  active.textContent=s.primary_domain;
  active.href=s.primary_url;
 }
 E('argus-domain-staged').textContent=s.staged_domain||'Nenhum domínio em preparação';
 E('argus-domain-status').textContent=!s.staged_domain?'Sem alteração pendente':
  (s.render_verified?'Verificado pelo Render':
   !s.render_configured?'Pendente da API do Render':
   s.render_status==='not_registered'?'Aguardando cadastro no Render':'Aguardando verificação DNS/SSL');
 E('argus-domain-connection').textContent=s.render_configured?
  'Chave da API e identificação do serviço configuradas.':'Conexão automática não configurada: defina ARGUS_RENDER_API_TOKEN e ARGUS_RENDER_SERVICE_ID no Render.';
 E('argus-domain-instructions').hidden=!s.staged_domain;
 E('argus-domain-dns-host').textContent=s.staged_domain||'—';
 E('argus-domain-dns-target').textContent=s.render_origin||'argus-payments-oregon-testes.onrender.com';
 E('argus-domain-dns-type').textContent=s.staged_domain?.split('.').length===2?'ALIAS / ANAME (raiz)':'CNAME (subdomínio)';
 const render=E('argus-domain-render');
 if(render&&s.render_service_url)render.href=s.render_service_url;
 E('argus-domain-register').disabled=!s.staged_domain||!s.render_configured;
 E('argus-domain-verify').disabled=!s.staged_domain||!s.render_configured;
 E('argus-domain-activate').disabled=!s.staged_domain||!s.render_verified;
 E('argus-domain-input').value=s.staged_domain||'';
 E('argus-domain-mode').textContent=s.staged_domain?'Mudança preparada sem desligar o domínio atual.':
   'O domínio atual continua operando normalmente.';
 if(s.notice)feedback(s.notice,!!s.staged_domain&&s.render_configured&&!s.render_verified);
}
async function refresh(){
 if(!E('argus-domain-active'))return;
 try{
  const data=await api('/api/admin/domains/status');
  display(data);
 }catch(err){feedback('Falha na consulta: '+err.message,true)}
}
async function mutate(action,body={}){
 if(busy)return;
 const otp=E('argus-domain-otp').value.trim();
 if(!/^[0-9]{6}$/.test(otp)){feedback('Digite o código de 6 dígitos do autenticador para continuar.',true);return}
 if(action==='activate'&&!confirm(
 'Marcar este domínio como preferencial? A opção NÃO remove o domínio antigo nem migra automaticamente links de Pix e webhooks. Confirme que o DNS, o TLS e os callbacks já foram revisados.'))return;
 busy=true;
 const root=E('argus-domain-shell');
 if(root)root.classList.add('is-working');
 try{
  const result=await post('/api/admin/domains/'+action,{...body,otp});
  E('argus-domain-otp').value='';
  await refresh();
  feedback(result.message||'Configuração atualizada.');
 }catch(err){feedback('Não foi possível concluir: '+err.message,true)}
 finally{busy=false;if(root)root.classList.remove('is-working')}
}
function setup(){
 const root=E('argus-domain-shell');if(!root)return;
 E('argus-domain-stage').addEventListener('click',()=>{
  const input=E('argus-domain-input').value.trim();
  if(!/^[a-z0-9.-]{4,253}$/i.test(input)){feedback('Informe somente o hostname, como novo-dominio.com.br, sem HTTPS.',true);return}
  mutate('stage',{domain:input});
 });
 E('argus-domain-register').addEventListener('click',()=>mutate('register'));
 E('argus-domain-verify').addEventListener('click',()=>mutate('verify'));
 E('argus-domain-activate').addEventListener('click',()=>mutate('activate'));
 E('argus-domain-refresh').addEventListener('click',refresh);
 document.querySelectorAll('[data-nav="domains"]').forEach(b=>b.addEventListener('click',()=>setTimeout(refresh,60)));
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();