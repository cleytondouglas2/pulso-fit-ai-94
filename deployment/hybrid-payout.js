(()=>{
'use strict';
const $=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
async function refresh(){
 if(typeof state==='undefined'||state?.user?.role!=='superadmin')return;
 const box=$('argus-hybrid-list');if(!box)return;
 box.textContent='Consultando operações em análise...';
 try {
  const data=await api('/api/admin/merchant-wallet/hybrid-reviews');
  $('argus-hybrid-status').textContent=data.live_enabled?
   'Aprovações administrativas podem iniciar transferências reais.':
   'Envio real desabilitado. As solicitações permanecem reservadas.';
  box.replaceChildren();
  for(const entry of data.reviews||[]){
   const item=document.createElement('article');
   item.className='argus-hybrid-item';
   const head=document.createElement('div');head.className='argus-hybrid-amount';
   const amount=document.createElement('strong');amount.textContent=money(entry.amount_cents);
   const net=document.createElement('small');net.textContent='Líquido: '+money(entry.amount_cents-entry.service_fee_cents);
   head.append(amount,net);
   const details=document.createElement('div');details.className='argus-hybrid-meta';
   const name=document.createElement('strong');name.textContent=String(entry.display_name||'Revendedor');
   const info=document.createElement('small');info.textContent=String(entry.pix_key_type||'')+' · '+String(entry.pix_key_masked||'');
   const reasons=document.createElement('small');reasons.textContent=(entry.reasons||[]).join(', ')||'Revisão administrativa';
   details.append(name,info,reasons);
   const risk=document.createElement('div');risk.className='argus-hybrid-actions';
   const score=document.createElement('small');score.textContent='Indicador local: '+Number(entry.score||0)+'/100';
   risk.append(score);item.append(head,details,risk);box.append(item);
  }
  if(!box.childElementCount)box.textContent='Nenhum saque aguardando análise.';
 } catch(error){box.textContent='Não foi possível consultar as análises: '+String(error?.message||error)}
}
function init(){
 const original=$('merchant-admin-withdrawals')?.closest('.panel');
 if(!original||$('argus-hybrid-list'))return;
 const panel=document.createElement('section');panel.className='argus-hybrid-panel';
 panel.innerHTML='<div class="argus-hybrid-top"><div><h2>Saques em análise</h2><p>Triagem local por revendedor, com saldo reservado.</p></div><button type="button" id="argus-hybrid-refresh">Atualizar</button></div><p id="argus-hybrid-status"></p><div id="argus-hybrid-list"></div>';
 original.parentNode.insertBefore(panel,original);
 $('argus-hybrid-refresh').addEventListener('click',refresh);
 $('merchant-admin-refresh')?.addEventListener('click',refresh);
 document.addEventListener('click',e=>{if(e.target.closest('[data-nav="merchant-wallet"]'))setTimeout(refresh,100)});
 if(!$('page-merchant-wallet')?.hidden)refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();