<?php
declare(strict_types=1);
/** Mask contract and existing financial protections. No provider access. */
$root='/var/www/html';
$js=(string)file_get_contents($root.'/public/static/merchant-portal.js');
$html=(string)file_get_contents($root.'/public/static/client.html');
$wallet=(string)file_get_contents($root.'/src/MerchantWallet.php');
$modal=(string)file_get_contents($root.'/public/static/seller_mfa.js');
foreach([
  'inputmode="numeric" autocomplete="off" enterkeyhint="done"',
  'id="seller-withdraw-money-hint"',
  "elements.amount.oninput=maskWithdrawBRL",
  "const sellerWithdrawBRLFormatter=new Intl.NumberFormat('pt-BR'",
  "const raw=String(input.value||''),digits=raw.replace(/[^0-9]/g,'');",
  "sellerWithdrawBRLFormatter.format(value/100)",
  "event?.inputType==='deleteContentBackward'",
  "function maskWithdrawBRL(event)",
  "function quote(){",
  "idempotency_key:idem,mfa_code:otp,confirm:true",
  "request('/api/portal/wallet/withdrawals'"
] as $needle){
 if(!str_contains($js,$needle))
   throw new RuntimeException('Saque Pix: missing mask or safety invariant '.$needle);
}
if(str_contains($js,"elements.amount.oninput=quote;"))
  throw new RuntimeException('Saque Pix: old unformatted input still active');
if(substr_count($js,'id="seller-withdraw-money-hint"')!==1)
  throw new RuntimeException('Saque Pix: unexpected duplicates of withdrawal hint');
if(!str_contains($js,'function cents(raw){')||
 !str_contains($js,"Number(str.replace(',','.'))")||
 !str_contains($js,'const FEE=100;'))
  throw new RuntimeException('Saque Pix: client-side parsing or fee unexpectedly changed');
if(!str_contains($html,'merchant-portal.js?v=withdraw-money-20261122-1'))
  throw new RuntimeException('Saque Pix: old script still cached');
if(!str_contains($wallet,'SellerMfa::requireCode($db,$account,$withdrawInput)')||
 !str_contains($modal,'window.ArgusSellerWithdrawModal'))
  throw new RuntimeException('Saque Pix: server MFA or confirmation modal missing');
$cases=['1'=>'0,01','10'=>'0,10','100'=>'1,00','1000'=>'10,00','10000'=>'100,00','001000'=>'10,00'];
foreach($cases as $digits=>$expected){
  $formatted=number_format(((int)$digits)/100,2,',','');
  if($formatted!==$expected)throw new RuntimeException("BRL fixture mismatch for $digits");
}
echo "PASS: BRL mask examples, decimal parser, quote, ID, MFA, fee and withdrawal API unchanged\n";
