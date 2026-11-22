<?php
declare(strict_types=1);
/**
 * ARGUS seller withdrawal: iPhone-safe progressive BRL cent mask.
 * UI only. The existing cents() parser, integer-cent payload, payout MFA,
 * idempotency guard, fee and server limits remain unchanged.
 */
$merchant='/var/www/html/public/static/merchant-portal.js';
$source=file_get_contents($merchant);
if(!is_string($source)||strlen($source)<2000)
  throw new RuntimeException('Saque Pix: seller frontend not found');
function brlMaskOne(string &$src,string $old,string $new,string $tag):void {
  if(substr_count($src,$old)!==1)
    throw new RuntimeException('Saque Pix: upstream template changed at '.$tag);
  $src=str_replace($old,$new,$src);
}
brlMaskOne(
  $source,
  'Valor total a sacar (R$)<input name="amount" inputmode="decimal" placeholder="10,00" required></label>',
  'Valor total a sacar (R$)<input name="amount" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" maxlength="12" placeholder="0,00" aria-describedby="seller-withdraw-money-hint" required><small id="seller-withdraw-money-hint" class="argus-withdraw-money-hint">A vírgula aparece automaticamente. Digite 1000 para R$ 10,00.</small></label>',
  'withdraw amount input (not the separate Pix charge input)'
);
brlMaskOne($source,
  "E('seller-withdraw-form').elements.amount.oninput=quote;",
  "E('seller-withdraw-form').elements.amount.oninput=maskWithdrawBRL;",
  'withdraw form input event');
$helper=<<<'JS'
/**
 * BRL digit-to-cent entry (like bank Pix amounts):
 * 1 -> 0,01 | 10 -> 0,10 | 100 -> 1,00 | 1000 -> 10,00.
 * The existing cents() function receives e.g. "10,00" and returns 1000;
 * no floating-point arithmetic or display-only value reaches the ledger.
 */
const sellerWithdrawBRLFormatter=new Intl.NumberFormat('pt-BR',{
 minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false
});
function maskWithdrawBRL(event){
 const input=event?.currentTarget;
 if(!input)return;
 const raw=String(input.value||''),digits=raw.replace(/[^0-9]/g,'');
 let formatted='';
 if(digits){
  const value=Number(digits);
  // Avoid silently truncating a pasted sum or rounding an unsafe integer.
  if(Number.isSafeInteger(value)&&digits.length<=10){
   if(event?.inputType==='deleteContentBackward'&&input.dataset.currencyPrevious==='0,00'&&value===0)
    formatted='';
   else formatted=sellerWithdrawBRLFormatter.format(value/100);
  }else{
   input.value=input.dataset.currencyPrevious||'';
   quote();
   return;
  }
 }
 input.value=formatted;
 input.dataset.currencyPrevious=formatted;
 try{input.setSelectionRange(formatted.length,formatted.length);}catch(_){}
 quote();
}
JS;
brlMaskOne($source,"function quote(){",$helper."\nfunction quote(){",'BRL format handler placement');
if(file_put_contents($merchant,$source)===false)
  throw new RuntimeException('Saque Pix: could not update reseller frontend');

$client='/var/www/html/public/static/client.html';
$html=file_get_contents($client);
if(!is_string($html))throw new RuntimeException('Saque Pix: reseller HTML missing');
$found=0;
$html=preg_replace_callback(
  '~(/static/merchant-portal\.js\?v=)[A-Za-z0-9._-]+~',
  static fn($m)=>$m[1].'withdraw-money-20261122-1',$html,1,$found
);
if($found!==1||!is_string($html))
  throw new RuntimeException('Saque Pix: could not update Safari JS cache version');
if(file_put_contents($client,$html)===false)
  throw new RuntimeException('Saque Pix: cannot update asset reference');
echo "PASS: seller withdrawal BRL cent mask installed; financial API and MFA unchanged\n";
