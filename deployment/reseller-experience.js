/* ARGUS Pay — seller admin-style presentation enhancements.
 * Only read-only account stage data is provided by the existing authenticated
 * Portal. No balance mutations, API requests, or identity approvals.
 */
(()=>{
'use strict';
if(window.__argusResellerExperience)return;
window.__argusResellerExperience=true;
const E=id=>document.getElementById(id);
const stages={
 documents_required:['Documentos pendentes','Envie os arquivos exigidos para iniciar a análise de identidade.'],
 documents_under_review:['Documentos em análise','A documentação está em revisão na Central KYC.'],
 identity_verified:['Identidade aprovada','A equipe aprovou sua identidade. A habilitação financeira é uma etapa separada.'],
 approved:['Cadastro financeiro autorizado','Sua conta passou pela autorização cadastral e financeira. Verifique a disponibilidade de Pix e saques na carteira.'],
 rejected:['Cadastro não aprovado','Consulte as orientações da Central KYC.'],
 suspended:['Conta suspensa','As operações permanecem restritas até nova análise.']
};
let stage=null,navTimer=0;
function message(status,identity,financial){
 if(financial)return ['Cadastro financeiro autorizado','Sua documentação foi aprovada e o cadastro financeiro foi autorizado. Pix e saques ainda dependem do serviço e do saldo disponíveis.'];
 if(identity)return ['Identidade e documentos aprovados','KYC aprovado. A autorização financeira para Pix, saques e emissão de chaves ainda é separada.'];
 return stages[status]||['Cadastro em avaliação','Consulte os requisitos de verificação da sua conta.'];
}
function holder(){
 const page=E('argus-reseller-page-overview'),top=E('argus-reseller-overview-top');
 if(!page||!top)return null;
 let node=E('argus-reseller-approval');
 if(node)return node;
 node=document.createElement('section');
 node.id='argus-reseller-approval';node.className='argus-reseller-approval';
 node.setAttribute('aria-label','Situação documental e financeira');
 node.innerHTML=[
 '<div class="argus-reseller-approval-head"><span>CONFORMIDADE DA CONTA</span><strong id="argus-reseller-approval-title">Verificando situação…</strong></div>',
 '<div class="argus-reseller-status-pills">',
 '<span id="argus-reseller-identity-pill">Identidade: consultando</span>',
 '<span id="argus-reseller-finance-pill">Financeiro: consultando</span>',
 '</div>',
 '<p id="argus-reseller-approval-message">Consultando a situação atual.</p>',
 '<button type="button" data-reseller-view="registration" class="argus-reseller-check-docs">Ver documentos e análise ↗</button>'
 ].join('');
 top.insertAdjacentElement('beforebegin',node);
 return node;
}
function renderStage(data){
 stage=data;
 const node=holder();
 if(!node||!data)return;
 const status=String(data.status||'documents_required');
 const identity=!!data.identity_approved;
 const financial=!!data.financial_authorized;
 const [title,explanation]=message(status,identity,financial);
 const heading=E('argus-reseller-approval-title');
 const text=E('argus-reseller-approval-message');
 const identityPill=E('argus-reseller-identity-pill');
 const financePill=E('argus-reseller-finance-pill');
 if(heading)heading.textContent=title;
 if(text)text.textContent=explanation;
 if(identityPill){
   identityPill.textContent=identity?'✓ Documentos aprovados':'◷ Documentos '+(status==='documents_required'?'pendentes':'em avaliação');
   identityPill.classList.toggle('verified',identity);
 }
 if(financePill){
   financePill.textContent=financial?'✓ Cadastro financeiro autorizado':'◷ Autorização financeira pendente';
   financePill.classList.toggle('verified',financial);
 }
 node.dataset.stage=status;
 // Keep the seller's top-level status honest without overriding staff decisions.
 const quick=E('argus-reseller-toolbar-status');
 if(quick){
   quick.textContent=identity?'KYC aprovado':(status==='documents_under_review'?'KYC em análise':'Cadastro');
   quick.classList.toggle('verified',identity);
 }
}
function progress(){
 const toolbar=document.querySelector('#argus-reseller-workspace .argus-reseller-toolbar');
 if(!toolbar)return;
 let bar=E('argus-reseller-nav-progress');
 if(!bar){
  bar=document.createElement('span');
  bar.id='argus-reseller-nav-progress';
  bar.setAttribute('aria-hidden','true');
  toolbar.appendChild(bar);
 }
 bar.classList.remove('is-changing');
 void bar.offsetWidth;
 bar.classList.add('is-changing');
 clearTimeout(navTimer);
 navTimer=setTimeout(()=>bar.classList.remove('is-changing'),480);
}
function enhance(){
 const root=E('argus-reseller-workspace');
 if(!root)return false;
 const actions=E('argus-reseller-toolbar-actions');
 if(actions&&!E('argus-reseller-toolbar-status')){
  const indicator=document.createElement('span');
  indicator.id='argus-reseller-toolbar-status';
  indicator.className='argus-reseller-toolbar-status';
  indicator.textContent='Cadastro';
  actions.insertAdjacentElement('afterbegin',indicator);
 }
 holder();
 if(stage)renderStage(stage);
 return true;
}
function start(){
 enhance();
 document.addEventListener('argus:reseller-stage',event=>{
  const d=event.detail;
  if(!d||typeof d!=='object')return;
  renderStage(d);
 });
 if(window.ArgusResellerStage)renderStage(window.ArgusResellerStage);
 document.addEventListener('click',event=>{
  if(!event.target.closest('#argus-reseller-workspace [data-reseller-view]'))return;
  progress();
 },true);
 // Existing KYC and financial panels are created asynchronously, so gently
 // retry presentation mounting without re-rendering any form or wallet data.
 const dashboard=E('dashboard');
 if(dashboard){
  const observer=new MutationObserver(mutations=>{
   if(!mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1)))return;
   if(!E('argus-reseller-approval')&&E('argus-reseller-workspace'))enhance();
  });
  observer.observe(dashboard,{childList:true,subtree:true});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 }
 window.addEventListener('pageshow',()=>{enhance();if(window.ArgusResellerStage)renderStage(window.ArgusResellerStage)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();