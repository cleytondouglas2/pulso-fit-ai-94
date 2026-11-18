<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Owner-scoped legal identity for admin and portal users.
 * No plaintext CPF/CNPJ stored, no document exposed in a session or public response.
 * Numeric checks are not official identity verification or PSP onboarding approval.
 */
final class IdentityProfile {
    private static function fail(string $m,int $code=422):never{throw new ApiError($m,$code);}
    private static function json(array $x):never{
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        echo json_encode($x,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
    }
    public static function install(Database $db):void{
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_account_identities (
            owner_type VARCHAR(12) NOT NULL,
            owner_id VARCHAR(120) NOT NULL,
            legal_type VARCHAR(2) NOT NULL,
            legal_name VARCHAR(180) NOT NULL,
            document_digest VARCHAR(64) NOT NULL,
            document_last4 VARCHAR(4) NOT NULL,
            document_sealed TEXT NOT NULL,
            confirmed_at VARCHAR(32) NOT NULL,
            PRIMARY KEY(owner_type,owner_id))");
    }
    private static function key():string{
        if(!function_exists('sodium_crypto_secretbox')||!function_exists('hash_hkdf'))
            self::fail('Proteção dos documentos indisponível',503);
        $secret=(string)(getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY')?:'');
        if(strlen($secret)<32)self::fail('Proteção cadastral não configurada no servidor',503);
        return hash_hkdf('sha256',$secret,SODIUM_CRYPTO_SECRETBOX_KEYBYTES,'argus-identity-profile-2026-v1');
    }
    private static function seal(string $document):string{
        $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher=sodium_crypto_secretbox($document,$nonce,self::key());
        return base64_encode($nonce.$cipher);
    }
    private static function unseal(string $encoded):string{
        $all=base64_decode($encoded,true);
        if(!is_string($all)||strlen($all)<SODIUM_CRYPTO_SECRETBOX_NONCEBYTES+SODIUM_CRYPTO_SECRETBOX_MACBYTES)
            self::fail('Documento cadastral indisponível; procure o suporte',503);
        $nonce=substr($all,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain=sodium_crypto_secretbox_open(substr($all,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),$nonce,self::key());
        if(!is_string($plain))self::fail('Não foi possível decifrar o documento cadastral',503);
        return $plain;
    }
    private static function digest(string $doc):string{
        $secret=(string)(getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY')?:'');
        if(strlen($secret)<32)self::fail('Proteção documental não configurada',503);
        return hash_hmac('sha256',$doc,$secret);
    }
    public static function validCpf(string $cpf):bool{
        if(!preg_match('/^\d{11}$/D',$cpf)||preg_match('/^(\d)\1{10}$/D',$cpf))return false;
        for($position=9;$position<=10;$position++){
            $sum=0;for($i=0;$i<$position;$i++)$sum+=(int)$cpf[$i]*($position+1-$i);
            $d=($sum*10)%11;if($d===10)$d=0;
            if($d!==(int)$cpf[$position])return false;
        }
        return true;
    }
    public static function validCnpj(string $cnpj):bool{
        if(!preg_match('/^\d{14}$/D',$cnpj)||preg_match('/^(\d)\1{13}$/D',$cnpj))return false;
        for($position=12;$position<=13;$position++){
            $weights=$position===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];
            $sum=0;foreach($weights as $i=>$weight)$sum+=(int)$cnpj[$i]*$weight;
            $rem=$sum%11;
            if((int)$cnpj[$position]!==($rem<2?0:11-$rem))return false;
        }
        return true;
    }
    public static function validate(string $type,string $name,string $number):array{
        if(!in_array($type,['PF','PJ'],true))self::fail('Selecione pessoa física ou jurídica');
        $name=trim(preg_replace('/\s+/u',' ',$name)??'');
        if(mb_strlen($name,'UTF-8')<3||mb_strlen($name,'UTF-8')>180)self::fail('Informe o nome completo ou a razão social');
        if($type==='PF'&&!str_contains($name,' '))self::fail('Informe seu nome completo, com sobrenome');
        $digits=preg_replace('/\D/','',$number)??'';
        if($type==='PF'&&!self::validCpf($digits))self::fail('CPF inválido');
        if($type==='PJ'&&!self::validCnpj($digits))self::fail('CNPJ inválido');
        return [$type,$name,$digits];
    }
    public static function public(Database $db,string $kind,string $owner):array{
        self::install($db);
        $r=$db->one('SELECT legal_type,legal_name,document_last4,confirmed_at FROM argus_account_identities WHERE owner_type=? AND owner_id=?',[$kind,$owner]);
        if(!$r)return ['complete'=>false,'account_type'=>null,'legal_name'=>null,'document_last4'=>null];
        return ['complete'=>true,'account_type'=>$r['legal_type'],'legal_name'=>$r['legal_name'],
            'document_last4'=>$r['document_last4'],'confirmed_at'=>$r['confirmed_at']];
    }
    public static function store(Database $db,string $kind,string $owner,string $type,string $name,string $doc):array{
        if(!in_array($kind,['admin','portal'],true)||$owner==='')self::fail('Cadastro inválido',403);
        [$type,$name,$doc]=self::validate($type,$name,$doc);
        self::install($db);
        $hash=self::digest($doc);
        $existing=$db->one('SELECT legal_type,document_digest FROM argus_account_identities WHERE owner_type=? AND owner_id=?',[$kind,$owner]);
        // A validated account must not switch its legal identity by silently editing the profile.
        if($existing&&($existing['legal_type']!==$type||!hash_equals((string)$existing['document_digest'],$hash)))
            self::fail('Para trocar CPF/CNPJ ou tipo de pessoa, solicite análise cadastral ao suporte',409);
        $sealed=self::seal($doc);
        $db->transaction(static function(Database $db) use($kind,$owner,$type,$name,$doc,$hash,$sealed){
            $db->run('DELETE FROM argus_account_identities WHERE owner_type=? AND owner_id=?',[$kind,$owner]);
            $db->run('INSERT INTO argus_account_identities(owner_type,owner_id,legal_type,legal_name,document_digest,document_last4,document_sealed,confirmed_at) VALUES (?,?,?,?,?,?,?,?)',
                [$kind,$owner,$type,$name,$hash,substr($doc,-4),$sealed,Database::stamp()]);
        });
        return self::public($db,$kind,$owner);
    }
    public static function forPayment(Database $db,string $actorId):array{
        self::install($db);
        $r=$db->one('SELECT legal_type,legal_name,document_sealed,document_digest FROM argus_account_identities WHERE owner_type=? AND owner_id=?',
            ['admin',$actorId]);
        if(!$r)self::fail('Complete o cadastro PF/PJ após entrar na conta para gerar Pix.',409);
        $doc=self::unseal($r['document_sealed']);
        [$type,$name,$document]=self::validate($r['legal_type'],$r['legal_name'],$doc);
        if(!hash_equals((string)$r['document_digest'],self::digest($document)))
            self::fail('Documento de cadastro inconsistente; procure o suporte',503);
        return ['account_type'=>$type,'legal_name'=>$name,'document_number'=>$document];
    }
    public static function admin(Database $db,string $method,string $path,array $actor):never{
        if($path!=='/api/admin/account-profile')self::fail('Rota indisponível',404);
        if($method==='GET')self::json(['profile'=>self::public($db,'admin',(string)$actor['id'])]);
        if($method==='POST'){
            $raw=file_get_contents('php://input');
            if(!is_string($raw)||strlen($raw)>8192)self::fail('Dados de cadastro muito extensos',413);
            try{$v=json_decode($raw,true,32,JSON_THROW_ON_ERROR);}catch(\JsonException){self::fail('JSON inválido');}
            if(!is_array($v))self::fail('Cadastro inválido');
            $type=$v['account_type']??null;$name=$v['legal_name']??null;$doc=$v['document_number']??null;
            if(!is_string($type)||!is_string($name)||!is_string($doc))self::fail('Preencha tipo de pessoa, nome e CPF/CNPJ');
            self::json(['ok'=>true,'profile'=>self::store($db,'admin',(string)$actor['id'],$type,$name,$doc)]);
        }
        self::fail('Método não permitido',405);
    }
    public static function portal(Database $db,array $a,array $data):array{
        $type=$data['account_type']??null;$name=$data['legal_name']??null;$doc=$data['document_number']??null;
        if(!is_string($type)||!is_string($name)||!is_string($doc))
            self::fail('Preencha os dados cadastrais obrigatórios');
        // Existing portal account identity/type is immutable without human re-review.
        if($type!==$a['account_type'])self::fail('O tipo de cadastro já está vinculado a esta conta',409);
        if(!hash_equals((string)$a['document_digest'],self::digest(preg_replace('/\D/','',$doc)??'')))
            self::fail('O documento não coincide com o cadastro original',409);
        // Keep reviewed legal name stable when an account is approved for payments.
        if($a['status']==='approved'&&$name!==$a['display_name'])
            self::fail('Alteração da razão social/nome de conta aprovada exige revisão',409);
        return self::store($db,'portal',(string)$a['id'],$type,$name,$doc);
    }
}
