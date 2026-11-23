/* ARGUS Admin: input-mask only, no direct payment requests or secrets. */
(()=>{
 'use strict';
 const amountSelector='#payout-form input[name="amount"]';
 const fmt=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 function parseCents(raw){
  const value=String(raw??'').trim();
  if(!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(value))return null;
  const digits=value.replace(/\D/g,'');
  const cents=Number(digits);
  return Number.isSafeInteger(cents)?cents:null;
 }
 function mask(raw){
  const digits=String(raw??'').replace(/\D/g,'').slice(0,11);
  if(!digits)return '';
  const integer=Number(digits);
  if(!Number.isSafeInteger(integer))return null;
  return fmt.format(integer/100);
 }
 window.ArgusAdminWithdrawMask=Object.freeze({parseCents,mask});
 function formatInput(input){
  const value=mask(input.value);
  if(value===null)return;
  if(input.value!==value)input.value=value;
  try{input.setSelectionRange(value.length,value.length)}catch(_){}
 }
 // Capture before the fee-preview bubble listeners to keep quote in sync.
 document.addEventListener('input',event=>{
  const input=event.target;
  if(!(input instanceof HTMLInputElement)||!input.matches(amountSelector))return;
  formatInput(input);
 },true);
 // Formatting is scoped to the Super Admin payout amount, not OTP, Pix key,
 // deposit amount, admin fees, or reseller screens.
 function prepare(){
  const input=document.querySelector(amountSelector);
  if(!input)return;
  if(input.value)formatInput(input);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepare,{once:true});
 else prepare();
})();