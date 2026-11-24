<?php
declare(strict_types=1);
namespace ArgusPayments;
/** Explicit migration; no provider calls, no balance changes, no raw payloads. */
final class TransactionJournal {
    private const TABLES=[
        'argus_seller_charges'=>['id','account_id'],
        'argus_seller_withdrawals'=>['id','account_id'],
        'admin_quick_pix'=>['id','actor_id'],
        'admin_payouts'=>['id','actor_id'],
        'argus_fee_operations'=>['operation_id',null],
        'argus_merchant_webhook_deliveries'=>['ledger_id','account_id']
    ];
    public static function install(Database $db):void {
        $pdo=$db->pdo();$driver=$db->driver();
        if(!in_array($driver,['pgsql','sqlite'],true))throw new \RuntimeException('Journal migration supports PostgreSQL and SQLite only');
        $id=$driver==='pgsql'?'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT';
        $pdo->exec("CREATE TABLE IF NOT EXISTS argus_transaction_journal (
            sequence_id $id, source VARCHAR(64) NOT NULL, operation_id VARCHAR(120) NOT NULL,
            owner_id VARCHAR(120), event_kind VARCHAR(16) NOT NULL,
            old_status VARCHAR(80), new_status VARCHAR(80), recorded_at VARCHAR(40) NOT NULL)");
        $pdo->exec('CREATE INDEX IF NOT EXISTS argus_tx_journal_ref_idx ON argus_transaction_journal(source,operation_id,sequence_id)');
        if($driver==='pgsql'){
            $pdo->exec(<<<'SQL'
CREATE OR REPLACE FUNCTION argus_journal_block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'argus append-only journal'; END;
$$
SQL);
            $pdo->exec(<<<'SQL'
CREATE OR REPLACE FUNCTION argus_journal_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_row jsonb; new_row jsonb; old_state text; new_state text;
BEGIN
 new_row:=to_jsonb(NEW);
 IF TG_OP='UPDATE' THEN old_row:=to_jsonb(OLD);old_state:=old_row->>'status'; END IF;
 new_state:=new_row->>'status';
 IF TG_OP='UPDATE' AND old_state IS NOT DISTINCT FROM new_state THEN RETURN NEW; END IF;
 INSERT INTO argus_transaction_journal(source,operation_id,owner_id,event_kind,old_status,new_status,recorded_at)
 VALUES(TG_TABLE_NAME,new_row->>TG_ARGV[0],CASE WHEN TG_ARGV[1]='' THEN NULL ELSE new_row->>TG_ARGV[1] END,
 LOWER(TG_OP),old_state,new_state,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 RETURN NEW;
END;
$$
SQL);
            $pdo->exec('DROP TRIGGER IF EXISTS argus_journal_no_mutation ON argus_transaction_journal');
            $pdo->exec('CREATE TRIGGER argus_journal_no_mutation BEFORE UPDATE OR DELETE ON argus_transaction_journal FOR EACH ROW EXECUTE FUNCTION argus_journal_block_mutation()');
            $pdo->exec('DROP TRIGGER IF EXISTS argus_journal_no_truncate ON argus_transaction_journal');
            $pdo->exec('CREATE TRIGGER argus_journal_no_truncate BEFORE TRUNCATE ON argus_transaction_journal FOR EACH STATEMENT EXECUTE FUNCTION argus_journal_block_mutation()');
        }else{
            foreach(['UPDATE','DELETE'] as $event)$pdo->exec("CREATE TRIGGER IF NOT EXISTS argus_journal_no_".strtolower($event)." BEFORE $event ON argus_transaction_journal BEGIN SELECT RAISE(ABORT,'argus append-only journal'); END");
        }
        foreach(self::TABLES as $table=>[$reference,$owner]){
            // All table and column identifiers are fixed internal constants.
            $pdo->query("SELECT $reference,status".($owner?",$owner":'')." FROM $table WHERE 1=0");
            $trigger='argus_journal_'.$table;
            if($driver==='pgsql'){
                $pdo->exec("DROP TRIGGER IF EXISTS $trigger ON $table");
                $ownerArg=$owner??'';
                $pdo->exec("CREATE TRIGGER $trigger AFTER INSERT OR UPDATE OF status ON $table FOR EACH ROW EXECUTE FUNCTION argus_journal_capture('$reference','$ownerArg')");
            }else{
                $newOwner=$owner?"NEW.$owner":'NULL';
                $pdo->exec("CREATE TRIGGER IF NOT EXISTS {$trigger}_insert AFTER INSERT ON $table BEGIN INSERT INTO argus_transaction_journal(source,operation_id,owner_id,event_kind,old_status,new_status,recorded_at) VALUES('$table',NEW.$reference,$newOwner,'insert',NULL,NEW.status,strftime('%Y-%m-%dT%H:%M:%fZ','now')); END");
                $pdo->exec("CREATE TRIGGER IF NOT EXISTS {$trigger}_update AFTER UPDATE OF status ON $table WHEN OLD.status IS NOT NEW.status BEGIN INSERT INTO argus_transaction_journal(source,operation_id,owner_id,event_kind,old_status,new_status,recorded_at) VALUES('$table',NEW.$reference,$newOwner,'update',OLD.status,NEW.status,strftime('%Y-%m-%dT%H:%M:%fZ','now')); END");
            }
        }
    }
    public static function entries(Database $db,string $table,string $id,string $owner):array {
        if(!isset(self::TABLES[$table]))throw new \LogicException('Unknown journal source');
        $rows=$db->all('SELECT sequence_id,source,event_kind,old_status,new_status,recorded_at FROM argus_transaction_journal WHERE (source=? AND operation_id=? AND owner_id=?) OR (source=? AND operation_id=?) ORDER BY sequence_id LIMIT 501',[$table,$id,$owner,'argus_fee_operations',$id]);
        return ['entries'=>array_slice($rows,0,500),'truncated'=>count($rows)>500];
    }
}
