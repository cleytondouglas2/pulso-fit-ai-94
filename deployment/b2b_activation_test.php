<?php
declare(strict_types=1);
/**
 * Offline, read-only B2B activation regression test.
 * Does not make provider requests, create charges, send notifications or payouts.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\B2BActivationPreflight;
$db=new Database(require '/var/www/html/config.php');
$db->installAndSeed();
if($db->driver()!=='sqlite')throw new RuntimeException('Only the isolated SQLite build database is allowed in synthetic test');
putenv('ARGUS_B2B_PREFLIGHT_UI=yes');
$report=B2BActivationPreflight::status($db);
if(($report['environment']??null)!=='B2B'||($report['read_only']??false)!==true||
   ($report['payments_enabled_by_this_endpoint']??true)!==false||
   ($report['activation_allowed']??true)!==false)
    throw new RuntimeException('B2B read-only response contract is not fail-closed');
if(($report['storage']['driver']??null)!=='sqlite'||
   ($report['storage']['persistent']??true)!==false||
   ($report['ready_local']??true)!==false)
    throw new RuntimeException('SQLite B2B must always be in financial BLOCKED state');
$items=$report['requirements']??[];
if(count($items)!==9)throw new RuntimeException('All nine readiness blockers must be mapped');
$codes=array_column($items,'code');
foreach([
 'explicit_activation','persistent_database','storage_policy',
 'split_direction_authorized','provider_split_confirmed',
 'strong_operator_secret','protected_webhook','https_callback',
 'payer_blocklist_secret'
] as $item)
 if(!in_array($item,$codes,true))throw new RuntimeException('Missing required gate: '.$item);
$secrets=[
 'ARGUS_TRADITIONAL_PIX_CLIENT_ID'=>'pk_B2Bsynthetickey12345678',
 'ARGUS_TRADITIONAL_PIX_CLIENT_SECRET'=>'sk_B2Bsyntheticsecret12345678',
 'ARGUS_MISTICPAY_PAYOUT_PK'=>'pk_B2Bsynthetickey12345678',
 'ARGUS_MISTICPAY_PAYOUT_SK'=>'sk_B2Bsyntheticsecret12345678'
];
foreach($secrets as $key=>$value)putenv($key.'='.$value);
$withSecrets=B2BActivationPreflight::status($db);
$serialized=json_encode($withSecrets,JSON_THROW_ON_ERROR);
foreach($secrets as $value)
 if(str_contains($serialized,$value))
    throw new RuntimeException('B2B readiness exposed configured credential values');
if($withSecrets['ready_local']!==false||$withSecrets['activation_allowed']!==false)
    throw new RuntimeException('Key presence alone must never unblock financial operations');
foreach(array_keys($secrets) as $key)putenv($key);
$admin=(string)file_get_contents('/var/www/html/src/Admin.php');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$html=(string)file_get_contents('/var/www/html/public/static/admin.html');
$js=(string)file_get_contents('/var/www/html/public/static/b2b-activation.js');
$css=(string)file_get_contents('/var/www/html/public/static/b2b-activation.css');
$backend=(string)file_get_contents('/var/www/html/src/B2BActivationPreflight.php');
foreach([
 'B2BActivationPreflight::handle($db,$method,$path,$actor)',
 "(\$actor['role']??'')!=='superadmin'"
] as $term)
 if(!str_contains($admin,$term))throw new RuntimeException('Missing Super Admin route/auth: '.$term);
if(!str_contains($gateway,"require_once __DIR__ . '/B2BActivationPreflight.php';"))
 throw new RuntimeException('B2B preflight not in bootstrap');
foreach([
 'data-nav="b2b-activation" hidden style="display:none"',
 'id="page-b2b-activation" hidden',
 'id="argus-b2b-readiness-root"',
 'b2b-activation.js?v=b2b-20261123-1'
] as $term)
 if(!str_contains($html,$term))throw new RuntimeException('B2B navigation/UI not mounted: '.$term);
foreach(['api/admin/b2b/readiness',"payments_enabled_by_this_endpoint!==false",
  "data-nav=\"b2b-activation\"","read_only!==true"] as $term)
 if(!str_contains($js,$term))throw new RuntimeException('B2B UI not read-only: '.$term);
if(str_contains($js,"post('/api/admin/b2b/")||
 str_contains($backend,'curl_init(')||
 str_contains($backend,'CURLOPT_POST')||
 preg_match('/(?<![A-Za-z_])(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|argus_)/i',$backend))
 throw new RuntimeException('B2B preflight must never call PSP or mutate money');
if(!str_contains($css,'@media(max-width:600px)'))
 throw new RuntimeException('B2B mobile design missing');
echo "PASS: B2B readiness blocked on SQLite, nine gates shown, secrets hidden, Super Admin-only GET, money operations untouched.\n";
