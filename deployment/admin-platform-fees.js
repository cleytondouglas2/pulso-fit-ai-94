/* ARGUS | Super Admin seller platform-fee revenues. Never initiate payouts. */
(()=>{
'use strict';
if(window.__argusPlatformFeesUI)return;
window.__argusPlatformFeesUI=true;
const by=id=>document.getElementById(id);
const cash=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
let loading=false,activated=false,lastLoad=0;
function element(tag,cls,text){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);
 return n;
}
function mount(){
 const page=by('page-merchant-wallet');
 if(!page||by('argus-platform-fees'))return;
 const section=element('section','argus-platform-fees');
 section.id='argus-platform-fees';
 section.appendChild(element('p','argus-fees-kicker','ARGUS PAY · TESOURARIA'));
 section.appendChild(element('h2',null,'Taxas dos revendedores'));
 section.appendChild(element('p','argus-fees-desc','Receita própria do ARGUS Pay reconhecida apenas após Pix pago e conciliado. Custos da MisticPay não são creditados ao administrador.'));
 const summary=element('div','argus-platform-fee-stats');
 summary.id='argus-platform-fee-stats';section.appendChild(summary);
 const bar=element('div','argus-fee-panel-head');
 bar.appendChild(element('h3',null,'Receitas por revendedor'));
 const button=element('button',null,'Atualizar');
 button.type='button';button.addEventListener('click',()=>load(true));bar.appendChild(button);
 section.appendChild(bar);
 const list=element('div','argus-platform-fee-sellers');list.id='argus-platform-fee-sellers';section.appendChild(list);
 const foot=element('p','argus-fee-internal-note',
  'Saldo de taxas reconhecidas contabilmente. Este relatório não envia Pix, não constitui saldo bancário disponível e não autoriza saques automáticos.');
 section.appendChild(foot);
 const host=by('merchant-admin-accounts')?.closest('.panel');
 if(host&&host.parentNode)host.parentNode.insertBefore(section,host);
 else page.appendChild(section);
}
async function load(force=false){
 if(loading||typeof state==='undefined'||state?.user?.role!=='superadmin')return;
 mount();
 if(!by('argus-platform-fees'))return;
 if(!force&&Date.now()-lastLoad<12000)return;
 const cards=by('argus-platform-fee-stats'),list=by('argus-platform-fee-sellers');
 loading=true;
 try{
  const result=await api('/api/admin/merchant-wallet/platform-fees');
  if(!result||!result.fees||result.fees.mode!=='internal_accounting_only')
   throw new Error('Status contábil indisponível.');
  const fees=result.fees;
  cards.replaceChildren();
  const info=[
   ['Conta administrativa',fees.owner_email],
   ['Receita confirmada',cash(fees.net_recognized_cents)],
   ['Taxas dos depósitos',cash(fees.deposit_fees_cents)],
   ['Taxas dos saques pagos',cash(fees.withdrawal_fees_cents)],
   ['Estornos de taxas','− '+cash(fees.refunded_fees_cents)]
  ];
  for(const [label,value] of info){
   const item=element('div','argus-platform-fee-stat');
   item.appendChild(element('span',null,label));
   item.appendChild(element('strong',null,value));
   cards.appendChild(item);
  }
  list.replaceChildren();
  for(const seller of fees.sellers||[]){
   const row=element('article','argus-platform-seller');
   const who=element('div');
   who.appendChild(element('strong',null,seller.display_name));
   who.appendChild(element('small',null,seller.email));
   row.appendChild(who);
   row.appendChild(element('b',null,cash(seller.net_cents)));
   list.appendChild(row);
  }
  if(!list.childElementCount)list.appendChild(element('p',null,'Ainda não há taxas contabilizadas de pagamentos confirmados.'));
  lastLoad=Date.now();
 }catch(e){
  cards.replaceChildren();list.replaceChildren();
  list.appendChild(element('p',null,'Não foi possível consultar as taxas agora. '+String(e?.message||e)));
 }finally{loading=false;}
}
function init(){
 mount();
 if(by('page-merchant-wallet')&&!by('page-merchant-wallet').hidden)load();
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-nav="merchant-wallet"]'))setTimeout(()=>load(true),120);
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();