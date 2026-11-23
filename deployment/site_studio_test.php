<?php
declare(strict_types=1);
/**
 * Site Studio synthetic data contract. No Render changes, Pix, charges,
 * webhooks, withdrawals, PSP requests, real admin users or secrets.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\SiteStudio;
use ArgusPayments\Database;
use ArgusPayments\ApiError;
$db=new Database(require '/var/www/html/config.php');
SiteStudio::install($db);
$manifest=(string)file_get_contents('/var/www/html/public/static/site-studio-manifest.json');
$m=json_decode($manifest,true,512,JSON_THROW_ON_ERROR);
if(($m['count']??0)<45||count($m['fields']??[])<45)
 throw new RuntimeException('Marketing content editor manifest is incomplete');
$schemaRef=new ReflectionMethod(SiteStudio::class,'schema');
$schema=$schemaRef->invoke(null);
if(count($schema)<75)throw new RuntimeException('Expected broad marketing site management');
$normalize=new ReflectionMethod(SiteStudio::class,'normalized');
$defaultRef=new ReflectionMethod(SiteStudio::class,'defaults');
$defaults=$defaultRef->invoke(null,$schema);
$original=SiteStudio::publicConfig($db);
if($original['settings']['brand.name']===''||
 !isset($original['settings']['sections.security'])||
 !array_key_exists('copy_001',$original['settings']))
 throw new RuntimeException('Public renderer is missing defaults or copy fields');
$draft=$defaults;
$draft['brand.name']='Marca Teste Argus';
$draft['theme.gold']='#eabb66';
$draft['contact.email']='suporte@example.com';
$draft['contact.whatsapp']='5511999999999';
$draft['announcement.enabled']=true;
$draft['announcement.text']='Comunicado de teste';
$draft['copy_001']='<img src=x onerror=alert(1)> & conteúdo seguro';
$clean=$normalize->invoke(null,$draft,$schema);
if($clean['copy_001']!==$draft['copy_001']||$clean['theme.gold']!=='#eabb66')
 throw new RuntimeException('Text or color values altered before safe DOM rendering');
foreach([
 ['theme.gold','red'],
 ['seo.title',str_repeat('x',1000)],
 ['contact.whatsapp','+55(11)99999999'],
 ['contact.email','invalid@'],
 ['cta.signup_url','javascript:alert(1)'],
 ['brand.logo','//evil.example/logo.png'],
 ['contact.instagram','http://insecure.example/'],
 ['seo.og_image','file:///etc/passwd']
] as [$field,$invalid]){
 $candidate=$draft;$candidate[$field]=$invalid;
 try{
  $normalize->invoke(null,$candidate,$schema);
  throw new RuntimeException('Unsafe field accepted: '.$field);
 }catch(ApiError $e){
  if($e->status!==422)throw $e;
 }
}
$saveRef=new ReflectionMethod(SiteStudio::class,'save');
$snapshot=$original['settings'];
$saveRef->invoke(null,$db,$snapshot,$clean,0,1,'synthetic_site_studio');
$public=SiteStudio::publicConfig($db);
if($public['settings']['brand.name']===$draft['brand.name']||
 $public['published_version']!==0)
 throw new RuntimeException('Unpublished draft leaked to public website');
$saveRef->invoke(null,$db,$clean,$clean,1,1,'synthetic_site_studio');
$published=SiteStudio::publicConfig($db);
if($published['published_version']!==1||
 $published['settings']['brand.name']!==$draft['brand.name']||
 $published['settings']['copy_001']!==$draft['copy_001'])
 throw new RuntimeException('Published website did not read only confirmed version');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$admin=(string)file_get_contents('/var/www/html/src/Admin.php');
$html=(string)file_get_contents('/var/www/html/public/static/admin.html');
$landing=(string)file_get_contents('/var/www/html/public/static/landing.html');
$publicJs=(string)file_get_contents('/var/www/html/public/static/site-studio-public.js');
$studioJs=(string)file_get_contents('/var/www/html/public/static/site-studio-admin.js');
foreach(["/api/public/site-studio","SiteStudio::respondPublic(\$db)",
  "require_once __DIR__ . '/SiteStudio.php'"] as $term)
 if(!str_contains($gateway,$term))throw new RuntimeException('Public published-only endpoint missing: '.$term);
foreach(["/api/admin/site-studio/","self::verifyMfaCode(\$db,\$actor",
  "self::writeAllowed(\$actor,true)","SiteStudio::handle(\$db,\$method,\$path,\$actor,\$payload)"] as $term)
 if(!str_contains($admin,$term))throw new RuntimeException('Admin 2FA route missing: '.$term);
foreach(['data-nav="site-studio"','id="page-site-studio"',
  'id="argus-studio-preview"','id="argus-studio-otp"',
  'site-studio-admin.css?v=20261123-1',
  'site-studio-admin.js?v=20261123-1'] as $term)
 if(!str_contains($html,$term))throw new RuntimeException('Site Studio admin UI missing '.$term);
foreach(['site-studio-public.js?v=20261123-1',
 'site-studio-public.css?v=20261123-1'] as $term)
 if(!str_contains($landing,$term))throw new RuntimeException('Landing published config mount missing '.$term);
foreach([
 'node.nodeValue=start+changed+end',
 "event", "pendingPreview",
 "e.origin!==location.origin",
 "location.search",
 "api/public/site-studio"
] as $term)
 if(!str_contains($publicJs,$term))throw new RuntimeException('DOM preview/content safety missing '.$term);
foreach([
 "api/admin/site-studio/status",
 "op('draft'",
 "op('publish'",
 "op('restore'",
 "argus-studio-otp",
 "argus-studio-save-bottom",
 "argus-studio-publish-bottom"
] as $term)
 if(!str_contains($studioJs,$term))throw new RuntimeException('Site designer incomplete '.$term);
if(str_contains($publicJs,'innerHTML=')||str_contains($publicJs,'eval(')||
 str_contains($publicJs,'document.cookie'))
 throw new RuntimeException('Public site renderer must not inject HTML or access financial sessions');
echo "PASS: full text catalog, safe site settings, draft isolation, publish, links, SEO, MFA route, preview and original public landing.\n";
