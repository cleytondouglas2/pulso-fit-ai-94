<?php
declare(strict_types=1);
/**
 * Test Safari-safe KYC previews using a locally generated synthetic PDF.
 * No customer files, external requests or production credentials are used.
 */
require_once '/var/www/html/src/Gateway.php';
require_once '/var/www/html/src/KycDocumentPreview.php';
use ArgusPayments\KycDocumentPreview as Preview;
use ArgusPayments\ApiError;

// A valid, minimal one-page PDF created entirely in memory with correct xrefs.
$ops="BT /F1 20 Tf 20 75 Td (ARGUS KYC TEST) Tj ET\n";
$objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 140] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length '.strlen($ops)." >>\nstream\n".$ops."endstream",
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
];
$pdf="%PDF-1.4\n";
$offsets=[0];
foreach($objects as $i=>$body){
    $offsets[]=strlen($pdf);
    $pdf.=($i+1)." 0 obj\n".$body."\nendobj\n";
}
$xref=strlen($pdf);
$pdf.="xref\n0 6\n0000000000 65535 f \n";
for($i=1;$i<=5;$i++)$pdf.=sprintf('%010d 00000 n ',$offsets[$i])."\n";
$pdf.="trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n".$xref."\n%%EOF\n";
if(strlen($pdf)<1000)$pdf.=str_repeat("\n",1000-strlen($pdf));

$meta=Preview::info($pdf);
if($meta['pages']!==1||$meta['preview_pages']!==1||$meta['truncated'])
    throw new RuntimeException('PDF metadata not compatible with protected viewer');
$png=Preview::png($pdf,1);
if(!str_starts_with($png,"\x89PNG\r\n\x1a\n"))
    throw new RuntimeException('PDF page does not render as PNG');
$dimensions=getimagesizefromstring($png);
if(!$dimensions||$dimensions[0]<100||$dimensions[1]<40||$dimensions[0]>1400||$dimensions[1]>1400)
    throw new RuntimeException('PDF preview raster size was not bounded');
try{Preview::png($pdf,2);throw new RuntimeException('Page 2 incorrectly accessible');}
catch(ApiError $e){if($e->status!==404)throw $e;}
try{Preview::info(str_repeat('not-a-pdf',120));throw new RuntimeException('Invalid PDF accepted');}
catch(ApiError $e){if($e->status!==422)throw $e;}

$backend=(string)file_get_contents('/var/www/html/src/KycStudio.php');
$ui=(string)file_get_contents('/var/www/html/public/static/kyc-studio.js');
$css=(string)file_get_contents('/var/www/html/public/static/kyc-studio.css');
$html=(string)file_get_contents('/var/www/html/public/static/admin.html');
foreach([
    "self::reviewLog(\$db,\$actor,\$accountId,'document_viewed'",
    "x.payload_encrypted",
    "hash('sha256',\$bytes)",
    "KycDocumentPreview::png(\$bytes",
    "KycDocumentPreview::info(\$bytes",
    "Content-Disposition: '.(\$mime==='application/pdf'?'attachment':'inline')",
    "Cache-Control: private, no-store"
] as $needle){
    if(!str_contains($backend,$needle))
        throw new RuntimeException('Secure KYC document endpoint changed: '.$needle);
}
foreach([
    "function preview(ev)", "credentials:'same-origin'",
    "base+'?preview=metadata'", "base+'?preview=page&page='+page",
    "image.src=pdf?", "kyc-pdf-counter",
    "kyc-viewer-image", "Baixar PDF original",
    "image.onerror", "Documento protegido"
] as $needle){
    if(!str_contains($ui,$needle))
        throw new RuntimeException('Safari-safe preview UI missing: '.$needle);
}
if(str_contains($ui,'URL.createObjectURL')||
   str_contains($ui,'<iframe id="kyc-viewer-pdf"'))
    throw new RuntimeException('Broken iOS blob/iframe preview remains');
if(!str_contains($css,'kyc-preview-stage img')||
   !str_contains($css,'kyc-pdf-controls')||
   !str_contains($html,'kyc-studio.js?v=4'))
    throw new RuntimeException('iPhone KYC viewer cache/layout missing');
echo "PASS: real local PDF->PNG render, private bounded pages, original downloaded, image URLs same-origin, reviewer auth/audit maintained; no Safari blob or PDF iframe.\n";
