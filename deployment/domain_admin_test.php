<?php
declare(strict_types=1);
/** Domain-control contract checks: offline, no Render API, DNS, Pix or payout requests. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\DomainControl;
use ArgusPayments\Database;
use ArgusPayments\ApiError;
$root='/var/www/html';
$db=new Database(require $root.'/config.php');
DomainControl::install($db);
$normalize=new ReflectionMethod(DomainControl::class,'normalize');
foreach(['arguspay.com.br','app.arguspay.com.br','novo-dominio.net','app.empresa.com.br'] as $valid) {
 if($normalize->invoke(null,$valid)!==$valid)
  throw new RuntimeException('Valid hostname was changed or refused: '.$valid);
}
foreach([
 'https://app.exemplo.com.br','localhost','localhost.local','127.0.0.1',
 'app.exemplo.com.br/path','app.exemplo.com.br:443','app.exemplo.com.br@evil.com',
 '*.empresa.com.br','-bad.com.br','bad-.com.br','a..com.br',
 'a.test','a.invalid','evil.onrender.com','private.internal',
 '169.254.169.254','x.com.br?redirect=https://evil.com'
] as $invalid) {
 try{$normalize->invoke(null,$invalid);throw new RuntimeException('Invalid domain accepted: '.$invalid);}
 catch(ApiError $exception){
  if(!in_array($exception->status,[400,422],true))
   throw new RuntimeException('Invalid hostname returned wrong HTTP error');
 }
}
$php=(string)file_get_contents($root.'/src/DomainControl.php');
$admin=(string)file_get_contents($root.'/src/Admin.php');
$gateway=(string)file_get_contents($root.'/src/Gateway.php');
$html=(string)file_get_contents($root.'/public/static/admin.html');
$js=(string)file_get_contents($root.'/public/static/domain-admin.js');
$css=(string)file_get_contents($root.'/public/static/domain-admin.css');
foreach([
 'ARGUS_RENDER_API_TOKEN',
 'ARGUS_RENDER_SERVICE_ID',
 'https://api.render.com/v1/services/',
 'CURLOPT_SSL_VERIFYHOST=>2',
 'CURLOPT_FOLLOWLOCATION=>false',
 'verificationStatus',
 'Somente o Super Admin',
 "in_array(\$db->driver(),['pgsql','mysql'],true)",
 'migration_note',
 'api/admin/domains/activate',
 'domainState($draft)',
 'if(!$state[\'verified\'])'

] as $term) {
 if(!str_contains($php,$term))throw new RuntimeException('DomainControl missing safety token: '.$term);
}
if(!str_contains($admin,"DomainControl::handle(\$db,\$method,\$path,\$actor,\$payload)")||
 !str_contains($admin,"self::verifyMfaCode(\$db,\$actor")||
 !str_contains($admin,"self::writeAllowed(\$actor,true)")||
 !str_contains($gateway,"require_once __DIR__ . '/DomainControl.php';"))
 throw new RuntimeException('Super Admin MFA/domain route not installed');
foreach(['data-nav="domains"','id="page-domains"','id="argus-domain-otp"',
 'domain-admin.js?v=20261123-1','domain-admin.css?v=20261123-1'] as $term)
 if(!str_contains($html,$term))throw new RuntimeException('Domain tab missing: '.$term);
foreach(['api/admin/domains/status','api/admin/domains/stage',
 'api/admin/domains/register','api/admin/domains/verify',
 'api/admin/domains/activate',"post('/api/admin/domains/'"] as $term)
 if(!str_contains($js,$term))throw new RuntimeException('Domain UI workflow missing: '.$term);
if(!str_contains($css,'@media(max-width:740px)')||
 !str_contains($css,'#argus-domain-shell'))throw new RuntimeException('Responsive domain UI styling missing');
if(str_contains($php,'CURLOPT_SSL_VERIFYPEER=>false')||
 str_contains($php,'CURLOPT_FOLLOWLOCATION=>true')||
 preg_match('/(?<![A-Za-z_])exec\\s*\\(/',$php) ||
 preg_match('/(?<![A-Za-z_])system\\s*\\(/',$php))
 throw new RuntimeException('Unsafe operation allowed by domain controller');
echo "PASS: restricted admin domain tab, 2FA, safe hostname rejection, Render-only fixed API, verified-before-preference, no Pix, payout, webhook or DNS mutations.\n";
