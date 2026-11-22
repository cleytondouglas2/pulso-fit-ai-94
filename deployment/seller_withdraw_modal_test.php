<?php
declare(strict_types=1);
/** Synthetic UI-contract checks. Never calls payment provider or submits Pix. */
$script=(string)file_get_contents('/var/www/html/public/static/merchant-portal.js');
$mfa=(string)file_get_contents('/var/www/html/public/static/seller_mfa.js');
$css=(string)file_get_contents('/var/www/html/public/static/seller_mfa.css');
$html=(string)file_get_contents('/var/www/html/public/static/client.html');
$wallet=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
foreach([
 'window.ArgusSellerWithdrawModal.request(',
 'if(!otp){working=false;button.disabled=false;return;}',
 'mfa_code:otp',
 'amount_cents:amount',
 "idempotency_key:idem",
 "request('/api/portal/wallet/withdrawals'"
] as $needle)
 if(!str_contains($script,$needle))throw new RuntimeException('Missing withdrawal safety contract '.$needle);
if(str_contains($script,'Confirmar saque direto?') ||
 str_contains($script,"mfa_code:String(v.get('mfa_code')"))
 throw new RuntimeException('Old pre-click OTP or native confirm still present');
if(str_contains($mfa,"inp.name='mfa_code'")||str_contains($mfa,'form.insertBefore(label,form.querySelector'))
 throw new RuntimeException('Inline OTP remains in withdrawal form');
foreach(['window.ArgusSellerWithdrawModal','dialog.showModal();',
    "const onCancel=event=>","const onBackdrop=event=>",
    'finish(value);','autocomplete="one-time-code"','role="alert"'] as $needle)
 if(!str_contains($mfa,$needle))throw new RuntimeException('OTP dialog contract missing '.$needle);
if(!str_contains($css,'#argus-seller-otp-dialog::backdrop')||
   !str_contains($css,'max-height:min(740px,calc(100dvh - 42px))'))
 throw new RuntimeException('Responsive modal styles missing');
if(!str_contains($html,'seller_mfa.js?v=withdraw-dialog-20261122-1')||
   !str_contains($html,'merchant-portal.js?v=withdraw-dialog-20261122-1'))
 throw new RuntimeException('Client still caches the old withdrawal screen');
if(!str_contains($wallet,'SellerMfa::requireCode($db,$account,$withdrawInput)'))
 throw new RuntimeException('Mandatory server-side withdrawal authorization removed');
if(substr_count($css,'{')!==substr_count($css,'}'))
 throw new RuntimeException('Unbalanced modal stylesheet');
echo "PASS: no inline OTP, modal after submit, cancel-safe, iPhone top layer, server TOTP and idempotent Pix unchanged\n";
