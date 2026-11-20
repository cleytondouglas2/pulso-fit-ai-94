<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * ARGUS hybrid payout decision layer. Deterministic local risk scoring, never an LLM
 * instruction or PSP call. PSP execution stays exclusively in MerchantWallet.
 * Each account's balances, velocity and review history are tenant-scoped.
 */
final class HybridPayout {
    private static function error(string $message,int $status=409):never {
        throw new ApiError($message,$status);
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_payout_risk_decisions (
            withdrawal_id VARCHAR(80) PRIMARY KEY,
            account_id VARCHAR(64) NOT NULL,
            score INTEGER NOT NULL,
            reasons_json TEXT NOT NULL,
            decision VARCHAR(20) NOT NULL,
            created_at VARCHAR(32) NOT NULL,
            reviewed_at VARCHAR(32),
            reviewed_by VARCHAR(64)
        )");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_payout_review_events (
            id VARCHAR(80) PRIMARY KEY,
            withdrawal_id VARCHAR(80) NOT NULL,
            account_id VARCHAR(64) NOT NULL,
            event_type VARCHAR(24) NOT NULL,
            actor_id VARCHAR(64) NOT NULL,
            created_at VARCHAR(32) NOT NULL
        )");
    }
    /** Pure, independently testable rules. Scoring is guidance, not proof of fraud. */
    public static function score(array $f):array {
        $amount=(int)($f['amount_cents']??0);
        $type=strtoupper((string)($f['pix_key_type']??''));
        $score=0;$reasons=[];
        if($amount>=5000){$score+=55;$reasons[]='valor_elevado';}
        if(!in_array($type,['CPF','CNPJ'],true)){$score+=45;$reasons[]='chave_pix_nao_documental';}
        if((int)($f['prior_count']??0)===0 && $amount>=2000) {
            $score+=30;$reasons[]='primeiro_saque_relevante';
        }
        if((int)($f['hour_count']??0)>=2){$score+=35;$reasons[]='frequencia_de_saques';}
        if((int)($f['uncertain_count']??0)>0){$score+=65;$reasons[]='saque_anterior_inconclusivo';}
        if((int)($f['new_beneficiary']??0)===1 && (int)($f['prior_count']??0)>0){
            $score+=25;$reasons[]='beneficiario_diferente';
        }
        $avg=(int)($f['historical_average_cents']??0);
        if($avg>=200 && $amount>=$avg*3 && $amount>=2000){
            $score+=35;$reasons[]='valor_fora_do_historico';
        }
        $score=min(100,$score);
        $threshold=max(20,min(95,(int)(getenv('ARGUS_HYBRID_REVIEW_SCORE')?:40)));
        $live=getenv('ARGUS_HYBRID_PAYOUT_LIVE')==='yes';
        if(!$live){$reasons[]='liberacao_automatica_desativada';}
        return [
            'score'=>$score,
            'decision'=>($live&&$score<$threshold)?'auto':'review',
            'reasons'=>$reasons
        ];
    }
    public static function assess(Database $db,string $accountId,int $amount,string $pixType,string $masked):array {
        self::install($db);
        $rows=$db->all('SELECT amount_cents,pix_key_type,pix_key_masked,status,created_at
            FROM argus_seller_withdrawals WHERE account_id=?
            ORDER BY created_at DESC LIMIT 60',[$accountId]);
        $hour=0;$uncertain=0;$other=0;$tot=0;$count=0;$newBeneficiary=0;
        foreach($rows as $row){
            $status=(string)$row['status'];
            $when=strtotime((string)$row['created_at'])?:0;
            if($when>=time()-3600)$hour++;
            if(in_array($status,['unknown','processing','queued','pending'],true))$uncertain++;
            if(in_array($status,['paid','failed','cancelled','refunded'],true)){
                $other++;
                if($status==='paid'){$tot+=(int)$row['amount_cents'];$count++;}
                if($row['pix_key_type']!==$pixType || $row['pix_key_masked']!==$masked)
                    $newBeneficiary=1;
            }
        }
        return self::score([
            'amount_cents'=>$amount,'pix_key_type'=>$pixType,
            'prior_count'=>$other,'hour_count'=>$hour,'uncertain_count'=>$uncertain,
            'new_beneficiary'=>$newBeneficiary,
            'historical_average_cents'=>$count>0?intdiv($tot,$count):0
        ]);
    }
    /** Called inside the same transaction that holds the merchant's own balance. */
    public static function record(Database $db,string $id,string $accountId,array $assessment):void {
        self::install($db);
        if(!in_array($assessment['decision']??null,['auto','review'],true))self::error('Classificação inválida');
        $db->run('INSERT INTO argus_payout_risk_decisions
            (withdrawal_id,account_id,score,reasons_json,decision,created_at)
            VALUES (?,?,?,?,?,?)',[
            $id,$accountId,(int)$assessment['score'],
            json_encode($assessment['reasons'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            $assessment['decision'],Database::stamp()
        ]);
        self::event($db,$id,$accountId,$assessment['decision'],'system');
    }
    private static function event(Database $db,string $id,string $accountId,string $type,string $actor):void {
        $db->run('INSERT INTO argus_payout_review_events
            (id,withdrawal_id,account_id,event_type,actor_id,created_at)
            VALUES (?,?,?,?,?,?)',[
            'hpe_'.bin2hex(random_bytes(16)),$id,$accountId,$type,$actor,Database::stamp()
        ]);
    }
    public static function canDispatch(Database $db,array $withdrawal):bool {
        $row=$db->one('SELECT decision FROM argus_payout_risk_decisions
            WHERE withdrawal_id=? AND account_id=?',
            [$withdrawal['id'],$withdrawal['account_id']]);
        $decision=(string)($row['decision']??'');
        // Feature is double-gated. Never turn live transfers on just by deploying code.
        return getenv('ARGUS_HYBRID_PAYOUT_LIVE')==='yes'
            && in_array($decision,['auto','approved'],true);
    }
    public static function approve(Database $db,array $request,array $actor):void {
        if(($actor['role']??'')!=='superadmin')self::error('Sem permissão',403);
        if(getenv('ARGUS_HYBRID_PAYOUT_LIVE')!=='yes'||getenv('ARGUS_PAYOUTS_ENABLED')!=='yes')
            self::error('Saques reais ainda não foram habilitados; revisão permanece pendente',503);
        self::install($db);
        $db->transaction(static function(Database $db)use($request,$actor){
            $sql='SELECT * FROM argus_seller_withdrawals WHERE id=? AND account_id=?';
            if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
            $w=$db->one($sql,[$request['id'],$request['account_id']]);
            if(!$w || $w['status']!=='review' || $w['provider_tx_id']!==null)
                self::error('Saque não está aguardando revisão');
            $balance=$db->one('SELECT held_cents,debt_cents FROM argus_seller_wallets WHERE account_id=?',
                [$w['account_id']]);
            if(!$balance||(int)$balance['held_cents']<(int)$w['debit_cents']||
                (int)$balance['debt_cents']!==0)self::error('Reserva bloqueada por divergência');
            $updated=$db->run("UPDATE argus_payout_risk_decisions
                SET decision='approved',reviewed_at=?,reviewed_by=?
                WHERE withdrawal_id=? AND account_id=? AND decision='review'",[
                Database::stamp(),(string)$actor['id'],$w['id'],$w['account_id']
            ]);
            if($updated->rowCount()!==1)self::error('Classificação já revisada');
            $changed=$db->run("UPDATE argus_seller_withdrawals SET status='requested',checked_at=?
                WHERE id=? AND account_id=? AND status='review'",[
                Database::stamp(),$w['id'],$w['account_id']
            ]);
            if($changed->rowCount()!==1)self::error('Outra revisão já foi registrada');
            self::event($db,$w['id'],$w['account_id'],'approved',(string)$actor['id']);
        });
    }
    public static function reject(Database $db,array $request,array $actor):void {
        if(($actor['role']??'')!=='superadmin')self::error('Sem permissão',403);
        self::install($db);
        $db->transaction(static function(Database $db)use($request,$actor){
            $sql='SELECT * FROM argus_seller_withdrawals WHERE id=? AND account_id=?';
            if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
            $row=$db->one($sql,[$request['id'],$request['account_id']]);
            if(!$row||$row['status']!=='review'||$row['provider_tx_id']!==null)
                self::error('Saque já processado ou fora da análise');
            $query='SELECT * FROM argus_seller_wallets WHERE account_id=?';
            if($db->driver()!=='sqlite')$query.=' FOR UPDATE';
            $wallet=$db->one($query,[$row['account_id']]);
            $held=(int)$row['debit_cents'];
            if(!$wallet || (int)$wallet['held_cents']<$held)
                self::error('Reserva financeira inconsistente; não liberada automaticamente');
            $debt=(int)$wallet['debt_cents'];$offset=min($held,$debt);$free=$held-$offset;
            $updated=$db->run("UPDATE argus_payout_risk_decisions
                SET decision='rejected',reviewed_at=?,reviewed_by=?
                WHERE withdrawal_id=? AND account_id=? AND decision='review'",[
                Database::stamp(),(string)$actor['id'],$row['id'],$row['account_id']
            ]);
            if($updated->rowCount()!==1)self::error('Revisão financeira já alterada');
            $db->run("UPDATE argus_seller_wallets SET
                available_cents=available_cents+?,held_cents=held_cents-?,
                debt_cents=debt_cents-?,updated_at=? WHERE account_id=?",[
                $free,$held,$offset,Database::stamp(),$row['account_id']
            ]);
            $db->run('INSERT INTO argus_seller_ledger
                (id,account_id,operation_kind,operation_id,delta_available,delta_held,
                 delta_debt,service_fee_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[
                'mwl_'.bin2hex(random_bytes(16)),$row['account_id'],'withdraw_release',
                $row['id'],$free,-$held,-$offset,0,Database::stamp()
            ]);
            $changed=$db->run("UPDATE argus_seller_withdrawals SET status='cancelled',checked_at=?
                WHERE id=? AND account_id=? AND status='review'",[
                Database::stamp(),$row['id'],$row['account_id']
            ]);
            if($changed->rowCount()!==1)self::error('Saque alterado durante a rejeição');
            self::event($db,$row['id'],$row['account_id'],'rejected',(string)$actor['id']);
        });
    }
    public static function queue(Database $db):array {
        self::install($db);
        $rows=$db->all("SELECT w.id,w.account_id,w.amount_cents,w.service_fee_cents,
            w.pix_key_type,w.pix_key_masked,w.status,w.created_at,
            a.display_name,r.score,r.reasons_json
            FROM argus_seller_withdrawals w
            JOIN argus_portal_accounts a ON a.id=w.account_id
            LEFT JOIN argus_payout_risk_decisions r ON r.withdrawal_id=w.id AND r.account_id=w.account_id
            WHERE w.status='review' ORDER BY w.created_at ASC LIMIT 100");
        return array_map(static function(array $r):array {
            $r['score']=(int)($r['score']??100);
            $r['amount_cents']=(int)$r['amount_cents'];
            $r['service_fee_cents']=(int)$r['service_fee_cents'];
            $r['reasons']=json_decode((string)($r['reasons_json']??'[]'),true)?:[];
            unset($r['reasons_json']);
            return $r;
        },$rows);
    }
}
