<?php
declare(strict_types=1);
/**
 * Final safety patch. Existing Pix provider validation, KYC, custody and
 * payout idempotency checks stay active. No automatic payout retry is added.
 */
$root='/var/www/html';
function financialSafetyReplace(string $file,string $before,string $after,string $label):void {
    $raw=file_get_contents($file);
    if(!is_string($raw)||substr_count($raw,$before)!==1)
        throw new RuntimeException('Financial safety patch anchor changed: '.$label);
    if(file_put_contents($file,str_replace($before,$after,$raw))===false)
        throw new RuntimeException('Financial safety patch write failed: '.$label);
}
financialSafetyReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/MerchantWebhooks.php';",
    "require_once __DIR__ . '/MerchantWebhooks.php';\nrequire_once __DIR__ . '/FinancialControl.php';",
    'safety class inclusion');
$wallet=$root.'/src/MerchantWallet.php';
$before=<<<'PHP'
            $w=self::lock($db,$accountId);
            if((int)$w['debt_cents']>0||((int)$w['available_cents'])<$debit)
PHP;
$after=<<<'PHP'
            $w=self::lock($db,$accountId);
            // Hold the tenant row lock while checking the entire ledger and
            // every other not-yet-settled payout for this account.
            FinancialControl::assertWalletBalanced($db,$accountId,$w);
            FinancialControl::assertPayoutNotDuplicated($db,$accountId,$bodyHash,$amount,$type,$masked);
            if((int)$w['debt_cents']>0||((int)$w['available_cents'])<$debit)
PHP;
financialSafetyReplace($wallet,$before,$after,'atomic tenant payout interlocks');
$before=<<<'PHP'
        self::install($db);$cutoff=gmdate('Y-m-d H:i:s',time()-7*86400);
        $stale=gmdate('Y-m-d H:i:s',time()-300);
        $rows=$db->all("SELECT * FROM argus_seller_charges
            WHERE status IN ('pending','unknown','paid') AND provider_id IS NOT NULL
            AND created_at>? AND (checked_at IS NULL OR checked_at<?)
            ORDER BY checked_at ASC LIMIT 25",[$cutoff,$stale]);
PHP;
$after=<<<'PHP'
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
financialSafetyReplace($wallet,$before,$after,'seller Pix permanent monitoring and paid reversal recheck');
// Do not treat the user-facing 30-minute QR expiration as authoritative settlement.
$quick=$root.'/src/TraditionalQuickPix.php';
$before=<<<'PHP'
        $cutoff=gmdate('Y-m-d H:i:s',time()-1800);
        $stale=gmdate('Y-m-d H:i:s',time()-45);
        $rows=$db->all("SELECT * FROM admin_quick_pix WHERE provider_id LIKE 'tr_%' AND status IN ('pending','unknown') AND created_at>=? AND (checked_at IS NULL OR checked_at<?) ORDER BY checked_at ASC LIMIT 16",[$cutoff,$stale]);
PHP;
$after=<<<'PHP'
        // 30 minutes is the QR presentation lifetime, not a reconciliation
        // cutoff. Older pending or unknown charges must stay in the queue.
        $stale=gmdate('Y-m-d H:i:s',time()-180);
        $rows=$db->all("SELECT * FROM admin_quick_pix
          WHERE provider_id LIKE 'tr_%' AND status IN ('pending','unknown')
            AND (checked_at IS NULL OR checked_at<?)
          ORDER BY checked_at ASC LIMIT 16",[$stale]);
PHP;
financialSafetyReplace($quick,$before,$after,'indefinite Traditional Pix settlement checks');
// The initial notification worker already calls live B2B and admin PSP checks.
// Remove their one-day creation cutoff, but keep provider identity/amount checks.
$worker='/usr/local/share/argus/notify_worker.php';
financialSafetyReplace($worker,
    "\$db->installAndSeed();\nAdmin::install(\$db);\nNotifications::install(\$db);\n",
    "\$db->installAndSeed();\nAdmin::install(\$db);\nNotifications::install(\$db);\n".
    "// Only one reconciliation cycle across all web/cron instances on this DB.\n".
    "if(!\\ArgusPayments\\FinancialControl::acquireWorkerLock(\$db)){\n".
    " error_log('ARGUS_FINANCIAL_WORKER status=already_running');exit(0);\n}\n".
    "register_shutdown_function(static function()use(\$db):void{\n".
    " try{\\ArgusPayments\\FinancialControl::releaseWorkerLock(\$db);}\n".
    " catch(\\Throwable \$e){error_log('ARGUS financial worker lock release: '.get_class(\$e));}\n".
    "});\n",
    'persistent database reconciliation mutex');
financialSafetyReplace($worker,
    "\$cutoff=gmdate('Y-m-d\\TH:i:s\\Z',time()-86400);\n",
    "// Unresolved Pix never leaves the queue just because a day elapsed.\n",
    'remove 24-hour notifications settlement cutoff');
financialSafetyReplace($worker,
    "AND created_at>=? AND (checked_at IS NULL OR checked_at<?) ORDER BY created_at ASC LIMIT 20\",[\$cutoff,\$since]",
    "AND (checked_at IS NULL OR checked_at<?) ORDER BY checked_at ASC LIMIT 20\",[\$since]",
    'admin Finance Pix older than one day');
financialSafetyReplace($worker,
    "AND created_at>=? AND (checked_at IS NULL OR checked_at<?) ORDER BY created_at ASC LIMIT 15\",[\$cutoff,\$since]",
    "AND (checked_at IS NULL OR checked_at<?) ORDER BY checked_at ASC LIMIT 15\",[\$since]",
    'B2B Pix older than one day');
financialSafetyReplace($worker,
    "AND created_at>=? AND (checked_at IS NULL OR checked_at<?) ORDER BY created_at ASC LIMIT 12\",[\$cutoff,\$since]",
    "AND (checked_at IS NULL OR checked_at<?) ORDER BY checked_at ASC LIMIT 12\",[\$since]",
    'admin payouts after the 24-hour time window');
// Record server-side worker heartbeat only AFTER the entire cycle; failure to
// record is logged and must never trigger a duplicate payment command.
$end=(string)file_get_contents($worker);
if(!str_contains($end,'MerchantWebhooks::worker($db)'))
    throw new RuntimeException('Financial monitoring patch must run after webhook worker');
$end.="\ntry{ \\ArgusPayments\\FinancialControl::heartbeat(\$db,'ok',\n";
$end.="  'cycle_complete_utc='.gmdate('Y-m-d H:i:s').' quick='.(int)\$counts['quick'].\n";
$end.="  ' b2b='.(int)\$counts['merchant'].' payouts='.(int)\$counts['payout']);\n";
$end.="  error_log('ARGUS_FINANCIAL_WORKER status=cycle_completed');}\n";
$end.="catch(\\Throwable \$e){error_log('ARGUS financial heartbeat error: '.get_class(\$e));}\n";
if(file_put_contents($worker,$end)===false)
    throw new RuntimeException('Cannot append financial heartbeat');
$ops=$root.'/src/FinanceOperations.php';
financialSafetyReplace($ops,
    "'background_reconciliation_configured'=>\$worker,",
    "'background_reconciliation_configured'=>\$worker,\n".
    "                'reconciliation_worker'=>FinancialControl::heartbeatStatus(\$db),",
    'Admin financial monitoring uptime');
echo "PASS: indefinite Pix polling, distributed worker mutex, atomic payout guards, ledger verification and reconciliation heartbeat.\n";
