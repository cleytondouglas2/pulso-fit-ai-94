<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
require_once '/var/www/html/src/ArgusPixQr.php';

use ArgusPayments\ArgusPixQr;
use ArgusPayments\MerchantWallet;

$copy='00020126580014br.gov.bcb.pix'.str_repeat('0123456789',23).'6304A1B2';
$data=ArgusPixQr::pngDataUri($copy);
if(!is_string($data)||!str_starts_with($data,'data:image/png;base64,'))
    throw new RuntimeException('ARGUS QR: PNG not generated for Pix');
$png=base64_decode(substr($data,22),true);
if(!is_string($png)||!str_starts_with($png,"\x89PNG\r\n\x1a\n"))
    throw new RuntimeException('ARGUS QR: invalid PNG header');
$size=unpack('Nwidth/Nheight',substr($png,16,8));
if(!$size||$size['width']<180||$size['height']<180||
    $size['width']!==$size['height'])
    throw new RuntimeException('ARGUS QR: wrong image dimensions');
$fmt=new ReflectionMethod(MerchantWallet::class,'chargePublic');
$row=[
 'id'=>'mwc_'.str_repeat('a',32),'amount_cents'=>1490,
 'service_fee_cents'=>100,'net_cents'=>1390,
 'status'=>'pending','created_at'=>gmdate('Y-m-d H:i:s'),
 'copy_paste'=>$copy
];
$created=$fmt->invoke(null,$row,true);
if($created['pix_copy_paste']!==$copy||
   ($created['qr_code_base64']??null)!==$data||
   $created['amount_cents']!==1490||$created['status']!=='pending')
    throw new RuntimeException('ARGUS QR: new checkout response mismatch');
$list=$fmt->invoke(null,$row);
if(($list['qr_code_base64']??null)!==null||$list['pix_copy_paste']!==$copy)
    throw new RuntimeException('ARGUS QR: list endpoint too expensive or dropped Pix');
$expired=$row;
$expired['created_at']=gmdate('Y-m-d H:i:s',time()-3600);
$old=$fmt->invoke(null,$expired,true);
if($old['pix_copy_paste']!==null||$old['qr_code_base64']!==null)
    throw new RuntimeException('ARGUS QR: expired Pix leaked');
if(ArgusPixQr::pngDataUri("invalid\npix")!==null)
    throw new RuntimeException('ARGUS QR: newlines not rejected');
echo "PASS: ARGUS Pix API returns a PNG QR image from provider copy/paste, preserves values, skips list rendering and does not display expired Pix.\n";
