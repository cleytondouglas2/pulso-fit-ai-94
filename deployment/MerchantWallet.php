<?php
declare(strict_types=1);
namespace ArgusPayments;

use ArgusPayments\Integrations\MisticPayPayout;

/**
 * Isolated seller wallet. Only authenticated PSP-confirmed deposits into the
 * ARGUS custody account may credit it. Merchant KYC + operating permissions
 * and an explicit custody-account attestation are required. No split payment
 * ever funds this ledger. Customer-facing fee: R$1 per confirmed deposit or
 * requested withdrawal. PSP costs belong to ARGUS, not charged again.
 */
final class MerchantWallet {
    private const FEE=100;
    private const API_ROOT='https://api.misticpay.com/api';
    private static function fail(string $m,int $s=422):never{throw new ApiError($m,$s);}
    private static function out(array $v,int $s=200):never{
        http_response_code($s);header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');header('X-Content-Type-Options: nosniff');
        echo json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
    }
    private static function now():string{return Database::stamp();}
    private static function uid(string $prefix):string{return $prefix.'_'.bin2hex(random_bytes(16));}
    private static function enabled(Database $db,bool $forPayout=false):void{
        $isolatedUnitTest=PHP_SAPI==='cli'&&getenv('ARGUS_MERCHANT_UNIT_TEST')==='local-sqlite-only';
        if(!in_array($db->driver(),['pgsql','mysql'],true)&&!$isolatedUnitTest)self::fail('Banco financeiro persistente indisponível',503);
        if(getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')!=='yes'||
           getenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED')!=='yes')
            self::fail('Carteira financeira de revendedores aguardando homologação da conta de custódia na MisticPay',503);
        if($forPayout&&getenv('ARGUS_PAYOUTS_ENABLED')!=='yes')self::fail('Processamento de saques indisponível',503);
    }
    public static function install(Database $db):void{
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_seller_wallets (
            account_id VARCHAR(64) PRIMARY KEY,merchant_id VARCHAR(120) NOT NULL,
            available_cents BIGINT NOT NULL DEFAULT 0,
            held_cents BIGINT NOT NULL DEFAULT 0,
            debt_cents BIGINT NOT NULL DEFAULT 0,
            updated_at VARCHAR(32) NOT NULL
        )");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_seller_charges (
            id VARCHAR(80) PRIMARY KEY,account_id VARCHAR(64) NOT NULL,
            merchant_id VARCHAR(120) NOT NULL,
            idem_hash VARCHAR(64) NOT NULL,body_hash VARCHAR(64) NOT NULL,
            amount_cents BIGINT NOT NULL,service_fee_cents INTEGER NOT NULL,
            net_cents BIGINT NOT NULL,description VARCHAR(160) NOT NULL,
            provider_id VARCHAR(130),copy_paste TEXT,
            status VARCHAR(24) NOT NULL,created_at VARCHAR(32) NOT NULL,
            checked_at VARCHAR(32),UNIQUE(account_id,idem_hash)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_seller_charges_pending_idx
            ON argus_seller_charges(status,checked_at)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_seller_withdrawals (
            id VARCHAR(80) PRIMARY KEY,account_id VARCHAR(64) NOT NULL,
            idem_hash VARCHAR(64) NOT NULL,body_hash VARCHAR(64) NOT NULL,
            amount_cents BIGINT NOT NULL,service_fee_cents INTEGER NOT NULL,
            debit_cents BIGINT NOT NULL,pix_key_type VARCHAR(24) NOT NULL,
            pix_key_masked VARCHAR(120) NOT NULL,pix_key_encrypted TEXT NOT NULL,
            description VARCHAR(120) NOT NULL,
            provider_tx_id VARCHAR(130),provider_job_id VARCHAR(130),
            status VARCHAR(24) NOT NULL,created_at VARCHAR(32) NOT NULL,
            checked_at VARCHAR(32),UNIQUE(account_id,idem_hash)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_seller_withdrawals_pending_idx
            ON argus_seller_withdrawals(status,checked_at)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_seller_ledger (
            id VARCHAR(80) PRIMARY KEY,account_id VARCHAR(64) NOT NULL,
            operation_kind VARCHAR(32) NOT NULL,operation_id VARCHAR(80) NOT NULL,
            delta_available BIGINT NOT NULL,delta_held BIGINT NOT NULL,
            delta_debt BIGINT NOT NULL,service_fee_cents BIGINT NOT NULL,
            created_at VARCHAR(32) NOT NULL,UNIQUE(operation_kind,operation_id)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_seller_ledger_account_idx
            ON argus_seller_ledger(account_id,created_at)");
    }
    private static function wallet(Database $db,array $account):array{
        self::install($db);
        $id=(string)$account['id'];$merchant=(string)($account['merchant_id']??'');
        if($merchant==='')self::fail('Cadastro financeiro ainda não autorizado',403);
        $db->run('INSERT INTO argus_seller_wallets(account_id,merchant_id,available_cents,held_cents,debt_cents,updated_at)
            VALUES(?,?,?,?,?,?) ON CONFLICT(account_id) DO NOTHING',[$id,$merchant,0,0,0,self::now()]);
        $w=$db->one('SELECT * FROM argus_seller_wallets WHERE account_id=?',[$id]);
        if(!$w||!hash_equals((string)$w['merchant_id'],$merchant))
            self::fail('Inconsistência no vínculo financeiro da conta',409);
        return $w;
    }
    private static function lock(Database $db,string $id):array{
        $sql='SELECT * FROM argus_seller_wallets WHERE account_id=?';
        if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
        $w=$db->one($sql,[$id]);if(!$w)self::fail('Carteira não encontrada',404);
        return $w;
    }
    private static function account(Database $db,array $key):array{
        $account=$db->one('SELECT a.* FROM argus_portal_accounts a WHERE a.id=?',[$key['account_id']]);
        if(!$account||$account['status']!=='approved'||empty($account['merchant_id'])||
           $account['merchant_id']!==$key['merchant_id'])
            self::fail('Conta financeira não autorizada',403);
        $m=$db->one("SELECT id,status FROM b2b_merchants WHERE id=? AND status='approved_live'",[$account['merchant_id']]);
        if(!$m||!KycStudio::identityApproved($db,(string)$account['id']))
            self::fail('Aguardando aprovação documental e financeira',403);
        return $account;
    }
    private static function auth(Database $db,bool $requireWithdrawScope=false):array{
        $public=(string)($_SERVER['HTTP_X_ARGUS_KEY']??'');
        $secret=(string)($_SERVER['HTTP_X_ARGUS_SECRET']??'');
        if(!preg_match('/^agp_live_[a-f0-9]{24}$/D',$public)||
           !preg_match('/^ags_live_[a-f0-9]{64}$/D',$secret))
            self::fail('Informe X-Argus-Key e X-Argus-Secret no servidor',401);
        $key=$db->one('SELECT * FROM argus_portal_keys WHERE public_key=? AND revoked_at IS NULL',[$public]);
        if(!$key||!hash_equals((string)$key['secret_hash'],hash('sha256',$secret)))
            self::fail('Chave de integração inválida ou revogada',401);
        // A compromised checkout key must not silently become a payout key.
        // The SELLER explicitly opts into withdrawals when issuing this pair.
        // Old credentials are read/charge-only until the seller rotates them.
        if($requireWithdrawScope){
            $permission=$db->one('SELECT allow_withdrawal FROM argus_portal_key_permissions
                WHERE key_id=? AND account_id=?',[$key['id'],$key['account_id']]);
            if(!$permission||(int)$permission['allow_withdrawal']!==1)
                self::fail('Esta chave não autoriza saques. Gere um novo par com permissão de saque na sua conta',403);
        }
        return self::account($db,$key);
    }
    private static function body():array{
        if((int)($_SERVER['CONTENT_LENGTH']??0)>12000)self::fail('Requisição muito grande',413);
        $raw=file_get_contents('php://input',false,null,0,12001);
        if(!is_string($raw)||strlen($raw)>12000)self::fail('Requisição muito grande',413);
        try{$v=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}
        catch(\JsonException){self::fail('JSON inválido',400);}
        if(!is_array($v)||array_is_list($v))self::fail('Objeto JSON obrigatório');
        return $v;
    }
    private static function providerIdempotency(string $id):string{
        // Deterministic UUID v4 shape derived from our persistent operation ID.
        $hex=substr(hash('sha256',$id),0,32);
        return substr($hex,0,8).'-'.substr($hex,8,4).'-4'.substr($hex,13,3).
            '-8'.substr($hex,17,3).'-'.substr($hex,20,12);
    }
    private static function idem():string{
        $raw=$_SERVER['HTTP_IDEMPOTENCY_KEY']??null;
        if(!is_string($raw)||!preg_match('/^[A-Za-z0-9._:-]{16,110}$/D',$raw))
            self::fail('Cabeçalho Idempotency-Key obrigatório (16 a 110 caracteres)',422);
        return hash('sha256',$raw);
    }
    private static function provider(string $route,array $payload,?string $idem=null):array{
        if(!in_array($route,['/transactions/create','/transactions/check'],true))
            self::fail('Operação do provedor inválida',403);
        $pk=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID')?:getenv('ARGUS_FINANCE_QR_CLIENT_ID')?:''));
        $sk=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')?:getenv('ARGUS_FINANCE_QR_CLIENT_SECRET')?:''));
        if(!preg_match('/^pk_[A-Za-z0-9_-]{8,}$/D',$pk)||
           !preg_match('/^sk_[A-Za-z0-9_-]{8,}$/D',$sk))
            self::fail('Credenciais de cobrança do provedor indisponíveis',503);
        if(!function_exists('curl_init'))self::fail('Conexão financeira indisponível',503);
        $headers=['Accept: application/json','Content-Type: application/json'];
        if($idem!==null)$headers[]='X-Idempotency-Key: '.$idem;
        $ch=curl_init(self::API_ROOT.$route);
        curl_setopt_array($ch,[
            CURLOPT_RETURNTRANSFER=>true,CURLOPT_USERPWD=>$pk.':'.$sk,
            CURLOPT_HTTPAUTH=>CURLAUTH_BASIC,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>12,
            CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
            CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,
            CURLOPT_POST=>true,CURLOPT_HTTPHEADER=>$headers,
            CURLOPT_POSTFIELDS=>json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)
        ]);
        $text=curl_exec($ch);$http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
        curl_close($ch);
        if(!is_string($text)||$http<200||$http>=300||strlen($text)>400000){
            // HTTP code only; never log provider body, Pix payload or secrets.
            error_log('ARGUS PSP Pix request failed: route='.$route.' http='.$http.' response='.(is_string($text)?'received':'transport_failure'));
            self::fail('Operação não confirmada pelo provedor. Consulte o protocolo antes de tentar novamente.',503);
        }
        $data=json_decode($text,true);
        if(!is_array($data))self::fail('Resposta financeira inválida',503);
        return $data;
    }
    private static function chargePublic(array $row):array{
        $state=(string)$row['status'];$expires=strtotime($row['created_at'].' UTC')+1800;
        return [
            'id'=>$row['id'],'amount_cents'=>(int)$row['amount_cents'],
            'service_fee_cents'=>(int)$row['service_fee_cents'],
            'net_cents'=>(int)$row['net_cents'],'status'=>$state,
            'display_status'=>$state==='pending'&&time()>=$expires?'expired':$state,
            'expires_at'=>gmdate('c',$expires),
            'pix_copy_paste'=>time()<$expires&&$state!=='failed'?$row['copy_paste']:null,
            'created_at'=>$row['created_at']
        ];
    }
    private static function balancePublic(Database $db,array $a):array{
        $w=self::wallet($db,$a);
        return [
            'currency'=>'BRL','available_cents'=>(int)$w['available_cents'],
            'reserved_cents'=>(int)$w['held_cents'],
            'negative_adjustments_cents'=>(int)$w['debt_cents'],
            'service_fee_deposit_cents'=>self::FEE,'service_fee_withdraw_cents'=>self::FEE,
            'deposits_enabled'=>getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')==='yes'&&
                getenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED')==='yes',
            'withdrawals_enabled'=>getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')==='yes'&&
                getenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED')==='yes'&&
                getenv('ARGUS_PAYOUTS_ENABLED')==='yes',
            'notice'=>'Saldo exclusivo de vendas Pix confirmadas da sua conta. Transferências pendentes ficam reservadas.'
        ];
    }
    /**
     * Use the account's verified name and CPF/CNPJ only when the seller is
     * explicitly paying their own Pix. For a customer checkout, real buyer
     * fields remain mandatory. Never represent a third party as this seller.
     */
    private static function payerDetails(Database $db,array $account,array $data):array{
        $mode=$data['payer_mode']??'customer';
        if($mode==='registered_seller'){
            if(($data['seller_is_payer']??false)!==true)
                self::fail('Confirme que o revendedor cadastrado é quem vai pagar este Pix',422);
            if(array_key_exists('payer_name',$data)||array_key_exists('payer_document',$data))
                self::fail('Use apenas o cadastro verificado ao selecionar o titular como pagador',422);
            $identity=IdentityProfile::sellerForPayout($db,$account);
            $data['payer_name']=$identity['legal_name'];
            $data['payer_document']=$identity['document_number'];
        }elseif($mode!=='customer'||array_key_exists('seller_is_payer',$data)){
            self::fail('Modo de pagador inválido; informe o pagador real da compra',422);
        }
        return $data;
    }
    public static function create(Database $db,array $account,array $data,string $idem):array{
        self::enabled($db);
        if(($account['status']??'')!=='approved'||!KycStudio::identityApproved($db,(string)$account['id']))
            self::fail('Cadastro documental não autorizado a receber',403);
        $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",[(string)($account['merchant_id']??'')]);
        if(!$merchant)self::fail('Conta financeira não autorizada a receber',403);
        $w=self::wallet($db,$account);
        // Preflight before recording a charge: missing credentials cannot have reached PSP.
        $pk=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID')?:''));
        $sk=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')?:''));
        if(!preg_match('/^pk_[A-Za-z0-9_-]{8,}$/D',$pk)||!preg_match('/^sk_[A-Za-z0-9_-]{8,}$/D',$sk))
            self::fail('Credenciais Pix da MisticPay não configuradas. Contate o administrador.',503);
        if(!function_exists('curl_init'))self::fail('Conexão Pix indisponível',503);
        $data=self::payerDetails($db,$account,$data);
        $gross=$data['amount_cents']??null;
        if(!is_int($gross)||$gross<100||$gross>10000)self::fail('Valor Pix permitido: R$ 1 a R$ 100',422);
        $name=trim((string)($data['payer_name']??''));
        $doc=preg_replace('/\D/','',(string)($data['payer_document']??''));
        $desc=trim((string)($data['description']??'Pagamento de produto ou serviço'));
        if(mb_strlen($desc)<3||mb_strlen($desc)>120)self::fail('Descrição da venda inválida');
        if(!is_string($name)||mb_strlen($name)<3||mb_strlen($name)>120)self::fail('Nome do pagador obrigatório');
        if(!(strlen($doc)===11&&TraditionalQuickPix::cpfValid($doc))&&
           !(strlen($doc)===14&&IdentityProfile::validCnpj($doc)))
            self::fail('Documento válido do pagador é obrigatório');
        if(!preg_match('/^[a-f0-9]{64}$/D',$idem))self::fail('Idempotência inválida',422);
        $bodyHash=hash('sha256',json_encode([$gross,$name,$doc,$desc],JSON_THROW_ON_ERROR));
        $accountId=(string)$account['id'];
        $existing=$db->one('SELECT * FROM argus_seller_charges WHERE account_id=? AND idem_hash=?',[$accountId,$idem]);
        if($existing){
            if(!hash_equals((string)$existing['body_hash'],$bodyHash))
                self::fail('Chave de idempotência usada com dados diferentes',409);
            return self::chargePublic($existing);
        }
        $id=self::uid('mwc');
        $db->run('INSERT INTO argus_seller_charges
            (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,
            net_cents,description,provider_id,copy_paste,status,created_at,checked_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
            $id,$accountId,$account['merchant_id'],$idem,$bodyHash,$gross,self::FEE,
            max(0,$gross-self::FEE),$desc,null,null,'creating',self::now(),null
        ]);
        try{
            $payload=TraditionalQuickPix::createBody($gross,$name,$doc,
                'qpx_'.substr($id,4),$desc);
            // Externally stable idempotency; never repeat on an uncertain result.
            $r=self::provider('/transactions/create',$payload,self::providerIdempotency($id));
            $created=TraditionalQuickPix::readCreated($r);
            if(($created['status']??'')==='paid')$created['status']='pending';
            $db->run("UPDATE argus_seller_charges SET provider_id=?,copy_paste=?,status=?,checked_at=?
                WHERE id=? AND status='creating'",[
                $created['provider_id'],$created['copy'],$created['status'],self::now(),$id
            ]);
        }catch(\Throwable $e){
            $db->run("UPDATE argus_seller_charges SET status='unknown',checked_at=?
                WHERE id=? AND status='creating'",[self::now(),$id]);
            // Only log a sanitized category; never log credentials, payer data or PSP body.
            $category=$e instanceof ApiError?'provider_or_credentials':($e instanceof \RuntimeException?'provider_response':'unexpected');
            error_log('ARGUS merchant Pix create uncertain: '.$category.' '.get_class($e));
        }
        return self::chargePublic($db->one('SELECT * FROM argus_seller_charges WHERE id=?',[$id]));
    }
    private static function journal(Database $db,string $account,string $kind,string $op,
                                    int $available,int $held,int $debt,int $fee):void{
        $db->run('INSERT INTO argus_seller_ledger(id,account_id,operation_kind,operation_id,
            delta_available,delta_held,delta_debt,service_fee_cents,created_at)
            VALUES(?,?,?,?,?,?,?,?,?)',[
            self::uid('mwl'),$account,$kind,$op,$available,$held,$debt,$fee,self::now()
        ]);
    }
    /** Only invoked after a verified MisticPay status query. No public endpoint can call it. */
    private static function applyVerifiedStatus(Database $db,array $charge,string $state):void{
        $db->transaction(static function(Database $db) use($charge,$state){
            $id=$charge['id'];
            $sql='SELECT * FROM argus_seller_charges WHERE id=?';
            if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
            $row=$db->one($sql,[$id]);if(!$row)return;
            $old=$row['status'];
            if($state==='paid'&&in_array($old,['pending','unknown'],true)){
                $w=self::lock($db,$row['account_id']);
                $net=(int)$row['net_cents'];$debt=(int)$w['debt_cents'];
                $settledDebt=min($net,$debt);$credit=$net-$settledDebt;
                self::journal($db,$row['account_id'],'deposit_paid',$id,$credit,0,-$settledDebt,(int)$row['service_fee_cents']);
                $db->run('UPDATE argus_seller_wallets SET available_cents=available_cents+?,
                    debt_cents=debt_cents-?,updated_at=? WHERE account_id=?',[
                    $credit,$settledDebt,self::now(),$row['account_id']
                ]);
                $db->run("UPDATE argus_seller_charges SET status='paid',checked_at=? WHERE id=?",[
                    self::now(),$id
                ]);
            }elseif($state==='refunded'&&$old==='paid'){
                $w=self::lock($db,$row['account_id']);
                $net=(int)$row['net_cents'];$available=(int)$w['available_cents'];
                $debit=min($available,$net);$debt=$net-$debit;
                self::journal($db,$row['account_id'],'deposit_refund',$id,-$debit,0,$debt,0);
                $db->run('UPDATE argus_seller_wallets SET available_cents=available_cents-?,
                    debt_cents=debt_cents+?,updated_at=? WHERE account_id=?',[
                    $debit,$debt,self::now(),$row['account_id']
                ]);
                $db->run("UPDATE argus_seller_charges SET status='refunded',checked_at=? WHERE id=?",
                    [self::now(),$id]);
            }elseif($old==='pending'||$old==='unknown'){
                $safe=in_array($state,['pending','failed','unknown'],true)?$state:'unknown';
                $db->run('UPDATE argus_seller_charges SET status=?,checked_at=? WHERE id=?',[
                    $safe,self::now(),$id
                ]);
            }else{
                $db->run('UPDATE argus_seller_charges SET checked_at=? WHERE id=?',[self::now(),$id]);
            }
        });
    }
    private static function reconcileOne(Database $db,array $charge):array{
        if(!in_array($charge['status'],['pending','unknown','paid','refunded'],true)||
           !str_starts_with((string)$charge['provider_id'],'tr_'))return $charge;
        $providerId=substr($charge['provider_id'],3);
        if(!preg_match('/^[A-Za-z0-9_.-]{1,110}$/D',$providerId))return $charge;
        $result=self::provider('/transactions/check',['transactionId'=>$providerId]);
        $checked=TraditionalQuickPix::readChecked($result,(int)$charge['amount_cents'],$providerId);
        $state=$checked['status'];
        if($state==='failed'&&$charge['status']==='paid')$state='refunded';
        self::applyVerifiedStatus($db,$charge,$state);
        return $db->one('SELECT * FROM argus_seller_charges WHERE id=?',[$charge['id']]);
    }
    public static function reconcile(Database $db,string $id,?string $accountId=null):array{
        self::install($db);
        $row=$db->one('SELECT * FROM argus_seller_charges WHERE id=?',[$id]);
        if(!$row||($accountId!==null&&$row['account_id']!==$accountId))
            self::fail('Cobrança não encontrada',404);
        if($row['provider_id']&&in_array($row['status'],['pending','unknown','paid'],true))
            return self::reconcileOne($db,$row);
        return $row;
    }
    public static function worker(Database $db):array{
        if(getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')!=='yes'||
           getenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED')!=='yes')
            return ['checked'=>0,'errors'=>0];
        self::install($db);$cutoff=gmdate('Y-m-d H:i:s',time()-7*86400);
        $stale=gmdate('Y-m-d H:i:s',time()-300);
        $rows=$db->all("SELECT * FROM argus_seller_charges
            WHERE status IN ('pending','unknown','paid') AND provider_id IS NOT NULL
            AND created_at>? AND (checked_at IS NULL OR checked_at<?)
            ORDER BY checked_at ASC LIMIT 25",[$cutoff,$stale]);
        $checked=0;$errors=0;
        foreach($rows as $row){
            try{self::reconcileOne($db,$row);$checked++;}
            catch(\Throwable $e){
                $errors++;
                $db->run('UPDATE argus_seller_charges SET checked_at=? WHERE id=?',
                    [self::now(),$row['id']]);
                error_log('ARGUS seller reconcile failed: '.get_class($e));
            }
        }
        try{self::reconcilePayouts($db);}catch(\Throwable $e){$errors++;}
        return ['checked'=>$checked,'errors'=>$errors];
    }
    public static function api(Database $db,string $method,string $path):never{
        $isPayoutSubmit=$method==='POST'&&$path==='/api/v2/wallet/withdrawals';
        $account=self::auth($db,$isPayoutSubmit);
        if($method==='GET'&&$path==='/api/v2/wallet/balance')
            self::out(self::balancePublic($db,$account));
        if($method==='POST'&&$path==='/api/v2/wallet/withdrawals'){
            $input=self::prepareApiWithdraw($db,$account,self::body(),self::idem());
            $withdrawal=self::requestWithdraw($db,$account,$input);
            if($withdrawal['status']==='requested')
                $withdrawal=self::sendWithdraw($db,(string)$withdrawal['id'],(string)$account['id']);
            self::out(['withdrawal'=>$withdrawal,'wallet'=>self::balancePublic($db,$account)],201);
        }
        if($method==='GET'&&$path==='/api/v2/wallet/withdrawals'){
            self::out(['withdrawals'=>self::payouts($db,(string)$account['id'])]);
        }
        if($method==='GET'&&preg_match('~^/api/v2/wallet/withdrawals/(mww_[a-f0-9]{32})$~D',$path,$match)){
            $row=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=? AND account_id=?',
                [$match[1],(string)$account['id']]);
            if(!$row)self::fail('Saque não encontrado nesta carteira',404);
            self::out(['withdrawal'=>self::payoutPublic($row)]);
        }
        if($method==='GET'&&$path==='/api/v2/wallet/transactions'){
            self::install($db);
            self::out(['transactions'=>$db->all(
                'SELECT operation_kind,operation_id,delta_available,delta_held,delta_debt,
                    service_fee_cents,created_at FROM argus_seller_ledger
                    WHERE account_id=? ORDER BY created_at DESC LIMIT 100',[$account['id']])]);
        }
        if($method==='GET'&&$path==='/api/v2/pix/charges'){
            self::install($db);
            $rows=$db->all('SELECT * FROM argus_seller_charges WHERE account_id=?
                ORDER BY created_at DESC LIMIT 100',[$account['id']]);
            self::out(['charges'=>array_map([self::class,'chargePublic'],$rows)]);
        }
        if($method==='POST'&&$path==='/api/v2/pix/charges'){
            self::out(self::create($db,$account,self::body(),self::idem()),201);
        }
        if($method==='GET'&&preg_match('~^/api/v2/pix/charges/(mwc_[a-f0-9]{32})$~D',$path,$m)){
            $row=self::reconcile($db,$m[1],$account['id']);
            self::out(self::chargePublic($row));
        }
        self::fail('Endpoint de integração não encontrado',404);
    }
    /**
     * Payouts requested by a seller's own API keys use the verified CPF/CNPJ
     * registered on that account. The caller CANNOT select another beneficiary,
     * change merchant ownership, or pass a different recipient document.
     * Registered identity is not made public or treated as the PIX *payer*.
     */
    private static function prepareApiWithdraw(Database $db,array $account,array $body,string $idem):array{
        foreach(['account_id','merchant_id','recipient_name','recipient_cpf',
                 'beneficiary_name','beneficiary_document','pix_key','pix_key_type',
                 'payer_name','payer_document'] as $foreign){
            if(array_key_exists($foreign,$body))
                self::fail('O destinatário é definido exclusivamente pelo cadastro verificado, não pela API',422);
        }
        $identity=IdentityProfile::sellerForPayout($db,$account);
        return [
            'amount_cents'=>$body['amount_cents']??null,
            'confirm'=>$body['confirm']??false,
            'idempotency_key'=>$idem,
            'pix_key_type'=>$identity['account_type']==='PJ'?'cnpj':'cpf',
            'pix_key'=>$identity['document_number'],
            'description'=>'Saque da carteira ARGUS Pay'
        ];
    }

    private static function payoutKey():string{
        $raw=(string)(getenv('ARGUS_MERCHANT_PAYOUT_ENCRYPTION_KEY')?:'');
        $key=base64_decode($raw,true);
        if(is_string($key)&&strlen($key)===SODIUM_CRYPTO_SECRETBOX_KEYBYTES)return $key;
        // Stable domain-separated key derived from the already configured KYC
        // encryption secret: avoids storing a second unprotected merchant secret.
        $kyc=base64_decode((string)(getenv('ARGUS_KYC_ENCRYPTION_KEY')?:''),true);
        if(is_string($kyc)&&strlen($kyc)===SODIUM_CRYPTO_SECRETBOX_KEYBYTES)
            return hash_hkdf('sha256',$kyc,SODIUM_CRYPTO_SECRETBOX_KEYBYTES,'argus-merchant-payout-v1');
        self::fail('Proteção de dados da chave de saque não configurada',503);
    }
    private static function seal(string $value):string{
        $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce.sodium_crypto_secretbox($value,$nonce,self::payoutKey()));
    }
    private static function unseal(string $encoded):string{
        $raw=base64_decode($encoded,true);
        if(!is_string($raw)||strlen($raw)<=SODIUM_CRYPTO_SECRETBOX_NONCEBYTES)
            self::fail('Dados protegidos do saque indisponíveis',503);
        $nonce=substr($raw,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $text=sodium_crypto_secretbox_open(substr($raw,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            $nonce,self::payoutKey());
        if(!is_string($text))self::fail('Chave financeira protegida inválida',503);
        return $text;
    }
    public static function requestWithdraw(Database $db,array $account,array $data):array{
        self::enabled($db,true);
        if($account['status']!=='approved'||!KycStudio::identityApproved($db,(string)$account['id']))
            self::fail('Cadastro KYC não autorizado para sacar',403);
        if(!$account['merchant_id'])self::fail('Conta financeira indisponível',403);
        $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",
            [$account['merchant_id']]);
        if(!$merchant)self::fail('Recebedor ainda não autorizado',403);
        $amount=$data['amount_cents']??null;
        if(!is_int($amount)||$amount<200||$amount>10000)
            self::fail('Saque permitido: R$ 2,00 a R$ 100,00, com R$ 1,00 de serviço descontado do total',422);
        if(($data['confirm']??null)!==true)self::fail('Confirme o valor do saque e a taxa de serviço de R$ 1,00');
        $type=$data['pix_key_type']??null;$pix=$data['pix_key']??null;
        if(!is_string($type)||!is_string($pix))self::fail('Chave Pix e tipo são obrigatórios');
        $type=match(strtolower($type)){
            'cpf'=>'CPF','cnpj'=>'CNPJ','email'=>'EMAIL',
            'phone','telefone'=>'TELEFONE','evp','chave_aleatoria'=>'CHAVE_ALEATORIA',
            default=>self::fail('Tipo de chave Pix inválido',422)
        };
        try{$key=MisticPayPayout::validatePixKey($type,$pix);}
        catch(\InvalidArgumentException $e){self::fail($e->getMessage(),422);}
        $desc=trim((string)($data['description']??'Saque de vendas ARGUS Pay'));
        if(mb_strlen($desc)<3||mb_strlen($desc)>120)self::fail('Descrição inválida');
        $idem=$data['idempotency_key']??null;
        if(!is_string($idem)||!preg_match('/^[A-Za-z0-9._:-]{16,110}$/D',$idem))
            self::fail('Idempotência obrigatória');
        $idemHash=hash('sha256',$idem);
        $bodyHash=hash('sha256',json_encode([$amount,$type,$key,$desc],JSON_THROW_ON_ERROR));
        $accountId=(string)$account['id'];
        $existing=$db->one('SELECT * FROM argus_seller_withdrawals WHERE account_id=? AND idem_hash=?',
            [$accountId,$idemHash]);
        if($existing){
            if(!hash_equals($existing['body_hash'],$bodyHash))
                self::fail('Idempotência usada com outra transferência',409);
            return self::payoutPublic($existing);
        }
        $debit=$amount;$id=self::uid('mww');
        $masked=substr($key,0,3).'••••'.substr($key,-4);
        $sealed=self::seal($key);
        self::wallet($db,$account);
        $db->transaction(static function(Database $db)use($id,$accountId,$idemHash,$bodyHash,$amount,
                                                     $type,$masked,$sealed,$desc,$debit){
            $w=self::lock($db,$accountId);
            if((int)$w['debt_cents']>0||((int)$w['available_cents'])<$debit)
                self::fail('Saldo disponível insuficiente para o valor total solicitado',409);
            $changed=$db->run('UPDATE argus_seller_wallets
                SET available_cents=available_cents-?,held_cents=held_cents+?,updated_at=?
                WHERE account_id=? AND available_cents>=? AND debt_cents=0',[
                $debit,$debit,self::now(),$accountId,$debit
            ]);
            if($changed->rowCount()!==1)self::fail('Saldo atualizado por outra operação. Tente novamente',409);
            $db->run('INSERT INTO argus_seller_withdrawals
                (id,account_id,idem_hash,body_hash,amount_cents,service_fee_cents,debit_cents,
                 pix_key_type,pix_key_masked,pix_key_encrypted,description,
                 provider_tx_id,provider_job_id,status,created_at,checked_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
                $id,$accountId,$idemHash,$bodyHash,$amount,self::FEE,$debit,$type,
                $masked,$sealed,$desc,null,null,'requested',self::now(),null
            ]);
            self::journal($db,$accountId,'withdraw_hold',$id,-$debit,$debit,0,self::FEE);
        });
        return self::payoutPublic($db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$id]));
    }
    private static function payoutPublic(array $row):array{
        return [
            'id'=>$row['id'],'amount_cents'=>(int)$row['amount_cents'],
            'service_fee_cents'=>(int)$row['service_fee_cents'],
            'recipient_cents'=>(int)$row['amount_cents']-(int)$row['service_fee_cents'],
            'debit_cents'=>(int)$row['debit_cents'],
            'pix_key_type'=>$row['pix_key_type'],'pix_key_masked'=>$row['pix_key_masked'],
            'status'=>$row['status'],'created_at'=>$row['created_at'],'checked_at'=>$row['checked_at']
        ];
    }
    private static function payouts(Database $db,string $accountId):array{
        self::install($db);
        return array_map([self::class,'payoutPublic'],$db->all(
            'SELECT * FROM argus_seller_withdrawals WHERE account_id=? ORDER BY created_at DESC LIMIT 100',
            [$accountId]));
    }
    public static function portal(Database $db,string $method,string $path,array $account):never{
        if($method==='GET'&&$path==='/api/portal/wallet'){
            self::reconcilePayouts($db,(string)$account['id']);
            self::out(['wallet'=>self::balancePublic($db,$account),
                'withdrawals'=>self::payouts($db,$account['id'])]);
        }
        if($method==='GET'&&$path==='/api/portal/wallet/charges'){
            self::install($db);
            $rows=$db->all('SELECT * FROM argus_seller_charges WHERE account_id=?
                ORDER BY created_at DESC LIMIT 100',[$account['id']]);
            self::out(['charges'=>array_map([self::class,'chargePublic'],$rows)]);
        }
        if($method==='POST'&&$path==='/api/portal/wallet/charges'){
            $data=self::body();
            $raw=$data['idempotency_key']??null;
            if(!is_string($raw)||!preg_match('/^[A-Za-z0-9._:-]{16,110}$/D',$raw))
                self::fail('Identificador único obrigatório para gerar Pix',422);
            self::out(['charge'=>self::create($db,$account,$data,hash('sha256',$raw))],201);
        }
        if($method==='GET'&&preg_match('~^/api/portal/wallet/charges/(mwc_[a-f0-9]{32})$~D',$path,$match)){
            $charge=self::reconcile($db,$match[1],(string)$account['id']);
            self::out(['charge'=>self::chargePublic($charge)]);
        }
        if($method==='POST'&&$path==='/api/portal/wallet/withdrawals'){
            $withdrawal=self::requestWithdraw($db,$account,self::body());
            if($withdrawal['status']==='requested')
                $withdrawal=self::sendWithdraw($db,(string)$withdrawal['id'],(string)$account['id']);
            self::out(['withdrawal'=>$withdrawal,'wallet'=>self::balancePublic($db,$account)],201);
        }
        self::fail('Rota da carteira não encontrada',404);
    }
    private static function payoutClient():MisticPayPayout{
        return new MisticPayPayout(
            trim((string)getenv('ARGUS_MISTICPAY_PAYOUT_PK')),
            trim((string)getenv('ARGUS_MISTICPAY_PAYOUT_SK'))
        );
    }
    /**
     * The seller confirms the payout, with no separate administrator approval.
     * Debit exactly gross, transfer gross minus service fee, with PSP idempotency.
     * An uncertain provider response is never retried automatically.
     */
    private static function sendWithdraw(Database $db,string $id,string $accountId):array{
        self::enabled($db,true);
        $row=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=? AND account_id=?',[$id,$accountId]);
        if(!$row)self::fail('Saque não pertence a esta carteira',404);
        if($row['status']!=='requested')return self::payoutPublic($row);
        $account=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$accountId]);
        if(!$account||$account['status']!=='approved'||!KycStudio::identityApproved($db,$accountId))
            self::fail('Cadastro financeiro não autorizado a sacar',403);
        $merchant=$db->one("SELECT id FROM b2b_merchants WHERE id=? AND status='approved_live'",
            [(string)($account['merchant_id']??'')]);
        if(!$merchant)self::fail('Recebedor não autorizado',403);
        $recipient=(int)$row['amount_cents']-(int)$row['service_fee_cents'];
        if($recipient<100||(int)$row['debit_cents']!==(int)$row['amount_cents'])
            self::fail('Valor líquido do saque inválido; transferência suspensa',409);
        $client=self::payoutClient();
        if($client->balance()<$recipient)
            self::fail('Saldo de liquidação temporariamente insuficiente; seu valor continua reservado',503);
        $db->transaction(static function(Database $db)use($id,$accountId,$row){
            $w=self::lock($db,$accountId);
            if((int)$w['held_cents']<(int)$row['debit_cents']||(int)$w['debt_cents']>0)
                self::fail('Saldo reservado inconsistente ou contestado',409);
            $changed=$db->run("UPDATE argus_seller_withdrawals
                SET status='processing',checked_at=?
                WHERE id=? AND account_id=? AND status='requested'",[self::now(),$id,$accountId]);
            if($changed->rowCount()!==1)self::fail('Saque já está em processamento',409);
        });
        try{
            $pix=self::unseal((string)$row['pix_key_encrypted']);
            $result=$client->withdraw($recipient,(string)$row['pix_key_type'],$pix,
                (string)$row['description'],self::providerIdempotency($id));
            $db->run("UPDATE argus_seller_withdrawals
                SET provider_tx_id=?,provider_job_id=?,status='queued',checked_at=?
                WHERE id=? AND account_id=? AND status='processing'",[
                $result['transaction_id'],$result['job_id'],self::now(),$id,$accountId
            ]);
        }catch(\Throwable $e){
            $db->run("UPDATE argus_seller_withdrawals SET status='unknown',checked_at=?
                WHERE id=? AND account_id=? AND status='processing'",[self::now(),$id,$accountId]);
            error_log('ARGUS seller automatic payout uncertain: '.get_class($e));
            self::fail('Transferência com resultado incerto: valor continua reservado e não será reenviado sem conciliação',503);
        }
        return self::payoutPublic($db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$id]));
    }

