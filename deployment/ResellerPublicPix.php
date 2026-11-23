<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Reseller-owned, white-label ARGUS Pay checkout.
 *
 * Each /e/{random 128-bit code} is mapped to one portal account. Customer
 * funds flow ONLY through MerchantWallet::create and its immutable fee snapshot,
 * verified PSP reconciliation and segregated seller ledger. Nothing in this
 * class can initiate a payout, move funds or mark a charge paid.
 */
final class ResellerPublicPix {
    private const MAX_GROSS=10000; // PSP R$100 maximum including service fee
    private const ID='[a-f0-9]{32}';
    private static function fail(string $message,int $status=422):never {
        throw new ApiError($message,$status);
    }
    private static function response(array $data,int $status=200):never {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        exit;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_reseller_public_links (
            account_id VARCHAR(64) PRIMARY KEY,
            public_code VARCHAR(32) NOT NULL UNIQUE,
            created_at VARCHAR(32) NOT NULL
        )");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_reseller_public_attempts (
            account_id VARCHAR(64) NOT NULL,
            idem_hash VARCHAR(64) NOT NULL,
            body_hash VARCHAR(64) NOT NULL,
            receipt_hash VARCHAR(64) NOT NULL,
            policy_version INTEGER NOT NULL,
            base_amount_cents INTEGER NOT NULL,
            gross_amount_cents INTEGER NOT NULL,
            charge_id VARCHAR(80),
            created_at VARCHAR(32) NOT NULL,
            PRIMARY KEY(account_id,idem_hash)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_reseller_public_charge_idx
            ON argus_reseller_public_attempts(account_id,charge_id)");
    }
    /** Stable link, generated even before account is enabled, never made from
     * email, document number, merchant ID or easily enumerable sequence. */
    public static function linkForAccount(Database $db,string $accountId):string {
        self::install($db);
        if(!preg_match('/^[a-f0-9]{32}$/D',$accountId))
            self::fail('Conta de revendedor inválida',404);
        $existing=$db->one('SELECT public_code FROM argus_reseller_public_links WHERE account_id=?',[$accountId]);
        if($existing)return (string)$existing['public_code'];
        $exists=$db->one('SELECT id FROM argus_portal_accounts WHERE id=?',[$accountId]);
        if(!$exists)self::fail('Conta não encontrada',404);
        for($attempt=0;$attempt<4;$attempt++){
            $code=bin2hex(random_bytes(16));
            try{
                $db->run('INSERT INTO argus_reseller_public_links (account_id,public_code,created_at)
                    VALUES (?,?,?)',[$accountId,$code,Database::stamp()]);
                return $code;
            }catch(\PDOException $e){
                $taken=$db->one('SELECT public_code FROM argus_reseller_public_links WHERE account_id=?',[$accountId]);
                if($taken)return (string)$taken['public_code'];
                if($attempt===3)throw $e;
            }
        }
        self::fail('Não foi possível disponibilizar o link público',503);
    }
    /** Existing accounts are assigned permanent URLs in small batches by the
     * server worker; new registrations are assigned immediately. This never
     * enables a pending account or exposes a personal identifier in the URL. */
    public static function seedExisting(Database $db,int $batch=100):int {
        self::install($db);
        $limit=max(1,min(200,$batch));
        $rows=$db->all("SELECT a.id FROM argus_portal_accounts a
            LEFT JOIN argus_reseller_public_links l ON l.account_id=a.id
            WHERE l.account_id IS NULL ORDER BY a.created_at ASC LIMIT ".$limit);
        $count=0;
        foreach($rows as $row){
            try{
                self::linkForAccount($db,(string)$row['id']);
                $count++;
            }catch(\Throwable $e){
                error_log('ARGUS_PUBLIC_RESELLER_BACKFILL error_class='.get_class($e));
            }
        }
        return $count;
    }
    public static function myLink(Database $db,array $account):array {
        $code=self::linkForAccount($db,(string)$account['id']);
        $readiness=self::readiness($db,$account);
        return [
            'public_code'=>$code,
            'public_path'=>'/e/'.$code,
            'available'=>$readiness['can_generate'],
            'business_name'=>mb_substr((string)$account['display_name'],0,90),
            'message'=>$readiness['availability_message']
        ];
    }
    private static function accountByCode(Database $db,string $code):array {
        if(!preg_match('/^'.self::ID.'$/D',$code))self::fail('Página de pagamento não encontrada',404);
        self::install($db);
        $account=$db->one('SELECT a.* FROM argus_portal_accounts a
            JOIN argus_reseller_public_links l ON l.account_id=a.id
            WHERE l.public_code=?',[$code]);
        if(!$account)self::fail('Página de pagamento não encontrada',404);
        return $account;
    }
    /**
     * Use the SAME financial authorization as MerchantWallet, including
     * independently approved CPF (PF) and CNPJ (PJ) seller wallets.
     * Never allow a public Pix when the custody/PSP prerequisites are off.
     * Public responses contain only ARGUS Pay availability, never PSP names,
     * keys, internal account IDs, or sensitive KYC details.
     */
    private static function readiness(Database $db,array $account):array {
        $fail=static fn(string $code,string $message):array=>[
            'can_generate'=>false,'availability_code'=>$code,
            'availability_message'=>$message
        ];
        if(($account['status']??'')!=='approved'||empty($account['merchant_id']))
            return $fail('account_review','Esta página aguardará a aprovação financeira do revendedor pela ARGUS Pay.');
        try {
            if(!KycStudio::identityApproved($db,(string)$account['id']))
                return $fail('account_review','O recebimento deste revendedor ainda aguarda aprovação da ARGUS Pay.');
            if(!PfFinancialApproval::authorized($db,$account))
                return $fail('account_review','O recebimento deste revendedor ainda aguarda liberação financeira da ARGUS Pay.');
        }catch(\Throwable $e){
            error_log('ARGUS_PUBLIC_PIX_AUTH_CHECK_UNAVAILABLE class='.get_class($e));
            return $fail('temporary_unavailable','Não foi possível confirmar a liberação desta conta. Tente novamente.');
        }
        $offline=PHP_SAPI==='cli'&&getenv('ARGUS_MERCHANT_UNIT_TEST')==='local-sqlite-only';
        if((!in_array($db->driver(),['pgsql','mysql'],true)&&!$offline)||
           getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')!=='yes'||
           getenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED')!=='yes')
            return $fail('platform_not_ready','Recebimentos Pix temporariamente indisponíveis na ARGUS Pay. O administrador precisa concluir a habilitação da operação.');
        // Traditional admin Pix supports the FINANCE_QR pair as fallback; the
        // seller wallet now follows that exact precedence too. No keys ever
        // leave the server or appear in this endpoint.
        $id=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID')?:getenv('ARGUS_FINANCE_QR_CLIENT_ID')?:''));
        $secret=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')?:getenv('ARGUS_FINANCE_QR_CLIENT_SECRET')?:''));
        if(!preg_match('/^pk_[A-Za-z0-9_-]{8,}$/D',$id)||
           !preg_match('/^sk_[A-Za-z0-9_-]{8,}$/D',$secret)||
           !function_exists('curl_init')&&!$offline)
            return $fail('platform_not_ready','O serviço de recebimento Pix da ARGUS Pay está em configuração. Tente novamente mais tarde.');
        return ['can_generate'=>true,'availability_code'=>'ready',
            'availability_message'=>'Recebimento Pix disponível nesta página da ARGUS Pay.'];
    }
    private static function accountReady(Database $db,array $account):bool {
        return self::readiness($db,$account)['can_generate'];
    }
    /** The payer enters a desired seller amount. Minimal gross Pix is
     * computed from the live admin deposit fee table so seller net >= base
     * even if a percentage rate is later configured. */
    public static function quote(Database $db,int $base):array {
        if($base<100||$base>self::MAX_GROSS)
            self::fail('Informe um valor de R$ 1,00 até R$ 100,00',422);
        SellerFeeSplit::bootstrapPolicy($db);
        $p=FeePolicy::current($db);
        $fixed=(int)$p['mistic_deposit_cents']+(int)$p['argus_deposit_fixed_cents'];
        $bps=(int)$p['argus_deposit_bps'];
        $netAt=static fn(int $gross):int=>$gross-$fixed-
            (int)round($gross*$bps/10000,0,PHP_ROUND_HALF_UP);
        if($netAt(self::MAX_GROSS)<$base)
            self::fail('O valor com a taxa excede o limite de R$ 100,00 por Pix',422);
        $lo=$base;$hi=self::MAX_GROSS;
        while($lo<$hi){
            $mid=intdiv($lo+$hi,2);
            if($netAt($mid)>=$base)$hi=$mid;else $lo=$mid+1;
        }
        $fee=SellerFeeSplit::quote($db,'deposit',$lo);
        if((int)$fee['policy_version']!==(int)$p['version'])
            self::fail('A tabela de tarifas foi alterada. Consulte novamente.',409);
        if($fee['net_cents']<$base||$fee['gross_cents']>self::MAX_GROSS||
           $fee['total_fee_cents']!==(int)$fee['provider_fee_cents']+(int)$fee['argus_fee_cents'])
            self::fail('Cotação de tarifa inconsistente',409);
        return [
            'base_amount_cents'=>$base,
            'total_amount_cents'=>(int)$fee['gross_cents'],
            'service_fee_cents'=>(int)$fee['total_fee_cents'],
            'seller_expected_net_cents'=>(int)$fee['net_cents'],
            'policy_version'=>(int)$fee['policy_version'],
            'currency'=>'BRL','payment_platform'=>'ARGUS Pay'
        ];
    }
    private static function browserOrigin():void {
        $origin=(string)($_SERVER['HTTP_ORIGIN']??'');
        $host=strtolower((string)($_SERVER['HTTP_HOST']??''));
        $parts=parse_url($origin);
        if(!is_array($parts)||!isset($parts['host'],$parts['scheme'])||
           strtolower((string)$parts['host'])!==explode(':',$host)[0]||
           (strtolower((string)$parts['scheme'])!=='https'&&
            strtolower((string)$parts['host'])!=='localhost'))
            self::fail('Origem não autorizada',403);
        $site=(string)($_SERVER['HTTP_SEC_FETCH_SITE']??'');
        if($site!==''&&!in_array($site,['same-origin','none'],true))
            self::fail('Requisição não autorizada',403);
    }
    private static function body():array {
        if((int)($_SERVER['CONTENT_LENGTH']??0)>3000)self::fail('Solicitação muito grande',413);
        $bytes=file_get_contents('php://input',false,null,0,3001);
        if(!is_string($bytes)||strlen($bytes)>3000)self::fail('Solicitação muito grande',413);
        try{$json=json_decode($bytes,true,16,JSON_THROW_ON_ERROR);}
        catch(\JsonException){self::fail('JSON inválido',400);}
        if(!is_array($json)||array_is_list($json))self::fail('Dados inválidos',422);
        return $json;
    }
    private static function attempt(Database $db,string $account,string $idem):?array {
        return $db->one('SELECT * FROM argus_reseller_public_attempts WHERE account_id=? AND idem_hash=?',
            [$account,$idem]);
    }
    private static function accountCharge(Database $db,string $accountId,string $idem):?array {
        return $db->one('SELECT * FROM argus_seller_charges WHERE account_id=? AND idem_hash=?',
            [$accountId,$idem]);
    }
    private static function display(array $charge,array $attempt):array {
        $created=strtotime((string)$charge['created_at'].' UTC');
        $expiry=$created===false?0:$created+1800;
        $status=(string)$charge['status'];
        $display=in_array($status,['paid','failed','refunded','cancelled'],true)?$status:
            ($expiry>0&&time()>=$expiry?'expired':$status);
        return [
            'id'=>(string)$charge['id'],
            'base_amount_cents'=>(int)$attempt['base_amount_cents'],
            'service_fee_cents'=>(int)$charge['service_fee_cents'],
            'total_amount_cents'=>(int)$charge['amount_cents'],
            'seller_expected_net_cents'=>(int)$charge['net_cents'],
            'policy_version'=>(int)$attempt['policy_version'],
            'status'=>$status,'display_status'=>$display,
            'pix_copy_paste'=>$display==='pending'?(string)($charge['copy_paste']??''):null,
            'expires_at_epoch'=>$expiry,
            'receipt_is_provider_settled'=>$status==='paid'
        ];
    }
    private static function receipt(Database $db,array $account,string $id,string $token):array {
        if(!preg_match('/^mwc_[a-f0-9]{32}$/D',$id)||
           !preg_match('/^[a-f0-9]{64}$/D',$token))
            self::fail('Comprovante não encontrado',404);
        $attempt=$db->one('SELECT * FROM argus_reseller_public_attempts
           WHERE account_id=? AND charge_id=?',[$account['id'],$id]);
        if(!$attempt||!hash_equals((string)$attempt['receipt_hash'],hash('sha256',$token)))
            self::fail('Comprovante não encontrado',404);
        $charge=$db->one('SELECT * FROM argus_seller_charges WHERE id=? AND account_id=?',
            [$id,$account['id']]);
        if(!$charge)self::fail('Comprovante não encontrado',404);
        return ['attempt'=>$attempt,'charge'=>$charge];
    }
    private static function rate(Database $db,string $code):void {
        SecurityShield::rate($db,'reseller_public_create_'.$code,SecurityShield::remoteTag(),8,600);
    }
    public static function handle(Database $db,string $method,string $path):never {
        if(!preg_match('~^/e/([a-f0-9]{32})/(config|quote|create|status)$~D',$path,$m))
            self::fail('Página não encontrada',404);
        $code=$m[1];$action=$m[2];
        if(($action==='config'||$action==='quote')&&$method!=='GET')
            self::fail('Método não permitido',405);
        if(($action==='create'||$action==='status')&&$method!=='POST')
            self::fail('Método não permitido',405);
        $account=self::accountByCode($db,$code);
        if($action==='config'){
            self::response([
                'business_name'=>mb_substr((string)$account['display_name'],0,90),
                ...self::readiness($db,$account),
                'payment_platform'=>'ARGUS Pay'
            ]);
        }
        if($action==='quote'){
            $base=filter_var($_GET['amount_cents']??null,FILTER_VALIDATE_INT);
            if(!is_int($base))self::fail('Valor inválido');
            $readiness=self::readiness($db,$account);
            self::response(['quote'=>self::quote($db,$base),...$readiness]);
        }
        self::browserOrigin();
        self::install($db);
        $data=self::body();
        if($action==='create'){
            if(!self::accountReady($db,$account))
                self::fail('Recebimentos ainda não disponíveis para esta conta ARGUS Pay',403);
            $base=$data['amount_cents']??null;
            if(!is_int($base))self::fail('Informe o valor em centavos');
            $q=self::quote($db,$base);
            if(!is_int($data['policy_version']??null)||
               (int)$q['policy_version']!==$data['policy_version'])
                self::fail('A taxa foi atualizada. Confira o total antes de gerar o Pix.',409);
            $name=trim((string)($data['payer_name']??''));
            $doc=preg_replace('/\D/','',(string)($data['payer_document']??''));
            if(mb_strlen($name)<3||mb_strlen($name)>120||
               !(strlen($doc)===11&&TraditionalQuickPix::cpfValid($doc))&&
               !(strlen($doc)===14&&IdentityProfile::validCnpj($doc)))
                self::fail('Informe nome e CPF/CNPJ válidos do pagador',422);
            $idem=(string)($data['idempotency_key']??'');
            $receipt=(string)($data['receipt_token']??'');
            if(!preg_match('/^[a-f0-9-]{36}$/iD',$idem)||
               !preg_match('/^[a-f0-9]{64}$/D',$receipt))
                self::fail('Identificação da solicitação inválida',422);
            $idemHash=hash('sha256','public:'.$code.':'.$idem);
            $bodyHash=hash('sha256',json_encode([$q['base_amount_cents'],
                $q['total_amount_cents'],$q['policy_version'],$name,$doc],JSON_THROW_ON_ERROR));
            $accountId=(string)$account['id'];
            $prior=self::attempt($db,$accountId,$idemHash);
            if($prior){
                if(!hash_equals((string)$prior['body_hash'],$bodyHash)||
                   !hash_equals((string)$prior['receipt_hash'],hash('sha256',$receipt)))
                    self::fail('A solicitação não pode ser reutilizada com outros dados',409);
            }else{
                self::rate($db,$code);
                try{
                    $db->run('INSERT INTO argus_reseller_public_attempts
                        (account_id,idem_hash,body_hash,receipt_hash,policy_version,
                         base_amount_cents,gross_amount_cents,created_at)
                        VALUES (?,?,?,?,?,?,?,?)',[
                        $accountId,$idemHash,$bodyHash,hash('sha256',$receipt),
                        $q['policy_version'],$base,$q['total_amount_cents'],Database::stamp()
                    ]);
                }catch(\PDOException){
                    $prior=self::attempt($db,$accountId,$idemHash);
                    if(!$prior||!hash_equals((string)$prior['body_hash'],$bodyHash)||
                       !hash_equals((string)$prior['receipt_hash'],hash('sha256',$receipt)))
                        self::fail('Cobrança já registrada. Consulte antes de repetir.',409);
                }
            }
            $dataForWallet=[
                'amount_cents'=>(int)$q['total_amount_cents'],
                'fee_version'=>(int)$q['policy_version'],
                'payer_name'=>$name,'payer_document'=>$doc,
                'payer_mode'=>'customer',
                'description'=>'Pagamento público ARGUS Pay'
            ];
            $result=MerchantWallet::create($db,$account,$dataForWallet,$idemHash);
            $db->run('UPDATE argus_reseller_public_attempts SET charge_id=?
                WHERE account_id=? AND idem_hash=? AND (charge_id IS NULL OR charge_id=?)',[
                $result['id'],$accountId,$idemHash,$result['id']
            ]);
            $receiptData=self::receipt($db,$account,(string)$result['id'],$receipt);
            self::response(['charge'=>self::display($receiptData['charge'],$receiptData['attempt'])],201);
        }
        $id=(string)($data['id']??'');
        $token=(string)($data['receipt_token']??'');
        $found=self::receipt($db,$account,$id,$token);
        $charge=$found['charge'];
        if(in_array($charge['status'],['pending','unknown'],true)&&
           str_starts_with((string)($charge['provider_id']??''),'tr_')){
            $expiry=strtotime((string)$charge['created_at'].' UTC');
            $seconds=$expiry!==false&&time()-$expiry<1800?10:180;
            $stale=gmdate('Y-m-d H:i:s',time()-$seconds);
            $claimed=$db->run("UPDATE argus_seller_charges SET checked_at=?
                WHERE id=? AND account_id=? AND status IN ('pending','unknown')
                  AND (checked_at IS NULL OR checked_at<=?)",[
                Database::stamp(),$id,$account['id'],$stale
            ]);
            if($claimed->rowCount()===1){
                try{
                    MerchantWallet::reconcile($db,$id,(string)$account['id']);
                }catch(\Throwable $e){
                    error_log('ARGUS_PUBLIC_SELLER_PIX_CHECK account='.substr($account['id'],0,6).
                        ' error_class='.get_class($e));
                }
            }
            $charge=self::receipt($db,$account,$id,$token)['charge'];
        }
        self::response(['charge'=>self::display($charge,$found['attempt'])]);
    }
}
