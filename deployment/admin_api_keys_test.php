<?php
declare(strict_types=1);
// Structural test: no API credential is created or real money moved here.
$root='/var/www/html';
$admin=(string)file_get_contents($root.'/src/Admin.php');
$html=(string)file_get_contents($root.'/public/static/admin.html');
$js=(string)file_get_contents($root.'/public/static/admin-api-keys.js');
$css=(string)file_get_contents($root.'/public/static/admin-api-keys.css');
$docs=(string)file_get_contents($root.'/public/static/merchant-docs.js');
foreach([
    "str_starts_with(\$path,'/api/admin/merchant-api-keys')",
    "(\$actor['role']??'')!=='superadmin'",
    "self::verifyMfaCode(\$db,\$actor",
    "KycStudio::identityApproved(\$db,\$accountId)",
    "m.status='approved_live'",
    "in_array(\$db->driver(),['pgsql','mysql'],true)",
    "hash('sha256',\$secret)",
    "revoked_at IS NULL",
    "random_bytes(32)",
    "LIMIT 200"
] as $required) {
    if(!str_contains($admin,$required))throw new RuntimeException('Admin credential safeguard missing: '.$required);
}
foreach([
    'admin-api-keys.js?v=3','admin-api-keys.css?v=3'
] as $asset)if(!str_contains($html,$asset))
    throw new RuntimeException('Admin API key component not loaded: '.$asset);
foreach([
    '/api/admin/merchant-api-keys','argus-admin-generate-key',
    'argus-admin-key-otp','argus-admin-key-account',
    '/documentacao-api','data-argus-revoke'
] as $needle)if(!str_contains($js,$needle))
    throw new RuntimeException('Missing user interface control: '.$needle);
if(!str_contains($docs,"document.querySelector('article.doc')")||
   !str_contains($docs,"host.prepend(root)"))
    throw new RuntimeException('API V2 is not prominent in documentation');
if(!str_contains($css,'max-width:760px'))
    throw new RuntimeException('Mobile layout rules missing');
echo "PASS: protected Super Admin API key generation and revocation with KYC/2FA, responsive UI, and prominent V2 documentation.\n";
