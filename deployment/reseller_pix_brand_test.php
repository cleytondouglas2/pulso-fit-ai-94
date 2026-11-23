<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\Portal;
use ArgusPayments\CommerceBrand;
use ArgusPayments\ResellerPublicPix;
$db=new Database(require '/var/www/html/config.php');
if($db->driver()!=='sqlite')throw new RuntimeException('Offline synthetic test only');
$db->installAndSeed();Portal::install($db);ResellerPublicPix::install($db);CommerceBrand::install($db);
$pdo=$db->pdo();$pdo->beginTransaction();
try{
 $a=bin2hex(random_bytes(16));$b=bin2hex(random_bytes(16));
 foreach([$a,$b] as $id){
  $db->run('INSERT INTO argus_portal_accounts
    (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)',[$id,'PJ','Synthetic brand',$id.'@example.invalid',hash('sha256',$id),'0000','offline','approved',null,Database::stamp(),Database::stamp()]);
 }
 $ca=ResellerPublicPix::linkForAccount($db,$a);$cb=ResellerPublicPix::linkForAccount($db,$b);
 $png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n54AAAAASUVORK5CYII=';
 if(CommerceBrand::resellerPixLogoUrl($db,$ca)!==null)throw new RuntimeException('Default not preserved');
 CommerceBrand::save($db,$a,['image_data_url'=>'data:image/png;base64,'.$png]);
 if(CommerceBrand::resellerPixLogoUrl($db,$ca)!=='/e/'.$ca.'/logo'||CommerceBrand::resellerPixLogoUrl($db,$cb)!==null)throw new RuntimeException('Cross-seller brand isolation failed');
 CommerceBrand::save($db,$b,['image_data_url'=>'data:image/png;base64,'.$png]);
 if(CommerceBrand::resellerPixLogoUrl($db,$cb)!=='/e/'.$cb.'/logo')throw new RuntimeException('Second seller logo unavailable');
 $resolve=new ReflectionMethod(CommerceBrand::class,'resellerPixOwner');
 if($resolve->invoke(null,$db,$ca)!==$a||$resolve->invoke(null,$db,$cb)!==$b)throw new RuntimeException('Logo route owner mismatch');
 $db->run('UPDATE argus_portal_accounts SET status=? WHERE id=?',['suspended',$a]);
 if(CommerceBrand::resellerPixLogoUrl($db,$ca)!==null)throw new RuntimeException('Suspended seller logo exposed');
 $db->run('UPDATE argus_portal_accounts SET status=? WHERE id=?',['approved',$a]);
 CommerceBrand::remove($db,$a);
 if(CommerceBrand::resellerPixLogoUrl($db,$ca)!==null||CommerceBrand::resellerPixLogoUrl($db,$cb)!=='/e/'.$cb.'/logo'||CommerceBrand::resellerPixLogoUrl($db,'invalid')!==null)throw new RuntimeException('Removal/fallback failed');
 $html=file_get_contents('/var/www/html/public/static/reseller-public-pix.html');
 $js=file_get_contents('/var/www/html/public/static/reseller-public-pix.js');
 $admin=file_get_contents('/var/www/html/public/static/public-pix.html');
 if(!str_contains($html,'seller-brand-20261123-1')||!str_contains($js,'result.logo_url!==expected')||!str_contains($js,'wordmark.hidden=true')||str_contains($admin,'reseller-checkout-brand'))throw new RuntimeException('Custom logo UI or admin isolation failed');
 if(!str_contains($js,"resellerBase+'/create'")||!str_contains($js,"resellerBase+'/status'"))throw new RuntimeException('Existing payments flow lost');
 echo "PASS: public Pix branding uses existing saved logo, two seller link isolation, suspended/invalid/removal fallback, admin unaffected, no financial operations.\n";
}finally{if($pdo->inTransaction())$pdo->rollBack();}
