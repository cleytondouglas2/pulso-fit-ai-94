<?php
declare(strict_types=1);
/** Add privacy-safe account access audit without changing auth decisions. */
$root='/var/www/html/';
function accessReplace(string &$s,string $a,string $b,string $label):void{
 if(substr_count($s,$a)!==1)throw new RuntimeException('Access audit anchor mismatch: '.$label);
 $s=str_replace($a,$b,$s);
}
$gateway=file_get_contents($root.'src/Gateway.php');
accessReplace($gateway,
 "require_once __DIR__ . '/SellerMfa.php';",
 "require_once __DIR__ . '/SellerMfa.php';\nrequire_once __DIR__ . '/SellerAccessAudit.php';",
 'bootstrap');
file_put_contents($root.'src/Gateway.php',$gateway);
$portal=file_get_contents($root.'src/Portal.php');
accessReplace($portal,
 "            self::out(['ok'=>true,'account'=>self::summary(\$db,\$account),'csrf_token'=>\$csrf]);",
 "            \$securityAlert=SellerAccessAudit::record(\$db,\$account);\n            self::out(['ok'=>true,'account'=>self::summary(\$db,\$account),'csrf_token'=>\$csrf,'security_alert'=>\$securityAlert]);",
 'successful seller login');
accessReplace($portal,
 "        if(str_starts_with(\$path,'/api/portal/security/mfa/'))SellerMfa::handle(\$db,\$method,\$path,\$account);",
 "        if(\$method==='GET'&&\$path==='/api/portal/security/activity')SellerAccessAudit::respond(\$db,\$account);\n        if(str_starts_with(\$path,'/api/portal/security/mfa/'))SellerMfa::handle(\$db,\$method,\$path,\$account);",
 'account scoped activity');
file_put_contents($root.'src/Portal.php',$portal);
$ui=file_get_contents($root.'public/static/portal.js');
accessReplace($ui,
 "notice('Acesso realizado com segurança')",
 "notice(result.security_alert||'Acesso realizado com segurança')",
 'alert newly recognized login');
file_put_contents($root.'public/static/portal.js',$ui);
echo "PASS: privacy-safe login fingerprints, authenticated activity view, optional nonblocking email notice installed\n";
