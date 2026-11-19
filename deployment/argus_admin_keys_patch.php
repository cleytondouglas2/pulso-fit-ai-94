<?php
declare(strict_types=1);

/** Secure seller API key generation in the existing Super Admin console. */
$root='/var/www/html';
$admin=$root.'/src/Admin.php';
$source=file_get_contents($admin);
if(!is_string($source))throw new RuntimeException('ARGUS Admin source unavailable');
$anchor=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/fees/operations'){
PHP;
if(substr_count($source,$anchor)!==1)
    throw new RuntimeException('ARGUS admin keys: protected Admin route anchor missing');
$handler=<<<'PHP'
        // Each credential belongs to a real, approved reseller portal account.
        // Never disclose a stored secret, permit an unapproved merchant, or create
        // credentials in an ephemeral DB that will lose them after redeployment.
        if(str_starts_with($path,'/api/admin/merchant-api-keys')){
            self::writeAllowed($actor,true);
            if(($actor['role']??'')!=='superadmin')
                self::fail('Somente o Super Admin gerencia as credenciais',403);
            Portal::install($db);
            $durable=in_array($db->driver(),['pgsql','mysql'],true);
            header('Cache-Control: no-store, private');

            if($method==='GET'&&$path==='/api/admin/merchant-api-keys'){
                $rows=$db->all("SELECT a.id,a.display_name,a.email,a.merchant_id
                    FROM argus_portal_accounts a
                    JOIN b2b_merchants m ON m.id=a.merchant_id
                    WHERE a.status='approved' AND m.status='approved_live'
                    ORDER BY a.display_name LIMIT 200");
                $accounts=array_values(array_filter($rows,static function(array $a)use($db):bool{
                    return KycStudio::identityApproved($db,(string)$a['id']);
                }));
                $keys=$db->all("SELECT k.id,k.account_id,k.public_key,k.created_at,
                    k.revoked_at,a.display_name,a.email
                    FROM argus_portal_keys k
                    JOIN argus_portal_accounts a ON a.id=k.account_id
                    ORDER BY k.created_at DESC LIMIT 200");
                self::reply([
                    'accounts'=>$accounts,'keys'=>$keys,
                    'can_issue'=>$durable&&count($accounts)>0,
                    'storage_persistent'=>$durable,
                    'documentation_url'=>'/documentacao-api'
                ]);
            }

            if($method==='POST'&&$path==='/api/admin/merchant-api-keys'){
                $body=self::input();
                self::verifyMfaCode($db,$actor,self::str($body,'otp',6,6));
                if(!$durable)self::fail('Banco de dados financeiro persistente obrigatório para armazenar credenciais',503);
                $accountId=$body['account_id']??null;
                if(!is_string($accountId)||!preg_match('/^[a-f0-9]{32}$/D',$accountId))
                    self::fail('Selecione um revendedor válido',422);
                $account=$db->one("SELECT a.id,a.merchant_id
                    FROM argus_portal_accounts a
                    JOIN b2b_merchants m ON m.id=a.merchant_id
                    WHERE a.id=? AND a.status='approved' AND m.status='approved_live'",[$accountId]);
                if(!$account||!KycStudio::identityApproved($db,$accountId))
                    self::fail('Revendedor ainda não aprovado na verificação documental e financeira',403);
                $count=$db->one('SELECT COUNT(*) AS n FROM argus_portal_keys
                    WHERE account_id=? AND revoked_at IS NULL',[$accountId]);
                if((int)($count['n']??0)>=10)
                    self::fail('Limite de 10 pares ativos atingido; revogue um par antes de gerar outro',409);
                $id=bin2hex(random_bytes(16));
                $public='agp_live_'.bin2hex(random_bytes(12));
                $secret='ags_live_'.bin2hex(random_bytes(32));
                $db->run("INSERT INTO argus_portal_keys
                    (id,account_id,merchant_id,public_key,secret_hash,created_at,revoked_at)
                    VALUES(?,?,?,?,?,?,?)",[
                    $id,$accountId,$account['merchant_id'],$public,
                    hash('sha256',$secret),Database::stamp(),null
                ]);
                self::reply([
                    'id'=>$id,'account_id'=>$accountId,
                    'api_key'=>$public,'api_secret'=>$secret,
                    'message'=>'Copie a chave secreta agora. Ela não será exibida novamente.'
                ],201);
            }

            if($method==='POST'&&preg_match(
                '~^/api/admin/merchant-api-keys/([a-f0-9]{32})/revoke$~D',$path,$m)){
                $body=self::input();
                self::verifyMfaCode($db,$actor,self::str($body,'otp',6,6));
                if(!$durable)self::fail('Banco persistente indisponível',503);
                $changed=$db->run('UPDATE argus_portal_keys SET revoked_at=?
                    WHERE id=? AND revoked_at IS NULL',[Database::stamp(),$m[1]]);
                if($changed->rowCount()!==1)
                    self::fail('Chave não encontrada ou já revogada',404);
                self::reply(['ok'=>true]);
            }
            self::fail('Endpoint de chaves não encontrado',404);
        }
PHP;
$source=str_replace($anchor,$handler."\n".$anchor,$source);
if(file_put_contents($admin,$source)===false)
    throw new RuntimeException('ARGUS admin keys: cannot save protected routes');

$html=$root.'/public/static/admin.html';
$markup=file_get_contents($html);
if(!is_string($markup)||substr_count($markup,'</head>')!==1||
   substr_count($markup,'</body>')!==1)
    throw new RuntimeException('ARGUS admin keys: admin HTML missing');
$markup=str_replace('</head>',
    '<link rel="stylesheet" href="/static/admin-api-keys.css?v=2"></head>',$markup);
$markup=str_replace('</body>',
    '<script src="/static/admin-api-keys.js?v=2" defer></script></body>',$markup);
if(file_put_contents($html,$markup)===false)
    throw new RuntimeException('ARGUS admin keys: HTML write failed');
echo "ARGUS admin merchant API key controls and documentation access added.\n";
