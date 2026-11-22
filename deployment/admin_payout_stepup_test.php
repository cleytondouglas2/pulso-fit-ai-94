<?php
declare(strict_types=1);
/** No financial provider call; verify UI flow stays fail-closed. */
$root='/var/www/html/public/static/';
$admin=(string)file_get_contents($root.'admin.html');
$js=(string)file_get_contents($root.'admin.js');
$dialog=(string)file_get_contents($root.'admin-pix-stepup.js');
$css=(string)file_get_contents($root.'admin-pix-stepup.css');
$security=(string)file_get_contents('/var/www/html/src/Admin.php');
foreach([
 '<form method="post" id="payout-form"',
 'Enviar saldo via Pix',
 'admin-pix-stepup.js?v=20261122-1',
 'admin-pix-stepup.css?v=20261122-1',
 'admin.js?v=pix-stepup-20261122-1'
] as $token)
 if(!str_contains($admin,$token))throw new RuntimeException('Admin form or version missing '.$token);
if(str_contains($admin,'Confirme com NOVO código do autenticador<input name="otp"'))
 throw new RuntimeException('Old inline admin OTP still exposed');
foreach([
 "if(!raw.confirm){toast(",
 "if(typeof window.ArgusAdminPixStepUp?.request!=='function')",
 "otp=await window.ArgusAdminPixStepUp.request({",
 "if(!otp){submit.disabled=false;return;}",
 "otp:otp,confirm:true",
 "idempotency_key=form.dataset.idem||crypto.randomUUID()",
 "fee_version:feeQuote.policy_version",
 "fee_acknowledged:true",
 "/api/admin/payouts/fee-quote?amount_cents=",
 "await post('/api/admin/payouts'",
 "state.user?.role!=='superadmin'"
] as $token)
 if(!str_contains($js,$token))throw new RuntimeException('Admin safety contract missing '.$token);
if(str_contains($js,"otp:raw.otp,confirm:true")||
   str_contains($js,"if(!raw.confirm||!raw.otp)"))
 throw new RuntimeException('Old admin TOTP form handler still active');
if(strpos($js,'await window.ArgusAdminPixStepUp.request(')>
   strpos($js,"await post('/api/admin/payouts'"))
 throw new RuntimeException('OTP confirmation would happen after provider call');
foreach([
 "window.ArgusAdminPixStepUp={",
 'item.showModal();',
 'const onCancel=event=>',
 'const onBackdrop=event=>',
 'finish',
 'end(code);',
 'feeQuote.recipient_cents+feeQuote.argus_fee_cents!==amountCents',
 'role="alert"',
 'autocomplete="one-time-code"'
] as $token)
 if(!str_contains($dialog,$token))throw new RuntimeException('Missing modal behavior '.$token);
if(str_contains($dialog,"fetch(")||str_contains($dialog,"/api/admin/payouts"))
 throw new RuntimeException('Modal must never make payment requests itself');
if(!str_contains($css,'#argus-admin-pix-otp-dialog::backdrop')||
   !str_contains($css,'max-height:calc(100dvh - 32px)'))
 throw new RuntimeException('iPhone dialog styling incomplete');
if(!str_contains($security,'/api/admin/payouts'))
 throw new RuntimeException('Server payout route missing');
echo "PASS: admin OTP post-click modal, cancellation safe, fee quote and server 2FA preserved; no real Pix\n";
