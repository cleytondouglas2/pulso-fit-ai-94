<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Automated document-screening metadata. Free CNPJ registry lookup is NOT KYC.
 * Does not change account approval, issue financial credentials, or identify a person.
 */
final class DocumentValidation
{
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_document_validation (
            account_id VARCHAR(64) PRIMARY KEY,
            provider VARCHAR(32) NOT NULL,
            result VARCHAR(40) NOT NULL,
            name_matches INTEGER,
            checked_at VARCHAR(32) NOT NULL)");
    }
    public static function view(Database $db,string $id):array {
        self::install($db);
        $row=$db->one('SELECT provider,result,name_matches,checked_at FROM argus_document_validation WHERE account_id=?',[$id]);
        if(!$row)return ['status'=>'not_checked','label'=>'Consulta não realizada','source'=>'none','checked_at'=>null];
        $labels=[
            'cpf_checksum_valid'=>'CPF com dígitos verificadores válidos (titularidade não verificada)',
            'cnpj_active_match'=>'CNPJ ativo; razão social informada coincide',
            'cnpj_active_review'=>'CNPJ ativo; razão social requer conferência',
            'cnpj_inactive'=>'CNPJ localizado, mas não está ativo',
            'cnpj_not_found'=>'CNPJ não localizado nesta consulta',
            'cnpj_unavailable'=>'Serviço público indisponível; aguardando nova consulta',
            'local_verified'=>'Estrutura cadastral validada localmente',
        ];
        $v=$row['result'];
        return ['status'=>$v,'label'=>$labels[$v]??'Conferência pendente','source'=>$row['provider'],
            'checked_at'=>$row['checked_at'],'identity_verified'=>false];
    }
    public static function evaluateCnpj(string $cnpj,string $submitted,array $response):array {
        $received=preg_replace('/\D/','',(string)($response['cnpj']??''));
        if($received!==$cnpj||strlen($received)!==14)return ['cnpj_unavailable',null];
        $status=strtoupper(trim((string)($response['descricao_situacao_cadastral']??'')));
        if($status==='')return ['cnpj_unavailable',null];
        if($status!=='ATIVA')return ['cnpj_inactive',null];
        $normal=static function(string $v):string {
            $v=function_exists('iconv')?((string)(iconv('UTF-8','ASCII//TRANSLIT//IGNORE',$v)?:$v)):$v;
            return preg_replace('/[^A-Z0-9]+/',' ',strtoupper(trim($v)))??'';
        };
        $registry=$normal((string)($response['razao_social']??''));
        $entered=$normal($submitted);
        $match=$registry!=='' && $registry===$entered;
        return [$match?'cnpj_active_match':'cnpj_active_review',$match?1:0];
    }
    private static function lookupCnpj(string $cnpj,string $name):array {
        if(!preg_match('/^\d{14}$/D',$cnpj)||!function_exists('curl_init'))return ['cnpj_unavailable',null];
        // Fixed HTTPS host, digits only; no generic URL/proxy or user-supplied endpoint.
        $ch=curl_init('https://brasilapi.com.br/api/cnpj/v1/'.$cnpj);
        curl_setopt_array($ch,[
            CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>3,
            CURLOPT_TIMEOUT=>7,CURLOPT_MAXREDIRS=>0,CURLOPT_SSL_VERIFYPEER=>true,
            CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_USERAGENT=>'ArgusPay-DocumentCheck/1.0',
            CURLOPT_HTTPHEADER=>['Accept: application/json'],
        ]);
        $raw=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
        if($status===404)return ['cnpj_not_found',null];
        if($status!==200 || !is_string($raw) || strlen($raw)>350000)return ['cnpj_unavailable',null];
        try{$data=json_decode($raw,true,32,JSON_THROW_ON_ERROR);}catch(\JsonException){return ['cnpj_unavailable',null];}
        if(!is_array($data))return ['cnpj_unavailable',null];
        return self::evaluateCnpj($cnpj,$name,$data);
    }
    public static function screen(Database $db,string $id,string $type,string $number,string $name,bool $force=false):array {
        self::install($db);
        $existing=$db->one('SELECT result,checked_at FROM argus_document_validation WHERE account_id=?',[$id]);
        if($existing && !$force)return self::view($db,$id);
        if($existing&&$force){
            $last=strtotime((string)$existing['checked_at'])?:0;
            if($last>time()-86400)return self::view($db,$id);
        }
        [$result,$nameMatch]=$type==='PJ'?self::lookupCnpj($number,$name):['cpf_checksum_valid',null];
        $provider=$type==='PJ'?'BrasilAPI CNPJ':'Verificador CPF local';
        // Remove any prior state atomically, keep only non-sensitive screening metadata.
        $db->transaction(function(Database $db)use($id,$provider,$result,$nameMatch){
            $db->run('DELETE FROM argus_document_validation WHERE account_id=?',[$id]);
            $db->run('INSERT INTO argus_document_validation(account_id,provider,result,name_matches,checked_at) VALUES (?,?,?,?,?)',
                [$id,$provider,$result,$nameMatch,Database::stamp()]);
        });
        return self::view($db,$id);
    }
    public static function formatValid(string $bytes,string $mime):bool {
        if($mime==='application/pdf'){
            return str_starts_with($bytes,'%PDF-') && str_contains(substr($bytes,-4096),'%%EOF');
        }
        if(!in_array($mime,['image/jpeg','image/png'],true)||!function_exists('getimagesizefromstring'))return false;
        $details=@getimagesizefromstring($bytes);
        if(!is_array($details))return false;
        return (int)$details[0]>=400 && (int)$details[1]>=300
            && (int)$details[0]<12000 && (int)$details[1]<12000;
    }
}
