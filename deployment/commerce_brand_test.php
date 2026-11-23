<?php
declare(strict_types=1);
/**
 * Seller brand upload: isolated SQLite-only synthetic tests, no money movement.
 * All test changes rollback. No real PSP/network credentials are used.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\CommerceBrand;
use ArgusPayments\CommerceSuite;
use ArgusPayments\Database;
use ArgusPayments\Portal;
use ArgusPayments\ApiError;
$db=new Database(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);CommerceSuite::install($db);CommerceBrand::install($db);
if($db->driver()!=='sqlite')throw new RuntimeException('Synthetic brand test must only run on SQLite');
if(!function_exists('getimagesizefromstring'))
    throw new RuntimeException('Image verifier required; do not silently skip validation');
$pdo=$db->pdo();
if($pdo->inTransaction())throw new RuntimeException('Brand test requires an isolated transaction');
$pdo->beginTransaction();
try {
    $owner=bin2hex(random_bytes(16));
    $other=bin2hex(random_bytes(16));
    foreach([$owner,$other] as $id){
        $db->run('INSERT INTO argus_portal_accounts
            (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
                $id,'PJ','Test Brand',
                'brand-'.substr($id,0,16).'@example.invalid',
                hash('sha256','brand-'.$id),'0000',
                password_hash('SyntheticBrandPassword1',PASSWORD_DEFAULT),
                'approved','synthetic_'.$id,
                Database::stamp(),Database::stamp()
            ]);
    }
    $png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n54AAAAASUVORK5CYII=';
    $bytes=base64_decode($png,true);
    if(!is_string($bytes)||getimagesizefromstring($bytes)===false)
        throw new RuntimeException('Synthetic PNG test fixture invalid');
    if(CommerceBrand::info($db,$owner)['has_logo']!==false)
        throw new RuntimeException('Expected default Argus branding');
    $save=CommerceBrand::save($db,$owner,['image_data_url'=>'data:image/png;base64,'.$png]);
    if(($save['ok']??false)!==true||CommerceBrand::info($db,$owner)['has_logo']!==true)
        throw new RuntimeException('Merchant logo could not be persisted');
    if(CommerceBrand::info($db,$other)['has_logo']!==false)
        throw new RuntimeException('Cross-tenant brand disclosure');
    $stored=$db->one('SELECT mime,encoded_image,content_sha256 FROM argus_commerce_brand_logos WHERE account_id=?',[$owner]);
    if(!$stored||$stored['mime']!=='image/png'||$stored['content_sha256']!==hash('sha256',$bytes))
        throw new RuntimeException('Persistent brand data corrupted');
    // Exercise the full 10 MiB boundary using a valid PNG tEXt metadata chunk.
    $metaLen=10*1024*1024-strlen($bytes)-12;
    $metadata='Comment'.chr(0).str_repeat('x',$metaLen-8);
    $tag='tEXt'.$metadata;
    $maxPng=substr($bytes,0,-12).pack('N',strlen($metadata)).$tag.pack('N',crc32($tag)).substr($bytes,-12);
    if(strlen($maxPng)!==10485760||getimagesizefromstring($maxPng)===false)
        throw new RuntimeException('10 MiB PNG test image invalid');
    $limitSave=CommerceBrand::save($db,$owner,['image_data_url'=>'data:image/png;base64,'.base64_encode($maxPng)]);
    if(($limitSave['ok']??false)!==true)
        throw new RuntimeException('10 MiB PNG rejected unexpectedly');
    try {
        CommerceBrand::save($db,$owner,['image_data_url'=>'data:image/png;base64,'.base64_encode($maxPng.'x')]);
        throw new RuntimeException('Oversized PNG accepted');
    } catch(ApiError $e){if($e->status!==422)throw $e;}
    unset($metadata,$tag,$maxPng);
    $offer=[
        'title'=>'Page with Seller Logo',
        'description'=>'Check marketing storefront branding without moving money.',
        'suggested_amount_cents'=>null,
        'image_url'=>'',
        'accent_color'=>'#e9bc74',
        'call_to_action'=>'Continuar para o Pix',
        'expires_at'=>null
    ];
    $created=CommerceSuite::create($db,$owner,$offer);
    CommerceSuite::action($db,$owner,$created['id'],'publish');
    $code=substr($created['public_path'],3);
    $public=CommerceSuite::show($db,$code);
    if(($public['logo_url']??null)!=='/api/public/commerce/logo/'.$code)
        throw new RuntimeException('Public storefront must reference seller brand');
    if(str_contains(json_encode($public,JSON_THROW_ON_ERROR),$png))
        throw new RuntimeException('Base64 logo must never be embedded in page JSON');
    $otherOffer=CommerceSuite::create($db,$other,$offer);
    CommerceSuite::action($db,$other,$otherOffer['id'],'publish');
    $otherPublic=CommerceSuite::show($db,substr($otherOffer['public_path'],3));
    if(!array_key_exists('logo_url',$otherPublic)||$otherPublic['logo_url']!==null)
        throw new RuntimeException('One seller logo was exposed to another seller');
    foreach([
        ['image_data_url'=>'data:image/svg+xml;base64,'.base64_encode('<svg><script>alert(1)</script></svg>')],
        ['image_data_url'=>'data:image/png;base64,'.base64_encode('<svg>not a png</svg>')],
        ['image_data_url'=>'data:image/png;base64,%%%'],
        ['image_data_url'=>'data:image/png;base64,'.str_repeat('A',13981200)],
        ['image_data_url'=>'https://example.invalid/logo.png']
    ] as $invalid){
        try{
            CommerceBrand::save($db,$owner,$invalid);
            throw new RuntimeException('Unsafe brand file accepted');
        }catch(ApiError $e){if($e->status!==422)throw $e;}
    }
    $db->run('UPDATE argus_portal_accounts SET status=? WHERE id=?',['suspended',$owner]);
    try{CommerceSuite::show($db,$code);throw new RuntimeException('Suspended seller page visible');}
    catch(ApiError $e){if($e->status!==404)throw $e;}
    $db->run('UPDATE argus_portal_accounts SET status=? WHERE id=?',['approved',$owner]);
    $removed=CommerceBrand::remove($db,$owner);
    if(($removed['ok']??false)!==true||CommerceBrand::info($db,$owner)['has_logo']!==false)
        throw new RuntimeException('Brand removal failed');
    if(CommerceSuite::show($db,$code)['logo_url']!==null)
        throw new RuntimeException('Argus fallback not restored after removing seller logo');

    $brandSource=(string)file_get_contents('/var/www/html/src/CommerceBrand.php');
    $gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
    $portal=(string)file_get_contents('/var/www/html/src/Portal.php');
    $publicJs=(string)file_get_contents('/var/www/html/public/static/commerce-public.js');
    $sellerJs=(string)file_get_contents('/var/www/html/public/static/commerce-brand.js');
    $sellerShell=(string)file_get_contents('/var/www/html/public/static/reseller-dashboard.js');
    $publicHtml=(string)file_get_contents('/var/www/html/public/static/commerce-public.html');
    $client=(string)file_get_contents('/var/www/html/public/static/client.html');
    foreach([
        "require_once __DIR__ . '/CommerceBrand.php'",
        "CommerceBrand::publicLogo(\$comLogoDb,\$logoMatch[1])"
    ] as $required)
        if(!str_contains($gateway,$required))throw new RuntimeException('Guarded public logo route absent');
    foreach(['CommerceBrand::portal($db,$method,$path,$account,','self::body(15000000)',
        "if(\$method!=='GET')self::csrf(\$account)"] as $required)
        if(!str_contains($portal,$required))throw new RuntimeException('Authenticated brand upload route absent');
    foreach(['data:(image/png|image/jpeg|image/webp)','getimagesizefromstring',
        'content_sha256','a.status NOT IN',"p.status='published'"] as $required)
        if(!str_contains($brandSource,$required))throw new RuntimeException('Brand validation/tenant policy absent: '.$required);
    foreach(['argus-commerce-logo-input','argus-commerce-logo-upload','argus-commerce-logo-remove',
        'commerce-brand.js?v=20261123-2'] as $required)
        if(!str_contains($sellerShell,$required)&&!str_contains($client,$required))
            throw new RuntimeException('Reseller brand UI missing: '.$required);
    foreach(['id="argus-cp-merchant-logo"','commerce-public.js?v=3'] as $required)
        if(!str_contains($publicHtml,$required))throw new RuntimeException('Public branding header missing');
    foreach(['logo_url','argus-cp-merchant-logo'] as $required)
        if(!str_contains($publicJs,$required))throw new RuntimeException('Public logo swap missing');
    foreach(['FileReader','/api/portal/commerce/logo','commerce-brand-image',
        'account','preview'] as $required)
        if(!str_contains($sellerJs,$required))throw new RuntimeException('Reseller upload UX missing');
    if(preg_match('/file_put_contents|move_uploaded_file|unlink\\(/',$brandSource))
        throw new RuntimeException('Logo should be in persistent DB, not ephemeral filesystem');
    echo "PASS: 10 MiB PNG boundary and above-limit rejection, isolated seller brand, public fallback, SVG rejection, no money movement.\n";
} finally {
    if($pdo->inTransaction())$pdo->rollBack();
}
