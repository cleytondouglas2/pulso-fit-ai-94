<?php
declare(strict_types=1);
namespace ArgusPayments;
final class LegalAcceptance {
    public static function manifest(?string $root=null,?string $version=null,?string $approved=null):array {
        $root??='/var/www/html/public/static';
        $version??=(string)getenv('ARGUS_LEGAL_VERSION');
        $approved??=(string)getenv('ARGUS_LEGAL_APPROVED_DIGEST');
        $terms=file_get_contents($root.'/terms-of-use.html');$privacy=file_get_contents($root.'/privacy-lgpd.html');
        if(!is_string($terms)||!is_string($privacy))throw new \RuntimeException('Legal documents unavailable');
        $th=hash('sha256',$terms);$ph=hash('sha256',$privacy);
        $digest=hash('sha256',$version.':'.$th.':'.$ph);
        $active=preg_match('/^[a-zA-Z0-9._-]{1,40}$/D',$version)===1
            && hash_equals($digest,$approved)
            && !preg_match('/MINUTA|não vigente|versão de revisão/iu',$terms."\n".$privacy);
        return ['active'=>$active,'version'=>$active?$version:null,'terms_sha256'=>$th,'privacy_sha256'=>$ph,'digest'=>$digest];
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_legal_acceptance (
            account_id VARCHAR(80) NOT NULL,version VARCHAR(40) NOT NULL,terms_sha256 VARCHAR(64) NOT NULL,
            privacy_sha256 VARCHAR(64) NOT NULL,digest VARCHAR(64) NOT NULL,accepted_at VARCHAR(32) NOT NULL,
            PRIMARY KEY(account_id,digest))");
    }
    public static function validate(array $body,array $manifest):void {
        if(!$manifest['active'])throw new ApiError('Documentos ainda não vigentes.',409);
        if(($body['accepted_terms']??null)!==true||($body['read_privacy']??null)!==true||
            !is_string($body['legal_digest']??null)||!hash_equals($manifest['digest'],$body['legal_digest']))
            throw new ApiError('Leia os documentos vigentes e confirme o aceite da versão atual.',422);
    }
    public static function record(Database $db,string $account,array $body,?array $manifest=null):array {
        $manifest??=self::manifest();self::validate($body,$manifest);
        $sql='INSERT INTO argus_legal_acceptance(account_id,version,terms_sha256,privacy_sha256,digest,accepted_at) VALUES (?,?,?,?,?,?)';
        if($db->driver()==='mysql')$sql.=' ON DUPLICATE KEY UPDATE account_id=account_id';
        else $sql.=' ON CONFLICT(account_id,digest) DO NOTHING';
        $db->run($sql,[$account,$manifest['version'],$manifest['terms_sha256'],$manifest['privacy_sha256'],$manifest['digest'],gmdate('c')]);
        return self::status($db,$account,$manifest);
    }
    public static function status(Database $db,string $account,?array $manifest=null):array {
        $manifest??=self::manifest();
        $row=$manifest['active']?$db->one('SELECT version,accepted_at FROM argus_legal_acceptance WHERE account_id=? AND digest=?',[$account,$manifest['digest']]):null;
        return ['document'=>$manifest,'accepted'=>$row!==null&&$row!==false,'acceptance'=>$row?:null];
    }
    public static function publicInfo():never {
        header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
        echo json_encode(self::manifest(),JSON_THROW_ON_ERROR);exit;
    }
}
