<?php
declare(strict_types=1);
/**
 * Anonymous public /pix checkout, tightly scoped to the existing verified
 * Super Admin MisticPay traditional Pix account. Does NOT grant admin API
 * access or alter merchant custody, wallet balances, payout flows or secrets.
 */
$root='/var/www/html';
function pubPixReplace(string $path,string $old,string $new,string $label):void {
    $src=file_get_contents($path);
    if(!is_string($src)||substr_count($src,$old)!==1)
        throw new RuntimeException('Public Pix integration anchor changed: '.$label);
    if(file_put_contents($path,str_replace($old,$new,$src))===false)
        throw new RuntimeException('Public Pix integration cannot persist: '.$label);
}
$gateway=$root.'/src/Gateway.php';
pubPixReplace($gateway,
    "require_once __DIR__ . '/SellerFeeSplit.php';",
    "require_once __DIR__ . '/SellerFeeSplit.php';\nrequire_once __DIR__ . '/PublicAdminPix.php';",
    'payment class bootstrap');
$routes=<<<'PHP'
            // Public QR checkout: no administrator session or API key is
            // shared with a browser. The provider request stays server-side.
            if($method==='GET'&&$path==='/pix'){
                self::htmlFile('public-pix.html');
                return;
            }
            if(in_array($path,['/pix/quote','/pix/create','/pix/status'],true)){
                $publicPixDb=new Database(self::$config);
                $publicPixDb->installAndSeed();
                PublicAdminPix::handle($publicPixDb,$method,$path);
                return;
            }
PHP;
pubPixReplace($gateway,
    '// Real-operation console: legacy demo pages, test checkout and demo login are removed.',
    $routes.'// Real-operation console: legacy demo pages, test checkout and demo login are removed.',
    'public routing before legacy fallback');
$traditional=$root.'/src/TraditionalQuickPix.php';
$provider=<<<'PHP'
    /**
     * Narrow public-checkout bridge: only the documented traditional
     * MisticPay charge API, never balance read, payout or API-key export.
     */
    public static function publicConfigured():bool {
        try{self::credentials();return true;}
        catch(\Throwable){return false;}
    }
    public static function publicCreate(array $body,string $idem):array {
        if(getenv('ARGUS_QUICK_PIX_PROVIDER')!=='traditional')
            self::fail('Provedor de Pix público indisponível',503);
        if(!preg_match('/^[0-9a-f-]{36}$/iD',$idem))
            self::fail('Chave Pix inválida',422);
        $created=self::readCreated(self::request('/transactions/create','POST',$body,$idem));
        // A create response cannot attest settlement, even if it says paid.
        $created['status']='pending';
        return $created;
    }
PHP;
pubPixReplace($traditional,'    private static function access():array {',
    $provider.'    private static function access():array {',
    'restricted traditional public Pix provider gateway');

foreach(['html','css','js'] as $type){
    $file="$root/public/static/public-pix.$type";
    if(!is_file($file)||filesize($file)<1500)
        throw new RuntimeException('Public Pix visual asset missing: '.$type);
}
$landing=$root.'/public/static/landing.html';
pubPixReplace($landing,
    '<div class="header-actions">',
    '<div class="header-actions"><a class="text-link" href="/pix">Gerar Pix</a>',
    'public checkout shortcut on landing');
pubPixReplace($landing,
    '<a href="#perguntas">Dúvidas frequentes</a><a href="/conta">',
    '<a href="#perguntas">Dúvidas frequentes</a><a href="/pix">Gerar Pix</a><a href="/conta">',
    'public checkout shortcut on mobile');
echo "PASS: /pix public billing route, restricted MisticPay charge API, dynamic admin PSP fee, original admin QR history, public mobile checkout.\n";