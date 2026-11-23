<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Self-service public Pix into the VERIFIED primary ARGUS administrator's
 * existing traditional MisticPay receiving account.
 *
 * Payer explicitly authorizes a QR for (desired amount + configured PSP cost).
 * This cannot create a payout, use reseller balances or credit an account from
 * a QR-created event. Only authenticated PSP reconciliation marks a Pix paid.
 */
final class PublicAdminPix {
    private const ADMIN_EMAIL='cleyton.douglas2@gmail.com';
    private const MAX_PROVIDER_CENTS=10000; // current traditional PSP contract
    private static function reject(string $message,int $status=422):never {
        throw new ApiError($message,$status);
    }
    private static function respond(array $payload,int $status=200):never {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($payload,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        exit;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_public_admin_pix (
            charge_id VARCHAR(48) PRIMARY KEY,
            admin_actor_id VARCHAR(64) NOT NULL,
            base_amount_cents INTEGER NOT NULL,
            provider_fee_cents INTEGER NOT NULL,
            total_amount_cents INTEGER NOT NULL,
            policy_version INTEGER NOT NULL,
            idem_hash VARCHAR(64) NOT NULL UNIQUE,
            body_hash VARCHAR(64) NOT NULL,
            receipt_hash VARCHAR(64) NOT NULL,
            created_at VARCHAR(32) NOT NULL
        )");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_public_pix_limits (
            ip_hash VARCHAR(64) PRIMARY KEY,
            window_seconds BIGINT NOT NULL,
            attempts INTEGER NOT NULL
        )");
    }
    public static function quote(Database $db,int $base):array {
        if($base<100||$base>self::MAX_PROVIDER_CENTS)
            self::reject('Informe um valor entre R$ 1,00 e R$ 100,00');
        $fees=FeePolicy::current($db);
        $psp=(int)$fees['mistic_deposit_cents'];
        $total=$base+$psp;
        if($total>self::MAX_PROVIDER_CENTS)
            self::reject('O valor com a taxa excede o limite de R$ 100,00 por Pix',422);
        return [
            'base_amount_cents'=>$base,
            'provider_fee_cents'=>$psp,
            'total_amount_cents'=>$total,
            'admin_expected_net_cents'=>$base,
            'policy_version'=>(int)$fees['version'],
            'currency'=>'BRL',
            'provider'=>'MisticPay',
            'admin_argus_seller_fee_applied'=>false,
            'provider_cost_is_configured_estimate'=>true,
            'settlement_subject_to_provider'=>true
        ];
    }
    private static function body():array {
        if((int)($_SERVER['CONTENT_LENGTH']??0)>3000)self::reject('Solicitação muito grande',413);
        $raw=file_get_contents('php://input',false,null,0,3001);
        if(!is_string($raw)||strlen($raw)>3000)self::reject('Solicitação muito grande',413);
        try{$json=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}
        catch(\JsonException){self::reject('JSON inválido',400);}
        if(!is_array($json)||array_is_list($json))self::reject('Dados inválidos');
        return $json;
    }
    private static function origin():void {
        // Public checkout is cross-user, not cross-site. No browser secret is
        // ever accepted as superadmin authentication. Browser POSTs require
        // exact origin/host equality; third-party embeds cannot create charges.
        $origin=(string)($_SERVER['HTTP_ORIGIN']??'');
        $host=strtolower((string)($_SERVER['HTTP_HOST']??''));
        $o=parse_url($origin);
        if(!is_array($o)||!isset($o['host'],$o['scheme'])||
           !is_string($o['host'])||!is_string($o['scheme'])||
           strtolower($o['host'])!==explode(':',$host)[0]||
           (!in_array(strtolower($o['scheme']),['https'],true)&&
            strtolower($o['host'])!=='localhost'))
            self::reject('Origem da solicitação não autorizada',403);
        $sec=(string)($_SERVER['HTTP_SEC_FETCH_SITE']??'');
        if($sec!==''&&!in_array($sec,['same-origin','none'],true))
            self::reject('Requisição de origem não autorizada',403);
    }
    private static function owner(Database $db):string {
        $row=$db->one("SELECT id FROM admin_users
            WHERE lower(email)=? AND role='superadmin' AND status='active' LIMIT 1",
            [self::ADMIN_EMAIL]);
        if(!$row||!is_string($row['id'])||$row['id']==='')
            self::reject('Conta de recebimento administrativo indisponível',503);
        return $row['id'];
    }
    private static function ready(Database $db):void {
        if(!in_array($db->driver(),['pgsql','mysql'],true))
            self::reject('Recebimento Pix público exige banco financeiro persistente',503);
        if(getenv('ARGUS_QUICK_PIX_PROVIDER')!=='traditional')
            self::reject('Pix público aguardando ativação da integração tradicional MisticPay',503);
        if(!TraditionalQuickPix::publicConfigured())
            self::reject('Pix público aguardando credenciais da adquirente',503);
    }
    private static function throttle(Database $db):void {
        $secret=(string)(getenv('ARGUS_SECURITY_RATE_SECRET')?:getenv('ARGUS_KYC_ENCRYPTION_KEY')?:'');
        if(strlen($secret)<32)self::reject('Controle de segurança do Pix público indisponível',503);
        $ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
        $key=hash_hmac('sha256',$ip,$secret);
        $window=intdiv(time(),600);
        $db->transaction(static function(Database $db)use($key,$window):void{
            $sql='SELECT attempts,window_seconds FROM argus_public_pix_limits WHERE ip_hash=?';
            if($db->driver()!=='sqlite')$sql.=' FOR UPDATE';
            $row=$db->one($sql,[$key]);
            if(!$row){
                try{$db->run('INSERT INTO argus_public_pix_limits (ip_hash,window_seconds,attempts)
                    VALUES(?,?,1)',[$key,$window]);}
                catch(\PDOException){self::reject('Tente novamente em alguns minutos',429);}
                return;
            }
            if((int)$row['window_seconds']!==$window){
                $db->run('UPDATE argus_public_pix_limits SET window_seconds=?,attempts=1
                    WHERE ip_hash=?',[$window,$key]);
                return;
            }
            if((int)$row['attempts']>=5)
                self::reject('Limite de geração de Pix atingido. Tente mais tarde.',429);
            $db->run('UPDATE argus_public_pix_limits SET attempts=attempts+1
                WHERE ip_hash=?',[$key]);
        });
    }
    private static function receipt(Database $db,string $id,string $token):array {
        if(!preg_match('/^qpx_[a-f0-9]{32}$/D',$id)||
           !preg_match('/^[a-f0-9]{64}$/D',$token))
            self::reject('Protocolo Pix inválido',404);
        $row=$db->one('SELECT p.*,q.status,q.provider_id,q.qr_copy,q.checked_at
            FROM argus_public_admin_pix p JOIN admin_quick_pix q ON q.id=p.charge_id
            WHERE p.charge_id=?',[$id]);
        if(!$row||!hash_equals((string)$row['receipt_hash'],hash('sha256',$token)))
            self::reject('Cobrança não encontrada',404);
        return $row;
    }
    private static function publicRow(array $row):array {
        $time=strtotime((string)$row['created_at'].' UTC');
        $expiry=$time===false?0:$time+1800;
        $status=(string)$row['status'];
        $display=in_array($status,['paid','failed','refunded','cancelled'],true)?$status:
            ($expiry>0&&time()>=$expiry?'expired':$status);
        $copy=$display==='pending'&&is_string($row['qr_copy'])?$row['qr_copy']:null;
        return [
            'id'=>$row['charge_id'],
            'base_amount_cents'=>(int)$row['base_amount_cents'],
            'provider_fee_cents'=>(int)$row['provider_fee_cents'],
            'total_amount_cents'=>(int)$row['total_amount_cents'],
            'policy_version'=>(int)$row['policy_version'],
            'status'=>$status,'display_status'=>$display,
            'pix_copy_paste'=>$copy,'expires_at_epoch'=>$expiry,
            'receipt_is_provider_settled'=>$status==='paid'
        ];
    }
    public static function handle(Database $db,string $method,string $path):never {
        if($method==='GET'&&$path==='/pix/quote'){
            $amount=filter_var($_GET['amount_cents']??null,FILTER_VALIDATE_INT);
            if(!is_int($amount))self::reject('Valor inválido');
            self::respond(['quote'=>self::quote($db,$amount)]);
        }
        if($method==='POST'&&$path==='/pix/create'){
            self::origin();self::ready($db);self::install($db);
            $data=self::body();
            $base=$data['amount_cents']??null;
            if(!is_int($base))self::reject('Informe o valor do Pix em centavos');
            $quote=self::quote($db,$base);
            if(!is_int($data['policy_version']??null)||
               $quote['policy_version']!==$data['policy_version'])
                self::reject('A taxa mudou. Atualize o valor antes de gerar o Pix.',409);
            $name=trim((string)($data['payer_name']??''));
            $document=preg_replace('/\D/','',(string)($data['payer_document']??''));
            $idem=(string)($data['idempotency_key']??'');
            $token=(string)($data['receipt_token']??'');
            if(!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD',$idem)||
               !preg_match('/^[a-f0-9]{64}$/D',$token))
                self::reject('Identificação única da cobrança inválida');
            $id='qpx_'.bin2hex(random_bytes(16));
            try{$providerBody=TraditionalQuickPix::createBody(
                $quote['total_amount_cents'],$name,$document,$id,'Pagamento público ARGUS Pay'
            );}catch(\InvalidArgumentException $e){self::reject($e->getMessage());}
            $hash=hash('sha256',$idem);
            $bodyHash=hash('sha256',json_encode([$base,$quote['total_amount_cents'],
                $quote['policy_version'],$providerBody['payerName'],$document],JSON_THROW_ON_ERROR));
            $old=$db->one('SELECT p.*,q.status,q.provider_id,q.qr_copy,q.checked_at
                FROM argus_public_admin_pix p JOIN admin_quick_pix q ON q.id=p.charge_id
                WHERE p.idem_hash=?',[$hash]);
            if($old){
                if(!hash_equals((string)$old['body_hash'],$bodyHash)||
                   !hash_equals((string)$old['receipt_hash'],hash('sha256',$token)))
                    self::reject('Identificador Pix reutilizado para outros dados',409);
                self::respond(['charge'=>self::publicRow($old)]);
            }
            self::throttle($db);
            $admin=self::owner($db);
            $db->transaction(static function(Database $db)use($id,$admin,$hash,$bodyHash,$quote,$token):void{
                if(FeePolicy::current($db)['version']!==$quote['policy_version'])
                    self::reject('A tabela de taxas mudou. Atualize a cotação.',409);
                $now=Database::stamp();
                $db->run('INSERT INTO admin_quick_pix
                    (id,actor_id,idempotency_hash,body_hash,amount_cents,description,
                     provider_id,qr_copy,status,created_at,checked_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
                    $id,$admin,$hash,$bodyHash,$quote['total_amount_cents'],
                    'Pagamento público ARGUS Pay',null,null,'creating',$now,null
                ]);
                $db->run('INSERT INTO argus_public_admin_pix
                    (charge_id,admin_actor_id,base_amount_cents,provider_fee_cents,total_amount_cents,
                     policy_version,idem_hash,body_hash,receipt_hash,created_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?)',[
                    $id,$admin,$quote['base_amount_cents'],$quote['provider_fee_cents'],
                    $quote['total_amount_cents'],$quote['policy_version'],
                    $hash,$bodyHash,hash('sha256',$token),$now
                ]);
            });
            try{
                $created=TraditionalQuickPix::publicCreate($providerBody,$idem);
                $db->run('UPDATE admin_quick_pix SET provider_id=?,qr_copy=?,status=?,checked_at=?
                    WHERE id=? AND status=?',[
                    $created['provider_id'],$created['copy'],'pending',Database::stamp(),
                    $id,'creating'
                ]);
            }catch(\Throwable $e){
                $db->run("UPDATE admin_quick_pix SET status='unknown',checked_at=?
                    WHERE id=? AND status='creating'",[Database::stamp(),$id]);
                error_log('ARGUS_PUBLIC_PIX_CREATE_UNCERTAIN id='.$id.' class='.get_class($e));
            }
            $row=self::receipt($db,$id,$token);
            self::respond(['charge'=>self::publicRow($row)],201);
        }
        if($method==='POST'&&$path==='/pix/status'){
            self::origin();self::install($db);
            $data=self::body();
            $row=self::receipt($db,(string)($data['id']??''),(string)($data['receipt_token']??''));
            if(in_array($row['status'],['pending','unknown'],true)&&
               str_starts_with((string)($row['provider_id']??''),'tr_')&&
               (time()-strtotime((string)($row['checked_at']??'1970-01-01 00:00:00').' UTC'))>=35){
                // PSP authenticated status check. Failure cannot imply payment.
                try{
                    $charge=$db->one('SELECT * FROM admin_quick_pix WHERE id=?',[$row['charge_id']]);
                    if($charge)TraditionalQuickPix::reconcileRow($db,$charge);
                }catch(\Throwable $e){
                    error_log('ARGUS_PUBLIC_PIX_STATUS_UNAVAILABLE id='.$row['charge_id'].
                        ' class='.get_class($e));
                }
                $row=self::receipt($db,$row['charge_id'],(string)$data['receipt_token']);
            }
            self::respond(['charge'=>self::publicRow($row)]);
        }
        self::reject('Rota Pix indisponível',404);
    }
}
