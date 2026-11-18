<?php
declare(strict_types=1);
/** Final presentation-only cleanup and 30-minute independent Pix monitor. */
require '/tmp/argus_pix_30m_patch.php';
$file='/var/www/html/public/static/admin.html';
$html=file_get_contents($file);
if(!is_string($html))throw new RuntimeException('Admin Pix UI not found');
$versions=[
 'quick-pix-autostatus.js?v=2'=>'quick-pix-autostatus.js?v=3',
 'quick-pix-popup.js?v=2'=>'quick-pix-popup.js?v=3',
 'quick-pix-popup.css?v=1'=>'quick-pix-popup.css?v=2'
];
foreach($versions as $old=>$new){
    if(substr_count($html,$old)!==1)
        throw new RuntimeException('Pix asset version anchor missing: '.$old);
    $html=str_replace($old,$new,$html);
}
if(file_put_contents($file,$html)===false)
    throw new RuntimeException('Could not update iPhone Pix asset versions');
echo "ARGUS Pix UX: 30-minute server/foreground monitor, silent pending status, no generic unavailable banner or redundant profile block.\n";
