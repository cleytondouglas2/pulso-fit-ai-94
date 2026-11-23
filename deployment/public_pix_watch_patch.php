<?php
declare(strict_types=1);
/**
 * Faster independent backend polling of admin/traditional Pix.
 * Applied after financial_safety_patch.php which removes QR expiry cutoff.
 * It never creates a Pix; uses existing authenticated PSP status validation.
 */
$src='/var/www/html/src/TraditionalQuickPix.php';
$s=file_get_contents($src);
if(!is_string($s))throw new RuntimeException('ARGUS Pix watcher missing class');
function watchReplace(string &$s,string $old,string $new,string $purpose):void {
    if(substr_count($s,$old)!==1)
        throw new RuntimeException('Pix watcher anchor mismatch: '.$purpose);
    $s=str_replace($old,$new,$s);
}
$old=<<<'PHP'
        $stale=gmdate('Y-m-d H:i:s',time()-180);
        $rows=$db->all("SELECT * FROM admin_quick_pix
          WHERE provider_id LIKE 'tr_%' AND status IN ('pending','unknown')
            AND (checked_at IS NULL OR checked_at<?)
          ORDER BY checked_at ASC LIMIT 16",[$stale]);
PHP;
$new=<<<'PHP'
        // During the 30-minute QR life, check after 20 sec. Still keep the
        // post-expiration 3-minute safety checks for delayed settlements.
        $freshCutoff=gmdate('Y-m-d H:i:s',time()-1800);
        $freshStale=gmdate('Y-m-d H:i:s',time()-20);
        $oldStale=gmdate('Y-m-d H:i:s',time()-180);
        $rows=$db->all("SELECT * FROM admin_quick_pix
          WHERE provider_id LIKE 'tr_%' AND status IN ('pending','unknown')
            AND ((created_at>=? AND (checked_at IS NULL OR checked_at<?))
              OR (created_at<? AND (checked_at IS NULL OR checked_at<?)))
          ORDER BY CASE WHEN created_at>=? THEN 0 ELSE 1 END,
                   checked_at ASC LIMIT 16",
          [$freshCutoff,$freshStale,$freshCutoff,$oldStale,$freshCutoff]);
PHP;
watchReplace($s,$old,$new,'fresh/old rate tiers independent of QR display');
$old=<<<'PHP'
        foreach($rows as $row){
            if(!str_starts_with((string)($row['provider_id']??''),'tr_'))continue;
            try{
                $fresh=self::reconcileRow($db,$row);
PHP;
$new=<<<'PHP'
        foreach($rows as $row){
            if(!str_starts_with((string)($row['provider_id']??''),'tr_'))continue;
            try{
                // Claim status polling atomically to avoid concurrent checks
                // with the checkout or other worker instances.
                $threshold=(string)$row['created_at']>=$freshCutoff?$freshStale:$oldStale;
                $now=gmdate('Y-m-d H:i:s');
                $claimed=$db->run("UPDATE admin_quick_pix SET checked_at=?
                    WHERE id=? AND status IN ('pending','unknown')
                      AND (checked_at IS NULL OR checked_at<?)",
                    [$now,$row['id'],$threshold]);
                if($claimed->rowCount()!==1)continue;
                $fresh=self::reconcileRow($db,$row);
PHP;
watchReplace($s,$old,$new,'atomic claim before verified PSP status request');
if(file_put_contents($src,$s)===false)
    throw new RuntimeException('ARGUS Pix watcher cannot persist');
echo "PASS: active traditional Pix checks every ~20-30s independent of browser, atomic claim, verified PSP status and late settlement safety; no new Pix.\n";
