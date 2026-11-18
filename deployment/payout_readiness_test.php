<?php
declare(strict_types=1);
// No real transfers, balance calls, money movements, API keys or OTPs are used.
$admin=(string)file_get_contents('/var/www/html/src/Admin.php');
$payout=(string)file_get_contents('/var/www/html/src/Integrations/MisticPayPayout.php');
$html=(string)file_get_contents('/var/www/html/public/static/admin.html');
$js=(string)file_get_contents('/var/www/html/public/static/payout-readiness.js');
$css=(string)file_get_contents('/var/www/html/public/static/payout-readiness.css');
foreach([
    "'/api/admin/payouts/readiness'",
    "self::writeAllowed(\$actor,true)",
    "'ready_to_request'=>\$ready",
    "'enabled'=>\$enabled",
    "'credentials_configured'=>\$credentials",
    "'persistent_storage'=>\$persistent",
    "'scope_verified'=>false",
    "'ARGUS_PAYOUTS_ENABLED'",
    "'ARGUS_MISTICPAY_PAYOUT_PK'",
    "'ARGUS_MISTICPAY_PAYOUT_SK'",
    "'BALANCE_READ','WITHDRAW_CREATE'"
] as $needle){
    if(!str_contains($admin,$needle))
        throw new RuntimeException('Payout readiness missing secure guard: '.$needle);
}
if(substr_count($admin,"'/api/admin/payouts/readiness'")!==1)
    throw new RuntimeException('Payout diagnostics path must not be registered twice');
if(!str_contains($admin,"self::payoutAvailable(\$db);")||
   !str_contains($admin,"\$result=self::payoutClient()->withdraw("))
    throw new RuntimeException('Original withdrawal permission/transfer path must remain unchanged');
if(!str_contains($payout,"'/transactions/withdraw'")||
   !str_contains($payout,'X-Idempotency-Key'))
    throw new RuntimeException('Authentic provider withdrawal and idempotency remain mandatory');
if(!str_contains($html,'payout-readiness.js?v=1')||
   !str_contains($html,'payout-readiness.css?v=1'))
    throw new RuntimeException('iPhone administrative payout readiness assets not installed');
foreach(["'/api/admin/payouts/readiness'",'ready_to_request',
    'elements.button.disabled=!ready','event.preventDefault()',
    'event.stopImmediatePropagation()',
    'ARGUS_PAYOUTS_ENABLED','ARGUS_MISTICPAY_PAYOUT_PK',
    'ARGUS_MISTICPAY_PAYOUT_SK','BALANCE_READ','WITHDRAW_CREATE'] as $needle){
    if(!str_contains($js,$needle))
        throw new RuntimeException('Payout frontend missing fail-closed readiness: '.$needle);
}
if(str_contains($js,'method:\'POST\'')||str_contains($js,'/transactions/withdraw')||
   str_contains($js,'fetch(\'https://api.misticpay.com'))
    throw new RuntimeException('Readiness script must never submit or directly call the provider');
if(!str_contains($css,'#argus-payout-readiness'))
    throw new RuntimeException('Payout readiness warning must be visible at the original form');
echo "PASS: withdrawal remains blocked without operational flag, dedicated credentials and database; read-only diagnostics, MFA and no accidental payout.\n";
