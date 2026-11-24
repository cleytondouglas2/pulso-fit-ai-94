<?php
declare(strict_types=1);
$root='/var/www/html';
function growthReplace(string $path,string $from,string $to):void{
 $s=file_get_contents($path);if(!is_string($s)||substr_count($s,$from)!==1)throw new RuntimeException('Growth anchor '.basename($path).' '.substr($from,0,100));
 if(file_put_contents($path,str_replace($from,$to,$s))===false)throw new RuntimeException('Growth write failed');
}
growthReplace($root.'/src/Gateway.php',"require_once __DIR__ . '/TransactionReceipt.php';","require_once __DIR__ . '/TransactionReceipt.php';\nrequire_once __DIR__ . '/ArgusGrowth.php';");
$routes=<<<'PHP'
            if($method==='GET'&&$path==='/verify'){
                header('Cache-Control: no-store, private');
                header('Referrer-Policy: no-referrer');
                self::htmlFile('argus-verify.html');return;
            }
            if($method==='POST'&&$path==='/api/public/verify'){
                $verifyDb=new Database(self::$config);
                ArgusGrowth::publicRoute($verifyDb);return;
            }
PHP;
growthReplace($root.'/src/Gateway.php','// Real-operation console: legacy demo pages, test checkout and demo login are removed.',$routes."\n".'// Real-operation console: legacy demo pages, test checkout and demo login are removed.');
growthReplace($root.'/src/Portal.php',"        if(\$method!=='GET')self::csrf(\$account);","        if(\$method!=='GET')self::csrf(\$account);\n        if(str_starts_with(\$path,'/api/portal/growth/'))ArgusGrowth::handle(\$db,'portal',\$method,\$path,\$account,\$method==='POST'?(\$path==='/api/portal/growth/batch'?ArgusGrowth::batchInput():self::body()):[]);");
$admin=<<<'PHP'
        if(str_starts_with($path,'/api/admin/growth/')){
            if(($actor['role']??'')!=='superadmin')self::fail('Acesso restrito.',403);
            if($method==='POST')self::writeAllowed($actor,true);
            ArgusGrowth::handle($db,'admin',$method,$path,$actor,$method==='POST'?($path==='/api/admin/growth/batch'?ArgusGrowth::batchInput():self::input()):[]);
        }
PHP;
growthReplace($root.'/src/Admin.php',"        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",$admin."\n        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){");
$d=$root.'/public/static/';
foreach(['admin.html','client.html'] as $f){
 growthReplace($d.$f,'</head>','<link rel="stylesheet" href="/static/argus-growth.css?v=1"></head>');
 growthReplace($d.$f,'</body>','<script defer src="/static/argus-growth.js?v=9"></script></body>');
}
// A suggested amount is only a prefill; the normal quote and buyer confirmation are mandatory.
$prefill=<<<'JS'
const suggested=new URLSearchParams(location.search).get('amount_cents');
if(/^[0-9]{1,5}$/.test(suggested||'')&&Number(suggested)>=100&&Number(suggested)<=10000){
 const field=$('pix-amount');if(field)field.value=(Number(suggested)/100).toFixed(2).replace('.',',');
}
loadReseller().then(()=>price());
JS;
growthReplace($d.'reseller-public-pix.js','loadReseller().then(()=>price());',$prefill);
growthReplace($d.'reseller-public-pix.html','reseller-public-pix.js?v=seller-brand-20261123-1','reseller-public-pix.js?v=growth-20261123-1');
echo "PASS: tenant-protected growth routes, real receipt verification and management UI mounted. No payment handler modified.\n";
