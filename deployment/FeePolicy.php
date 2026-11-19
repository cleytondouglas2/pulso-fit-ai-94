<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Financial fee POLICY, not a charge/withdrawal processor.
 *
 * MisticPay costs and ARGUS client pricing are distinct accounting concepts.
 * These configurable, versioned estimates do NOT change provider payloads,
 * settlement, merchant balances, payouts, QR amounts or historical operations.
 */
final class FeePolicy {
    private const DEFAULTS=[
        'mistic_deposit_cents'=>50,
        'mistic_withdraw_cents'=>50,
        'argus_deposit_fixed_cents'=>0,
        'argus_withdraw_fixed_cents'=>0,
        'argus_deposit_bps'=>0,
        'argus_withdraw_bps'=>0
    ];
    private const FIXED=[
        'mistic_deposit_cents',
        'mistic_withdraw_cents',
        'argus_deposit_fixed_cents',
        'argus_withdraw_fixed_cents'
    ];
    private const PERCENT=['argus_deposit_bps','argus_withdraw_bps'];
    private static function fail(string $message,int $status=422):never{
        throw new ApiError($message,$status);
    }
    private static function reply(array $data,int $status=200):never{
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        exit;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_fee_policy (
            id INTEGER PRIMARY KEY,
            mistic_deposit_cents INTEGER NOT NULL,
            mistic_withdraw_cents INTEGER NOT NULL,
            argus_deposit_fixed_cents INTEGER NOT NULL,
            argus_withdraw_fixed_cents INTEGER NOT NULL,
            argus_deposit_bps INTEGER NOT NULL,
            argus_withdraw_bps INTEGER NOT NULL,
            version INTEGER NOT NULL,
            updated_by VARCHAR(64) NOT NULL,
            updated_at VARCHAR(32) NOT NULL
        )");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_fee_policy_history (
            id VARCHAR(64) PRIMARY KEY,
            version INTEGER NOT NULL UNIQUE,
            updated_by VARCHAR(64) NOT NULL,
            reason VARCHAR(240) NOT NULL,
            policy_json TEXT NOT NULL,
            created_at VARCHAR(32) NOT NULL
        )");
        $db->run('INSERT INTO argus_fee_policy (
            id,mistic_deposit_cents,mistic_withdraw_cents,
            argus_deposit_fixed_cents,argus_withdraw_fixed_cents,
            argus_deposit_bps,argus_withdraw_bps,version,updated_by,updated_at
        ) VALUES(1,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
        [
            self::DEFAULTS['mistic_deposit_cents'],
            self::DEFAULTS['mistic_withdraw_cents'],
            self::DEFAULTS['argus_deposit_fixed_cents'],
            self::DEFAULTS['argus_withdraw_fixed_cents'],
            self::DEFAULTS['argus_deposit_bps'],
            self::DEFAULTS['argus_withdraw_bps'],
            1,'system',Database::stamp()
        ]);
    }
    public static function current(Database $db):array{
        self::install($db);
        $row=$db->one('SELECT * FROM argus_fee_policy WHERE id=1');
        if(!$row)self::fail('Tabela de taxas ainda não disponível',503);
        $data=[];
        foreach(self::DEFAULTS as $k=>$default)$data[$k]=(int)$row[$k];
        return array_merge($data,[
            'version'=>(int)$row['version'],
            'updated_by'=>(string)$row['updated_by'],
            'updated_at'=>(string)$row['updated_at'],
            'currency'=>'BRL',
            'mode'=>'estimated_only',
            'source'=>'MisticPay: valores informados pelo operador; ARGUS: tabela configurável',
            'auto_deducts'=>false
        ]);
    }
    /** 1 basis point = 0.01 percentage point; all calculations in integer cents. */
    public static function quote(array $policy,int $amountCents,string $direction):array{
        if(!in_array($direction,['deposit','withdraw'],true))self::fail('Operação inválida');
        if($amountCents<100||$amountCents>100000000)self::fail('Valor da simulação fora do intervalo permitido');
        $provider=(int)$policy[$direction==='deposit'?'mistic_deposit_cents':'mistic_withdraw_cents'];
        $fixed=(int)$policy[$direction==='deposit'?'argus_deposit_fixed_cents':'argus_withdraw_fixed_cents'];
        $bps=(int)$policy[$direction==='deposit'?'argus_deposit_bps':'argus_withdraw_bps'];
        $percent=(int)round($amountCents*$bps/10000,0,PHP_ROUND_HALF_UP);
        $revenue=$fixed+$percent;
        return [
            'direction'=>$direction,'amount_cents'=>$amountCents,
            'mistic_provider_cost_cents'=>$provider,
            'argus_fixed_cents'=>$fixed,
            'argus_percent_cents'=>$percent,
            'argus_total_fee_cents'=>$revenue,
            'argus_estimated_margin_cents'=>$revenue-$provider,
            'is_estimate'=>true,
            'provider_cost_from_user_setting'=>true,
            'automatically_charged'=>false
        ];
    }
    private static function sanitize(array $input):array{
        if(!isset($input['version'])||!is_int($input['version'])||$input['version']<1)
            self::fail('Versão da tabela de taxas inválida',409);
        $rates=[];
        foreach(self::FIXED as $key){
            $v=$input[$key]??null;
            if(!is_int($v)||$v<0||$v>10000)self::fail('Informe um valor válido de R$ 0,00 a R$ 100,00 para '.$key);
            $rates[$key]=$v;
        }
        foreach(self::PERCENT as $key){
            $v=$input[$key]??null;
            if(!is_int($v)||$v<0||$v>5000)self::fail('Informe taxa percentual entre 0% e 50% para '.$key);
            $rates[$key]=$v;
        }
        $reason=$input['reason']??null;
        if(!is_string($reason)||mb_strlen(trim($reason),'UTF-8')<8||
            mb_strlen(trim($reason),'UTF-8')>240)
            self::fail('Informe uma justificativa para a alteração (8 a 240 caracteres)');
        return ['version'=>$input['version'],'rates'=>$rates,'reason'=>trim($reason)];
    }
    private static function input():array{
        if((int)($_SERVER['CONTENT_LENGTH']??0)>4096)self::fail('Solicitação muito grande',413);
        $raw=file_get_contents('php://input',false,null,0,4097);
        if(!is_string($raw)||strlen($raw)>4096)self::fail('Solicitação muito grande',413);
        try{$input=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}
        catch(\JsonException){self::fail('Formato JSON inválido',400);}
        if(!is_array($input)||array_is_list($input))self::fail('Dados inválidos',422);
        return $input;
    }
    public static function save(Database $db,array $actor,array $payload):array{
        if(($actor['role']??null)!=='superadmin')self::fail('Somente o Super Admin pode alterar taxas',403);
        self::install($db);
        $safe=self::sanitize($payload);
        $newVersion=$safe['version']+1;
        $when=Database::stamp();
        $data=$safe['rates'];
        $db->transaction(static function(Database $db) use($safe,$data,$newVersion,$when,$actor){
            $stmt=$db->run('UPDATE argus_fee_policy SET
                    mistic_deposit_cents=?,mistic_withdraw_cents=?,
                    argus_deposit_fixed_cents=?,argus_withdraw_fixed_cents=?,
                    argus_deposit_bps=?,argus_withdraw_bps=?,
                    version=?,updated_by=?,updated_at=?
                WHERE id=1 AND version=?',
                [
                    $data['mistic_deposit_cents'],$data['mistic_withdraw_cents'],
                    $data['argus_deposit_fixed_cents'],$data['argus_withdraw_fixed_cents'],
                    $data['argus_deposit_bps'],$data['argus_withdraw_bps'],
                    $newVersion,(string)$actor['id'],$when,$safe['version']
                ]);
            if($stmt->rowCount()!==1)
                self::fail('A tabela de taxas mudou em outra sessão. Atualize antes de salvar.',409);
            $db->run('INSERT INTO argus_fee_policy_history(id,version,updated_by,reason,policy_json,created_at)
                VALUES(?,?,?,?,?,?)',
                [
                    Database::uid('fee'),$newVersion,(string)$actor['id'],
                    $safe['reason'],
                    json_encode($data,JSON_THROW_ON_ERROR),$when
                ]);
        });
        return self::current($db);
    }
    private static function history(Database $db):array{
        $rows=$db->all('SELECT version,updated_by,reason,policy_json,created_at
            FROM argus_fee_policy_history ORDER BY version DESC LIMIT 20');
        return array_map(static function(array $row):array{
            $rates=json_decode((string)$row['policy_json'],true);
            if(!is_array($rates))$rates=[];
            return [
                'version'=>(int)$row['version'],
                'reason'=>(string)$row['reason'],
                'changed_at'=>(string)$row['created_at'],
                'updated_by'=>(string)$row['updated_by'],
                'rates'=>$rates
            ];
        },$rows);
    }
    public static function admin(Database $db,string $method,string $path,array $actor):never{
        if(($actor['role']??'')!=='superadmin')
            self::fail('A tabela de taxas é exclusiva do Super Admin',403);
        if($path!=='/api/admin/fees')self::fail('Rota de taxas não encontrada',404);
        if($method==='GET'){
            $policy=self::current($db);
            self::reply([
                'fees'=>$policy,
                'history'=>self::history($db),
                'sample_quotes'=>[
                    'deposit'=>self::quote($policy,10000,'deposit'),
                    'withdraw'=>self::quote($policy,10000,'withdraw')
                ],
                'notice'=>'Tabela de custos e precificação. Ainda não altera o valor de QR Code, o saque, o saldo ou o ledger de clientes.'
            ]);
        }
        if($method==='POST'){
            $updated=self::save($db,$actor,self::input());
            self::reply([
                'ok'=>true,'fees'=>$updated,'history'=>self::history($db),
                'sample_quotes'=>[
                    'deposit'=>self::quote($updated,10000,'deposit'),
                    'withdraw'=>self::quote($updated,10000,'withdraw')
                ],
                'message'=>'Tabela de taxas atualizada e registrada no histórico. Nenhuma transação existente foi alterada.'
            ]);
        }
        self::fail('Método não permitido',405);
    }
}
