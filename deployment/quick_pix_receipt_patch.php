<?php
declare(strict_types=1);
/** Scope is intentionally restricted to generated Pix receipt UI. */
$root='/var/www/html/public/static';
$html=$root.'/admin.html';
$original=file_get_contents($html);
if(!is_string($original))throw new RuntimeException('ARGUS Pix receipt: admin HTML missing');
$scriptAnchor='<script src="/static/account-profile.js?v=1" defer></script>';
if(substr_count($original,$scriptAnchor)!==1)throw new RuntimeException('ARGUS Pix receipt: prior scripts not found');
// Both are versioned to prevent stale installed Safari/PWA assets.
$replacement='<link rel="stylesheet" href="/static/quick-pix-receipt.css?v=1">'.
             $scriptAnchor.
             '<script src="/static/quick-pix-receipt.js?v=1" defer></script>';
$next=str_replace($scriptAnchor,$replacement,$original);
if($next===$original)throw new RuntimeException('ARGUS Pix receipt: script insertion failed');
file_put_contents($html,$next);
echo "ARGUS Pix receipt-only display patch wired: full code, copy, PNG download and New QR.\n";
