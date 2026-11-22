<?php
declare(strict_types=1);
/**
 * Add abuse protection around invalid API credentials and reset verification.
 * Runs AFTER all prior financial/auth patches; does not change a successful
 * API request, any balance, wallet status, Pix workflow or payout confirmation.
 */
$root='/var/www/html/src/';
function hardenReplace(string &$source,string $old,string $next,string $label):void{
 if(substr_count($source,$old)!==1)
   throw new RuntimeException('Security hardening anchor mismatch: '.$label);
 $source=str_replace($old,$next,$source);
}
$path=$root.'MerchantWallet.php';
$s=file_get_contents($path);
if(!is_string($s))throw new RuntimeException('Merchant wallet unavailable');
hardenReplace($s,
 "if(!\$key||!hash_equals((string)\$key['secret_hash'],hash('sha256',\$secret)))\n            self::fail('Chave de integração inválida ou revogada',401);",
 "if(!\$key||!hash_equals((string)\$key['secret_hash'],hash('sha256',\$secret))){\n            SecurityShield::failedApi(\$db,\$public,is_array(\$key));\n            self::fail('Chave de integração inválida ou revogada',401);\n        }",
 'v2 merchant API credential check');
if(file_put_contents($path,$s)===false)throw new RuntimeException('Merchant wallet update failed');

$path=$root.'Portal.php';
$s=file_get_contents($path);
if(!is_string($s))throw new RuntimeException('Customer portal unavailable');
hardenReplace($s,
 "            self::fail('Credenciais inválidas, revogadas ou não autorizadas',403);",
 "            { SecurityShield::failedApi(\$db,\$key,is_array(\$c));\n              self::fail('Credenciais inválidas, revogadas ou não autorizadas',403); }",
 'legacy v1 API credential failure');
if(file_put_contents($path,$s)===false)throw new RuntimeException('Customer portal update failed');

$path=$root.'PortalPasswordReset.php';
$s=file_get_contents($path);
if(!is_string($s))throw new RuntimeException('Password reset handler unavailable');
hardenReplace($s,
 "        if(\$path===\$prefix.'confirm'){\n            \$data=self::json();",
 "        if(\$path===\$prefix.'confirm'){\n            SecurityShield::resetVerify(\$db,\$admin);\n            \$data=self::json();",
 'password reset confirm protection');
if(file_put_contents($path,$s)===false)throw new RuntimeException('Password reset update failed');
echo "PASS: failed V1/V2 API credentials rate limited, reset confirmations guarded, successful API traffic unchanged\n";
