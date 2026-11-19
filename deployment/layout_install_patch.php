<?php
declare(strict_types=1);
/**
 * Shared visual consistency patch applied AFTER all functional/security tests.
 * No payment, KYC, account, role, balance or request behavior is modified.
 */
$root='/var/www/html/public/static';
$pages=['admin.html','client.html','docs.html','install.html'];
foreach($pages as $name){
    $file=$root.'/'.$name;
    $html=file_get_contents($file);
    if(!is_string($html)||substr_count($html,'</head>')!==1||
       substr_count($html,'</body>')!==1)
        throw new RuntimeException('Responsive UI: malformed HTML template '.$name);
    $asset='/static/layout-quality.css?v=20261119-1';
    $script='/static/layout-quality.js?v=20261119-1';
    if(str_contains($html,$asset)||str_contains($html,$script))
        throw new RuntimeException('Responsive UI: duplicate shared assets in '.$name);
    $html=str_replace('</head>',
        '<link rel="stylesheet" href="'.$asset.'"></head>',$html);
    $html=str_replace('</body>',
        '<script src="'.$script.'" defer></script></body>',$html);
    if(!preg_match('~<meta[^>]+name=["\']viewport["\']~i',$html)){
        // Device-width viewport is essential for Safari mobile/tablet rules.
        if(!preg_match('~<head[^>]*>~i',$html))
            throw new RuntimeException('Responsive UI: HTML head absent '.$name);
        $html=preg_replace('~<head([^>]*)>~i',
            '<head$1><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
            $html,1);
    }
    if(file_put_contents($file,$html)===false)
        throw new RuntimeException('Responsive UI: could not save '.$name);
}
echo "PASS: shared responsive layout assets installed for admin, seller, API documentation and PWA installation pages.\n";
