<?php
declare(strict_types=1);
/**
 * Security hardening applied after original Argus/KYC/merchant unit tests.
 * The existing API and money accounting remain unchanged.
 */
$root='/var/www/html';
function argusShieldReplace(string &$source,string $from,string $to,string $label):void{
    if(substr_count($source,$from)!==1)
        throw new RuntimeException('Security shield install: unexpected source at '.$label);
    $source=str_replace($from,$to,$source);
}
$gatewayPath=$root.'/src/Gateway.php';
$gateway=file_get_contents($gatewayPath);
if(!is_string($gateway))throw new RuntimeException('Security shield: gateway unavailable');
argusShieldReplace($gateway,
    "require_once __DIR__ . '/FaceCapture.php';",
    "require_once __DIR__ . '/FaceCapture.php';\nrequire_once __DIR__ . '/SecurityShield.php';",
    'gateway bootstrap');
if(file_put_contents($gatewayPath,$gateway)===false)
    throw new RuntimeException('Security shield: cannot persist gateway');

$portalPath=$root.'/src/Portal.php';
$portal=file_get_contents($portalPath);
if(!is_string($portal))throw new RuntimeException('Security shield: customer portal missing');
argusShieldReplace($portal,
    "if(!filter_var(\$email,FILTER_VALIDATE_EMAIL))self::fail('E-mail inválido',422);",
    "if(!filter_var(\$email,FILTER_VALIDATE_EMAIL))self::fail('E-mail inválido',422);\n            SecurityShield::register(\$db,\$email);",
    'registration rate protection');
argusShieldReplace($portal,
    "\$data=self::body();\$email=strtolower(self::string(\$data,'email',5,190));\$password=self::string(\$data,'password',1,200);",
    "\$data=self::body();\$email=strtolower(self::string(\$data,'email',5,190));\$password=self::string(\$data,'password',1,200);\n            SecurityShield::login(\$db,\$email);",
    'login brute force protection');
argusShieldReplace($portal,
    "'SELECT k.*,a.status account_status FROM argus_portal_keys k JOIN argus_portal_accounts a ON a.id=k.account_id WHERE k.public_key=? AND k.revoked_at IS NULL'",
    "'SELECT k.*,a.status account_status,a.merchant_id current_merchant_id FROM argus_portal_keys k JOIN argus_portal_accounts a ON a.id=k.account_id WHERE k.public_key=? AND k.revoked_at IS NULL'",
    'legacy merchant ownership');
argusShieldReplace($portal,
    "if(!\$c||!hash_equals(\$c['secret_hash'],hash('sha256',\$secret))||\$c['account_status']!=='approved')self::fail('Credenciais inválidas, revogadas ou não autorizadas',403);",
    "if(!\$c||!hash_equals(\$c['secret_hash'],hash('sha256',\$secret))||\$c['account_status']!=='approved'||\n           !hash_equals((string)\$c['merchant_id'],(string)(\$c['current_merchant_id']??''))||\n           !KycStudio::identityApproved(\$db,(string)\$c['account_id']))\n            self::fail('Credenciais inválidas, revogadas ou não autorizadas',403);",
    'legacy v1 keys cannot outlive account/merchant KYC authorization');
if(file_put_contents($portalPath,$portal)===false)
    throw new RuntimeException('Security shield: cannot persist portal');

$walletPath=$root.'/src/MerchantWallet.php';
$wallet=file_get_contents($walletPath);
if(!is_string($wallet))throw new RuntimeException('Security shield: wallet unavailable');
argusShieldReplace($wallet,
    "\$pk=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID')?:getenv('ARGUS_FINANCE_QR_CLIENT_ID')?:''));",
    "\$pk=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID')?:''));",
    'central Pix provider key must match the traditional Pix endpoint');
argusShieldReplace($wallet,
    "\$sk=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')?:getenv('ARGUS_FINANCE_QR_CLIENT_SECRET')?:''));",
    "\$sk=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')?:''));",
    'never fall back to unrelated financial provider secret');
argusShieldReplace($wallet,
    "if(\$method==='POST'&&\$path==='/api/v2/wallet/withdrawals'){\n            \$input=self::prepareApiWithdraw",
    "if(\$method==='POST'&&\$path==='/api/v2/wallet/withdrawals'){\n            SecurityShield::merchant(\$db,(string)\$account['id'],'withdraw');\n            \$input=self::prepareApiWithdraw",
    'withdrawal API request velocity');
argusShieldReplace($wallet,
    "if(\$method==='POST'&&\$path==='/api/v2/pix/charges'){\n            self::out(self::create",
    "if(\$method==='POST'&&\$path==='/api/v2/pix/charges'){\n            SecurityShield::merchant(\$db,(string)\$account['id'],'charge');\n            self::out(self::create",
    'Pix API request velocity');
argusShieldReplace($wallet,
    "if(\$method==='POST'&&\$path==='/api/portal/wallet/charges'){\n            \$data=self::body();",
    "if(\$method==='POST'&&\$path==='/api/portal/wallet/charges'){\n            SecurityShield::merchant(\$db,(string)\$account['id'],'charge');\n            \$data=self::body();",
    'Pix seller portal request velocity');
argusShieldReplace($wallet,
    "if(\$method==='POST'&&\$path==='/api/portal/wallet/withdrawals'){\n            \$withdrawal=self::requestWithdraw",
    "if(\$method==='POST'&&\$path==='/api/portal/wallet/withdrawals'){\n            SecurityShield::merchant(\$db,(string)\$account['id'],'withdraw');\n            \$withdrawal=self::requestWithdraw",
    'withdraw seller portal request velocity');
argusShieldReplace($wallet,
    "error_log('ARGUS seller automatic payout uncertain: '.get_class(\$e));",
    "error_log('ARGUS seller automatic payout uncertain: '.get_class(\$e));\n            try{SecurityShield::unknownPayout(\$db,\$accountId);}catch(\\Throwable){}",
    'privacy-safe incident audit for unknown financial settlement');
if(file_put_contents($walletPath,$wallet)===false)
    throw new RuntimeException('Security shield: cannot persist wallet');
echo "PASS: privacy-safe rate limits, v1/v2 merchant scope, payout risk telemetry and provider credential separation installed.\n";
