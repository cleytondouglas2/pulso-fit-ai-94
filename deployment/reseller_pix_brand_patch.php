<?php
declare(strict_types=1);
$root='/var/www/html';
function resellerBrandPatch(string $path,string $old,string $new):void{
 $s=file_get_contents($path);
 if(!is_string($s)||substr_count($s,$old)!==1)throw new RuntimeException('Reseller branding anchor: '.basename($path).' '.substr($old,0,100));
 if(file_put_contents($path,str_replace($old,$new,$s))===false)throw new RuntimeException('Reseller branding write failed');
}
$gateway=$root.'/src/Gateway.php';
// Separate read-only image endpoint; existing payment routes stay unchanged.
$anchor=<<<'PHP'
            if(preg_match('~^/e/[a-f0-9]{32}/(config|quote|create|status)$~D',$path)){
PHP;
$route=<<<'PHP'
            if($method==='GET'&&preg_match('~^/e/([a-f0-9]{32})/logo$~D',$path,$sellerLogo)){
                $sellerLogoDb=new Database(self::$config);
                CommerceBrand::resellerPixLogo($sellerLogoDb,$sellerLogo[1]);
                return;
            }
PHP;
resellerBrandPatch($gateway,$anchor,$route."\n".$anchor);
$pix=$root.'/src/ResellerPublicPix.php';
$old=<<<'PHP'
        if($action==='config'){
            self::response([
PHP;
$new=<<<'PHP'
        if($action==='config'){
            // Branding errors must not disable checkout or change financial readiness.
            $logoUrl=null;
            try{$logoUrl=CommerceBrand::resellerPixLogoUrl($db,$code);}
            catch(\Throwable $e){error_log('ARGUS_PUBLIC_PIX_BRAND_UNAVAILABLE class='.get_class($e));}
            self::response([
                'logo_url'=>$logoUrl,
PHP;
resellerBrandPatch($pix,$old,$new);
$d=$root.'/public/static/';
$html=$d.'reseller-public-pix.html';
resellerBrandPatch($html,'<a class="brand" href="/" aria-label="ARGUS Pay - página inicial">','<a id="reseller-checkout-brand" class="brand" href="/" aria-label="ARGUS Pay - página inicial">');
resellerBrandPatch($html,'<span>ARGUS<span class="accent">PAY</span></span>','<span id="reseller-checkout-wordmark">ARGUS<span class="accent">PAY</span></span>');
resellerBrandPatch($html,'reseller-public-pix.js?v=receipt-20261123-2','reseller-public-pix.js?v=seller-brand-20261123-1');
resellerBrandPatch($html,'reseller-public-pix.css?v=20261123-1','reseller-public-pix.css?v=seller-brand-20261123-1');
$js=$d.'reseller-public-pix.js';
$logic=<<<'JS'
function applyResellerBrand(result,business){
 const brand=$('reseller-checkout-brand');
 const image=brand?.querySelector('img');
 const wordmark=$('reseller-checkout-wordmark');
 if(!brand||!image||!wordmark)return;
 const expected=resellerBase+'/logo';
 if(result.logo_url!==expected)return;
 // Load only the same-origin image bound to this exact public link.
 // Keep default branding until the custom image is successfully loaded.
 const candidate=new Image();
 candidate.alt='Logomarca de '+business;
 candidate.className='reseller-custom-logo';
 candidate.decoding='async';
 candidate.onload=()=>{
  if(!candidate.naturalWidth||!candidate.naturalHeight)return;
  image.replaceWith(candidate);
  brand.classList.add('reseller-custom-brand');
  brand.setAttribute('aria-label',business+' - página de pagamento');
  brand.href=resellerBase;
  wordmark.hidden=true;
  document.title='Pague com Pix | '+business;
 };
 candidate.src=expected;
}
JS;
resellerBrandPatch($js,'async function loadReseller(){',$logic."\n".'async function loadReseller(){');
resellerBrandPatch($js,"  \$('reseller-dialog-business').textContent=business;","  \$('reseller-dialog-business').textContent=business;\n  applyResellerBrand(result,business);");
$css=$d.'reseller-public-pix.css';
$style=<<<'CSS'

/* Custom merchant logo: no crop, no stretched logo, no duplicated wordmark. */
.topbar .reseller-custom-brand{min-width:0;flex:1;max-width:calc(100% - 125px)}
.topbar .reseller-custom-brand .reseller-custom-logo{display:block;width:auto;height:auto;max-width:min(100%,260px);max-height:72px;object-fit:contain;object-position:left center}
.topbar .reseller-custom-brand #reseller-checkout-wordmark[hidden]{display:none!important}
.topbar .secure{flex-shrink:0}
@media(max-width:600px){.topbar .reseller-custom-brand .reseller-custom-logo{max-width:100%;max-height:56px}.topbar .reseller-custom-brand{max-width:calc(100% - 115px)}}
CSS;
if(file_put_contents($css,$style,FILE_APPEND)===false)throw new RuntimeException('Seller branding style failed');
echo "PASS: reseller public Pix logo route, owner-bound config, fallback and responsive custom header installed; payment code untouched.\n";
