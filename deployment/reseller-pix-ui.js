/* ARGUS Pay: seller charge visual upgrade. Financial events and API calls stay untouched. */
(()=>{
'use strict';
if(window.__argusPixSellerUi)return;
window.__argusPixSellerUi=true;
const $=id=>document.getElementById(id);
const brl=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const asCents=value=>{
 const raw=String(value||'').trim();
 if(!/^\d{1,6}(?:,\d{1,2})?$/.test(raw))return 0;
 const [whole,fraction='']=raw.split(',');
 return Number(whole)*100+Number(fraction.padEnd(2,'0'));
};
const el=(tag,className,html)=>{
 const node=document.createElement(tag);
 node.className=className;
 if(html!==undefined)node.innerHTML=html;
 return node;
};
let chargeReady=false,receiptReady=false;
function update(){
 const input=$('seller-charge-amount'),view=$('seller-charge-preview-amount');
 if(!input||!view)return;
 const cents=asCents(input.value);
 view.textContent=brl(cents);
 document.querySelectorAll('#seller-deposit-form [data-seller-amount]').forEach(btn=>{
  const active=cents===Number(btn.dataset.sellerAmount);
  btn.classList.toggle('is-active',active);
  btn.setAttribute('aria-pressed',String(active));
 });
}
function mask(){
 const input=$('seller-charge-amount');
 if(!input)return;
 const digits=input.value.replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,8);
 const next=digits?new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(digits)/100):'';
 if(input.value!==next){
  input.value=next;
  try{input.setSelectionRange(input.value.length,input.value.length)}catch(_){}
 }
 update();
}
function enhanceCharge(){
 const form=$('seller-deposit-form');
 if(!form||form.dataset.pixEnhanced)return false;
 const amount=form.elements.namedItem('amount'),
       description=form.elements.namedItem('description'),
       checkbox=$('seller-self-payer'),
       button=form.querySelector('button[type="submit"]');
 if(!amount||!description||!checkbox||!button)return false;
 form.dataset.pixEnhanced='true';
 const card=form.closest('.seller-panel');
 card.classList.add('seller-charge-panel');
 const headline=card.querySelector('h3'),intro=card.querySelector('p');
 const heading=el('div','seller-charge-heading');
 const symbol=el('div','seller-charge-symbol','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></svg>');
 const headingText=el('div','seller-charge-heading-text');
 headingText.append(el('span','seller-charge-kicker','COBRANÇA INSTANTÂNEA'));
 if(headline){headline.textContent='Nova cobrança Pix';headingText.append(headline);}
 if(intro){intro.textContent='Informe o valor e gere um QR Code pronto para compartilhar.';headingText.append(intro);}
 heading.append(symbol,headingText);
 card.insertBefore(heading,form);
 const step=number=>el('div','seller-charge-step','<span>'+number+'</span><strong>'+(number==='01'?'Valor da cobrança':'Detalhes do pagamento')+'</strong>');
 form.prepend(step('01'));
 const amountLabel=amount.closest('label');
 amountLabel.classList.add('seller-charge-amount-label');
 amountLabel.firstChild.textContent='Quanto você deseja cobrar?';
 amount.id='seller-charge-amount';amount.type='text';amount.inputMode='numeric';
 amount.maxLength=12;amount.placeholder='0,00';amount.setAttribute('aria-describedby','seller-amount-hint');
 const wrap=el('div','seller-money-wrap');
 amount.parentNode.insertBefore(wrap,amount);
 wrap.append(el('span','seller-money-prefix','R$'),amount);
 const hint=el('p','seller-charge-hint','A vírgula é automática: digite 1000 para R$ 10,00.');
 hint.id='seller-amount-hint';amountLabel.after(hint);
 const quick=el('div','seller-quick-values');
 quick.setAttribute('role','group');quick.setAttribute('aria-label','Valores sugeridos');
 [[1000,'R$ 10'],[2000,'R$ 20'],[5000,'R$ 50'],[10000,'R$ 100']].forEach(([value,label])=>{
  const b=el('button','',label);b.type='button';b.dataset.sellerAmount=String(value);b.setAttribute('aria-pressed','false');
  b.addEventListener('click',()=>{
   amount.value=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/100);
   update();amount.focus({preventScroll:true});
  });
  quick.append(b);
 });
 hint.after(quick);
 const divider=el('div','seller-charge-divider');quick.after(divider);divider.after(step('02'));
 const payerLabel=checkbox.closest('label');
 payerLabel.classList.add('seller-payer-choice');
 const span=payerLabel.querySelector('span');
 if(span)span.innerHTML='<strong>Usar meus dados cadastrados</strong><small>Preencher o pagador com meus dados já verificados.</small>';
 ['payer_name','payer_document'].forEach(name=>form.elements.namedItem(name)?.closest('label')?.classList.add('seller-charge-field'));
 const descLabel=description.closest('label');
 descLabel.classList.add('seller-charge-field','seller-description-field');
 descLabel.firstChild.textContent='Descrição da cobrança';
 // Keep description editable and initialized for every new charge.
 if(!description.defaultValue.trim())description.defaultValue='Pagamento de produto ou serviço';
 if(!description.value.trim())description.value=description.defaultValue;
 descLabel.append(el('small','','Já preenchida; você também pode personalizar.'));
 const total=el('div','seller-charge-total','<span>Valor da cobrança</span><strong id="seller-charge-preview-amount">R$ 0,00</strong>');
 button.before(total);
 button.classList.add('seller-charge-submit');
 button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM14 14h2m4 0v2m-6 4h2m4-1v1m-3-4v4"/></svg><span>Gerar QR Code Pix</span><span class="seller-charge-submit-arrow" aria-hidden="true">→</span>';
 button.after(el('p','seller-charge-footer-note','O QR Code e o Pix Copia e Cola serão exibidos em uma janela.'));
 amount.addEventListener('input',mask);
 form.addEventListener('reset',()=>Promise.resolve().then(update));
 if(amount.value)mask();else update();
 chargeReady=true;
 return true;
}
function enhanceReceipt(){
 const page=$('argus-reseller-page-charges'),receipt=page?.querySelector('.res-charge-receipt');
 if(!receipt||receipt.dataset.pixEnhanced)return false;
 receipt.dataset.pixEnhanced='true';
 const title=receipt.querySelector('h3');
 if(title){
  title.before(el('span','res-charge-receipt-label','ACOMPANHAMENTO'));
  title.before(el('div','res-receipt-icon','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zm6 0v3m-3 3h3"/></svg>'));
 }
 receipt.append(el('div','res-receipt-footer','<span>●</span> Cobranças registradas na sua conta ARGUS Pay'));
 const intro=page.querySelector('.argus-reseller-page-intro p');
 if(intro)intro.textContent='Crie e compartilhe cobranças com valor formatado automaticamente em reais.';
 receiptReady=true;
 return true;
}
function install(){
 if(!chargeReady)enhanceCharge();
 if(!receiptReady)enhanceReceipt();
 if(chargeReady&&receiptReady)observer.disconnect();
}
const observer=new MutationObserver(install);
if(document.body){observer.observe(document.body,{childList:true,subtree:true});install();}
else document.addEventListener('DOMContentLoaded',()=>{
 observer.observe(document.body,{childList:true,subtree:true});install();
},{once:true});
})();
