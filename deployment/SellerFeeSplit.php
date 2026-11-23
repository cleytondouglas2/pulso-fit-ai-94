<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Immutable merchant fee allocation. A seller pays ONE disclosed service fee:
 * the MisticPay component (provider cost provision) plus the ARGUS commercial
 * component. Provider settlement is handled by the PSP, never by a second Pix.
 * A fee quote is frozen before the associated provider operation.
 */
final class SellerFeeSplit {
    private static function fail(string $message,int $status=422):never {
        throw new ApiError($message,$status);
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_seller_fee_snapshots (
            operation_kind VARCHAR(16) NOT NULL,
            operation_id VARCHAR(80) NOT NULL,
            account_id VARCHAR(64) NOT NULL,
            gross_cents BIGINT NOT NULL,
            total_fee_cents BIGINT NOT NULL,
            provider_fee_cents BIGINT NOT NULL,
            argus_fee_cents BIGINT NOT NULL,
            policy_version INTEGER NOT NULL,
            created_at VARCHAR(32) NOT NULL,
            PRIMARY KEY(operation_kind,operation_id)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_seller_fee_account_idx
            ON argus_seller_fee_snapshots(account_id,created_at)");
    }
    /**
     * The existing Super Admin fee policy is the SINGLE source of new rates.
     * Legacy system-only zero-fee defaults are migrated once to the user's
     * intended 50c ARGUS + 50c MisticPay, with a version and audit event.
     * Manually configured policies are never silently overridden.
     */
    public static function bootstrapPolicy(Database $db):void {
        FeePolicy::install($db);
        $db->transaction(static function(Database $db):void{
            $changed=$db->run("UPDATE argus_fee_policy SET
                argus_deposit_fixed_cents=50,argus_withdraw_fixed_cents=50,
                version=2,updated_by='seller-fee-initialization',updated_at=?
                WHERE id=1 AND version=1 AND updated_by='system'
                  AND argus_deposit_fixed_cents=0 AND argus_withdraw_fixed_cents=0
                  AND argus_deposit_bps=0 AND argus_withdraw_bps=0
                  AND mistic_deposit_cents=50 AND mistic_withdraw_cents=50",
                [Database::stamp()]);
            if($changed->rowCount()===1){
                $db->run('INSERT INTO argus_fee_policy_history
                    (id,version,updated_by,reason,policy_json,created_at)
                    VALUES(?,?,?,?,?,?)',[
                    Database::uid('fee'),2,'seller-fee-initialization',
                    'Divisão inicial da tarifa do revendedor: MisticPay R$ 0,50 e ARGUS R$ 0,50',
                    json_encode([
                        'mistic_deposit_cents'=>50,'mistic_withdraw_cents'=>50,
                        'argus_deposit_fixed_cents'=>50,'argus_withdraw_fixed_cents'=>50,
                        'argus_deposit_bps'=>0,'argus_withdraw_bps'=>0
                    ],JSON_THROW_ON_ERROR),Database::stamp()
                ]);
            }
        });
    }
    public static function quote(Database $db,string $kind,int $gross):array {
        if(!in_array($kind,['deposit','withdraw'],true))self::fail('Tipo de tarifa inválido',422);
        if($gross<100||$gross>100000000)self::fail('Valor fora do limite de cotação',422);
        self::bootstrapPolicy($db);
        $policy=FeePolicy::current($db);
        $provider=(int)$policy['mistic_'.$kind.'_cents'];
        $fixed=(int)$policy['argus_'.$kind.'_fixed_cents'];
        $bps=(int)$policy['argus_'.$kind.'_bps'];
        $variable=(int)round($gross*$bps/10000,0,PHP_ROUND_HALF_UP);
        $argus=$fixed+$variable;
        $total=$provider+$argus;
        if($provider<0||$argus<0||$total>$gross-100)
            self::fail('Valor precisa cobrir a taxa de serviço e manter pelo menos R$ 1,00 líquido',422);
        return [
            'kind'=>$kind,'gross_cents'=>$gross,
            'provider_fee_cents'=>$provider,'argus_fee_cents'=>$argus,
            'argus_fixed_cents'=>$fixed,'argus_percent_cents'=>$variable,
            'total_fee_cents'=>$total,'net_cents'=>$gross-$total,
            'policy_version'=>(int)$policy['version'],
            'provider_fee_is_cost_provision'=>true,
            'provider_transfer_created'=>false
        ];
    }
    public static function reserve(Database $db,string $kind,string $operationId,string $accountId,array $quote):void{
        self::install($db);
        if(!in_array($kind,['deposit','withdraw'],true)||
           !preg_match('/^mw[wc]_[a-f0-9]{32}$/D',$operationId)||
           !preg_match('/^[a-f0-9]{32}$/D',$accountId))
            self::fail('Origem da tarifa inválida',422);
        if((int)$quote['total_fee_cents']!==(int)$quote['provider_fee_cents']+(int)$quote['argus_fee_cents']||
           (int)$quote['gross_cents']-(int)$quote['total_fee_cents']<100)
            self::fail('Divisão de tarifa inconsistente',409);
        $prior=self::get($db,$kind,$operationId);
        if($prior){
            foreach([
                'account_id'=>$accountId,
                'gross_cents'=>(int)$quote['gross_cents'],
                'total_fee_cents'=>(int)$quote['total_fee_cents'],
                'provider_fee_cents'=>(int)$quote['provider_fee_cents'],
                'argus_fee_cents'=>(int)$quote['argus_fee_cents'],
                'policy_version'=>(int)$quote['policy_version']
            ] as $field=>$expected){
                if((string)$prior[$field]!== (string)$expected)
                    self::fail('Não é permitido reprecificar uma operação existente',409);
            }
            return;
        }
        $db->run('INSERT INTO argus_seller_fee_snapshots
          (operation_kind,operation_id,account_id,gross_cents,total_fee_cents,
           provider_fee_cents,argus_fee_cents,policy_version,created_at)
          VALUES(?,?,?,?,?,?,?,?,?)',[
          $kind,$operationId,$accountId,(int)$quote['gross_cents'],
          (int)$quote['total_fee_cents'],(int)$quote['provider_fee_cents'],
          (int)$quote['argus_fee_cents'],(int)$quote['policy_version'],Database::stamp()
        ]);
    }
    public static function get(Database $db,string $kind,string $operationId):?array {
        self::install($db);
        $row=$db->one('SELECT * FROM argus_seller_fee_snapshots
            WHERE operation_kind=? AND operation_id=?',[$kind,$operationId]);
        if(!$row)return null;
        foreach(['gross_cents','total_fee_cents','provider_fee_cents',
            'argus_fee_cents','policy_version'] as $field)$row[$field]=(int)$row[$field];
        return $row;
    }
    public static function providerCostSummary(Database $db):array {
        self::install($db);
        $row=$db->one("SELECT COALESCE(SUM(s.provider_fee_cents),0) AS cost,
           COUNT(*) AS operations
          FROM argus_seller_fee_snapshots s
          JOIN argus_seller_ledger l
            ON l.operation_id=s.operation_id AND l.account_id=s.account_id
          WHERE (s.operation_kind='deposit' AND l.operation_kind='deposit_paid')
             OR (s.operation_kind='withdraw' AND l.operation_kind='withdraw_paid')");
        return [
            'estimated_provider_cost_cents'=>(int)($row['cost']??0),
            'split_fee_operations'=>(int)($row['operations']??0),
            'provider_cost_mode'=>'contractual_estimate_not_second_psp_debit'
        ];
    }
}
