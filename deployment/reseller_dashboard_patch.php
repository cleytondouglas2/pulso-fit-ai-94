<?php
declare(strict_types=1);
/**
 * Final-stage client dashboard-only presentation patch.
 * Install after all KYC, banking, login stability and native iPhone fixes.
 * Reparent existing DOM nodes, preserving their JS event handlers and
 * authenticated server authorizations. The visitor login is unchanged.
 */
$root='/var/www/html/public/static';
$target=$root.'/client.html';
$html=file_get_contents($target);
if(!is_string($html)||substr_count($html,'</head>')!==1||
   substr_count($html,'</body>')!==1||
   substr_count($html,'<section id="dashboard" hidden>')!==1)
    throw new RuntimeException('Reseller dashboard: customer markup not recognized');
foreach(['reseller-dashboard.css','reseller-dashboard.js'] as $name)
    if(!is_file($root.'/'.$name)||filesize($root.'/'.$name)<4000)
        throw new RuntimeException('Reseller dashboard: asset missing '.$name);
if(str_contains($html,'reseller-dashboard.css')||str_contains($html,'reseller-dashboard.js'))
    throw new RuntimeException('Reseller dashboard already installed');
$html=str_replace('</head>',
    '<link rel="stylesheet" href="/static/reseller-dashboard.css?v=admin-v1-20261119"></head>',$html);
$html=str_replace('</body>',
    '<script defer src="/static/reseller-dashboard.js?v=admin-v1-20261119"></script></body>',$html);
if(file_put_contents($target,$html)===false)
    throw new RuntimeException('Reseller dashboard: cannot save customer page');
echo "PASS: reseller admin-style navigation installed only on authenticated dashboard; login and original financial APIs unchanged.\n";
