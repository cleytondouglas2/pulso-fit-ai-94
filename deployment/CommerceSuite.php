<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * ARGUS Commerce Suite: tenant-scoped hosted presentation pages and a
 * deliberately nonfinancial developer sandbox. No PSP calls or wallet writes.
 * NEVER mistake the public suggested amount for an enforced Pix amount.
 */
final class CommerceSuite {
    private static function fail(string $text,int $status=422):never {throw new ApiError($text,$status);}
    private static function out(array $x,int $status=200):never {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($x,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        exit;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_commerce_pages(
            id VARCHAR(40) PRIMARY KEY,
            account_id VARCHAR(64) NOT NULL,
            public_code VARCHAR(32) NOT NULL UNIQUE,
            title VARCHAR(100) NOT NULL,
            description VARCHAR(600) NOT NULL,
            suggested_amount_cents INTEGER NOT NULL,
            image_url VARCHAR(600) NOT NULL DEFAULT '',
            accent_color VARCHAR(7) NOT NULL DEFAULT '#e9bc74',
            call_to_action VARCHAR(70) NOT NULL DEFAULT 'Continuar para o Pix',
            status VARCHAR(14) NOT NULL DEFAULT 'draft',
            expires_at VARCHAR(32),
            created_at VARCHAR(32) NOT NULL,
            updated_at VARCHAR(32) NOT NULL
        )");
        $db->pdo()->exec("CREATE INDEX IF NOT EXISTS argus_commerce_owner_idx
            ON argus_commerce_pages(account_id,created_at)");
    }
    private static function str(array $body,string $key,int $min,int $max):string {
        $raw=$body[$key]??null;
        if(!is_string($raw))self::fail('Preencha '.str_replace('_',' ',$key).'.');
        $value=trim($raw);
        $len=function_exists('mb_strlen')?mb_strlen($value,'UTF-8'):strlen($value);
        if($len<$min||$len>$max||str_contains($value,"\0"))
            self::fail('Campo '.$key.' inválido. Máximo de '.$max.' caracteres.');
        return $value;
    }
    private static function validated(array $body):array {
        $title=self::str($body,'title',3,100);
        $description=self::str($body,'description',5,600);
        $button=self::str($body,'call_to_action',3,70);
        // Empty/omitted/null value means the payer chooses the Pix amount later.
        // Persist as zero for backward-compatible NOT NULL SQLite/PGSQL schemas;
        // never expose zero as a suggested sale price.
        $amount=$body['suggested_amount_cents']??null;
        if($amount===null||$amount==='')$amount=0;
        if(!is_int($amount)||($amount!==0&&($amount<100||$amount>9000)))
            self::fail('O valor sugerido é opcional. Quando preenchido, use R$ 1,00 a R$ 90,00.');
        $image=$body['image_url']??'';
        if(!is_string($image)||strlen($image)>600)self::fail('Imagem inválida.');
        if($image!==''&&
            !preg_match('~^https://[a-z0-9.-]+(?:/[a-zA-Z0-9/_.,%=-]+)?$~iD',$image))
            self::fail('Use imagem HTTPS pública, sem parâmetros, credenciais ou endereços internos.');
        if($image!==''){
            $host=strtolower((string)(parse_url($image,PHP_URL_HOST)?:''));
            if(filter_var($host,FILTER_VALIDATE_IP)||
                in_array($host,['localhost','metadata.google.internal'],true)||
                str_ends_with($host,'.local')||str_ends_with($host,'.internal')||str_contains($host,'..'))
                self::fail('Endereço da imagem não permitido.');
        }
        $color=$body['accent_color']??'#e9bc74';
        if(!is_string($color)||!preg_match('/^#[A-Fa-f0-9]{6}$/D',$color))
            self::fail('Cor hexadecimal inválida.');
        $expires=$body['expires_at']??null;
        if($expires==='')$expires=null;
        if($expires!==null&&(!is_string($expires)||
            !preg_match('/^\d{4}-\d{2}-\d{2}$/D',$expires)||
            !checkdate((int)substr($expires,5,2),(int)substr($expires,8,2),(int)substr($expires,0,4))))
            self::fail('Data de expiração inválida.');
        return [$title,$description,$amount,$image,$color,$button,$expires];
    }
    public static function mine(Database $db,string $owner):array {
        self::install($db);
        $pages=$db->all("SELECT id,public_code,title,description,suggested_amount_cents,
            image_url,accent_color,call_to_action,status,expires_at,created_at,updated_at
            FROM argus_commerce_pages WHERE account_id=? AND status<>'deleted'
            ORDER BY created_at DESC LIMIT 40",[$owner]);
        foreach($pages as &$page){
            $cents=(int)$page['suggested_amount_cents'];
            $page['suggested_amount_cents']=$cents>0?$cents:null;
        }
        unset($page);
        return ['pages'=>$pages,
            'note'=>'O valor da página é opcional e apenas sugestivo. O pagador escolhe ou confirma o valor e as taxas no checkout Pix.',
            'pix_flow_unchanged'=>true];
    }
    public static function create(Database $db,string $owner,array $input):array {
        self::install($db);
        $count=$db->one("SELECT COUNT(*) AS total FROM argus_commerce_pages
            WHERE account_id=? AND status NOT IN ('archived','deleted')",[$owner]);
        if((int)($count['total']??0)>=30)
            self::fail('Limite de 30 páginas não arquivadas por revendedor.',409);
        [$title,$description,$amount,$image,$color,$button,$expires]=self::validated($input);
        $id='cmp_'.bin2hex(random_bytes(16));
        $code=bin2hex(random_bytes(16));
        $now=Database::stamp();
        $db->run('INSERT INTO argus_commerce_pages(id,account_id,public_code,title,description,
          suggested_amount_cents,image_url,accent_color,call_to_action,status,expires_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[
            $id,$owner,$code,$title,$description,$amount,$image,$color,$button,'draft',
            $expires,$now,$now
        ]);
        return ['ok'=>true,'id'=>$id,'public_path'=>'/c/'.$code,'status'=>'draft',
            'message'=>'Página salva como rascunho. Publique quando estiver pronta.'];
    }
    private static function own(Database $db,string $owner,string $id):array {
        if(!preg_match('/^cmp_[a-f0-9]{32}$/D',$id))self::fail('Página não encontrada.',404);
        self::install($db);
        $row=$db->one('SELECT * FROM argus_commerce_pages WHERE id=? AND account_id=?',[$id,$owner]);
        if(!$row||$row['status']==='deleted')
            self::fail('Página não encontrada nesta conta.',404);
        return $row;
    }
    public static function edit(Database $db,string $owner,string $id,array $input):array {
        self::own($db,$owner,$id);
        [$title,$description,$amount,$image,$color,$button,$expires]=self::validated($input);
        $db->run('UPDATE argus_commerce_pages SET title=?,description=?,suggested_amount_cents=?,
          image_url=?,accent_color=?,call_to_action=?,expires_at=?,status=?,updated_at=?
          WHERE id=? AND account_id=?',[
            $title,$description,$amount,$image,$color,$button,$expires,'draft',
            Database::stamp(),$id,$owner
        ]);
        return ['ok'=>true,'status'=>'draft',
            'message'=>'Alteração salva como rascunho; publique para disponibilizar a página.'];
    }
    public static function action(Database $db,string $owner,string $id,string $action):array {
        $row=self::own($db,$owner,$id);
        if(!in_array($action,['publish','archive','delete'],true))
            self::fail('Ação inválida.',404);
        if($row['status']==='deleted')
            self::fail('A página já foi excluída.',404);
        if($action==='publish'){
            // Publishing a MARKETING page is independent of PSP/KYC activation.
            // Public renderer only exposes checkout if merchant PSP readiness passes.
            if($row['expires_at']!==null&&$row['expires_at']<gmdate('Y-m-d'))
                self::fail('A página está expirada. Ajuste a validade antes de publicar.',409);
            $account=$db->one('SELECT status FROM argus_portal_accounts WHERE id=?',[$owner]);
            if(!$account||in_array($account['status'],['suspended','rejected'],true))
                self::fail('Sua conta está bloqueada para publicações.',403);
        }
        $state=match($action){'publish'=>'published','archive'=>'archived','delete'=>'deleted'};
        // Soft deletion keeps a security/audit trace and invalidates the public URL.
        // No financial objects, receipts, wallet balances or PSP charge rows change.
        $db->run('UPDATE argus_commerce_pages SET status=?,updated_at=? WHERE id=? AND account_id=?',
            [$state,Database::stamp(),$id,$owner]);
        return ['ok'=>true,'status'=>$state,'message'=>match($state){
            'published'=>'Página comercial publicada. O Pix só estará disponível após liberação financeira.',
            'archived'=>'Página arquivada. O link público foi desativado.',
            'deleted'=>'Página excluída da sua lista e desativada. Histórico técnico preservado para auditoria.'
        }];
    }
    public static function show(Database $db,string $code):array {
        if(!preg_match('/^[a-f0-9]{32}$/D',$code))self::fail('Página não encontrada.',404);
        self::install($db);
        $row=$db->one("SELECT p.title,p.description,p.suggested_amount_cents,
            p.image_url,p.accent_color,p.call_to_action,p.expires_at,
            p.status,a.id AS owner,a.display_name AS seller_name,a.status AS account_status
            FROM argus_commerce_pages p JOIN argus_portal_accounts a ON a.id=p.account_id
            WHERE p.public_code=?",[$code]);
        if(!$row||$row['status']!=='published'||
           in_array($row['account_status'],['suspended','rejected'],true)||
           $row['expires_at']!==null&&$row['expires_at']<gmdate('Y-m-d'))
            self::fail('Essa página não está disponível.',404);
        $payment=['available'=>false,'public_path'=>null];
        try{
            // Use the existing seller checkout's *real* custody/KYC readiness.
            // Never create a Pix or expose merchant/account identifiers here.
            $full=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$row['owner']]);
            if($full){
                $live=ResellerPublicPix::myLink($db,$full);
                if(($live['available']??false)===true){
                    $payment=['available'=>true,'public_path'=>$live['public_path']];
                }
            }
        }catch(\Throwable){/* Fail closed if seller readiness cannot be proved. */}
        return [
            'title'=>$row['title'],'description'=>$row['description'],
            'suggested_amount_cents'=>(int)$row['suggested_amount_cents']>0?(int)$row['suggested_amount_cents']:null,
            'seller_name'=>$row['seller_name'],
            'logo_url'=>CommerceBrand::hasLogo($db,(string)$row['owner'])?
                '/api/public/commerce/logo/'.$code:null,
            'image_url'=>$row['image_url'],'accent_color'=>$row['accent_color'],
            'call_to_action'=>$row['call_to_action'],'expires_at'=>$row['expires_at'],
            'checkout'=>$payment,
            'price_note'=>(int)$row['suggested_amount_cents']>0?
                'Valor sugerido. O valor real e as taxas são confirmados pelo pagador no checkout Pix da ARGUS Pay.':
                'Valor aberto: o pagador escolhe o valor e confirma as taxas no checkout Pix da ARGUS Pay.',
            'not_a_receipt'=>true
        ];
    }
    public static function sandbox(array $body):array {
        $scenario=$body['scenario']??null;
        if(!in_array($scenario,['paid','pending','failed','refunded'],true))
            self::fail('Cenário de demonstração inválido.');
        $amount=$body['amount_cents']??null;
        if(!is_int($amount)||$amount<100||$amount>1000000)
            self::fail('Valor de demonstração inválido.');
        return ['simulated'=>true,'environment'=>'sandbox_offline',
            'simulation_id'=>'sim_'.bin2hex(random_bytes(16)),
            'amount_cents'=>$amount,'scenario'=>$scenario,
            'status'=>'simulated_'.$scenario,
            'provider_id'=>null,'pix_copy_paste'=>null,'wallet_credit_cents'=>0,
            'notice'=>'Simulação local isolada: não cria Pix válido, saldo, webhook real ou saque.'];
    }
    public static function portal(Database $db,string $method,string $path,array $account,array $input=[]):never {
        $owner=(string)$account['id'];
        if($path==='/api/portal/commerce/pages'&&$method==='GET')self::out(self::mine($db,$owner));
        if($path==='/api/portal/commerce/pages'&&$method==='POST'){
            SecurityShield::rate($db,'commerce_page',$owner,12,3600);
            self::out(self::create($db,$owner,$input),201);
        }
        if($path==='/api/portal/commerce/sandbox'&&$method==='POST'){
            SecurityShield::rate($db,'commerce_sandbox',$owner,24,60);
            self::out(self::sandbox($input));
        }
        if(preg_match('~^/api/portal/commerce/pages/(cmp_[a-f0-9]{32})(?:/(publish|archive|delete))?$~D',$path,$m)&&$method==='POST'){
            SecurityShield::rate($db,'commerce_edit',$owner,30,3600);
            self::out(!empty($m[2])?self::action($db,$owner,$m[1],$m[2]):self::edit($db,$owner,$m[1],$input));
        }
        self::fail('Rota de comércio indisponível.',404);
    }
    public static function respondAdmin(Database $db,array $actor):never {
        self::out(self::admin($db,$actor));
    }
    public static function public(Database $db,string $method,string $path):never {
        if($method!=='GET'||!preg_match('~^/api/public/commerce/([a-f0-9]{32})$~D',$path,$m))
            self::fail('Página não encontrada.',404);
        self::out(self::show($db,$m[1]));
    }
    public static function admin(Database $db,array $actor):array {
        if(($actor['role']??'')!=='superadmin')self::fail('Somente Super Admin.',403);
        self::install($db);
        $rows=$db->all('SELECT status,COUNT(*) AS total FROM argus_commerce_pages GROUP BY status');
        $counts=['draft'=>0,'published'=>0,'archived'=>0];
        foreach($rows as $r)if(array_key_exists((string)$r['status'],$counts))
            $counts[$r['status']]=(int)$r['total'];
        return ['status'=>'informational','financial_transactions_triggered'=>false,'pages'=>$counts,
            'sandbox'=>'offline','payment_provider_integration'=>'existing_Pix_only'];
    }
}
