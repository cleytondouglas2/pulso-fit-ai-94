<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Super Admin financial activation of a PERSON (CPF) under an independently
 * attested ARGUS custodial model. This is NOT MisticPay subaccount creation.
 * No CPF is stored in plaintext, and no CNPJ merchant is impersonated.
 *
 * Money endpoints remain gated by the existing merchant custody, PSP account
 * match, payout flags, KYC, ledger isolation, and provider confirmation.
 */
final class PfFinancialApproval {
    private static function fail(string $msg,int $code=422):never {
        throw new ApiError($msg,$code);
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_pf_wallet_merchants (
            id VARCHAR(64) PRIMARY KEY,
            account_id VARCHAR(64) NOT NULL UNIQUE,
            cpf_digest VARCHAR(64) NOT NULL,
            legal_name VARCHAR(180) NOT NULL,
            status VARCHAR(32) NOT NULL,
            approved_at VARCHAR(32) NOT NULL,
            reviewer_id VARCHAR(64) NOT NULL
        )");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_pf_financial_audit (
            id VARCHAR(64) PRIMARY KEY,
            account_id VARCHAR(64) NOT NULL,
            reviewer_id VARCHAR(64) NOT NULL,
            decision VARCHAR(32) NOT NULL,
            reason VARCHAR(300) NOT NULL,
            created_at VARCHAR(32) NOT NULL
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_pf_financial_audit_account_idx
            ON argus_pf_financial_audit(account_id,created_at)");
    }
    public static function custodyReady():bool {
        return getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')==='yes'
           && getenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED')==='yes';
    }
    public static function authorized(Database $db,array $account):bool {
        $id=(string)($account['merchant_id']??'');
        if($id===''||($account['status']??'')!=='approved')return false;
        if(($account['account_type']??'')==='PJ'){
            $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",[$id]);
            return $merchant!==null;
        }
        if(($account['account_type']??'')!=='PF')return false;
        self::install($db);
        $merchant=$db->one("SELECT id FROM argus_pf_wallet_merchants
            WHERE id=? AND account_id=? AND cpf_digest=? AND status='approved_live'",
            [$id,(string)$account['id'],(string)$account['document_digest']]);
        return $merchant!==null;
    }

    /**
     * Returns an internal merchant ID that represents this reviewed PF seller.
     * It never represents a separate banking account or PSP recipient.
     */
    public static function approve(Database $db,array $actor,string $accountId,array $input):array {
        if(($actor['role']??null)!=='superadmin')
            self::fail('Somente o Super Admin pode liberar o cadastro financeiro',403);
        if(!in_array($db->driver(),['pgsql','mysql'],true))
            self::fail('Banco financeiro persistente obrigatório',503);
        if(!self::custodyReady())
            self::fail('A conta central da MisticPay ainda não está homologada para o modelo de carteira segregada no ARGUS. Configure a confirmação de custódia antes de liberar recebimentos.',503);
        if(($input['confirm_identity']??null)!==true||
           ($input['confirm_provider_custody']??null)!==true||
           ($input['confirm_contract']??null)!==true||
           ($input['confirm_ledger']??null)!==true)
            self::fail('Confirme identidade, autorização do provedor, contrato e segregação dos saldos',422);
        $reason=trim((string)($input['reason']??''));
        if(mb_strlen($reason,'UTF-8')<10||mb_strlen($reason,'UTF-8')>300)
            self::fail('Informe uma justificativa de 10 a 300 caracteres',422);
        $a=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$accountId]);
        if(!$a)self::fail('Cadastro não encontrado',404);
        if($a['account_type']!=='PF')self::fail('Esta liberação individual é exclusiva de contas CPF',422);
        if($a['status']!=='identity_verified'||!empty($a['merchant_id']))
            self::fail('CPF não está aguardando liberação financeira ou já foi habilitado',409);
        if(!KycStudio::identityApproved($db,$accountId))
            self::fail('Aguarde a aprovação documental auditada',403);
        $summary=KycStudio::summary($db,$a);
        if(empty($summary['complete']))
            self::fail('Os documentos obrigatórios precisam estar completos',422);
        $profile=$db->one("SELECT legal_type,legal_name,document_digest,document_last4
            FROM argus_account_identities WHERE owner_type='portal' AND owner_id=?",[$accountId]);
        if(!$profile||$profile['legal_type']!=='PF'||
           !hash_equals((string)$a['document_digest'],(string)$profile['document_digest'])||
           !hash_equals((string)$a['document_last4'],(string)$profile['document_last4'])||
           trim((string)$a['display_name'])!==trim((string)$profile['legal_name']))
            self::fail('CPF ou nome diverge da identidade protegida do cadastro',409);
        self::install($db);
        $merchantId='pfm_'.bin2hex(random_bytes(16));
        $reviewId='pfa_'.bin2hex(random_bytes(16));
        $stamp=Database::stamp();
        $db->transaction(static function(Database $db)use($a,$accountId,$actor,$reason,$merchantId,$reviewId,$stamp){
            $row=$db->run("UPDATE argus_portal_accounts
                SET status='approved',merchant_id=?,updated_at=?
                WHERE id=? AND account_type='PF' AND status='identity_verified' AND merchant_id IS NULL",
                [$merchantId,$stamp,$accountId]);
            if($row->rowCount()!==1)
                throw new ApiError('Cadastro alterado por outro analista. Atualize a Central KYC.',409);
            $db->run("INSERT INTO argus_pf_wallet_merchants
                (id,account_id,cpf_digest,legal_name,status,approved_at,reviewer_id)
                VALUES(?,?,?,?,?,?,?)",[
                $merchantId,$accountId,$a['document_digest'],$a['display_name'],
                'approved_live',$stamp,(string)$actor['id']
            ]);
            $db->run("INSERT INTO argus_pf_financial_audit
                (id,account_id,reviewer_id,decision,reason,created_at)
                VALUES(?,?,?,?,?,?)",[
                $reviewId,$accountId,(string)$actor['id'],'approved',$reason,$stamp
            ]);
        });
        return [
            'ok'=>true,'status'=>'approved',
            'merchant_id'=>$merchantId,
            'authorization'=>'argus_custodial_internal',
            'withdrawals_enabled'=>getenv('ARGUS_PAYOUTS_ENABLED')==='yes',
            'message'=>'Conta financeira CPF autorizada no ARGUS. O recebimento usa a integração central, com carteira individual e todas as verificações da MisticPay ainda obrigatórias.'
        ];
    }
}
