<?php
declare(strict_types=1);
/** Admin display only: no transfers, money writes or provider calls. */
$base='/var/www/html/public/static/';
$page=$base.'admin.html';
$html=file_get_contents($page);
if(!is_string($html))throw new RuntimeException('Admin HTML missing');
$old='finance-operations.js?v=preflight-20261123-v2';
$new='finance-operations.js?v=review-20261123-v3';
if(substr_count($html,$old)!==1)throw new RuntimeException('Unknown finance JS version');
if(file_put_contents($page,str_replace($old,$new,$html))===false)
 throw new RuntimeException('Cannot write Admin HTML');
echo "PASS: Super Admin financial incident lists linked with no financial action.\n";
