<?php
declare(strict_types=1);

/** Final, nonfinancial API response patch. No Pix or wallet state is modified. */
$file='/var/www/html/src/MerchantWallet.php';
$php=file_get_contents($file);
if(!is_string($php))throw new RuntimeException('ARGUS QR: wallet not readable');
function replaceQrAnchor(string &$php,string $old,string $new,string $label):void{
    if(substr_count($php,$old)!==1)
        throw new RuntimeException('ARGUS QR API response anchor changed: '.$label);
    $php=str_replace($old,$new,$php);
}
$old=<<<'PHP'
    private static function chargePublic(array $row):array{
        $state=(string)$row['status'];$expires=strtotime($row['created_at'].' UTC')+1800;
PHP;
$new=<<<'PHP'
    private static function chargePublic(array $row,bool $includeQr=false):array{
        $state=(string)$row['status'];$expires=strtotime($row['created_at'].' UTC')+1800;
        $copy=time()<$expires&&$state!=='failed'?$row['copy_paste']:null;
        $qr=null;
        if($includeQr&&is_string($copy)&&$copy!==''){
            require_once __DIR__ . '/ArgusPixQr.php';
            $qr=ArgusPixQr::pngDataUri($copy);
        }
PHP;
replaceQrAnchor($php,$old,$new,'private formatter signature');
replaceQrAnchor(
    $php,
    "'pix_copy_paste'=>time()<\$expires&&\$state!=='failed'?\$row['copy_paste']:null,",
    "'pix_copy_paste'=>\$copy,'qr_code_base64'=>\$qr,",
    'api response image field'
);
replaceQrAnchor($php,
    'return self::chargePublic($existing);',
    'return self::chargePublic($existing,true);',
    'idempotent checkout response');
replaceQrAnchor($php,
    "return self::chargePublic(\$db->one('SELECT * FROM argus_seller_charges WHERE id=?',[\$id]));",
    "return self::chargePublic(\$db->one('SELECT * FROM argus_seller_charges WHERE id=?',[\$id]),true);",
    'new checkout response');
replaceQrAnchor($php,
    'self::out(self::chargePublic($row));',
    'self::out(self::chargePublic($row,true));',
    'authenticated single charge lookup');
replaceQrAnchor($php,
    "self::out(['charge'=>self::chargePublic(\$charge)]);",
    "self::out(['charge'=>self::chargePublic(\$charge,true)]);",
    'seller portal single charge lookup');
if(file_put_contents($file,$php)===false)
    throw new RuntimeException('ARGUS QR: unable to update response formatter');
echo "ARGUS: Pix charge creation, idempotent replays and single-charge lookups return local QR PNG when available; lists stay lightweight.\n";
