(()=>{
'use strict';
const E=id=>document.getElementById(id),cash=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let loaded=false,processing=false,records={};
function allowed(){return state?.user?.role==='superadmin'}
async function loadWallets(){
 if(!allowed()||processing)return;
 const list=E('merchant-admin-accounts'),pending=E('merchant-admin-withdrawals');
 if(!list||!pending)return;
 processing=true;
 try{
  const result=await api('/api/admin/merchant-wallet/overview');
  const accounts=result.wallets||[],items=result.withdrawals||[];
  list.innerHTML=accounts.length?accounts.map(a=>'<article class="seller-admin-line"><div><strong>'+esc(a.display_name)+'</strong>'+
   '<small>'+esc(a.email)+'</small></div><div>Disponível <b>'+cash(a.available_cents)+'</b></div>'+
   '<div>Reservado <b>'+cash(a.held_cents)+'</b></div>'+
   (Number(a.debt_cents)>0?'<p class="seller-admin-problem">Ajuste pendente '+cash(a.debt_cents)+'</p>':'')+
   '</article>').join(''):'<p>Nenhuma carteira habilitada ainda.</p>';
  pending.innerHTML=items.length?items.map(r=>'<article class="seller-admin-line">'+
    '<div><strong>Solicitado '+cash(r.amount_cents)+'</strong><small>Pix líquido '+cash(Number(r.amount_cents)-100)+'</small><small>'+esc(r.pix_key_masked)+'</small>'+
    '<small>Taxa de serviço R$ 1,00</small></div><div><strong>'+esc(r.status)+'</strong><small>'+esc(r.created_at)+'</small></div>'+
    '<div class="seller-admin-buttons">'+
    (r.status==='requested'?'<small>Aguardando processamento do próprio revendedor</small>':'')+
    (r.provider_tx_id&&['queued','unknown','pending','processing'].includes(r.status)?'<button type="button" data-seller-reconcile="'+esc(r.id)+'">Conciliar</button>':'')+
    '</div></article>').join(''):'<p>Nenhum saque solicitado.</p>';
 }catch(err){list.textContent='Não foi possível consultar as carteiras: '+err.message;}
 finally{processing=false;}
}
async function action(e){
 const button=e.target.closest('button[data-seller-execute],button[data-seller-reconcile]');
 if(!button||processing||!allowed())return;
 const execute=!!button.dataset.sellerExecute;
 const id=button.dataset.sellerExecute||button.dataset.sellerReconcile;
 let body={};
 if(execute){
  if(!confirm('Transferência real para a chave Pix registrada pelo vendedor. O saldo já está reservado. Confirma o processamento?'))return;
  const otp=prompt('Informe um NOVO código de 6 dígitos do autenticador do Super Admin:');
  if(!otp||!/^\d{6}$/.test(otp)){toast('Código 2FA inválido. Operação não enviada.',true);return;}
  body={otp};
 }
 button.disabled=true;
 try{
  await post('/api/admin/merchant-wallet/withdrawals/'+encodeURIComponent(id)+'/'+(execute?'execute':'reconcile'),body);
  toast(execute?'Transferência enviada. Consulte o status financeiro antes de repetir.':'Conciliação concluída.');
  await loadWallets();
 }catch(err){toast('Não reenvie automaticamente: '+err.message,true)}
 finally{button.disabled=false;}
}
function init(){E('merchant-admin-refresh')?.addEventListener('click',loadWallets);
 E('merchant-admin-withdrawals')?.addEventListener('click',action);}
const oldLoad=loadPage;
loadPage=async function(page){if(page==='merchant-wallet')return loadWallets();return oldLoad.apply(this,arguments);};
const oldNav=navigate;
navigate=function(page){if(page==='merchant-wallet'&&!allowed())return;const result=oldNav.apply(this,arguments);
 if(page==='merchant-wallet'){if(E('page-heading'))E('page-heading').textContent='Saldos de revendedores';if(E('crumb'))E('crumb').textContent='Saldos de revendedores';}
 return result;
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();