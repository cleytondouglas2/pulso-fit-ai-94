<?php
declare(strict_types=1);
/**
 * Fail-closed PARTIAL PSP refunds + explicitly track unresolved operations.
 * No new provider calls, transfers, balances or credentials. Full-refund
 * handling is preserved. Partial amounts require reconciliation by PSP ledger.
 */
function agfix(string $file,string $old,string $new,string $label):void {
 $s=file_get_contents($file);
 if(!is_string($s)||substr_count($s,$old)!==1)
  throw new RuntimeException('ARGUS partial-refund patch anchor: '.$label);
 if(file_put_contents($file,str_replace($old,$new,$s))===false)
  throw new RuntimeException('ARGUS partial-refund write: '.$label);
}
$root='/var/www/html/src/';
$w=$root.'MerchantWallet.php';
$q=$root.'TraditionalQuickPix.php';
$o=$root.'FinanceOperations.php';

agfix($q,
 "            'FALHA','CANCELADO','DEVOLVIDO','DEVOLVIDO_PARCIAL'=>'failed',",
 "            'FALHA','CANCELADO','DEVOLVIDO'=>'failed',\n".
 "            // A partial refund is NOT a whole payment reversal.\n".
 "            'DEVOLVIDO_PARCIAL'=>'partial_review',",
 'partial PSP Pix state distinct from complete refund');

agfix($q,
 "if(!is_numeric(\$value)||abs((int)round((float)\$value*100)-\$expectedCents)>0)throw new \\RuntimeException('Valor informado pelo provedor diverge');",
 "if(!is_numeric(\$value)||(\$state!=='partial_review'&&abs((int)round((float)\$value*100)-\$expectedCents)>0))throw new \\RuntimeException('Valor informado pelo provedor diverge');",
 'allow partial refund review even when PSP returns the refunded portion instead of original gross');


