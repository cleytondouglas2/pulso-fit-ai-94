<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Database-backed request throttle for sensitive Argus actions.
 * Buckets contain HMAC identifiers ONLY, never raw IPs, CPF, login emails,
 * API keys or passwords. Atomic upserts work with PostgreSQL, MySQL and SQLite.
 *
 * Rate-limits are guard rails, not a replacement for WAF, transaction risk
 * scoring, certified facial PAD, payment-provider KYC or operational review.
 */
final class SecurityShield {
    private static function fail(string $text,int $code=429):never {
        throw new ApiError($text,$code);
    }
    private static function secret():string{
        $secret=(string)(getenv('ARGUS_SECURITY_RATE_SECRET')?:
            getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY')?:'');
        if(strlen($secret)<32)
            self::fail('Proteção contra abuso indisponível no servidor',503);
        return $secret;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_security_request_buckets(
            bucket_key VARCHAR(64) PRIMARY KEY,
            category VARCHAR(40) NOT NULL,
            hits INTEGER NOT NULL DEFAULT 0,
            created_at VARCHAR(32) NOT NULL,
            expires_at BIGINT NOT NULL
        )");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_security_risk_events(
            id VARCHAR(32) PRIMARY KEY,
            category VARCHAR(40) NOT NULL,
            subject_hash VARCHAR(64) NOT NULL,
            event_time VARCHAR(32) NOT NULL
        )");
    }
    private static function audit(Database $db,string $category,string $subjectHash):void{
        try{
            $db->run('INSERT INTO argus_security_risk_events
                (id,category,subject_hash,event_time) VALUES(?,?,?,?)',[
                bin2hex(random_bytes(16)),$category,$subjectHash,Database::stamp()
            ]);
        }catch(\Throwable){
            // Rate-limit denial is enforced even if telemetry cannot be saved.
        }
    }
    public static function rate(Database $db,string $category,string $subject,int $max,int $windowSec):void {
        if(!preg_match('/^[a-z_]{3,40}$/D',$category)||
           $max<1||$max>100000||$windowSec<10||$windowSec>86400)
            throw new \InvalidArgumentException('Invalid private request throttle configuration');
        self::install($db);
        $now=time();$window=(int)floor($now/$windowSec);
        $hash=hash_hmac('sha256',$category."\n".$window."\n".$subject,self::secret());
        $expiry=($window+1)*$windowSec;
        if($db->driver()==='mysql'){
            $db->run('INSERT INTO argus_security_request_buckets
                (bucket_key,category,hits,created_at,expires_at)
                VALUES(?,?,?,?,?)
                ON DUPLICATE KEY UPDATE hits=hits+1',[
                $hash,$category,1,Database::stamp(),$expiry
            ]);
        }else{
            $db->run('INSERT INTO argus_security_request_buckets
                (bucket_key,category,hits,created_at,expires_at)
                VALUES(?,?,?,?,?)
                ON CONFLICT(bucket_key) DO UPDATE SET hits=argus_security_request_buckets.hits+1',[
                $hash,$category,1,Database::stamp(),$expiry
            ]);
        }
        $row=$db->one('SELECT hits FROM argus_security_request_buckets WHERE bucket_key=?',[$hash]);
        if((int)($row['hits']??0)>$max){
            self::audit($db,'rate_'.$category,$hash);
            if(!headers_sent())header('Retry-After: '.max(1,$expiry-$now));
            self::fail('Muitas tentativas neste período. Aguarde antes de tentar novamente.',429);
        }
        // Opportunistic TTL pruning: immutable hashed audit events are retained
        // for forensics; per-request rate buckets older than a day are purged.
        if(random_int(1,300)===1){
            try{$db->run('DELETE FROM argus_security_request_buckets WHERE expires_at<?',
                [$now-86400]);}catch(\Throwable){}
        }
    }
    public static function remoteTag():string{
        // Only REMOTE_ADDR is used; untrusted X-Forwarded-For must not let
        // callers bypass rate limits by inventing IP addresses.
        return (string)($_SERVER['REMOTE_ADDR']??'unknown');
    }
    public static function login(Database $db,string $email):void {
        $identity=hash_hmac('sha256',strtolower(trim($email)),self::secret());
        self::rate($db,'login_account',$identity,20,600);
        // Keep a loose network limiter to avoid blocking NAT/shared proxies.
        self::rate($db,'login_network',self::remoteTag(),2000,600);
    }
    public static function register(Database $db,string $email):void {
        $identity=hash_hmac('sha256',strtolower(trim($email)),self::secret());
        self::rate($db,'register_email',$identity,8,3600);
        self::rate($db,'register_network',self::remoteTag(),400,3600);
    }
    public static function merchant(Database $db,string $accountId,string $action):void{
        $limits=[
            'charge'=>[120,60],
            'withdraw'=>[10,60]
        ];
        if(!isset($limits[$action]))
            throw new \InvalidArgumentException('Invalid merchant action');
        [$max,$window]=$limits[$action];
        self::rate($db,'merchant_'.$action,$accountId,$max,$window);
    }

    /**
     * Failed integration authentication only. Successful checkout, reads and
     * payouts NEVER consume these limits. No raw API key or IP is persisted.
     * Unknown keys use only a coarse network bucket to prevent unbounded
     * creation of per-key rows by requests with random public keys.
     */
    public static function failedApi(Database $db,string $publicKey,bool $known):void{
        self::rate($db,'api_invalid_network',self::remoteTag(),1500,600);
        if($known){
            self::rate($db,'api_invalid_key',$publicKey,25,600);
        }
    }

    /** Token-bearing reset confirmations remain bounded during abuse attempts. */
    public static function resetVerify(Database $db,bool $admin):void{
        $category=$admin?'reset_admin_verify':'reset_portal_verify';
        // A generous network limit avoids locking users behind a shared proxy.
        self::rate($db,$category,self::remoteTag(),1500,600);
    }

    public static function unknownPayout(Database $db,string $accountId):void{
        $subject=hash_hmac('sha256','payout-account:'.$accountId,self::secret());
        self::audit($db,'uncertain_payout',$subject);
    }
}
