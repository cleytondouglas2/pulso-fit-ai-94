<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Checkout Studio seller branding. Logos are stored once per reseller in the
 * existing persistent account database, never on the ephemeral Render filesystem.
 * Marketing page branding does not modify the regulated Pix checkout or receipts.
 */
final class CommerceBrand {
    private const MAX_BYTES=10485760; // 10 MiB per logo
    private const MAX_DATA_URL_BYTES=13981100; // base64 of 10 MiB plus data URL header
    private const ALLOWED=['image/png'=>IMAGETYPE_PNG,'image/jpeg'=>IMAGETYPE_JPEG,'image/webp'=>IMAGETYPE_WEBP];

    private static function fail(string $message,int $status=422):never {
        throw new ApiError($message,$status);
    }
    private static function json(array $payload):never {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($payload,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        exit;
    }
    public static function install(Database $db):void {
        // MySQL TEXT cannot hold a 10 MiB image encoded in base64.
        $storageType=$db->driver()==='mysql'?'LONGTEXT':'TEXT';
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_commerce_brand_logos(
            account_id VARCHAR(64) PRIMARY KEY,
            mime VARCHAR(32) NOT NULL,
            encoded_image {$storageType} NOT NULL,
            content_sha256 VARCHAR(64) NOT NULL,
            updated_at VARCHAR(32) NOT NULL
        )");
        if($db->driver()==='mysql'){
            $column=$db->pdo()->query("SHOW COLUMNS FROM argus_commerce_brand_logos LIKE 'encoded_image'")->fetch(\PDO::FETCH_ASSOC);
            if($column && strtolower((string)($column['Type']??''))==='text')
                $db->pdo()->exec('ALTER TABLE argus_commerce_brand_logos MODIFY encoded_image LONGTEXT NOT NULL');
        }
    }
    public static function info(Database $db,string $owner):array {
        self::install($db);
        $row=$db->one("SELECT mime,content_sha256,updated_at FROM argus_commerce_brand_logos
            WHERE account_id=?",[$owner]);
        return [
            'has_logo'=>(bool)$row,
            'mime'=>$row['mime']??null,
            'updated_at'=>$row['updated_at']??null,
            'preview_url'=>$row?'/api/portal/commerce/logo/image':null,
            'applies_to'=>'Todas as páginas comerciais deste revendedor',
            'note'=>'A logomarca substitui a marca Argus Pay no cabeçalho das páginas comerciais, mas não nos comprovantes nem no checkout financeiro da adquirente.'
        ];
    }
    public static function save(Database $db,string $owner,array $body):array {
        self::install($db);
        $dataUrl=$body['image_data_url']??null;
        if(!is_string($dataUrl)||strlen($dataUrl)>self::MAX_DATA_URL_BYTES||
           !preg_match('~^data:(image/png|image/jpeg|image/webp);base64,([A-Za-z0-9+/]+={0,2})$~D',$dataUrl,$m))
            self::fail('Envie uma logomarca PNG, JPG ou WEBP válida, de até 10 MB.');
        $bytes=base64_decode($m[2],true);
        if(!is_string($bytes)||strlen($bytes)<40||strlen($bytes)>self::MAX_BYTES)
            self::fail('A imagem deve ter até 10 MB.');
        $detected=(new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if($detected!==$m[1]||!isset(self::ALLOWED[$detected]))
            self::fail('Formato real da imagem não corresponde ao arquivo enviado.');
        if(!function_exists('getimagesizefromstring'))
            self::fail('Validação de imagens temporariamente indisponível.',503);
        $image=@getimagesizefromstring($bytes);
        if(!is_array($image)||($image[2]??null)!==self::ALLOWED[$detected]||
           (int)($image[0]??0)<1||(int)($image[1]??0)<1||
           (int)$image[0]>4096||(int)$image[1]>4096||
           (int)$image[0]*(int)$image[1]>6000000)
            self::fail('Imagem inválida ou com dimensões excessivas. Use até 4096 px.');
        $hash=hash('sha256',$bytes);
        $encoded=base64_encode($bytes);
        $existing=$db->one('SELECT account_id FROM argus_commerce_brand_logos WHERE account_id=?',[$owner]);
        if($existing){
            $db->run('UPDATE argus_commerce_brand_logos
                SET mime=?,encoded_image=?,content_sha256=?,updated_at=?
                WHERE account_id=?',[$detected,$encoded,$hash,Database::stamp(),$owner]);
        }else{
            $db->run('INSERT INTO argus_commerce_brand_logos
                (account_id,mime,encoded_image,content_sha256,updated_at)
                VALUES(?,?,?,?,?)',[$owner,$detected,$encoded,$hash,Database::stamp()]);
        }
        return ['ok'=>true,'message'=>'Logomarca salva. Ela aparecerá em todas as suas páginas comerciais publicadas.',
            'branding'=>self::info($db,$owner)];
    }
    public static function remove(Database $db,string $owner):array {
        self::install($db);
        $db->run('DELETE FROM argus_commerce_brand_logos WHERE account_id=?',[$owner]);
        return ['ok'=>true,'message'=>'Logomarca removida. As páginas comerciais voltarão a exibir Argus Pay.',
            'branding'=>self::info($db,$owner)];
    }
    public static function hasLogo(Database $db,string $owner):bool {
        self::install($db);
        return (bool)$db->one('SELECT account_id FROM argus_commerce_brand_logos WHERE account_id=?',[$owner]);
    }
    private static function image(Database $db,string $owner):never {
        self::install($db);
        $row=$db->one('SELECT mime,encoded_image FROM argus_commerce_brand_logos WHERE account_id=?',[$owner]);
        if(!$row)self::fail('Logomarca não encontrada.',404);
        $data=base64_decode((string)$row['encoded_image'],true);
        if(!is_string($data)||strlen($data)>self::MAX_BYTES||strlen($data)<40)
            self::fail('Logomarca indisponível.',404);
        header('Content-Type: '.$row['mime']);
        header('Content-Length: '.strlen($data));
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline');
        header('Cross-Origin-Resource-Policy: same-origin');
        echo $data;
        exit;
    }
    public static function portal(Database $db,string $method,string $path,array $account,array $body=[]):never {
        $owner=(string)$account['id'];
        if($method==='GET'&&$path==='/api/portal/commerce/logo')
            self::json(self::info($db,$owner));
        if($method==='GET'&&$path==='/api/portal/commerce/logo/image')
            self::image($db,$owner);
        if($method==='POST'&&$path==='/api/portal/commerce/logo'){
            SecurityShield::rate($db,'commerce_brand_upload',$owner,12,3600);
            self::json(self::save($db,$owner,$body));
        }
        if($method==='POST'&&$path==='/api/portal/commerce/logo/remove'){
            SecurityShield::rate($db,'commerce_brand_remove',$owner,12,3600);
            self::json(self::remove($db,$owner));
        }
        self::fail('Rota de logomarca inválida.',404);
    }
    public static function publicLogo(Database $db,string $code):never {
        if(!preg_match('/^[a-f0-9]{32}$/D',$code))
            self::fail('Página não encontrada.',404);
        self::install($db);
        $row=$db->one("SELECT p.account_id FROM argus_commerce_pages p
          JOIN argus_portal_accounts a ON a.id=p.account_id
          JOIN argus_commerce_brand_logos l ON l.account_id=p.account_id
          WHERE p.public_code=? AND p.status='published'
            AND a.status NOT IN ('suspended','rejected')
            AND (p.expires_at IS NULL OR p.expires_at>=?)",
          [$code,gmdate('Y-m-d')]);
        if(!$row)self::fail('Página não disponível.',404);
        self::image($db,(string)$row['account_id']);
    }
}