agfix($w,
 "            if(\$state==='paid'&&in_array(\$old,['pending','unknown'],true)){",
 <<<'CODE'
            // A disputed partial refund has no verified refundable amount.
            // Keep existing funds unchanged and prevent new payouts for this
            // tenant until an explicit PSP-backed accounting review finishes.
            if($old==='partial_review'){
                $db->run('UPDATE argus_seller_charges SET checked_at=? WHERE id=?',
                    [self::now(),$id]);
                return;
            }
            if($state==='partial_review'){
                $db->run("UPDATE argus_seller_charges
                    SET status='partial_review',checked_at=? WHERE id=?",
                    [self::now(),$id]);
                error_log('ARGUS_SELLER_PARTIAL_REFUND_REVIEW operation_id='.$id);
                return;
            }
            if($state==='paid'&&in_array($old,['pending','unknown'],true)){
CODE,
 'hold seller partial Pix reversal without altering ledger');

agfix($w,
 "if(!in_array(\$charge['status'],['pending','unknown','paid','refunded'],true)||",
 "if(!in_array(\$charge['status'],['pending','unknown','paid','refunded','partial_review'],true)||",
 'recognize manual-refund-review charge in status lookup');
agfix($w,
 "((status IN ('pending','unknown') AND\n                  ((created_at>=? AND (checked_at IS NULL OR checked_at<?))",
 "((status IN ('pending','unknown','partial_review') AND\n                  ((created_at>=? AND (checked_at IS NULL OR checked_at<?))",
 'continue periodic safe PSP query for partial reviews');
agfix($w,
 "ORDER BY CASE WHEN status IN ('pending','unknown') THEN 0 ELSE 1 END,",
 "ORDER BY CASE WHEN status IN ('pending','unknown','partial_review') THEN 0 ELSE 1 END,",
 'partial reviews prioritize worker queue');
agfix($w,
 "            FinancialControl::assertPayoutNotDuplicated(\$db,\$accountId,\$bodyHash,\$amount,\$type,\$masked);",
 <<<'CODE'
            FinancialControl::assertPayoutNotDuplicated($db,$accountId,$bodyHash,$amount,$type,$masked);
            // No new withdrawal if this tenant has an unresolved partial
            // refund. Do NOT reverse money without exact PSP refund values.
            if($db->one("SELECT id FROM argus_seller_charges
                WHERE account_id=? AND status='partial_review' LIMIT 1",[$accountId]))
                self::fail('Há uma devolução parcial aguardando conciliação financeira. Saques temporariamente protegidos.',409);
CODE,
 'prevent additional seller payouts during unresolved partial refund');

$from="'CANCELADO'=>'cancelled','DEVOLVIDO','DEVOLVIDO_PARCIAL'=>'refunded',";
$to="'CANCELADO'=>'cancelled','DEVOLVIDO'=>'refunded',\n".
"                    // Never release the entire hold for an unknown partial amount.\n".
"                    'DEVOLVIDO_PARCIAL'=>'unknown',";
$s=file_get_contents($w);
if(!is_string($s)||substr_count($s,$from)!==2)
 throw new RuntimeException('Expected two PSP payout refund mapping sites');
$s=str_replace($from,$to,$s);
if(file_put_contents($w,$s)===false)throw new RuntimeException('Cannot update payout mapping');

agfix($q,
 "        if(in_array((string)\$row['status'],['pending','unknown'],true)){",
 <<<'CODE'
        if((string)$row['status']==='paid'&&$new==='partial_review'){
            // Provider-verified partial refund requires manual accounting,
            // not automatic credit or full reversal of an old paid charge.
            $db->run("UPDATE admin_quick_pix SET status='partial_review',checked_at=?
                WHERE id=? AND status='paid'",[gmdate('Y-m-d H:i:s'),$row['id']]);
            error_log('ARGUS_ADMIN_PARTIAL_REFUND_REVIEW operation_id='.$row['id']);
        }elseif(in_array((string)$row['status'],['pending','unknown'],true)){
CODE,
 'admin past-paid partial review exception');
agfix($q,
 "            if(\$new==='paid'&&\$updated->rowCount()>0){",
 "            if(\$new==='partial_review')error_log('ARGUS_ADMIN_PARTIAL_REFUND_REVIEW operation_id='.\$row['id']);\n".
 "            if(\$new==='paid'&&\$updated->rowCount()>0){",
 'audit new admin partial charge');

agfix($w,
 "                self::finishWithdraw(\$db,\$row,\$mapped);\n                if(\$mapped==='pending')",
 <<<'CODE'
                self::finishWithdraw($db,$row,$mapped);
                if($mapped==='unknown'){
                    // PSP status is uncertain or partially returned.
                    // Preserve held funds; throttle checks; alert for review.
                    $db->run("UPDATE argus_seller_withdrawals
                        SET status='unknown',checked_at=?
                        WHERE id=? AND status IN ('queued','pending','unknown')",
                        [self::now(),$row['id']]);
                    if(strtoupper((string)($status['state']??''))==='DEVOLVIDO_PARCIAL')
                        error_log('ARGUS_SELLER_PARTIAL_PAYOUT_REVIEW operation_id='.$row['id']);
                }
                if($mapped==='pending')
CODE,
 'retain held payout balance and record uncertain partial PSP status');

agfix($q,
 "        if(in_array(\$status,['paid','failed','cancelled','refunded'],true))return \$status;",
 "        if(in_array(\$status,['paid','failed','cancelled','refunded','partial_review'],true))return \$status;",
 'do not display partial refund as expired Pix');

agfix($o,
 "        \$worker=getenv('ARGUS_NOTIFICATIONS_WORKER_ENABLED')==='yes';",
 <<<'CODE'
        // Operations with no provider ID cannot be reliably reconciled by
        // polling. Surface them for secure manual investigation, never retry.
        $unknownWithoutProvider=$db->all("SELECT id,account_id,created_at
            FROM argus_seller_charges WHERE status='unknown' AND provider_id IS NULL
            ORDER BY created_at ASC LIMIT 30");
        $partialRefundReview=$db->all("SELECT id,account_id,created_at
            FROM argus_seller_charges WHERE status='partial_review'
            ORDER BY created_at ASC LIMIT 30");
        $untraceablePayouts=$db->all("SELECT id,account_id,status,created_at
            FROM argus_seller_withdrawals
            WHERE status IN ('unknown','processing') AND provider_tx_id IS NULL
            ORDER BY created_at ASC LIMIT 30");
        $adminUnknownWithoutProvider=$db->all("SELECT id,actor_id,created_at
            FROM admin_quick_pix WHERE status='unknown' AND provider_id IS NULL
            ORDER BY created_at ASC LIMIT 30");
        $adminPartialRefundReview=$db->all("SELECT id,actor_id,created_at
            FROM admin_quick_pix WHERE status='partial_review'
            ORDER BY created_at ASC LIMIT 30");
        $worker=getenv('ARGUS_NOTIFICATIONS_WORKER_ENABLED')==='yes';
CODE,
 'manual-reconciliation queue in Super Admin audit');
agfix($o,
 "            'uncertain_withdrawals'=>\$uncertainPayouts,'stale_withdrawals'=>\$heldPayouts,",
 "            'uncertain_withdrawals'=>\$uncertainPayouts,'stale_withdrawals'=>\$heldPayouts,\n".
 "            'unknown_charges_without_provider_id'=>\$unknownWithoutProvider,\n".
 "            'untraceable_withdrawals'=>\$untraceablePayouts,\n".
 "            'partial_refund_reviews'=>\$partialRefundReview,\n".
 "            'admin_unknown_without_provider_id'=>\$adminUnknownWithoutProvider,\n".
 "            'admin_partial_refund_reviews'=>\$adminPartialRefundReview,",
 'return categorized manual review without secrets');

echo "PASS: partial refunds flagged without full ledger reversal; seller holds protected; unresolved operations listed for manual reconciliation.\n";
