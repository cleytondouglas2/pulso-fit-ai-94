<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Guided face-motion capture only. Client-side landmarks are NOT reliable
 * proof of biological liveness or identity and NEVER authorize financial KYC.
 * A certified PAD provider is required for bank-grade spoof resistance.
 */
final class FaceCapture {
    private static function fail(string $m,int $status=422):never{throw new ApiError($m,$status);}
    private static function reply(array $out,int $status=200):never{
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($out,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);exit;
    }
    public static function install(Database $db):void{
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_kyc_face_challenges(
          id VARCHAR(32) PRIMARY KEY, account_id VARCHAR(64) NOT NULL,
          steps_json VARCHAR(180) NOT NULL, issued_at VARCHAR(32) NOT NULL,
          expires_at VARCHAR(32) NOT NULL, used_at VARCHAR(32), capture_hash VARCHAR(64)
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_face_account_idx ON argus_kyc_face_challenges(account_id)");
    }
    public static function status(Database $db,string $accountId):array{
        self::install($db);
        $latest=$db->one('SELECT used_at FROM argus_kyc_face_challenges WHERE account_id=?
            AND used_at IS NOT NULL ORDER BY used_at DESC LIMIT 1',[$accountId]);
        return ['guided_capture_completed'=>$latest!==null,
            'method'=>'guided_motion_capture',
            'bank_grade_liveness'=>false,'identity_verified'=>false,
            'status'=>$latest?'captured_pending_human_review':'not_captured'];
    }
    private static function editable(array $account):void{
        if(!in_array((string)($account['status']??''),['documents_required','documents_under_review'],true))
            self::fail('Captura facial indisponível nesta etapa de cadastro',403);
    }
    public static function start(Database $db,array $account):never{
        self::editable($account);self::install($db);
        $since=gmdate('Y-m-d H:i:s',time()-600);
        $rate=$db->one('SELECT COUNT(*) AS n FROM argus_kyc_face_challenges WHERE account_id=? AND issued_at>=?',
            [$account['id'],$since]);
        if((int)($rate['n']??0)>=8)self::fail('Limite temporário de tentativas. Tente novamente após alguns minutos.',429);
        $direction=random_int(0,1)===0?'turn_left':'turn_right';
        $steps=random_int(0,1)===0?['blink',$direction,'center']:[$direction,'blink','center'];
        $id=bin2hex(random_bytes(16));
        $issued=Database::stamp();$expires=gmdate('Y-m-d H:i:s',time()+150);
        $db->run('INSERT INTO argus_kyc_face_challenges
            (id,account_id,steps_json,issued_at,expires_at,used_at,capture_hash)
            VALUES(?,?,?,?,?,?,?)',[
            $id,$account['id'],json_encode($steps,JSON_THROW_ON_ERROR),$issued,$expires,null,null
        ]);
        self::reply(['challenge_id'=>$id,'steps'=>$steps,'expires_in_seconds'=>150,
            'mode'=>'guided_motion_capture','bank_grade_liveness'=>false,
            'message'=>'Siga os desafios usando a câmera frontal para registrar sua selfie. A equipe KYC avaliará o resultado.']);
    }
    public static function complete(Database $db,array $account):never{
        self::editable($account);self::install($db);
        $raw=file_get_contents('php://input',false,null,0,4600000);
        if(!is_string($raw)||strlen($raw)>4600000)
            self::fail('Imagem facial acima do tamanho permitido',413);
        try{$data=json_decode($raw,true,24,JSON_THROW_ON_ERROR);}catch(\JsonException){
            self::fail('Dados da captura inválidos',400);
        }
        if(!is_array($data)||array_is_list($data))self::fail('Captura inválida',422);
        $id=$data['challenge_id']??null;
        if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))
            self::fail('Desafio facial inválido',422);
        $session=$db->one('SELECT * FROM argus_kyc_face_challenges WHERE id=? AND account_id=?',
            [$id,$account['id']]);
        if(!$session||$session['used_at']!==null||$session['expires_at']<Database::stamp())
            self::fail('Desafio facial expirado ou já utilizado. Inicie uma nova captura.',409);
        if(strtotime((string)$session['issued_at'])>time()-3)
            self::fail('Complete os movimentos com calma, sem acelerar a verificação',422);
        $steps=json_decode((string)$session['steps_json'],true);
        $trace=$data['observations']??null;
        if(!is_array($trace)||!array_is_list($trace)||count($trace)!==3)
            self::fail('Movimentos faciais incompletos',422);
        $previous=0;
        foreach($steps as $i=>$required){
            $item=$trace[$i];
            if(!is_array($item)||($item['step']??'')!==$required||
               !is_int($item['elapsed_ms']??null)||
               $item['elapsed_ms']<500||$item['elapsed_ms']>140000||
               $item['elapsed_ms']<=$previous)
                self::fail('Sequência facial inválida. Refazer captura.',422);
            $previous=$item['elapsed_ms'];
        }
        if($previous<2500)self::fail('Tempo dos movimentos insuficiente para revisão',422);
        $photo=$data['photo_base64']??null;
        if(!is_string($photo)||strlen($photo)>4400000||strlen($photo)<2000)
            self::fail('Imagem facial ausente ou muito grande',422);
        $bytes=base64_decode($photo,true);
        if(!is_string($bytes)||strlen($bytes)<1024||strlen($bytes)>3200000)
            self::fail('Imagem facial inválida',422);
        $mime=(new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if(!in_array($mime,['image/jpeg','image/png'],true))
            self::fail('A captura deve ser JPG ou PNG',422);
        // Untrusted browser-reported motion is evidence for human triage only.
        // Never mark identity_approved / financial_enabled here.
        $saved=null;
        $db->transaction(static function(Database $db)use($account,$session,$id,$bytes,$mime,&$saved){
            $updated=$db->run('UPDATE argus_kyc_face_challenges
                SET used_at=?,capture_hash=? WHERE id=? AND account_id=? AND used_at IS NULL',
                [Database::stamp(),hash('sha256',$bytes),$id,$account['id']]);
            if($updated->rowCount()!==1)self::fail('Captura já enviada',409);
            $saved=KycStudio::storeGuidedSelfie($db,$account,$bytes,$mime);
            $db->run('INSERT INTO argus_kyc_review_events
                (id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
                VALUES(?,?,?,?,?,?,?,?)',[
                bin2hex(random_bytes(16)),$account['id'],'face-guided-client',
                'system','face_guided_capture',
                'Câmera guiada, observações de movimento não certificadas; revisão humana necessária',
                'selfie',Database::stamp()
            ]);
        });
        $fresh=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$account['id']]);
        $summary=KycStudio::summary($db,$fresh);
        $next=$summary['complete']?'documents_under_review':'documents_required';
        $db->run('UPDATE argus_portal_accounts SET status=?,updated_at=? WHERE id=? AND status IN (?,?)',
            [$next,Database::stamp(),$account['id'],'documents_required','documents_under_review']);
        self::reply(['ok'=>true,'status'=>'captured_pending_human_review',
            'face_capture'=>self::status($db,(string)$account['id']),
            'message'=>'Captura facial recebida e protegida. A identidade ainda será analisada pela equipe ARGUS.'],201);
    }
}
