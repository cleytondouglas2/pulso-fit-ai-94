<?php
declare(strict_types=1);
/** Install only after existing KYC+customer tests pass. */
$root='/var/www/html';
$gateway=$root.'/src/Gateway.php';
$source=file_get_contents($gateway);
$anchor="require_once __DIR__ . '/KycStudio.php';";
if(!is_string($source)||substr_count($source,$anchor)!==1)
    throw new RuntimeException('Guided face capture: KYC service bootstrap missing');
$source=str_replace($anchor,$anchor."\nrequire_once __DIR__ . '/FaceCapture.php';",$source);
if(file_put_contents($gateway,$source)===false)
    throw new RuntimeException('Guided face capture: cannot activate challenge service');

$client=$root.'/public/static/client.html';
$html=file_get_contents($client);
if(!is_string($html)||substr_count($html,'kyc-portal.js?v=1')!==1||
   substr_count($html,'kyc-portal.css?v=1')!==1)
    throw new RuntimeException('Guided face capture: KYC client assets not found');
$html=str_replace('kyc-portal.js?v=1','kyc-portal.js?v=3',$html);
$html=str_replace('kyc-portal.css?v=1','kyc-portal.css?v=3',$html);
if(substr_count($html,'</head>')!==1||substr_count($html,'</body>')!==1)
    throw new RuntimeException('Guided face capture: malformed HTML');
$html=str_replace('</head>','<link rel="stylesheet" href="/static/face-capture.css?v=1"></head>',$html);
$html=str_replace('</body>','<script defer src="/static/face-capture.js?v=1"></script></body>',$html);
if(file_put_contents($client,$html)===false)
    throw new RuntimeException('Guided face capture: unable to update KYC frontend');
echo "PASS: guided facial motion capture installed behind existing customer session and KYC audit.\n";
