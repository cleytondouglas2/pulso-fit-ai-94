<?php
declare(strict_types=1);
$d='/var/www/html/public/static/';
foreach(['landing.html','client.html','admin.html','public-pix.html','reseller-public-pix.html','commerce-public.html','privacy-lgpd.html','terms-of-use.html','cookies-policy.html','docs.html','install.html','argus-verify.html','commerce-status.html'] as $f){
 $s=file_get_contents($d.$f);
 if(!is_string($s)||substr_count($s,'/static/cookie-consent-core.js?v=1')!==1||substr_count($s,'/static/cookie-consent-ui.js?v=1')!==1||substr_count($s,'/static/cookie-consent.css?v=1')!==1)throw new RuntimeException('Consent asset mounting: '.$f);
 if(strpos($s,'cookie-consent-core.js')>strpos($s,'cookie-consent-ui.js'))throw new RuntimeException('Consent asset order');
}
// Known tracker markers are not permitted in direct executable markup or JS until
// an explicitly consent-gated integration and provider inventory have been reviewed.
$tracker='~googletagmanager\.com/(?:gtm\.js|gtag/js)|google-analytics\.com/(?:analytics\.js|g/collect)|connect\.facebook\.net/[^"\s]+/fbevents\.js|static\.hotjar\.com/c/hotjar-|analytics\.tiktok\.com/i18n/pixel|clarity\.ms/tag/|(?:\bgtag|\bfbq)\s*\(~i';
foreach(array_merge(glob($d.'*.html')?:[],glob($d.'*.js')?:[]) as $f){
 $s=file_get_contents($f);
 if(is_string($s)&&preg_match($tracker,$s))throw new RuntimeException('Review optional tracker before release: '.basename($f));
}
$ui=file_get_contents($d.'cookie-consent-ui.js');
foreach(['Rejeitar opcionais','Aceitar todos','Personalizar cookies','Salvar preferências','Preferências de cookies','C.allows','localStorage','/cookies'] as $str)if(!str_contains($ui,$str))throw new RuntimeException('Consent UI contract missing: '.$str);
if(str_contains($ui,'innerHTML')||str_contains($ui,'document.cookie')||str_contains($ui,'fetch('))throw new RuntimeException('Consent UI must not inject HTML, modify session cookies, or send preferences');
echo "PASS: cookie controls mounted across 13 pages; known direct tracker markers absent; no session cookie mutation or preference transmission\n";
