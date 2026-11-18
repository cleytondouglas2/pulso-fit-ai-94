<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * ARGUS KYC Studio. Documentary triage is not a government identity-verification
 * service, proof of beneficial ownership or payment-provider authorization.
 *
 * Sensitive bytes are encrypted before being stored in the persistent database.
 * Never expose them in account JSON, logs, URLs, event metadata or audit notes.
 */
final class KycStudio {
    private const MAX_BYTES=3200000;
    private const REQUIRED_PF=['identidade_frente','identidade_verso','selfie'];
    private const REQUIRED_PJ=['cnpj_comprovante','contrato_social','identidade_frente','identidade_verso','selfie'];
    private static function fail(string $text,int $status=422):never {throw new ApiError($text,$status);}
    private static function send(array $data,int $status=200):never{
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        exit;
    }
    private static function input(int $max=4500000):array {
        $len=(int)($_SERVER['CONTENT_LENGTH']??0);
        if($len>$max)self::fail('Arquivo ou dados acima do limite permitido',413);
        $raw=file_get_contents('php://input',false,null,0,$max+1);
        if(!is_string($raw)||strlen($raw)>$max)self::fail('Solicitação muito grande',413);
        try{$data=json_decode($raw,true,32,JSON_THROW_ON_ERROR);}catch(\JsonException){self::fail('Dados enviados em formato inválido',400);}
        if(!is_array($data)||array_is_list($data))self::fail('Dados inválidos',422);
        return $data;
    }
    private static function value(array $data,string $key,int $min=2,int $max=180):string{
        $v=$data[$key]??null;
        if(!is_string($v))self::fail('Preencha o campo '.$key);
        $v=trim($v);
        if(mb_strlen($v,'UTF-8')<$min||mb_strlen($v,'UTF-8')>$max)self::fail('Confira o campo '.$key);
        return $v;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_kyc_encrypted_documents (
            id VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64) NOT NULL,
            document_type VARCHAR(40) NOT NULL, mime VARCHAR(80) NOT NULL,
            payload_encrypted TEXT NOT NULL, sha256 VARCHAR(64) NOT NULL,
            created_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_kyc_representatives (
            account_id VARCHAR(64) PRIMARY KEY, full_name VARCHAR(180) NOT NULL,
            cpf_last4 VARCHAR(4) NOT NULL, cpf_digest VARCHAR(64) NOT NULL,
            cpf_ciphertext TEXT NOT NULL, capacity VARCHAR(32) NOT NULL,
            updated_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_kyc_review_events (
            id VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64) NOT NULL,
            reviewer_id VARCHAR(64) NOT NULL, reviewer_role VARCHAR(32) NOT NULL,
            event_type VARCHAR(32) NOT NULL, note VARCHAR(650) NOT NULL,
            document_types VARCHAR(250) NOT NULL, created_at VARCHAR(32) NOT NULL)");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_kyc_document_account_idx ON argus_kyc_encrypted_documents(account_id)");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_kyc_event_account_idx ON argus_kyc_review_events(account_id)");
    }
    private static function key():string {
        $secret=(string)(getenv('ARGUS_DOC_HMAC_KEY')?:getenv('ARGUS_PAYER_HMAC_KEY')?:'');
        if(strlen($secret)<32||!function_exists('sodium_crypto_secretbox')||!function_exists('hash_hkdf'))
            self::fail('Proteção documental ainda não está configurada no servidor',503);
        return hash_hkdf('sha256',$secret,SODIUM_CRYPTO_SECRETBOX_KEYBYTES,'argus-kyc-postgres-v1');
    }
    private static function encrypt(string $data):string{
        $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce.sodium_crypto_secretbox($data,$nonce,self::key()));
    }
    private static function decrypt(string $sealed):string{
        $blob=base64_decode($sealed,true);
        if(!is_string($blob)||strlen($blob)<=SODIUM_CRYPTO_SECRETBOX_NONCEBYTES+SODIUM_CRYPTO_SECRETBOX_MACBYTES)
            self::fail('Arquivo protegido indisponível',503);
        $nonce=substr($blob,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain=sodium_crypto_secretbox_open(substr($blob,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),$nonce,self::key());
        if(!is_string($plain))self::fail('Falha de integridade do arquivo',503);
        return $plain;
    }
    private static function id():string {return bin2hex(random_bytes(16));}
    public static function required(string $type):array {
        return $type==='PJ'?self::REQUIRED_PJ:self::REQUIRED_PF;
    }
    /** Most recent non-rejected document for each required type. */
    private static function latest(Database $db,string $accountId):array {
        $all=$db->all('SELECT id,document_type,mime,created_at,review_status FROM argus_portal_documents WHERE account_id=? ORDER BY created_at DESC,id DESC',[$accountId]);
        $latest=[];
        foreach($all as $d){
            if(!isset($latest[$d['document_type']]))$latest[$d['document_type']]=$d;
        }
        return $latest;
    }
    public static function summary(Database $db,array $account):array{
        self::install($db);
        $docs=self::latest($db,(string)$account['id']);
        $required=self::required((string)$account['account_type']);
        $present=[];
        foreach($required as $type){
            if(isset($docs[$type]) && in_array($docs[$type]['review_status'],['awaiting_review','approved'],true)
                && $db->one('SELECT id FROM argus_kyc_encrypted_documents WHERE id=? AND account_id=?',[$docs[$type]['id'],$account['id']]))
                $present[]=$type;
        }
        $rep=$db->one('SELECT full_name,cpf_last4,capacity,updated_at FROM argus_kyc_representatives WHERE account_id=?',[$account['id']]);
        $missing=array_values(array_diff($required,$present));
        if($account['account_type']==='PJ'&&!$rep)$missing[]='responsavel_legal';
        $history=$db->all('SELECT event_type,note,document_types,created_at FROM argus_kyc_review_events WHERE account_id=? ORDER BY created_at DESC LIMIT 12',[$account['id']]);
        return ['required'=>$required,'received'=>$present,'missing'=>$missing,
            'complete'=>count($missing)===0,
            'legal_representative'=>$rep?:null,
            'documents'=>array_values($docs),'history'=>$history,
            'status'=>$account['status'],
            'financial_enabled'=>$account['status']==='approved'&&!empty($account['merchant_id']),
            'document_storage'=>'encrypted_database'];
    }
    public static function identityApproved(Database $db,string $accountId):bool{
        self::install($db);
        $event=$db->one('SELECT event_type FROM argus_kyc_review_events WHERE account_id=? ORDER BY created_at DESC LIMIT 1',[$accountId]);
        return $event!==null&&$event['event_type']==='identity_approved';
    }
    private static function account(Database $db,string $id):array{
        $a=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$id]);
        if(!$a)self::fail('Cadastro não encontrado',404);
        return $a;
    }
    private static function uploadAllowed(array $a):void {
        if(!in_array((string)$a['status'],['documents_required','documents_under_review'],true))
            self::fail('Envio bloqueado nesta etapa do cadastro. Solicite uma nova análise ao suporte.',403);
    }
    private static function format(string $data,string $mime,string $type):void {
        if(!in_array($mime,['image/jpeg','image/png','application/pdf'],true))
            self::fail('Envie uma imagem JPG/PNG ou um PDF legível',422);
        if($type==='selfie'&&$mime==='application/pdf')self::fail('A selfie deve ser uma foto JPG ou PNG',422);
        if(!DocumentValidation::formatValid($data,$mime))
            self::fail('Documento incompleto, corrompido ou com resolução insuficiente',422);
    }
    public static function upload(Database $db,array $account):never {
        self::install($db);self::uploadAllowed($account);
        // Key readiness is checked before processing potentially large sensitive payloads.
        self::key();
        $input=self::input();
        $type=self::value($input,'document_type',4,32);
        if(!in_array($type,self::required((string)$account['account_type']),true))
            self::fail('Este documento não pertence ao tipo de cadastro escolhido',422);
        $encoded=self::value($input,'file_base64',100,4350000);
        $bytes=base64_decode($encoded,true);
        if(!is_string($bytes)||strlen($bytes)<1024||strlen($bytes)>self::MAX_BYTES)
            self::fail('O arquivo deve ter entre 1 KB e 3,2 MB',422);
        $mime=(new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if(!is_string($mime))self::fail('Tipo de arquivo não identificado');
        self::format($bytes,$mime,$type);
        $count=$db->one('SELECT COUNT(*) AS c FROM argus_portal_documents WHERE account_id=?',[$account['id']]);
        if((int)($count['c']??0)>=20)self::fail('Limite de documentos atingido; solicite orientação ao suporte',429);
        $id=self::id();$checksum=hash('sha256',$bytes);
        $sealed=self::encrypt($bytes);
        $stamp=Database::stamp();
        $db->transaction(static function(Database $db)use($account,$type,$mime,$id,$checksum,$sealed,$stamp){
            $db->run('INSERT INTO argus_kyc_encrypted_documents(id,account_id,document_type,mime,payload_encrypted,sha256,created_at) VALUES(?,?,?,?,?,?,?)',
                [$id,$account['id'],$type,$mime,$sealed,$checksum,$stamp]);
            $db->run('INSERT INTO argus_portal_documents(id,account_id,document_type,mime,sealed_file,file_digest,created_at,review_status) VALUES(?,?,?,?,?,?,?,?)',
                [$id,$account['id'],$type,$mime,'database:'.$id,$checksum,$stamp,'awaiting_review']);
        });
        // Only mark the dossier "under review" once all required evidence is present.
        $fresh=self::account($db,(string)$account['id']);
        $summary=self::summary($db,$fresh);
        $next=$summary['complete']?'documents_under_review':'documents_required';
        $db->run('UPDATE argus_portal_accounts SET status=?,updated_at=? WHERE id=? AND status IN (?,?)',
            [$next,Database::stamp(),$account['id'],'documents_required','documents_under_review']);
        $fresh['status']=$next;
        self::send(['ok'=>true,'kyc'=>self::summary($db,$fresh),
            'message'=>$summary['complete']?
            'Documentos recebidos. Sua conta está em análise; avisaremos após a avaliação.' :
            'Documento recebido com segurança. Envie os demais arquivos indicados.'],201);
    }
    public static function representative(Database $db,array $account):never {
        self::install($db);self::uploadAllowed($account);
        if($account['account_type']!=='PJ')self::fail('Representante legal exigido somente para empresa',422);
        $input=self::input(4096);
        $name=self::value($input,'full_name',5,180);
        if(!str_contains($name,' '))self::fail('Informe nome e sobrenome do responsável');
        $cpf=preg_replace('/\D/','',self::value($input,'cpf',11,19));
        if(!IdentityProfile::validCpf($cpf))self::fail('CPF do representante inválido',422);
        $role=self::value($input,'capacity',5,32);
        if(!in_array($role,['proprietario','socio','administrador'],true))
            self::fail('Selecione o vínculo com a empresa');
        $digest=hash_hmac('sha256',$cpf,self::key());
        $existing=$db->one('SELECT cpf_digest FROM argus_kyc_representatives WHERE account_id=?',[$account['id']]);
        if($existing&&$existing['cpf_digest']!==$digest)
            self::fail('Troca de representante exige revisão administrativa; peça uma correção de cadastro',409);
        $db->transaction(static function(Database $db)use($account,$name,$cpf,$digest,$role){
            $db->run('DELETE FROM argus_kyc_representatives WHERE account_id=?',[$account['id']]);
            $db->run('INSERT INTO argus_kyc_representatives(account_id,full_name,cpf_last4,cpf_digest,cpf_ciphertext,capacity,updated_at) VALUES(?,?,?,?,?,?,?)',
                [$account['id'],$name,substr($cpf,-4),$digest,self::encrypt($cpf),$role,Database::stamp()]);
        });
        $summary=self::summary($db,self::account($db,(string)$account['id']));
        $next=$summary['complete']?'documents_under_review':'documents_required';
        $db->run('UPDATE argus_portal_accounts SET status=?,updated_at=? WHERE id=? AND status IN (?,?)',
            [$next,Database::stamp(),$account['id'],'documents_required','documents_under_review']);
        $fresh=self::account($db,(string)$account['id']);
        self::send(['ok'=>true,'kyc'=>self::summary($db,$fresh),
            'message'=>$next==='documents_under_review'?'Documentação completa, aguardando análise da ARGUS.':
            'Responsável cadastrado. Envie os arquivos documentais pendentes.']);
    }
    public static function portal(Database $db,string $method,string $path,array $account):never{
        if($method==='GET'&&$path==='/api/portal/kyc/status')
            self::send(['kyc'=>self::summary($db,$account)]);
        if($method==='POST'&&$path==='/api/portal/kyc/representative')
            self::representative($db,$account);
        if($method==='POST'&&$path==='/api/portal/kyc/upload')
            self::upload($db,$account);
        self::fail('Rota documental indisponível',404);
    }
    private static function reviewer(array $actor):void{
        if(!in_array((string)($actor['role']??''),['admin','superadmin'],true))
            self::fail('Acesso restrito à equipe de análise KYC',403);
    }
    private static function dossier(Database $db,array $a):array{
        $data=self::summary($db,$a);
        return ['id'=>$a['id'],'account_type'=>$a['account_type'],
            'display_name'=>$a['display_name'],'email'=>$a['email'],
            'document_last4'=>$a['document_last4'],'status'=>$a['status'],
            'created_at'=>$a['created_at'],'updated_at'=>$a['updated_at'],
            'merchant_linked'=>!empty($a['merchant_id']),
            'screening'=>DocumentValidation::view($db,(string)$a['id']),
            'kyc'=>$data];
    }
    private static function reviewLog(Database $db,array $actor,string $account,string $event,string $note,array $types=[]):void{
        $db->run('INSERT INTO argus_kyc_review_events(id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at) VALUES(?,?,?,?,?,?,?,?)',
            [self::id(),$account,(string)$actor['id'],(string)$actor['role'],$event,$note,implode(',',array_slice($types,0,8)),Database::stamp()]);
    }
    private static function review(Database $db,array $actor,string $id):never{
        $a=self::account($db,$id);
        if(!in_array($a['status'],['documents_required','documents_under_review','identity_verified','rejected'],true))
            self::fail('Este cadastro não pode ser alterado pela triagem KYC',409);
        $data=self::input(3500);
        $decision=self::value($data,'decision',6,32);
        if(!in_array($decision,['approve_identity','needs_changes','reject'],true))self::fail('Decisão inválida');
        $reason=self::value($data,'reason',10,650);
        $kyc=self::summary($db,$a);
        $now=Database::stamp();
        if($decision==='approve_identity'){
            if($a['status']!=='documents_under_review'||!$kyc['complete'])
                self::fail('Envie todos os documentos e o responsável PJ antes da aprovação',422);
            foreach(['documents_match','identity_matches','legal_representative_checked'] as $check){
                if(($data[$check]??null)!==true)self::fail('Confirmar revisão: '.$check,422);
            }
            $db->transaction(static function(Database $db)use($id,$actor,$reason,$now){
                $db->run("UPDATE argus_portal_accounts SET status='identity_verified',updated_at=? WHERE id=? AND status='documents_under_review'",[$now,$id]);
                $db->run("UPDATE argus_portal_documents SET review_status='approved' WHERE account_id=? AND review_status='awaiting_review'",[$id]);
                self::reviewLog($db,$actor,$id,'identity_approved',$reason);
            });
            try{Notifications::accountUpdate($db,$id,'identity_verified');}catch(\Throwable){}
            self::send(['ok'=>true,'status'=>'identity_verified','message'=>'Documentos aprovados. A liberação financeira exige autorização operacional separada.']);
        }
        if($decision==='needs_changes'){
            $types=$data['requested_types']??[];
            if(!is_array($types)||!array_is_list($types)||count($types)<1||count($types)>6)
                self::fail('Selecione os documentos que precisam ser corrigidos',422);
            $allowed=array_merge(self::required((string)$a['account_type']),$a['account_type']==='PJ'?['responsavel_legal']:[]);
            foreach($types as $type)if(!is_string($type)||!in_array($type,$allowed,true))
                self::fail('Documento solicitado inválido',422);
            $db->transaction(static function(Database $db)use($id,$actor,$reason,$types,$now){
                foreach($types as $type)if($type==='responsavel_legal'){
                    $db->run('DELETE FROM argus_kyc_representatives WHERE account_id=?',[$id]);
                }else{
                    $db->run("UPDATE argus_portal_documents SET review_status='needs_changes' WHERE account_id=? AND document_type=?",
                        [$id,$type]);
                }
                $db->run("UPDATE argus_portal_accounts SET status='documents_required',updated_at=? WHERE id=?",[$now,$id]);
                self::reviewLog($db,$actor,$id,'needs_changes',$reason,$types);
            });
            try{Notifications::accountUpdate($db,$id,'documents_required');}catch(\Throwable){}
            self::send(['ok'=>true,'status'=>'documents_required','message'=>'Correções solicitadas. O cliente poderá substituir os documentos.']);
        }
        $db->transaction(static function(Database $db)use($id,$actor,$reason,$now){
            $db->run("UPDATE argus_portal_accounts SET status='rejected',updated_at=? WHERE id=?",[$now,$id]);
            $db->run('UPDATE argus_portal_keys SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL',[$now,$id]);
            self::reviewLog($db,$actor,$id,'rejected',$reason);
        });
        try{Notifications::accountUpdate($db,$id,'rejected');}catch(\Throwable){}
        self::send(['ok'=>true,'status'=>'rejected','message'=>'Cadastro reprovado com justificativa registrada.']);
    }
    private static function fetchDocument(Database $db,array $actor,string $accountId,string $docId):never{
        $row=$db->one('SELECT p.*,x.payload_encrypted,x.sha256 FROM argus_portal_documents p JOIN argus_kyc_encrypted_documents x ON x.id=p.id AND x.account_id=p.account_id WHERE p.id=? AND p.account_id=?',[$docId,$accountId]);
        if(!$row)self::fail('Documento não encontrado ou fora deste cadastro',404);
        $bytes=self::decrypt((string)$row['payload_encrypted']);
        if(!hash_equals((string)$row['sha256'],hash('sha256',$bytes)))self::fail('Falha na integridade documental',503);
        $mime=(string)$row['mime'];
        self::format($bytes,$mime,(string)$row['document_type']);
        // Access is audited without logging file content, document numbers or download URL.
        self::reviewLog($db,$actor,$accountId,'document_viewed','Visualização protegida de documento',[(string)$row['document_type']]);
        header('Content-Type: '.$mime);
        header('Cache-Control: private, no-store, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('Content-Security-Policy: sandbox');
        header('Content-Disposition: attachment; filename="documento-argus-'.$docId.'.'.($mime==='application/pdf'?'pdf':($mime==='image/png'?'png':'jpg')).'"');
        header('Content-Length: '.strlen($bytes));
        echo $bytes;exit;
    }
    public static function admin(Database $db,string $method,string $path,array $actor):never{
        self::reviewer($actor);self::install($db);
        if($method==='GET'&&$path==='/api/admin/kyc/queue'){
            $accounts=$db->all('SELECT * FROM argus_portal_accounts ORDER BY created_at DESC LIMIT 200');
            $items=[];foreach($accounts as $account)$items[]=self::dossier($db,$account);
            self::send(['applications'=>$items,
                'statistics'=>[
                    'all'=>count($items),
                    'awaiting'=>count(array_filter($items,static fn($a)=>$a['status']==='documents_under_review')),
                    'incomplete'=>count(array_filter($items,static fn($a)=>$a['status']==='documents_required')),
                    'identity_approved'=>count(array_filter($items,static fn($a)=>in_array($a['status'],['identity_verified','approved'],true))),
                    'rejected'=>count(array_filter($items,static fn($a)=>$a['status']==='rejected'))]
                ]);
        }
        if($method==='GET'&&preg_match('~^/api/admin/kyc/applications/([a-f0-9]{32})$~D',$path,$m))
            self::send(['application'=>self::dossier($db,self::account($db,$m[1]))]);
        if($method==='GET'&&preg_match('~^/api/admin/kyc/applications/([a-f0-9]{32})/documents/([a-f0-9]{32})$~D',$path,$m))
            self::fetchDocument($db,$actor,$m[1],$m[2]);
        if($method==='POST'&&preg_match('~^/api/admin/kyc/applications/([a-f0-9]{32})/decision$~D',$path,$m))
            self::review($db,$actor,$m[1]);
        self::fail('Rota de análise KYC não encontrada',404);
    }
}
