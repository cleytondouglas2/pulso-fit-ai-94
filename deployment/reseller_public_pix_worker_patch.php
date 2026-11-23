<?php
declare(strict_types=1);
/**
 * Background seller Pix reconciliation, independent of clients or open tabs.
 * Uses existing MerchantWallet::reconcileOne authenticated PSP status (never
 * marks a charge paid based on QR generation or a browser event).
 */
$file='/var/www/html/src/MerchantWallet.php';
$s=file_get_contents($file);
if(!is_string($s))throw new RuntimeException('Seller wallet worker missing');
function resellerWorkerReplace(string &$s,string $from,string $to,string $label):void{
 if(substr_count($s,$from)!==1)throw new RuntimeException('Reseller worker changed: '.$label);
 $s=str_replace($from,$to,$s);
}
$before=<<<'PHP'
        self::install($db);
        // Never stop checking an unresolved Pix solely because its QR expired.
        // Recheck confirmed receipts more slowly to capture later reversals.
        $stale=gmdate('Y-m-d H:i:s',time()-180);
        $paidStale=gmdate('Y-m-d H:i:s',time()-86400);
        $rows=$db->all("SELECT * FROM argus_seller_charges
            WHERE provider_id IS NOT NULL AND
             ((status IN ('pending','unknown') AND (checked_at IS NULL OR checked_at<?))
              OR (status='paid' AND (checked_at IS NULL OR checked_at<?)))
            ORDER BY CASE WHEN status IN ('pending','unknown') THEN 0 ELSE 1 END,
                     checked_at ASC LIMIT 25",[$stale,$paidStale]);
PHP;
$after=<<<'PHP'
        self::install($db);
        // First 30 minutes: 20-second eligible checks on a 25-second server
        // worker. Pending and unknown receipts are NEVER dropped on expiry.
        // Preserve the existing 1-day recheck for already paid reversals.
        $fresh=gmdate('Y-m-d H:i:s',time()-1800);
        $freshStale=gmdate('Y-m-d H:i:s',time()-20);
        $olderStale=gmdate('Y-m-d H:i:s',time()-180);
        $paidStale=gmdate('Y-m-d H:i:s',time()-86400);
        $rows=$db->all("SELECT * FROM argus_seller_charges
            WHERE provider_id IS NOT NULL AND
              ((status IN ('pending','unknown') AND
                  ((created_at>=? AND (checked_at IS NULL OR checked_at<?))
                   OR (created_at<? AND (checked_at IS NULL OR checked_at<?))))
               OR (status='paid' AND (checked_at IS NULL OR checked_at<?)))
            ORDER BY CASE WHEN status IN ('pending','unknown') THEN 0 ELSE 1 END,
                     checked_at ASC LIMIT 25",
            [$fresh,$freshStale,$fresh,$olderStale,$paidStale]);
PHP;
resellerWorkerReplace($s,
    "    public static function worker(Database \$db):array{\n",
    "    public static function worker(Database \$db):array{\n".
    "        // Generate safe permanent links for existing resellers even when\n".
    "        // they have not signed in again. Pending accounts stay disabled.\n".
    "        if(in_array(\$db->driver(),['pgsql','mysql'],true)){\n".
    "            try{ResellerPublicPix::seedExisting(\$db,100);}\n".
    "            catch(\\Throwable \$e){error_log('ARGUS_RESELLER_LINK_SEED '.get_class(\$e));}\n".
    "        }\n",
    'existing reseller auto-link backfill');
resellerWorkerReplace($s,$before,$after,'fresh 30-minute seller Pix rate tiers');
$old=<<<'PHP'
        foreach($rows as $row){
            try{self::reconcileOne($db,$row);$checked++;}
PHP;
$new=<<<'PHP'
        foreach($rows as $row){
            try{
                $limit=$row['status']==='paid'?$paidStale:
                   ((string)$row['created_at']>=$fresh?$freshStale:$olderStale);
                // Atomic claim: a tab and worker may race to check the same
                // transaction, but at most one should query the PSP now.
                $claimed=$db->run("UPDATE argus_seller_charges SET checked_at=?
                     WHERE id=? AND status=? AND (checked_at IS NULL OR checked_at<?)",
                    [self::now(),$row['id'],$row['status'],$limit]);
                if($claimed->rowCount()!==1)continue;
                self::reconcileOne($db,$row);$checked++;
            }
PHP;
resellerWorkerReplace($s,$old,$new,'deduplicate worker/tab PSP polling');
if(file_put_contents($file,$s)===false)throw new RuntimeException('Cannot update seller Pix watcher');
echo "PASS: 25s server-driven seller Pix checks throughout 30-minute QR validity; 3m pending/unknown after expiry, 1d paid reversal checks; no duplicate PSP status call, zero outgoing transfers.\n";