    // Status checks only. These never submit transfers.
    private static function reconcilePayouts(Database $db,?string $accountId=null):void{
        if(getenv('ARGUS_PAYOUTS_ENABLED')!=='yes')return;
        self::install($db);
        $cutoff=gmdate('Y-m-d H:i:s',time()-45);
        $where="status IN ('queued','pending','unknown') AND provider_tx_id IS NOT NULL
            AND (checked_at IS NULL OR checked_at<?)";
        $args=[$cutoff];
        if($accountId!==null){$where.=' AND account_id=?';$args[]=$accountId;}
        $rows=$db->all('SELECT * FROM argus_seller_withdrawals WHERE '.$where.'
            ORDER BY checked_at ASC LIMIT 12',$args);
        foreach($rows as $row){
            try{
                $status=self::payoutClient()->status((string)$row['provider_tx_id']);
                if(!hash_equals((string)$row['provider_tx_id'],(string)($status['transaction_id']??'')))
                    throw new \RuntimeException('Transaction identity mismatch');
                $mapped=match(strtoupper((string)($status['state']??''))){
                    'COMPLETO'=>'paid','FALHA'=>'failed',
                    'CANCELADO'=>'cancelled','DEVOLVIDO','DEVOLVIDO_PARCIAL'=>'refunded',
                    default=>'pending'
                };
                self::finishWithdraw($db,$row,$mapped);
                if($mapped==='pending')
                    $db->run("UPDATE argus_seller_withdrawals SET status='pending',checked_at=?
                        WHERE id=? AND status IN ('queued','pending','unknown')",[self::now(),$row['id']]);
            }catch(\Throwable $e){
                $db->run('UPDATE argus_seller_withdrawals SET checked_at=? WHERE id=?',
                    [self::now(),$row['id']]);
                error_log('ARGUS seller payout status reconciliation failed: '.get_class($e));
            }
        }
    }
    private static function finishWithdraw(Database $db,array $row,string $state):void{
        if(!in_array($state,['paid','failed','cancelled','refunded'],true))return;
        $db->transaction(static function(Database $db)use($row,$state){
            $sql='SELECT * FROM argus_seller_withdrawals WHERE id=?';
            if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
            $current=$db->one($sql,[$row['id']]);
            if(!$current||!in_array($current['status'],['processing','queued','unknown','pending'],true))return;
            $w=self::lock($db,$current['account_id']);
            $debit=(int)$current['debit_cents'];
            if((int)$w['held_cents']<$debit)self::fail('Reserva financeira inconsistente; pagamento suspenso',409);
            if($state==='paid'){
                $db->run('UPDATE argus_seller_wallets SET held_cents=held_cents-?,updated_at=? WHERE account_id=?',
                    [$debit,self::now(),$row['account_id']]);
                self::journal($db,$row['account_id'],'withdraw_paid',$row['id'],0,-$debit,0,0);
            }else{
                $debt=(int)$w['debt_cents'];$offset=min($debit,$debt);$free=$debit-$offset;
                $db->run('UPDATE argus_seller_wallets SET available_cents=available_cents+?,
                    held_cents=held_cents-?,debt_cents=debt_cents-?,updated_at=? WHERE account_id=?',
                    [$free,$debit,$offset,self::now(),$row['account_id']]);
                self::journal($db,$row['account_id'],'withdraw_release',$row['id'],$free,-$debit,-$offset,0);
            }
            $db->run('UPDATE argus_seller_withdrawals SET status=?,checked_at=? WHERE id=?',
                [$state,self::now(),$row['id']]);
        });
    }
    public static function admin(Database $db,string $method,string $path,array $actor,array $data=[]):never{
        if(($actor['role']??'')!=='superadmin')self::fail('Somente o Super Admin executa saques',403);
        self::install($db);
        if($method==='GET'&&$path==='/api/admin/merchant-wallet/overview'){
            $rows=$db->all('SELECT w.account_id,w.merchant_id,w.available_cents,w.held_cents,
                w.debt_cents,a.display_name,a.email,a.status FROM argus_seller_wallets w
                JOIN argus_portal_accounts a ON a.id=w.account_id ORDER BY a.display_name LIMIT 250');
            $requests=$db->all('SELECT id,account_id,amount_cents,debit_cents,
                pix_key_type,pix_key_masked,status,created_at,provider_tx_id
                FROM argus_seller_withdrawals ORDER BY created_at DESC LIMIT 150');
            self::out(['wallets'=>$rows,'withdrawals'=>$requests]);
        }
        if(preg_match('~^/api/admin/merchant-wallet/withdrawals/(mww_[a-f0-9]{32})/(execute|reconcile)$~D',$path,$m)&&$method==='POST'){
            self::enabled($db);
            $row=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$m[1]]);
            if(!$row)self::fail('Saque não encontrado',404);
            if($m[2]==='reconcile'){
                if(!$row['provider_tx_id'])self::fail('Transferência ainda sem identificador verificável',409);
                $status=self::payoutClient()->status($row['provider_tx_id']);
                if(!hash_equals((string)$row['provider_tx_id'],(string)($status['transaction_id']??'')))
                    self::fail('Confirmação financeira não corresponde à transferência consultada',409);
                $providerState=strtoupper((string)($status['state']??''));
                $mapped=match($providerState){
                    'COMPLETO'=>'paid','FALHA'=>'failed',
                    'CANCELADO'=>'cancelled','DEVOLVIDO','DEVOLVIDO_PARCIAL'=>'refunded',
                    default=>'pending'
                };
                self::finishWithdraw($db,$row,$mapped);
                $fresh=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$m[1]]);
                self::out(['withdrawal'=>self::payoutPublic($fresh)]);
            }
            // Manual route is retained for legacy requests only. Sellers initiate
            // their own withdrawals without invoking an administrator.
            self::out(['withdrawal'=>self::sendWithdraw($db,(string)$row['id'],(string)$row['account_id'])]);
        }
        self::fail('Rota administrativa da carteira não encontrada',404);
    }
}
