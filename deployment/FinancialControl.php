<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Financial safety interlocks. No provider transfer or Pix issuance here.
 * Status checks only credit after the existing authenticated PSP verification.
 */
final class FinancialControl {
    private const PG_LOCK=721193342005;
    private const MYSQL_LOCK='argus-financial-reconcile-v1';
    private static function fail(string $message,int $status=409):never{
        throw new ApiError($message,$status);
    }
    /** A database-level mutex prevents two background cycles on the SAME DB. */
    public static function acquireWorkerLock(Database $db):bool {
        if($db->driver()==='pgsql'){
            $r=$db->one('SELECT pg_try_advisory_lock(?) AS acquired',[self::PG_LOCK]);
            return in_array($r['acquired']??null,[true,1,'1','t'],true);
        }
        if($db->driver()==='mysql'){
            $r=$db->one('SELECT GET_LOCK(?,0) AS acquired',[self::MYSQL_LOCK]);
            return (int)($r['acquired']??0)===1;
        }
        return false; // Persistent storage mandatory for independent workers.
    }
    public static function releaseWorkerLock(Database $db):void {
        if($db->driver()==='pgsql')
            $db->one('SELECT pg_advisory_unlock(?) AS unlocked',[self::PG_LOCK]);
        elseif($db->driver()==='mysql')
            $db->one('SELECT RELEASE_LOCK(?) AS unlocked',[self::MYSQL_LOCK]);
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_financial_worker_health (
           worker_id VARCHAR(32) PRIMARY KEY,
           last_started_at VARCHAR(32) NOT NULL,
           last_finished_at VARCHAR(32),
           result VARCHAR(24) NOT NULL,
           details VARCHAR(260) NOT NULL
        )");
    }
    public static function heartbeat(Database $db,string $result,string $details=''):void {
        self::install($db);
        $started=Database::stamp();
        // Single row, same DB as financial ledger; no account data, keys or
        // provider payloads ever stored in health metadata.
        $db->run('DELETE FROM argus_financial_worker_health WHERE worker_id=?',['settlement']);
        $db->run('INSERT INTO argus_financial_worker_health
          (worker_id,last_started_at,last_finished_at,result,details)
          VALUES(?,?,?,?,?)',['settlement',$started,$started,
          preg_match('/^(ok|partial|error)$/',$result)?$result:'error',
          mb_substr($details,0,260)]);
    }
    public static function heartbeatStatus(Database $db):array {
        self::install($db);
        $last=$db->one('SELECT last_finished_at,result,details FROM argus_financial_worker_health
            WHERE worker_id=?',['settlement']);
        $when=$last['last_finished_at']??null;
        $epoch=$when?strtotime((string)$when.' UTC'):false;
        $age=$epoch===false?null:max(0,time()-$epoch);
        return [
          'last_successful_cycle_utc'=>$last&&$last['result']==='ok'?$when:null,
          'last_cycle_utc'=>$when,
          'last_cycle_result'=>$last['result']??'never',
          'seconds_since_cycle'=>$age,
          'fresh'=>$age!==null&&$age<300,
          'schedule_external_verified'=>false
        ];
    }
    /** Call ONLY while holding the tenant wallet row lock in a DB transaction. */
    public static function assertWalletBalanced(Database $db,string $accountId,array $w):void {
        foreach(['available_cents','held_cents','debt_cents'] as $field){
            if((int)$w[$field]<0)self::fail('Carteira inconsistente. Saque suspenso para conferência.');
        }
        $sum=$db->one('SELECT COALESCE(SUM(delta_available),0) avail,
            COALESCE(SUM(delta_held),0) held,COALESCE(SUM(delta_debt),0) debt
            FROM argus_seller_ledger WHERE account_id=?',[$accountId]);
        if((int)$w['available_cents']!==(int)$sum['avail']||
           (int)$w['held_cents']!==(int)$sum['held']||
           (int)$w['debt_cents']!==(int)$sum['debt'])
            self::fail('Divergência entre saldo e livro-razão. Saque bloqueado até conciliação.');
    }
    /**
     * Fail closed: only one unsettled payout per tenant. A second request
     * with a new idempotency key and same transfer fingerprint is blocked
     * for ten minutes even if the first payout already completed.
     */
    public static function assertPayoutNotDuplicated(Database $db,string $accountId,string $bodyHash):void {
        $open=$db->one("SELECT id FROM argus_seller_withdrawals WHERE account_id=?
            AND status IN ('requested','processing','queued','pending','unknown')
            ORDER BY created_at DESC LIMIT 1",[$accountId]);
        if($open)self::fail('Já existe um saque em andamento nesta conta. Aguarde a conciliação.');
        $recent=$db->one("SELECT id FROM argus_seller_withdrawals WHERE account_id=?
           AND body_hash=? AND created_at>=? AND status='paid'
           ORDER BY created_at DESC LIMIT 1",[
             $accountId,$bodyHash,gmdate('Y-m-d H:i:s',time()-600)
        ]);
        if($recent)self::fail('Saque idêntico já foi concluído recentemente. Confira o extrato antes de solicitar outro.');
    }
}
