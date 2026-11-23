/* ARGUS private acquisition status view. */
(()=>{'use strict';
const el=id=>document.getElementById(id);
const safe=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let rows=[];
async function refresh(){
 const box=el('argus-acq-cards');if(!box)return;
 try{
  const r=await api('/api/admin/acquirer/status');rows=r.slots||[];
  box.innerHTML=rows.map(x=>'<article class="argus-acq-card"><h3>'+safe(x.label)+'</h3><p>Adquirente: '+safe(x.provider)+'</p><div class="argus-acq-state" id="argus-acq-state-'+x.slot+'">Aguardando verificação</div><dl><div><dt>API Key</dt><dd>'+safe(x.key_masked)+'</dd></div><div><dt>Origem</dt><dd>'+safe(x.source)+'</dd></div></dl>'+(x.draft?'<p class="argus-acq-draft">Configuração pendente de aprovação</p>':'')+'<div class="argus-acq-card-actions"><button class="btn secondary" type="button" data-monitor="'+x.slot+'">Testar conexão</button><button class="btn secondary" type="button" data-config="'+x.slot+'">Configurar</button></div><small id="argus-acq-last-'+x.slot+'"></small></article>').join('');
  el('argus-acq-status').textContent='Status atualizado em '+new Date().toLocaleString('pt-BR');
 }catch(e){el('argus-acq-status').textContent='Consulta não concluída: '+e.message}
}
async function verify(slot,stage='active'){
 try{
  const r=await api('/api/admin/acquirer/probe?slot='+encodeURIComponent(slot)+'&stage='+stage);
  if(stage!=='active'){el('argus-acq-feedback').textContent=r.message;return}
  const ok=r.status==='online',label=ok?'Conectado':r.status==='invalid_credentials'?'Credenciais rejeitadas':r.status==='insufficient_permissions'?'Escopos insuficientes':r.status==='not_configured'?'Não configurado':'Sem confirmação';
  const box=el('argus-acq-state-'+slot);box.textContent=label+(r.http?' · HTTP '+r.http:'');box.className='argus-acq-state is-'+(ok?'good':'warning');
  el('argus-acq-last-'+slot).textContent=r.message;
 }catch(e){el('argus-acq-status').textContent='Falha: '+e.message}
}
function configure(slot){
 const r=rows.find(x=>x.slot===slot);if(!r)return;
 el('argus-acq-slot').value=slot;
 el('argus-acq-heading').textContent=r.label;
 el('argus-acq-current').textContent='Ativa: '+r.provider+' · '+r.key_masked;
 el('argus-acq-editor').hidden=false;
 el('argus-acq-activate').disabled=!r.draft;
 el('argus-acq-editor').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function init(){
 if(!el('argus-acq-cards'))return;
 el('argus-acq-cards').addEventListener('click',e=>{
  const test=e.target.closest('[data-monitor]'),change=e.target.closest('[data-config]');
  if(test)verify(test.dataset.monitor);if(change)configure(change.dataset.config);
 });
 el('argus-acq-refresh').addEventListener('click',async()=>{await refresh();await Promise.all(['pix','finance','payout'].map(s=>verify(s)))});
 document.querySelectorAll('[data-nav="acquirer"]').forEach(b=>b.addEventListener('click',()=>setTimeout(async()=>{await refresh();await Promise.all(['pix','finance','payout'].map(s=>verify(s)))},50)));
 refresh();
 setInterval(()=>{if(!el('page-acquirer').hidden)refresh()},120000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();