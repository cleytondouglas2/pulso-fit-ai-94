<?php
declare(strict_types=1);
/** ARGUS Commerce Suite safe synthetic tests. No PSP HTTP, live Pix or payouts. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\CommerceSuite;
use ArgusPayments\Portal;
use ArgusPayments\Database;
use ArgusPayments\ApiError;
$db=new Database(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);CommerceSuite::install($db);
if($db->driver()!=='sqlite')throw new RuntimeException('Synthetic suite must run in Docker SQLite ONLY');
$connection=$db->pdo();
if($connection->inTransaction())throw new RuntimeException('Synthetic test must own the transaction');
$connection->beginTransaction();
try{
 $one=bin2hex(random_bytes(16));$two=bin2hex(random_bytes(16));
 foreach([$one,$two] as $id){
    $db->run('INSERT INTO argus_portal_accounts
      (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
        $id,'PJ','Synthetic Commerce Shop',
        'commerce-'.substr($id,0,16).'@example.invalid',
        hash('sha256','commerce-'.$id),'0000',
        password_hash('NotRealCommercePass1',PASSWORD_DEFAULT),
        'approved','synthetic_merchant_'.substr($id,0,8),
        Database::stamp(),Database::stamp()
    ]);
 }
 $body=[
   'title'=>'Produto Digital de Demonstração',
   'description'=>'Página comercial de teste, sem acesso a PSP ou valor recebido.',
   'suggested_amount_cents'=>3500,
   'image_url'=>'https://cdn.example.org/preview.webp',
   'accent_color'=>'#e9bc74',
   'call_to_action'=>'Continuar para o Pix',
   'expires_at'=>null
 ];
 $create=CommerceSuite::create($db,$one,$body);
 if($create['status']!=='draft'||!preg_match('~^/c/[a-f0-9]{32}$~D',$create['public_path']))
   throw new RuntimeException('Checkout draft must not be a live payment');
 $mine=CommerceSuite::mine($db,$one)['pages'];
 if(count($mine)!==1||count(CommerceSuite::mine($db,$two)['pages'])!==0)
   throw new RuntimeException('Tenant access to commerce pages is not isolated');
 try{CommerceSuite::edit($db,$two,$create['id'],$body);throw new RuntimeException('Cross-seller update allowed');}
 catch(ApiError $e){if($e->status!==404)throw $e;}
 $published=CommerceSuite::action($db,$one,$create['id'],'publish');
 if($published['status']!=='published')throw new RuntimeException('Approved merchant could not publish offer');
 $publicCode=substr($create['public_path'],3);
 $public=CommerceSuite::show($db,$publicCode);
 if($public['suggested_amount_cents']!==3500||
    $public['not_a_receipt']!==true||
    ($public['checkout']['available']??false)!==false)
   throw new RuntimeException('Public offer must be content only until KYC/PSP availability');
 if(isset($public['owner'])||isset($public['merchant_id'])||isset($public['api_key']))
   throw new RuntimeException('Public page leaked private account data');
 $summary=CommerceSuite::admin($db,['role'=>'superadmin']);
 if($summary['pages']['published']<1||$summary['financial_transactions_triggered']!==false)
   throw new RuntimeException('Admin commerce counts or financial isolation failed');
 try{CommerceSuite::admin($db,['role'=>'reseller']);throw new RuntimeException('Reseller could access Super Admin overview');}
 catch(ApiError $e){if($e->status!==403)throw $e;}
 $body['suggested_amount_cents']=4900;
 CommerceSuite::edit($db,$one,$create['id'],$body);
 try{CommerceSuite::show($db,$publicCode);throw new RuntimeException('Editing did not unpublish prior version');}
 catch(ApiError $e){if($e->status!==404)throw $e;}
 CommerceSuite::action($db,$one,$create['id'],'publish');
 CommerceSuite::action($db,$one,$create['id'],'archive');
 try{CommerceSuite::show($db,$publicCode);throw new RuntimeException('Archived offer still public');}
 catch(ApiError $e){if($e->status!==404)throw $e;}
 foreach([
  ['image_url'=>'http://invalid.example.org/x.png'],
  ['image_url'=>'https://127.0.0.1/secret.png'],
  ['image_url'=>'javascript:alert(1)'],
  ['suggested_amount_cents'=>100000],
  ['expires_at'=>'2026-02-30'],
  ['accent_color'=>'red']
 ] as $delta){
    try{CommerceSuite::create($db,$one,array_replace($body,$delta));throw new RuntimeException('Unsafe offer input accepted');}
    catch(ApiError $e){if($e->status!==422)throw $e;}
 }
 $mock=CommerceSuite::sandbox(['scenario'=>'paid','amount_cents'=>5500]);
 if($mock['status']!=='simulated_paid'||$mock['wallet_credit_cents']!==0||
    $mock['provider_id']!==null||$mock['pix_copy_paste']!==null||$mock['simulated']!==true)
   throw new RuntimeException('Sandbox must never create provider transactions');
 foreach(['failure','refund_paid','credit_wallet'] as $scenario){
    try{CommerceSuite::sandbox(['scenario'=>$scenario,'amount_cents'=>5500]);throw new RuntimeException('Unsafe sandbox scenario');}
    catch(ApiError $e){if($e->status!==422)throw $e;}
 }
 $g=(string)file_get_contents('/var/www/html/src/Gateway.php');
 $p=(string)file_get_contents('/var/www/html/src/Portal.php');
 $a=(string)file_get_contents('/var/www/html/src/Admin.php');
 $nav=(string)file_get_contents('/var/www/html/public/static/reseller-dashboard.js');
 $ui=(string)file_get_contents('/var/www/html/public/static/client.html');
 $admin=(string)file_get_contents('/var/www/html/public/static/admin.html');
 $publicUi=(string)file_get_contents('/var/www/html/public/static/commerce-public.js');
 foreach([
  "require_once __DIR__ . '/CommerceSuite.php'",
  "self::htmlFile('commerce-public.html')",
  "CommerceSuite::public(\$comPublicDb,\$method,\$path)"
 ] as $q)if(!str_contains($g,$q))throw new RuntimeException('Commerce public gateway routing missing');
 if(!str_contains($p,'CommerceSuite::portal($db,$method,$path,$account,')||
    !str_contains($p,"if(\$method!=='GET')self::csrf(\$account);"))
    throw new RuntimeException('Commerce portal route not protected by seller session/CSRF');
 if(!str_contains($a,'CommerceSuite::respondAdmin($db,$actor)'))
    throw new RuntimeException('Admin commerce overview not protected');
 foreach(["nav('commerce')","page('commerce'","commerce:'Checkout Studio'"] as $t)
  if(!str_contains($nav,$t))throw new RuntimeException('Reseller commerce SPA missing: '.$t);
 foreach(['commerce-suite.js?v=20261123-1','commerce-suite.css?v=20261123-1'] as $t)
  if(!str_contains($ui,$t)||!str_contains($admin,$t))throw new RuntimeException('Commerce UI assets missing');
 if(str_contains($publicUi,'innerHTML=')||str_contains($publicUi,'POST')||
    str_contains($publicUi,'pix_copy_paste'))
    throw new RuntimeException('Public product page must never issue money or inject HTML');
 echo "PASS: commerce drafts, publish/archive, 2-seller isolation, SSRF-safe images, simulation with zero credit, protected routes and no-money handoff.\n";
}finally{
 if($connection->inTransaction())$connection->rollBack();
}
