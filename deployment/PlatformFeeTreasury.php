<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Platform commercial-fee accruals (NOT PSP transfers or a withdrawable
 * wallet). All posted entries have a unique, verified merchant-ledger source.
 * Source amount snapshots are immutable. Provider MisticPay costs NEVER count
 * as revenue of ARGUS. Signed refunds reverse a previously collected fee.
 */
final class PlatformFeeTreasury {
    private const OWNER='cleyton.douglas2@gmail.com';
    private static function fail(string $message,int $status=409):never{
        throw new ApiError($message,$status);
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_platform_fee_journal (
            id VARCHAR(160) PRIMARY KEY,
            owner_email VARCHAR(190) NOT NULL,
            seller_account_id VARCHAR(64) NOT NULL,
            event_kind VARCHAR(32) NOT NULL,
            operation_id VARCHAR(80) NOT NULL,
            amount_cents BIGINT NOT NULL,
            created_at VARCHAR(32) NOT NULL,
            UNIQUE(event_kind,operation_id)
        )");
    }
    private static function kind(string $kind):bool {
        return in_array($kind,['deposit_paid','deposit_refund','withdraw_paid'],true);
    }
    /**
     * Called ONLY from an already trusted PSP reconciliation DB transaction or
     * from reconciliation of an existing verified seller ledger entry.
     * The table must be installed BEFORE beginning the financial transaction.
     */
    public static function record(Database $db,string $kind,string $opId,string $accountId):bool {
        if(!self::kind($kind)||!preg_match('/^mw[wc]_[a-f0-9]{32}$/D',$opId)||
           !preg_match('/^[a-f0-9]{32}$/D',$accountId))
            self::fail('Origem da tarifa inválida',422);
        $source=$db->one('SELECT operation_kind,service_fee_cents FROM argus_seller_ledger
            WHERE operation_kind=? AND operation_id=? AND account_id=?',[$kind,$opId,$accountId]);
        if(!$source)self::fail('Taxa sem lançamento financeiro verificado',409);
        $row=null;
        if($kind==='withdraw_paid'){
            $row=$db->one('SELECT account_id,service_fee_cents,amount_cents,status,provider_tx_id
                FROM argus_seller_withdrawals WHERE id=? AND account_id=?',[$opId,$accountId]);
            if(!$row||$row['status']!=='paid'||empty($row['provider_tx_id']))
                self::fail('Saque ainda não confirmado pelo provedor',409);
        }else{
            $row=$db->one('SELECT account_id,service_fee_cents,amount_cents,status,provider_id
                FROM argus_seller_charges WHERE id=? AND account_id=?',[$opId,$accountId]);
            if(!$row||!in_array($row['status'],['paid','refunded'],true)||
               !str_starts_with((string)$row['provider_id'],'tr_'))
                self::fail('Depósito ainda não confirmado pelo provedor',409);
            if($kind==='deposit_refund'&&$row['status']!=='refunded')
                self::fail('Estorno ainda não confirmado',409);
            // On historical catch-up, make sure the paid credit is attributed
            // before any subsequent reversal of its commercial fee.
            if($kind==='deposit_refund'){
                $original=$db->one("SELECT id FROM argus_platform_fee_journal
                  WHERE event_kind='deposit_paid' AND operation_id=?",[$opId]);
                if(!$original)self::record($db,'deposit_paid',$opId,$accountId);
            }
        }
        $fee=(int)$row['service_fee_cents'];
        $gross=(int)$row['amount_cents'];
        if($fee<=0)return false; // Rate can legitimately be zero: no ARGUS revenue.
        if($fee>$gross)self::fail('Taxa superior ao valor original',409);
        $signed=$kind==='deposit_refund'?-$fee:$fee;
        $id='pfe_'.$kind.'_'.$opId;
        $prior=$db->one('SELECT owner_email,seller_account_id,amount_cents FROM argus_platform_fee_journal WHERE id=?',[$id]);
        if($prior){
            if($prior['owner_email']!==self::OWNER||
               $prior['seller_account_id']!==$accountId||
               (int)$prior['amount_cents']!==$signed)
                self::fail('Conflito no lançamento da receita ARGUS',409);
            return false;
        }
        $insert=$db->run('INSERT INTO argus_platform_fee_journal
          (id,owner_email,seller_account_id,event_kind,operation_id,amount_cents,created_at)
          VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',[
          $id,self::OWNER,$accountId,$kind,$opId,$signed,Database::stamp()
        ]);
        return $insert->rowCount()===1;
    }
    /**
     * Idempotently recover historic fees already verified in the original
     * seller ledger, without contacting the PSP or creating any Pix.
     * Run in the existing background financial reconciliation worker.
     */
    public static function backfill(Database $db,int $limit=60):array {
        self::install($db);
        $limit=max(1,min(150,$limit));$count=0;$errors=0;
        $rows=$db->all("SELECT l.operation_kind,l.operation_id,l.account_id
          FROM argus_seller_ledger l
          WHERE l.operation_kind IN ('deposit_paid','deposit_refund','withdraw_paid')
            AND NOT EXISTS (SELECT 1 FROM argus_platform_fee_journal f
              WHERE f.event_kind=l.operation_kind AND f.operation_id=l.operation_id)
            AND (
              (l.operation_kind IN ('deposit_paid','deposit_refund')
                AND EXISTS(SELECT 1 FROM argus_seller_charges c
                  WHERE c.id=l.operation_id AND c.account_id=l.account_id
                    AND c.status IN ('paid','refunded')
                    AND c.provider_id LIKE 'tr_%'))
              OR
              (l.operation_kind='withdraw_paid'
                AND EXISTS(SELECT 1 FROM argus_seller_withdrawals w
                  WHERE w.id=l.operation_id AND w.account_id=l.account_id
                    AND w.status='paid' AND w.provider_tx_id IS NOT NULL))
            )
          ORDER BY l.created_at ASC, l.operation_kind ASC LIMIT ".$limit);
        foreach($rows as $row){
            try{
                $db->transaction(static function(Database $db)use($row,&$count){
                    if(self::record($db,(string)$row['operation_kind'],
                        (string)$row['operation_id'],(string)$row['account_id']))$count++;
                });
            }catch(\Throwable $e){
                $errors++;
                error_log('ARGUS platform fee reconciliation skipped: '.get_class($e));
            }
        }
        return ['posted'=>$count,'failed'=>$errors];
    }
    public static function summary(Database $db):array {
        self::install($db);
        $total=$db->one("SELECT
             COALESCE(SUM(amount_cents),0) AS net,
             COALESCE(SUM(CASE WHEN event_kind='deposit_paid' THEN amount_cents ELSE 0 END),0) AS deposits,
             COALESCE(SUM(CASE WHEN event_kind='withdraw_paid' THEN amount_cents ELSE 0 END),0) AS withdrawals,
             COALESCE(SUM(CASE WHEN event_kind='deposit_refund' THEN -amount_cents ELSE 0 END),0) AS refunds,
             COUNT(*) AS events
           FROM argus_platform_fee_journal WHERE owner_email=?", [self::OWNER]);
        $sellers=$db->all("SELECT f.seller_account_id,a.display_name,a.email,
          COALESCE(SUM(f.amount_cents),0) AS net_cents,
          COUNT(*) AS events
          FROM argus_platform_fee_journal f
          LEFT JOIN argus_portal_accounts a ON a.id=f.seller_account_id
          WHERE f.owner_email=?
          GROUP BY f.seller_account_id,a.display_name,a.email
          ORDER BY net_cents DESC LIMIT 50",[self::OWNER]);
        $latest=$db->all('SELECT seller_account_id,event_kind,operation_id,amount_cents,created_at
           FROM argus_platform_fee_journal WHERE owner_email=?
           ORDER BY created_at DESC,id DESC LIMIT 40',[self::OWNER]);
        return [
          'owner_email'=>self::OWNER,
          'currency'=>'BRL','mode'=>'internal_accounting_only',
          'not_withdrawable'=>true,
          'provider_transfer_created'=>false,
          'net_recognized_cents'=>(int)($total['net']??0),
          'deposit_fees_cents'=>(int)($total['deposits']??0),
          'withdrawal_fees_cents'=>(int)($total['withdrawals']??0),
          'refunded_fees_cents'=>(int)($total['refunds']??0),
          'event_count'=>(int)($total['events']??0),
          'sellers'=>array_map(static fn($row)=>[
            'account_id'=>(string)$row['seller_account_id'],
            'display_name'=>(string)($row['display_name']?:'Revendedor'),
            'email'=>(string)($row['email']??''),
            'net_cents'=>(int)$row['net_cents'],
            'events'=>(int)$row['events']
          ],$sellers),
          'recent'=>array_map(static fn($row)=>[
            'account_id'=>(string)$row['seller_account_id'],
            'event_kind'=>(string)$row['event_kind'],
            'operation_id'=>(string)$row['operation_id'],
            'amount_cents'=>(int)$row['amount_cents'],
            'created_at'=>(string)$row['created_at']
          ],$latest)
        ];
    }
}
