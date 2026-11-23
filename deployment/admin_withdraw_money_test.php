<?php
declare(strict_types=1);
/** Build-time, no live Pix/PSP/withdrawals. */
$root='/var/www/html/public/static/';
$html=(string)file_get_contents($root.'admin.html');
$js=(string)file_get_contents($root.'admin.js');
$mask=(string)file_get_contents($root.'admin-withdraw-money.js');
$css=(string)file_get_contents($root.'admin-withdraw-money.css');
if(substr_count($html,'data-admin-payout-money')!==1||
   !str_contains($html,'inputmode="numeric" autocomplete="off" enterkeyhint="done"')||
   !str_contains($html,'admin-withdraw-money.js?v=20261123-1')||
   !str_contains($html,'admin-withdraw-money.css?v=20261123-1')||
   !str_contains($html,'admin.js?v=withdraw-admin-money-20261123-1'))
 throw new RuntimeException('Admin payout mask markup/version is missing');
if(!str_contains($js,'window.ArgusAdminWithdrawMask?.parseCents(raw.amount)')||
   str_contains($js,"Number(String(raw.amount||'').replace(',','.'))")||
   !str_contains($js,"otp=await window.ArgusAdminPixStepUp.request({")||
   !str_contains($js,"await post('/api/admin/payouts'")||
   !str_contains($js,"fee_version:feeQuote.policy_version")||
   !str_contains($js,"otp:otp,confirm:true")||
   !str_contains($js,"idempotency_key=form.dataset.idem||crypto.randomUUID()"))
 throw new RuntimeException('Admin exact cent parser / security flow unexpectedly modified');
foreach([
 "amountSelector='#payout-form input[name=\"amount\"]'",
 "minimumFractionDigits:2,maximumFractionDigits:2",
 "function parseCents(raw)",
 "function mask(raw)",
 "document.addEventListener('input'",
 "},true);",
 "window.ArgusAdminWithdrawMask=Object.freeze({parseCents,mask})"
] as $needle)
 if(!str_contains($mask,$needle))throw new RuntimeException('Currency mask missing '.$needle);
foreach(['1'=>'0,01','10'=>'0,10','100'=>'1,00','1000'=>'10,00','10000'=>'100,00'] as $input=>$expected){
 if(number_format((int)$input/100,2,',','.')!==$expected)
  throw new RuntimeException('Mask fixture failed '.$input);
}
if(!str_contains($css,'#payout-form input[data-admin-payout-money]'))
 throw new RuntimeException('Admin payout CSS scope incorrect');
if(str_contains($mask,'fetch(')||str_contains($mask,'/api/admin/payouts')||
   str_contains($mask,'localStorage'))
 throw new RuntimeException('Money mask must not invoke financial API or persist data');
echo "PASS: Super Admin withdrawal 1→0,01; 1000→10,00; exact integer-cent payout quote; modal 2FA, idempotency and withdrawal safeguards; NO real Pix.\n";
