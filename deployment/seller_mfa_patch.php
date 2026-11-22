<?php
declare(strict_types=1);
/** Install seller authenticator checks after all existing app patches. */
$root='/var/www/html/';
function requireAnchor(string &$src,string $a,string $b,string $label):void {
 if(substr_count($src,$a)!==1)throw new RuntimeException('MFA anchor mismatch: '.$label);
 $src=str_replace($a,$b,$src);
}
$gateway=file_get_contents($root.'src/Gateway.php');
requireAnchor($gateway,"require_once __DIR__ . '/SecurityShield.php';",
  "require_once __DIR__ . '/SecurityShield.php';\nrequire_once __DIR__ . '/SellerMfa.php';",'bootstrap');
file_put_contents($root.'src/Gateway.php',$gateway);
$portal=file_get_contents($root.'src/Portal.php');
requireAnchor($portal,
  "        if(\$method==='POST'&&\$path==='/api/portal/logout'){",
  "        if(str_starts_with(\$path,'/api/portal/security/mfa/'))SellerMfa::handle(\$db,\$method,\$path,\$account);\n        if(\$method==='POST'&&\$path==='/api/portal/logout'){",
  'session-authenticated CSRF Mfa handler');
requireAnchor($portal,
  "            \$payoutAllowed=\$request['allow_withdrawal']??false;",
  "            \$payoutAllowed=\$request['allow_withdrawal']??false;\n            if(\$payoutAllowed===true)SellerMfa::requireCode(\$db,\$account,\$request);",
  'new payout API key step up');
file_put_contents($root.'src/Portal.php',$portal);
$wallet=file_get_contents($root.'src/MerchantWallet.php');
requireAnchor($wallet,
  "            \$withdrawal=self::requestWithdraw(\$db,\$account,self::body());",
  "            \$withdrawInput=self::body();\n            SellerMfa::requireCode(\$db,\$account,\$withdrawInput);\n            \$withdrawal=self::requestWithdraw(\$db,\$account,\$withdrawInput);",
  'browser withdrawal TOTP verification');
file_put_contents($root.'src/MerchantWallet.php',$wallet);
$merchant=file_get_contents($root.'public/static/merchant-portal.js');
requireAnchor($merchant,
  "description:'Saque de vendas ARGUS Pay',idempotency_key:idem,confirm:true",
  "description:'Saque de vendas ARGUS Pay',idempotency_key:idem,mfa_code:String(v.get('mfa_code')||''),confirm:true",
  'withdrawal JS payload');
file_put_contents($root.'public/static/merchant-portal.js',$merchant);
$chat=file_get_contents($root.'public/static/chat-payout.js');
requireAnchor($chat,
  "  '<label class=\"ai-payout-consent\"><input name=\"confirm\" type=\"checkbox\" required>',",
  "  '<label>Código do aplicativo autenticador<input name=\"mfa_code\" inputmode=\"numeric\" autocomplete=\"one-time-code\" maxlength=\"6\" pattern=\"[0-9]{6}\" required placeholder=\"000000\"></label>',\n  '<label class=\"ai-payout-consent\"><input name=\"confirm\" type=\"checkbox\" required>',",
  'chat OTP entry');
requireAnchor($chat,
  " const confirmCheck=form.elements.namedItem('confirm');",
  " const confirmCheck=form.elements.namedItem('confirm');\n const otp=form.elements.namedItem('mfa_code');",
  'chat OTP var');
requireAnchor($chat,
  "||!key.value.trim()||!confirmCheck.checked;",
  "||!key.value.trim()||!/^\\d{6}$/.test(otp.value.trim())||!confirmCheck.checked;",
  'chat OTP send guard');
requireAnchor($chat,"for(const input of [amount,type,key,confirmCheck])",
  "for(const input of [amount,type,key,otp,confirmCheck])",'chat OTP listener');
requireAnchor($chat,"amount.disabled=true;type.disabled=true;key.disabled=true;confirmCheck.disabled=true;",
  "amount.disabled=true;type.disabled=true;key.disabled=true;otp.disabled=true;confirmCheck.disabled=true;",
  'chat OTP lock');
requireAnchor($chat,
  "description:'Saque de vendas ARGUS Pay',idempotency_key:idempotency,confirm:true",
  "description:'Saque de vendas ARGUS Pay',idempotency_key:idempotency,mfa_code:otp.value.trim(),confirm:true",
  'chat OTP API body');
file_put_contents($root.'public/static/chat-payout.js',$chat);
$ui=file_get_contents($root.'public/static/portal.js');
requireAnchor($ui,
  "try{const result=await request('/api/portal/keys',{method:'POST',body:{allow_withdrawal:payout}});",
  "const code=payout?window.prompt('Código de 6 dígitos do autenticador. Configure em Saldo e saques.'):'';
  if(payout&&(code===null||!/^\\d{6}$/.test(code.trim()))){notice('Autenticador exigido para chaves de saque',true);btn.disabled=false;return;}
  try{const result=await request('/api/portal/keys',{method:'POST',body:{allow_withdrawal:payout,mfa_code:code}});",
  'payout API key seller UI');
file_put_contents($root.'public/static/portal.js',$ui);
echo "PASS: seller TOTP checked server-side before portal/chat payouts and new withdrawal keys, with CSRF retained\n";
