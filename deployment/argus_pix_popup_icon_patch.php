<?php
declare(strict_types=1);
/** Final nonfinancial UX patch for the ARGUS Pix modal and distinct iPhone icon. */
$root='/var/www/html/public/static';
$admin=$root.'/admin.html';
$h=file_get_contents($admin);
if(!is_string($h)||substr_count($h,'</head>')!==1||substr_count($h,'</body>')!==1)
    throw new RuntimeException('ARGUS popup: admin HTML structure missing');
$old='<script src="/static/quick-pix-receipt.js?v=3" defer></script>';
if(substr_count($h,$old)!==1)throw new RuntimeException('ARGUS popup: receipt script version missing');
$h=str_replace('</head>','<link rel="stylesheet" href="/static/quick-pix-popup.css?v=1"></head>',$h);
$h=str_replace('</body>','<script src="/static/quick-pix-popup.js?v=1" defer></script></body>',$h);
file_put_contents($admin,$h);
// Every home-screen entry point must refer to the same new, uniquely named, opaque
// icon. Changing filename (not just query string) avoids Safari's cached old glyph.
$icon='<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-argus-a-v6.png">';
$tabIcon='<link rel="icon" type="image/png" sizes="192x192" href="/static/assets/argus-a-192-v6.png">';
$manifest='<link rel="manifest" href="/static/manifest.webmanifest?v=6">';
foreach(['admin.html','client.html','install.html','docs.html'] as $file){
    $path="$root/$file";
    $raw=file_get_contents($path);
    if(!is_string($raw)||substr_count($raw,'</head>')!==1)
        throw new RuntimeException('ARGUS icon: missing head in '.$file);
    $replaced=preg_replace('~<link\b[^>]*\brel=["\']apple-touch-icon["\'][^>]*>~i',$icon,$raw,-1,$n);
    if(!is_string($replaced))throw new RuntimeException('ARGUS icon rewrite failed: '.$file);
    if($n===0)$replaced=str_replace('</head>',$icon.'</head>',$replaced);
    // Keep older favicon links in place; the last icon link explicitly points to A.
    $replaced=str_replace('</head>',$tabIcon.'</head>',$replaced);
    if(preg_match('~<link\b[^>]*\brel=["\']manifest["\'][^>]*>~i',$replaced)){
        $replaced=preg_replace('~<link\b[^>]*\brel=["\']manifest["\'][^>]*>~i',$manifest,$replaced);
    }else{
        $replaced=str_replace('</head>',$manifest.'</head>',$replaced);
    }
    if(substr_count($replaced,$icon)!==1||substr_count($replaced,$manifest)!==1)
        throw new RuntimeException('ARGUS icon: duplicate or missing PWA metadata '.$file);
    file_put_contents($path,$replaced);
}
$path="$root/manifest.webmanifest";
$m=json_decode((string)file_get_contents($path),true,32,JSON_THROW_ON_ERROR);
$m['name']='ARGUS Payments';
$m['short_name']='ARGUS';
$m['icons']=[
    ['src'=>'/static/assets/argus-a-192-v6.png','sizes'=>'192x192','type'=>'image/png','purpose'=>'any'],
    ['src'=>'/static/assets/argus-a-512-v6.png','sizes'=>'512x512','type'=>'image/png','purpose'=>'any'],
    ['src'=>'/static/assets/argus-a-512-v6.png','sizes'=>'512x512','type'=>'image/png','purpose'=>'maskable']
];
file_put_contents($path,json_encode($m,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
echo "ARGUS: popup Pix, confirmed-payment celebration and uniquely versioned letter A icon wired.\n";
