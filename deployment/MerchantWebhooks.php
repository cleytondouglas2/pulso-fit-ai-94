<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Merchant OUTBOUND webhooks. Ledger events are immutable, PSP-confirmed
 * and account-scoped. These POSTs are notifications, NEVER proof of payment.
 * TLS connects to a pinned, public IPv4; no redirects or private-network calls.
 */
final class MerchantWebhooks {
    private static function fail(string $m,int $code=422):never{throw new ApiError($m,$code);}
    private static function out(array $v,int $code=200):never{
        http_response_code($code);header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        echo json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
    }
    private static function body():array{
        $data=file_get_contents('php://input');
        if(!is_string($data)||strlen($data)>4096)self::fail('Dados inválidos',413);
        try{$v=json_decode($data,true,16,JSON_THROW_ON_ERROR);}catch(\Throwable){self::fail('JSON inválido',400);}
        if(!is_array($v)||array_is_list($v))self::fail('Objeto JSON obrigatório');
        return $v;
    }
    private static function secretKey():string{
        $key=(string)(getenv('ARGUS_WEBHOOK_ENCRYPTION_KEY')?:getenv('ARGUS_DOC_HMAC_KEY')?:'');
        if(strlen($key)<32||!function_exists('sodium_crypto_secretbox'))
            self::fail('Proteção de chaves de webhook não configurada',503);
        return hash_hkdf('sha256',$key,SODIUM_CRYPTO_SECRETBOX_KEYBYTES,'argus-merchant-webhook-v1');
    }
    private static function seal(string $plain):string{
        $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce.sodium_crypto_secretbox($plain,$nonce,self::secretKey()));
    }
    private static function unseal(string $sealed):string{
        $bin=base64_decode($sealed,true);
        if(!is_string($bin)||strlen($bin)<SODIUM_CRYPTO_SECRETBOX_NONCEBYTES+16)
            self::fail('Chave de webhook indisponível',503);
        $nonce=substr($bin,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain=sodium_crypto_secretbox_open(substr($bin,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            $nonce,self::secretKey());
        if(!is_string($plain))self::fail('Chave de webhook inválida',503);
        return $plain;
    }
    public static function install(Database $db):void{
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_merchant_webhook_endpoints (
            id VARCHAR(64) PRIMARY KEY,account_id VARCHAR(64) NOT NULL,
            endpoint_url VARCHAR(500) NOT NULL,secret_sealed TEXT NOT NULL,
            status VARCHAR(20) NOT NULL,created_at VARCHAR(32) NOT NULL,
            disabled_at VARCHAR(32)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_webhook_account_idx
            ON argus_merchant_webhook_endpoints(account_id,status)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_merchant_webhook_deliveries (
            id VARCHAR(64) PRIMARY KEY,webhook_id VARCHAR(64) NOT NULL,
            account_id VARCHAR(64) NOT NULL,ledger_id VARCHAR(80) NOT NULL,
            event_kind VARCHAR(40) NOT NULL,payload TEXT NOT NULL,
            status VARCHAR(20) NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at BIGINT NOT NULL,created_at VARCHAR(32) NOT NULL,
            delivered_at VARCHAR(32),last_http_code INTEGER,
            UNIQUE(webhook_id,ledger_id)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_webhook_delivery_queue_idx
            ON argus_merchant_webhook_deliveries(status,next_attempt_at)");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_webhook_delivery_account_idx
            ON argus_merchant_webhook_deliveries(account_id,created_at)");
    }
    public static function validUrl(string $url):bool{
        if(strlen($url)<18||strlen($url)>500||preg_match('/[\x00-\x20\\]/',$url))
            return false;
        $p=parse_url($url);
        if(!is_array($p)||($p['scheme']??'')!=='https'||!empty($p['user'])||
           !empty($p['pass'])||isset($p['fragment'])||isset($p['port'])||
           isset($p['query']))return false;
        $host=strtolower((string)($p['host']??''));
        if(strlen($host)<5||strlen($host)>253||
           !preg_match('/^(?=.{5,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,30}$/D',$host)||
           str_ends_with($host,'.local')||str_ends_with($host,'.internal')||
           str_ends_with($host,'.localhost'))return false;
        return strlen((string)($p['path']??''))<=300;
    }
    public static function register(Database $db,string $account,string $url):array{
        self::install($db);$url=trim($url);
        if(!self::validUrl($url))
            self::fail('Use uma URL HTTPS pública com domínio válido, sem parâmetros, fragmentos ou portas extras.');
        $n=$db->one("SELECT COUNT(*) AS n FROM argus_merchant_webhook_endpoints
            WHERE account_id=? AND status='active'",[$account]);
        if((int)$n['n']>=3)self::fail('Limite de três webhooks ativos por revendedor',409);
        $id='wh_'.bin2hex(random_bytes(16));
        $secret='whsec_'.bin2hex(random_bytes(32));
        $db->run('INSERT INTO argus_merchant_webhook_endpoints
            (id,account_id,endpoint_url,secret_sealed,status,created_at,disabled_at)
            VALUES(?,?,?,?,?,?,NULL)',[
                $id,$account,$url,self::seal($secret),'active',Database::stamp()
            ]);
        return ['id'=>$id,'url'=>$url,'status'=>'active','signing_secret'=>$secret,
            'message'=>'Copie o segredo agora. Ele não será mostrado novamente. Verifique assinaturas no seu servidor.'];
    }
    public static function list(Database $db,string $account):array{
        self::install($db);
        return $db->all('SELECT id,endpoint_url AS url,status,created_at,disabled_at
            FROM argus_merchant_webhook_endpoints WHERE account_id=?
            ORDER BY created_at DESC LIMIT 30',[$account]);
    }
    public static function disable(Database $db,string $account,string $id):void{
        self::install($db);
        $changed=$db->run("UPDATE argus_merchant_webhook_endpoints SET status='disabled',
            disabled_at=? WHERE id=? AND account_id=? AND status='active'",
            [Database::stamp(),$id,$account]);
        if($changed->rowCount()!==1)self::fail('Webhook não encontrado ou desativado',404);
        $db->run("UPDATE argus_merchant_webhook_deliveries SET status='cancelled'
            WHERE webhook_id=? AND account_id=? AND status IN ('pending','sending')",[$id,$account]);
    }
    private static function eventType(string $kind):?string{
        return match($kind){
            'deposit_paid'=>'pix.paid','deposit_refund'=>'pix.refunded',
            'withdraw_hold'=>'payout.requested','withdraw_paid'=>'payout.paid',
            'withdraw_release'=>'payout.released',default=>null
        };
    }
    /** Called by worker, includes historical events only after subscription date. */
    public static function queue(Database $db,int $limit=200):int{
        self::install($db);MerchantWallet::install($db);
        $limit=max(1,min(200,$limit));$since=gmdate('Y-m-d H:i:s',time()-30*86400);
        $events=$db->all("SELECT e.id webhook_id,e.account_id,l.id ledger_id,
            l.operation_kind,l.operation_id,l.delta_available,l.delta_held,
            l.delta_debt,l.service_fee_cents,l.created_at
            FROM argus_seller_ledger l JOIN argus_merchant_webhook_endpoints e
              ON l.account_id=e.account_id AND l.created_at>=e.created_at
            LEFT JOIN argus_merchant_webhook_deliveries d
              ON d.webhook_id=e.id AND d.ledger_id=l.id
            WHERE e.status='active' AND l.created_at>=? AND d.id IS NULL
            ORDER BY l.created_at ASC,l.id ASC LIMIT ".$limit,[$since]);
        $n=0;
        foreach($events as $event){
            $type=self::eventType((string)$event['operation_kind']);
            if($type===null)continue;
            $payload=json_encode([
                'id'=>'evt_'.hash('sha256',(string)$event['webhook_id'].':'.$event['ledger_id']),
                'type'=>$type,'created_at'=>$event['created_at'],
                'data'=>[
                    'operation_id'=>$event['operation_id'],
                    'account_id'=>$event['account_id'],
                    'delta_available_cents'=>(int)$event['delta_available'],
                    'delta_held_cents'=>(int)$event['delta_held'],
                    'delta_adjustment_cents'=>(int)$event['delta_debt'],
                    'service_fee_cents'=>(int)$event['service_fee_cents']
                ]
            ],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
            try{
                $db->run("INSERT INTO argus_merchant_webhook_deliveries
                  (id,webhook_id,account_id,ledger_id,event_kind,payload,status,attempts,
                   next_attempt_at,created_at,delivered_at,last_http_code)
                  VALUES(?,?,?,?,?,?,'pending',0,?,?,NULL,NULL)",[
                    'whd_'.bin2hex(random_bytes(16)),$event['webhook_id'],
                    $event['account_id'],$event['ledger_id'],$type,$payload,
                    time(),Database::stamp()
                ]);
                $n++;
            }catch(\PDOException $ex){
                // Idempotent UNIQUE delivery insert; no duplicate event per endpoint.
                $existing=$db->one('SELECT id FROM argus_merchant_webhook_deliveries
                    WHERE webhook_id=? AND ledger_id=?',[$event['webhook_id'],$event['ledger_id']]);
                if(!$existing)throw $ex;
            }
        }
        return $n;
    }
    /**
     * Resolve A records, require globally routable IPv4, then connect directly
     * to that vetted address with SNI and certificate bound to the hostname.
     * Never allow redirects, URL-embedded auth, forwarded private IPs or ports.
     */
    private static function deliver(string $url,string $body,string $secret,string $deliveryId):int{
        if(!self::validUrl($url))return 0;
        $p=parse_url($url);$host=strtolower((string)$p['host']);
        $records=dns_get_record($host,DNS_A);
        if(!is_array($records)||count($records)===0)return 0;
        $ips=[];
        foreach($records as $record){
            $ip=$record['ip']??'';
            if(!is_string($ip)||filter_var($ip,FILTER_VALIDATE_IP,
                FILTER_FLAG_IPV4|FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE)===false)
                return 0;
            // Shared address space is not universally excluded by NO_RES_RANGE.
            $oct=explode('.',$ip);$a=(int)$oct[0];$b=(int)$oct[1];
            if(($a===100&&$b>=64&&$b<=127)||($a===198&&$b>=18&&$b<=19))return 0;
            $ips[]=$ip;
        }
        $ip=$ips[0];$path=($p['path']??'')?:'/';
        $ts=(string)time();
        $sig=hash_hmac('sha256',$ts.'.'.$body,$secret);
        $headers="POST ".$path." HTTP/1.1\r\nHost: ".$host."\r\n".
            "Content-Type: application/json\r\n".
            "X-Argus-Delivery: ".$deliveryId."\r\n".
            "X-Argus-Timestamp: ".$ts."\r\n".
            "X-Argus-Signature: sha256=".$sig."\r\n".
            "User-Agent: ArgusPay-Webhook/1.0\r\n".
            "Content-Length: ".strlen($body)."\r\nConnection: close\r\n\r\n";
        $ctx=stream_context_create(['ssl'=>[
            'verify_peer'=>true,'verify_peer_name'=>true,'allow_self_signed'=>false,
            'peer_name'=>$host,'SNI_enabled'=>true,'SNI_server_name'=>$host
        ]]);
        $errno=0;$errstr='';
        $socket=@stream_socket_client('tls://'.$ip.':443',$errno,$errstr,5,STREAM_CLIENT_CONNECT,$ctx);
        if(!is_resource($socket))return 0;
        stream_set_timeout($socket,5);
        $raw=$headers.$body;$offset=0;$n=strlen($raw);
        while($offset<$n){
            $written=@fwrite($socket,substr($raw,$offset));
            if(!is_int($written)||$written<=0){fclose($socket);return 0;}
            $offset+=$written;
        }
        $first=fgets($socket,256);
        fclose($socket);
        if(!is_string($first)||!preg_match('~^HTTP/1\.[01] (\d{3})(?: |$)~',$first,$matches))return 0;
        return (int)$matches[1];
    }
    /** Strict bounded retries and exclusive claim prevent duplicate concurrent sends. */
    public static function worker(Database $db):array{
        self::install($db);
        $queued=self::queue($db);
        if(getenv('ARGUS_MERCHANT_WEBHOOKS_ENABLED')!=='yes')
            return ['queued'=>$queued,'delivered'=>0,'failed'=>0,'delivery_enabled'=>false];
        $now=time();$done=0;$errors=0;
        $rows=$db->all("SELECT d.*,e.endpoint_url,e.secret_sealed,e.status endpoint_status
          FROM argus_merchant_webhook_deliveries d
          JOIN argus_merchant_webhook_endpoints e ON e.id=d.webhook_id
          WHERE ((d.status='pending') OR (d.status='sending'))
            AND d.next_attempt_at<=? ORDER BY d.next_attempt_at,d.created_at LIMIT 5",[$now]);
        foreach($rows as $r){
            if($r['endpoint_status']!=='active')continue;
            $claimed=$db->run("UPDATE argus_merchant_webhook_deliveries
                SET status='sending',next_attempt_at=? WHERE id=? AND
                ((status='pending' AND next_attempt_at<=?) OR
                 (status='sending' AND next_attempt_at<=?))",
                [$now+90,$r['id'],$now,$now]);
            if($claimed->rowCount()!==1)continue;
            $status=0;
            try{$status=self::deliver((string)$r['endpoint_url'],(string)$r['payload'],
                self::unseal((string)$r['secret_sealed']),(string)$r['id']);}
            catch(\Throwable){$status=0;}
            $attempts=(int)$r['attempts']+1;
            if($status>=200&&$status<300){
                $db->run("UPDATE argus_merchant_webhook_deliveries
                    SET status='delivered',attempts=?,last_http_code=?,delivered_at=? WHERE id=?",
                    [$attempts,$status,Database::stamp(),$r['id']]);$done++;
            }else{
                $delay=[60,300,900,3600,21600][$attempts-1]??21600;
                $db->run("UPDATE argus_merchant_webhook_deliveries
                    SET status=?,attempts=?,last_http_code=?,next_attempt_at=? WHERE id=?",
                    [$attempts>=6?'dead':'pending',$attempts,$status,$now+$delay,$r['id']]);
                $errors++;
            }
        }
        return ['queued'=>$queued,'delivered'=>$done,'failed'=>$errors,'delivery_enabled'=>true];
    }
    public static function portal(Database $db,string $method,string $path,array $account):never{
        $id=(string)$account['id'];self::install($db);
        if($method==='GET'&&$path==='/api/portal/webhooks')
            self::out(['endpoints'=>self::list($db,$id),
                'delivery_enabled'=>getenv('ARGUS_NOTIFICATIONS_WORKER_ENABLED')==='yes'&&
                    getenv('ARGUS_MERCHANT_WEBHOOKS_ENABLED')==='yes']);
        if($method==='POST'&&$path==='/api/portal/webhooks'){
            $v=self::body();$url=$v['url']??null;
            if(!is_string($url))self::fail('URL HTTPS obrigatória');
            self::out(self::register($db,$id,$url),201);
        }
        if($method==='GET'&&$path==='/api/portal/webhooks/deliveries'){
            $rows=$db->all('SELECT id,webhook_id,event_kind,status,attempts,last_http_code,created_at,delivered_at
                FROM argus_merchant_webhook_deliveries WHERE account_id=? ORDER BY created_at DESC LIMIT 50',[$id]);
            self::out(['deliveries'=>$rows]);
        }
        if($method==='POST'&&preg_match('~^/api/portal/webhooks/(wh_[a-f0-9]{32})/disable$~D',$path,$m)){
            self::disable($db,$id,$m[1]);self::out(['ok'=>true]);
        }
        self::fail('Rota de webhook inexistente',404);
    }
}
