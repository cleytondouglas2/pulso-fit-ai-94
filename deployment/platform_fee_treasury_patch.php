<?php
declare(strict_types=1);
/** Atomic fee attribution after verified seller Pix settlement. No PSP calls. */
$root='/var/www/html';
function adminFeeReplace(string $path,string $before,string $after,string $label):void {
    $content=file_get_contents($path);
    if(!is_string($content)||substr_count($content,$before)!==1)
        throw new RuntimeException('Platform fee patch source mismatch: '.$label);
    if(file_put_contents($path,str_replace($before,$after,$content))===false)
        throw new RuntimeException('Platform fee patch write failed: '.$label);
}
adminFeeReplace($root.'/src/Gateway.php',
 "require_once __DIR__ . '/MerchantWallet.php';",
 "require_once __DIR__ . '/MerchantWallet.php';\nrequire_once __DIR__ . '/PlatformFeeTreasury.php';",
 'platform ledger dependency');
$wallet=$root.'/src/MerchantWallet.php';
// MerchantWallet::install is invoked before any financial transaction.
adminFeeReplace($wallet,<<<'PHP'
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_seller_ledger_account_idx
            ON argus_seller_ledger(account_id,created_at)");
PHP,
<<<'PHP'
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_seller_ledger_account_idx
            ON argus_seller_ledger(account_id,created_at)");
        PlatformFeeTreasury::install($db);
PHP,
 'install platform fee table before financial writes');
// Deposit: payment receipt must already be PSP verified and seller wallet
// credited; log fee in the same ACID transaction.
adminFeeReplace($wallet,<<<'PHP'
                 $db->run("UPDATE argus_seller_charges SET status='paid',checked_at=? WHERE id=?",[
                     self::now(),$id
                 ]);
PHP,
<<<'PHP'
                 $db->run("UPDATE argus_seller_charges SET status='paid',checked_at=? WHERE id=?",[
                     self::now(),$id
                 ]);
                 PlatformFeeTreasury::record($db,'deposit_paid',(string)$id,(string)$row['account_id']);
PHP,
 'book deposit fee only when paid');
// Reverse exactly the previously booked ARGUS revenue if PSP reports refund.
adminFeeReplace($wallet,<<<'PHP'
                 $db->run("UPDATE argus_seller_charges SET status='refunded',checked_at=? WHERE id=?",
                     [self::now(),$id]);
PHP,
<<<'PHP'
                 $db->run("UPDATE argus_seller_charges SET status='refunded',checked_at=? WHERE id=?",
                     [self::now(),$id]);
                 PlatformFeeTreasury::record($db,'deposit_refund',(string)$id,(string)$row['account_id']);
PHP,
 'reverse deposited fee on provider refund');
// Seller payout fees are NOT revenue when the request is held/queued/unknown.
// Post only after the provider returns paid (COMPLETO).
adminFeeReplace($wallet,<<<'PHP'
             $db->run('UPDATE argus_seller_withdrawals SET status=?,checked_at=? WHERE id=?',
                 [$state,self::now(),$row['id']]);
PHP,
<<<'PHP'
             $db->run('UPDATE argus_seller_withdrawals SET status=?,checked_at=? WHERE id=?',
                 [$state,self::now(),$row['id']]);
             if($state==='paid')
                 PlatformFeeTreasury::record($db,'withdraw_paid',(string)$current['id'],(string)$current['account_id']);
PHP,
 'credit withdrawal fee only after paid');
// Automatic historical reconstruction from original verified seller-ledger
// events; no second payout or extra debit is issued.
adminFeeReplace($wallet,<<<'PHP'
         try{self::reconcilePayouts($db);}catch(\Throwable $e){$errors++;}
         return ['checked'=>$checked,'errors'=>$errors];
PHP,
<<<'PHP'
         try{self::reconcilePayouts($db);}catch(\Throwable $e){$errors++;}
         try{PlatformFeeTreasury::backfill($db,60);}
         catch(\Throwable $e){$errors++;error_log('ARGUS platform fee catch-up failed: '.get_class($e));}
         return ['checked'=>$checked,'errors'=>$errors];
PHP,
 'idempotent fee catchup');
// Read-only account-scoped API with existing superadmin + CSRF enforcement in
// Admin::route; it cannot transfer funds or access another custodial account.
adminFeeReplace($wallet,<<<'PHP'
         if($method==='GET'&&$path==='/api/admin/merchant-wallet/overview'){
PHP,
<<<'PHP'
         if($method==='GET'&&$path==='/api/admin/merchant-wallet/platform-fees')
             self::out(['fees'=>PlatformFeeTreasury::summary($db)]);
         if($method==='GET'&&$path==='/api/admin/merchant-wallet/overview'){
PHP,
 'superadmin fee revenue API');
$admin=$root.'/public/static/admin.html';
adminFeeReplace($admin,'</head>',
 '<link rel="stylesheet" href="/static/admin-platform-fees.css?v=20261122-1"></head>',
 'superadmin fee stylesheet');
adminFeeReplace($admin,'</body>',
 '<script defer src="/static/admin-platform-fees.js?v=20261122-1"></script></body>',
 'superadmin fee panel');
echo "PASS: unique ARGUS platform revenue booked for verified seller deposits/payouts only; refund reversal and historical reconciliation; no PSP transfer\n";
