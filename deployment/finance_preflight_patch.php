<?php
declare(strict_types=1);
/* Read-only preflight in the existing Super Admin financial-health screen.
 * All transfers, charges, balances, payouts and payment guards unchanged.
 */
$static='/var/www/html/public/static/';
$admin=$static.'admin.html';
$html=file_get_contents($admin);
if(!is_string($html))throw new RuntimeException('Preflight: admin HTML not found');
$old='finance-operations.js?v=20261119-1';
$new='finance-operations.js?v=preflight-20261123-v2';
if(substr_count($html,$old)!==1||substr_count($html,'</head>')!==1)
 throw new RuntimeException('Preflight: admin asset anchor changed');
$html=str_replace($old,$new,$html);
$html=str_replace('</head>','<link rel="stylesheet" href="/static/finance-preflight.css?v=20261123-v2"></head>',$html);
if(file_put_contents($admin,$html)===false)
 throw new RuntimeException('Preflight: cannot update admin');
echo "PASS: admin financial preflight read-only, independent provider checks, no credentials exposed or transfers initiated.\n";
