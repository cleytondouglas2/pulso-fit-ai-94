<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Bind commercial fee snapshots to the actual, uniquely identified ARGUS Pix
 * operations. Never mutate a paid Pix value or charge MisticPay cost twice.
 * Deposit: ledger only, after authenticated PSP confirmation.
 * Withdraw: recipient receives requested gross MINUS ARGUS fee, after explicit
 * user approval of this quote. MisticPay provider cost is informational; the
 * PSP settles/charges it on its own terms.
 */
final class FeeExecution {
    public static function install(Database $db):void{
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_fee_operations (
            operation_kind VARCHAR(24) NOT NULL,
            operation_id VARCHAR(120) NOT NULL,
            gross_cents INTEGER NOT NULL,
            provider_amount_cents INTEGER NOT NULL,
            commercial_net_cents INTEGER NOT NULL,
            argus_fee_cents INTEGER NOT NULL,
            argus_fixed_cents INTEGER NOT NULL,
            argus_percent_cents INTEGER NOT NULL,
            mistic_cost_estimate_cents INTEGER NOT NULL,
            policy_version INTEGER NOT NULL,
            status VARCHAR(24) NOT NULL,
            created_at VARCHAR(32) NOT NULL,
            finalized_at VARCHAR(32),
            PRIMARY KEY (operation_kind,operation_id)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_fee_operations_status_idx
            ON argus_fee_operations(status,created_at)");
    }
    public static function quote(Database $db,string $kind,int $gross):array{
        if(!in_array($kind,['deposit','withdraw'],true))
            throw new ApiError('Operação de taxa inválida',422);
        $policy=FeePolicy::current($db);
        $calc=FeePolicy::quote($policy,$gross,$kind);
        $net=$gross-(int)$calc['argus_total_fee_cents'];
        if($net<100)
            throw new ApiError('O valor líquido após a taxa ARGUS precisa ser no mínimo R$ 1,00',422);
        return [
            'kind'=>$kind,
            'gross_cents'=>$gross,
            'recipient_cents'=>$net,
            'commercial_net_cents'=>$net,
            'argus_fee_cents'=>(int)$calc['argus_total_fee_cents'],
            'argus_fixed_cents'=>(int)$calc['argus_fixed_cents'],
            'argus_percent_cents'=>(int)$calc['argus_percent_cents'],
            'mistic_cost_estimate_cents'=>(int)$calc['mistic_provider_cost_cents'],
            'policy_version'=>(int)$policy['version'],
            'provider_fee_charged_here'=>false,
            'provider_amount_cents'=>$kind==='withdraw'?$net:$gross,
            'automatic_debit_of_provider_cost'=>false,
            'deposit_ledger_only'=>$kind==='deposit'
        ];
    }
    public static function reserve(Database $db,string $kind,string $operationId,array $quote):array{
        self::install($db);
        if(!in_array($kind,['deposit','withdraw'],true) ||
           !preg_match('/^[a-zA-Z0-9_-]{12,120}$/D',$operationId))
            throw new ApiError('ID de operação inválido',422);
        $found=self::get($db,$kind,$operationId);
        if($found){
            if((int)$found['gross_cents']!==(int)$quote['gross_cents'])
                throw new ApiError('Taxas já reservadas para outro valor desta operação',409);
            return $found;
        }
        $db->run("INSERT INTO argus_fee_operations (
            operation_kind,operation_id,gross_cents,provider_amount_cents,
            commercial_net_cents,argus_fee_cents,argus_fixed_cents,argus_percent_cents,
            mistic_cost_estimate_cents,policy_version,status,created_at,finalized_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",[
            $kind,$operationId,$quote['gross_cents'],$quote['provider_amount_cents'],
            $quote['commercial_net_cents'],$quote['argus_fee_cents'],
            $quote['argus_fixed_cents'],$quote['argus_percent_cents'],
            $quote['mistic_cost_estimate_cents'],$quote['policy_version'],
            'reserved',Database::stamp(),null
        ]);
        return self::get($db,$kind,$operationId);
    }
    public static function get(Database $db,string $kind,string $id):?array{
        self::install($db);
        $row=$db->one('SELECT * FROM argus_fee_operations WHERE operation_kind=? AND operation_id=?',[$kind,$id]);
        if(!$row)return null;
        foreach([
            'gross_cents','provider_amount_cents','commercial_net_cents',
            'argus_fee_cents','argus_fixed_cents','argus_percent_cents',
            'mistic_cost_estimate_cents','policy_version'
        ] as $key)$row[$key]=(int)$row[$key];
        return $row;
    }
    /**
     * Calling this only after a verified provider result is essential. This
     * operation does NOT credit a merchant wallet that does not exist.
     */
    public static function depositPaid(Database $db,string $operationId):bool{
        self::install($db);
        $row=$db->one('SELECT id,status FROM admin_quick_pix WHERE id=?',[$operationId]);
        if(!$row||$row['status']!=='paid')return false;
        $updated=$db->run("UPDATE argus_fee_operations SET status='settled',finalized_at=?
            WHERE operation_kind='deposit' AND operation_id=? AND status='reserved'",
            [Database::stamp(),$operationId]);
        return $updated->rowCount()===1;
    }
    /** Background repair is safe because initial 'paid' can only be set by
     *  the authenticated /transactions/check path after our integration patch. */
    public static function settlePaidSnapshots(Database $db):int{
        self::install($db);
        $rows=$db->all("SELECT f.operation_id FROM argus_fee_operations f
            JOIN admin_quick_pix p ON p.id=f.operation_id
            WHERE f.operation_kind='deposit' AND f.status='reserved'
              AND p.status='paid' AND p.provider_id LIKE 'tr_%'
            ORDER BY f.created_at ASC LIMIT 80");
        $count=0;
        foreach($rows as $row)if(self::depositPaid($db,(string)$row['operation_id']))$count++;
        return $count;
    }
    public static function payoutSubmitted(Database $db,string $operationId):void{
        self::install($db);
        $db->run("UPDATE argus_fee_operations SET status='submitted'
            WHERE operation_kind='withdraw' AND operation_id=? AND status='reserved'",[$operationId]);
    }
    public static function payoutReconciled(Database $db,string $operationId,string $status):void{
        self::install($db);
        $target=match($status){
            'paid'=>'settled',
            'failed','cancelled','refunded','partially_refunded'=>'not_collected',
            default=>'submitted'
        };
        if($target==='submitted')return;
        // Any provider outcome is written only from an authenticated status check.
        $db->run("UPDATE argus_fee_operations SET status=?,finalized_at=?
            WHERE operation_kind='withdraw' AND operation_id=? AND status IN ('reserved','submitted')",
            [$target,Database::stamp(),$operationId]);
    }
    public static function summary(Database $db,int $limit=60):array{
        self::install($db);
        $limit=max(1,min(100,$limit));
        return $db->all('SELECT operation_kind,operation_id,gross_cents,
            provider_amount_cents,commercial_net_cents,argus_fee_cents,
            argus_fixed_cents,argus_percent_cents,mistic_cost_estimate_cents,
            policy_version,status,created_at,finalized_at
            FROM argus_fee_operations ORDER BY created_at DESC LIMIT '.$limit);
    }
}
