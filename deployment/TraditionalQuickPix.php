<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Traditional MisticPay Cash-In via scoped pk_/sk_ credentials.
 * The only public payment operation is POST /transactions/create with real payer fields.
 * No fake payer identity, no auto-settlement, no retry on uncertain provider responses.
 */
final class TraditionalQuickPix
{
    private const ROOT='https://api.misticpay.com/api';
    private static function fail(string $message,int $status=422):never {throw new ApiError($message,$status);}
    private static function reply(array $payload,int $status=200):never {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        echo json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        exit;
    }
    private static function credentials():array {
        $id=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID')?:getenv('ARGUS_FINANCE_QR_CLIENT_ID')?:''));
        $secret=trim((string)(getenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')?:getenv('ARGUS_FINANCE_QR_CLIENT_SECRET')?:''));
        if(!preg_match('/^pk_[a-zA-Z0-9_-]{8,}$/D',$id)||!preg_match('/^sk_[a-zA-Z0-9_-]{8,}$/D',$secret)){
            self::fail('Credenciais MisticPay pk/sk não configuradas para a API tradicional',503);
        }
        return [$id,$secret];
    }
    private static function request(string $path,string $method='GET',?array $payload=null,?string $idem=null):array {
        [$id,$secret]=self::credentials();
        if(!function_exists('curl_init'))self::fail('Integração HTTP indisponível',503);
        if(!in_array($path,['/users/info','/transactions/create','/transactions/check'],true))self::fail('Rota não autorizada',403);
        $headers=['Accept: application/json'];
        if($payload!==null)$headers[]='Content-Type: application/json';
        if($idem!==null)$headers[]='X-Idempotency-Key: '.$idem;
        $ch=curl_init(self::ROOT.$path);
        curl_setopt_array($ch,[
            CURLOPT_RETURNTRANSFER=>true,CURLOPT_USERPWD=>$id.':'.$secret,
            CURLOPT_HTTPAUTH=>CURLAUTH_BASIC,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>12,
            CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_SSL_VERIFYPEER=>true,
            CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>$headers,
            CURLOPT_CUSTOMREQUEST=>$method
        ]);
        if($payload!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        $raw=curl_exec($ch);$http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
        curl_close($ch);
        if(!is_string($raw)||$http===0||strlen($raw)>1000000)self::fail('Sem confirmação do provedor. Verifique o protocolo antes de tentar novamente.',503);
        $data=json_decode($raw,true);
        if(!is_array($data))self::fail('O provedor retornou resposta inválida; não repita automaticamente.',503);
        if($http>=400){
            $code=strtoupper((string)($data['code']??'UNCLASSIFIED'));
            if(!preg_match('/^[A-Z0-9_]{1,64}$/D',$code))$code='UNCLASSIFIED';
            // Explicit 401/403 are safe to show, not PII or raw server responses.
            $requiredScope=$path==='/transactions/check'?'TRANSACTION_READ':($path==='/transactions/create'?'TRANSACTION_CREATE':'BALANCE_READ');
            self::fail('MisticPay recusou a operação (HTTP '.$http.', '.$code.'). Verifique a permissão '.$requiredScope.' e o IP autorizado.', $http===429?429:503);
        }
        if($http<200||$http>=300)self::fail('Resposta inesperada da API Pix',503);
        return $data;
    }
    public static function cpfValid(string $value):bool {
        if(!preg_match('/^\d{11}$/D',$value)||preg_match('/^(\d)\1{10}$/',$value))return false;
        for($pos=9;$pos<=10;$pos++){
            $sum=0;for($i=0;$i<$pos;$i++)$sum+=(int)$value[$i]*($pos+1-$i);
            $digit=($sum*10)%11;if($digit===10)$digit=0;
            if($digit!==(int)$value[$pos])return false;
        }
        return true;
    }
    public static function createBody(int $cents,string $name,string $cpf,string $id,string $description):array {
        if($cents<100||$cents>10000)throw new \InvalidArgumentException('Valor entre R$ 1 e R$ 100');
        $name=trim(preg_replace('/\s+/u',' ',$name)??'');
        if(mb_strlen($name)<3||mb_strlen($name)>120)throw new \InvalidArgumentException('Informe o nome completo do pagador');
        $cpf=preg_replace('/\D/','',$cpf);
        $validDocument=(strlen($cpf)===11&&self::cpfValid($cpf))||(strlen($cpf)===14&&IdentityProfile::validCnpj($cpf));
        if(!$validDocument)throw new \InvalidArgumentException('CPF ou CNPJ cadastrado inválido');
        if(!preg_match('/^qpx_[a-f0-9]{32}$/D',$id))throw new \InvalidArgumentException('ID inválido');
        return ['amount'=>$cents/100,'payerName'=>$name,'payerDocument'=>$cpf,
            'transactionId'=>$id,'description'=>$description];
    }
    public static function readCreated(array $data):array {
        $d=$data['data']??$data;
        if(!is_array($d))throw new \RuntimeException('Formato de cobrança inválido');
        $tx=$d['transactionId']??null;
        if(!is_string($tx)&&!is_int($tx))throw new \RuntimeException('ID de transação ausente');
        $tx=(string)$tx;
        if(!preg_match('/^[a-zA-Z0-9_.-]{1,110}$/D',$tx))throw new \RuntimeException('ID de transação incompatível');
        $copy=$d['copyPaste']??'';
        if(!is_string($copy)||strlen($copy)<20||strlen($copy)>9000)throw new \RuntimeException('Copia e Cola Pix ausente');
        $status=strtoupper((string)($d['transactionState']??'PENDENTE'));
        return ['provider_id'=>'tr_'.$tx,'copy'=>$copy,'status'=>self::status($status)];
    }
    public static function status(string $state):string {
        return match(strtoupper($state)){
            'COMPLETO'=>'paid',
            'PENDENTE'=>'pending',
            'FALHA','CANCELADO','DEVOLVIDO','DEVOLVIDO_PARCIAL'=>'failed',
            default=>'unknown',
        };
    }
    public static function readChecked(array $response,int $expectedCents,?string $providerId=null):array {
        $row=$response['transaction']??null;
        if(!is_array($row))throw new \RuntimeException('Status da transação ausente');
        // Never settle from a webhook, cached QR code, or a response for another charge.
        if($providerId!==null){
            $received=$row['transactionId']??null;
            if(!is_string($received)&&!is_int($received))throw new \RuntimeException('Identificador ausente na confirmação');
            if(!hash_equals($providerId,(string)$received))throw new \RuntimeException('Transação diferente da cobrança original');
        }
        $state=self::status((string)($row['transactionState']??''));
        if(isset($row['transactionType'])&&strtoupper((string)$row['transactionType'])!=='DEPOSITO')
            throw new \RuntimeException('Resposta não é de depósito Pix');
        if(isset($row['transactionMethod'])&&strtoupper((string)$row['transactionMethod'])!=='PIX')
            throw new \RuntimeException('Método de pagamento diferente');
        if(isset($row['value'])){
            $value=$row['value'];
            if(!is_int($value)&&!is_float($value)&&!is_string($value))throw new \RuntimeException('Valor inválido');
            if(!is_numeric($value)||abs((int)round((float)$value*100)-$expectedCents)>0)throw new \RuntimeException('Valor informado pelo provedor diverge');
        }elseif($state==='paid'){
            throw new \RuntimeException('Confirmação sem valor verificado');
        }
        return ['status'=>$state];
    }

    /** Test TRANSACTION_READ without touching an actual payment or knowing a customer ID. */
    public static function readPermission():array {
        try{
            self::request('/transactions/check','POST',['transactionId'=>'argus_read_probe_'.bin2hex(random_bytes(12))]);
            return ['status'=>'unverified'];
        }catch(ApiError $e){
            $error=$e->getMessage();
            if(str_contains($error,'TRANSACTION_NOT_FOUND'))return ['status'=>'verified'];
            if(str_contains($error,'API_SCOPE_DENIED'))return ['status'=>'denied'];
            if(str_contains($error,'INVALID_API_CREDENTIAL')||str_contains($error,'IP_NOT_ALLOWED'))return ['status'=>'credentials_rejected'];
            return ['status'=>'unverified'];
        }catch(\Throwable){
            return ['status'=>'unavailable'];
        }
    }

    /** Only verified data from POST /api/transactions/check can change payment status. */
    public static function reconcileRow(Database $db,array $row):array {
        $p=(string)($row['provider_id']??'');
        if(!str_starts_with($p,'tr_'))throw new \RuntimeException('Cobrança não pertence à API tradicional');
        $providerId=substr($p,3);
        if(!preg_match('/^[a-zA-Z0-9_.-]{1,110}$/D',$providerId))throw new \RuntimeException('Identificador do provedor inválido');
        $result=self::request('/transactions/check','POST',['transactionId'=>$providerId]);
        $checked=self::readChecked($result,(int)$row['amount_cents'],$providerId);
        $new=$checked['status'];
        if(in_array((string)$row['status'],['pending','unknown'],true)){
            $updated=$db->run("UPDATE admin_quick_pix SET status=?,checked_at=? WHERE id=? AND status IN ('pending','unknown')",
                [$new,gmdate('Y-m-d H:i:s'),$row['id']]);
            if($new==='paid'&&$updated->rowCount()>0){
                try{Notifications::adminPixReceived($db,(string)$row['id'],(int)$row['amount_cents']);}
                catch(\Throwable $e){error_log('ARGUS traditional Pix notification failed: '.get_class($e));}
            }
        }
        $latest=$db->one('SELECT * FROM admin_quick_pix WHERE id=?',[$row['id']]);
        return $latest?:$row;
    }

    /** Runs on the existing notification worker, whether or not an admin has the app open. */
    public static function worker(Database $db):array {
        if(getenv('ARGUS_QUICK_PIX_PROVIDER')!=='traditional' || !in_array($db->driver(),['pgsql','mysql'],true))
            return ['checked'=>0,'paid'=>0,'errors'=>0];
        $cutoff=gmdate('Y-m-d H:i:s',time()-7*86400);
        $stale=gmdate('Y-m-d H:i:s',time()-45);
        $rows=$db->all("SELECT * FROM admin_quick_pix WHERE provider_id LIKE 'tr_%' AND status IN ('pending','unknown') AND created_at>=? AND (checked_at IS NULL OR checked_at<?) ORDER BY checked_at ASC LIMIT 16",[$cutoff,$stale]);
        $stats=['checked'=>0,'paid'=>0,'errors'=>0];
        foreach($rows as $row){
            if(!str_starts_with((string)($row['provider_id']??''),'tr_'))continue;
            try{
                $fresh=self::reconcileRow($db,$row);
                $stats['checked']++;
                if($fresh['status']==='paid')$stats['paid']++;
            }catch(\Throwable $e){
                $stats['errors']++;
                // Throttle outages and missing TRANSACTION_READ while retaining unresolved status.
                $db->run("UPDATE admin_quick_pix SET checked_at=? WHERE id=? AND status IN ('pending','unknown')",
                    [gmdate('Y-m-d H:i:s'),$row['id']]);
                if($e instanceof ApiError&&str_contains($e->getMessage(),'API_SCOPE_DENIED'))
                    error_log('ARGUS traditional Pix reconciliation blocked: missing TRANSACTION_READ permission');
                else
                    error_log('ARGUS traditional Pix reconciliation unavailable: '.get_class($e));
            }
        }
        error_log('ARGUS traditional Pix reconciliation cycle: checked='.$stats['checked'].' paid='.$stats['paid'].' errors='.$stats['errors']);
        return $stats;
    }
    private static function access():array {
        try {
            $d=self::request('/users/info');
            return ['status'=>'verified','provider_http_status'=>200];
        } catch(ApiError $e) {
            // This endpoint typically requires BALANCE_READ; 403 API_SCOPE_DENIED
            // means the key authenticated, NOT that CREATE is allowed.
            // For config, use low-impact check and allow submit only with proof of auth.
            if(str_contains($e->getMessage(),'API_SCOPE_DENIED'))
                return ['status'=>'verified','provider_http_status'=>403];
            return ['status'=>'unavailable','provider_http_status'=>null];
        } catch(\Throwable){return ['status'=>'unavailable','provider_http_status'=>null];}
    }
    private static function publicCharge(array $row):array {
        return ['id'=>$row['id'],'amount_cents'=>(int)$row['amount_cents'],
            'pix_copy_paste'=>$row['qr_copy'],'status'=>$row['status'],
            'created_at'=>$row['created_at'],'provider'=>'MisticPay tradicional',
            'recipient'=>'Conta MisticPay vinculada'];
    }
    private static function known(Database $db,string $id,array $actor):array {
        $charge=$db->one('SELECT * FROM admin_quick_pix WHERE id=?',[$id]);
        if(!$charge||$charge['actor_id']!==$actor['id'])self::fail('Cobrança não encontrada',404);
        return $charge;
    }
    public static function handle(Database $db,string $method,string $path,array $actor):never {
        if(($actor['role']??'')!=='superadmin')self::fail('Área reservada à administração principal',403);
        if($method==='GET'&&$path==='/api/admin/quick-pix/config') {
            $valid=false;
            try{self::credentials();$valid=true;}catch(\Throwable){}
            $access=$valid?self::access():['status'=>'missing','provider_http_status'=>null];
            $readScope=$valid?self::readPermission():['status'=>'missing'];
            self::reply(['configured'=>$valid,'provider_access'=>$access['status'],
                'provider_http_status'=>$access['provider_http_status'],
                'transaction_read_scope'=>$readScope['status'],
                'ready'=>$valid&&$access['status']==='verified'&&$readScope['status']==='verified'&&in_array($db->driver(),['pgsql','mysql'],true),
                'min_cents'=>100,'max_cents'=>10000,'recipient'=>'Conta MisticPay vinculada',
                'provider'=>'traditional','payer_fields_required'=>true,'split'=>false]);
        }
        if($method==='GET'&&$path==='/api/admin/quick-pix') {
            self::reply($db->all('SELECT id,amount_cents,provider_id,status,created_at,checked_at FROM admin_quick_pix ORDER BY created_at DESC LIMIT 150'));
        }
        if($method==='POST'&&$path==='/api/admin/quick-pix'){
            if(!in_array($db->driver(),['pgsql','mysql'],true))self::fail('Banco persistente indisponível',503);
            $data=json_decode(file_get_contents('php://input')?:'{}',true);
            if(!is_array($data))self::fail('JSON inválido');
            $cents=$data['amount_cents']??null;
            if(!is_int($cents))self::fail('Valor em centavos inválido');
            // The payer's legal identity is obtained exclusively from the MFA-protected
            // server-side profile, never accepted from browser-supplied payment fields.
            $identity=IdentityProfile::forPayment($db,(string)$actor['id']);
            $name=$identity['legal_name'];
            $cpf=$identity['document_number'];
            $uuid=(string)($data['idempotency_key']??'');
            if(!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iD',$uuid))self::fail('Chave de idempotência inválida');
            $id='qpx_'.bin2hex(random_bytes(16));$desc='Cobrança ARGUS '.$id;
            try{$body=self::createBody($cents,$name,$cpf,$id,$desc);}
            catch(\InvalidArgumentException $e){self::fail($e->getMessage());}
            $hash=hash('sha256',$uuid);
            // Raw payer name or CPF are never persisted in the quick-charge table.
            $bodyHash=hash('sha256',json_encode([$cents,$body['payerName'],$cpf],JSON_THROW_ON_ERROR));
            $existing=$db->one('SELECT * FROM admin_quick_pix WHERE idempotency_hash=?',[$hash]);
            if($existing){
                if(!hash_equals($existing['body_hash'],$bodyHash))self::fail('Tentativa Pix repetida com dados diferentes',409);
                self::reply(self::publicCharge($existing));
            }
            try{
                $db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    [$id,$actor['id'],$hash,$bodyHash,$cents,$desc,null,null,'creating',gmdate('Y-m-d H:i:s'),null]);
            }catch(\PDOException $e){
                $prev=$db->one('SELECT * FROM admin_quick_pix WHERE idempotency_hash=?',[$hash]);
                if(!$prev||!hash_equals($prev['body_hash'],$bodyHash))self::fail('Conflito de idempotência',409);
                self::reply(self::publicCharge($prev));
            }
            try{
                $result=self::request('/transactions/create','POST',$body,$uuid);
                $created=self::readCreated($result);
                $db->run('UPDATE admin_quick_pix SET provider_id=?,qr_copy=?,status=?,checked_at=? WHERE id=? AND status=?',
                    [$created['provider_id'],$created['copy'],$created['status'],gmdate('Y-m-d H:i:s'),$id,'creating']);
                $row=self::known($db,$id,$actor);
                self::reply(self::publicCharge($row),201);
            }catch(\Throwable $e){
                $db->run("UPDATE admin_quick_pix SET status='unknown',checked_at=? WHERE id=? AND status='creating'",
                    [gmdate('Y-m-d H:i:s'),$id]);
                error_log('ARGUS_TRADITIONAL_QUICK_PIX outcome=unknown type='.get_class($e).' id='.$id);
                self::reply(['id'=>$id,'amount_cents'=>$cents,'status'=>'unknown',
                    'message'=>'Emissão sem confirmação. NÃO repita com outra tentativa; confira com o provedor.'],200);
            }
        }
        if(preg_match('~^/api/admin/quick-pix/(qpx_[a-f0-9]{32})(/reconcile)?$~D',$path,$m)){
            $row=self::known($db,$m[1],$actor);
            if($method==='GET'&&empty($m[2]))self::reply(self::publicCharge($row));
            if($method==='POST'&&!empty($m[2])){
                $p=(string)$row['provider_id'];
                if(!str_starts_with($p,'tr_'))self::fail('Esta cobrança não foi emitida pela API tradicional e não pode ser conciliada nessa integração',409);
                $fresh=self::reconcileRow($db,$row);
                self::reply(['charge'=>self::publicCharge($fresh),'status'=>$fresh['status']]);
            }
        }
        self::fail('Rota indisponível',404);
    }
}
