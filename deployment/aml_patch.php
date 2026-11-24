<?php
declare(strict_types=1);
$root='/var/www/html';
function amlReplace(string $p,string $a,string $b):void{
 $s=file_get_contents($p);if(!is_string($s)||substr_count($s,$a)!==1)throw new RuntimeException('AML anchor: '.basename($p));
 if(file_put_contents($p,str_replace($a,$b,$s))===false)throw new RuntimeException('AML write failed');
}
amlReplace($root.'/src/Gateway.php',"require_once __DIR__ . '/TransactionJournal.php';","require_once __DIR__ . '/TransactionJournal.php';\nrequire_once __DIR__ . '/AmlCenter.php';");
$routes=<<<'PHP'
        if(str_starts_with($path,'/api/admin/aml/')){
            Compliance::authorize($actor);
            $payload=[];
            if($method==='POST'){
                self::writeAllowed($actor,true);
                $payload=self::input();
                self::verifyMfaCode($db,$actor,self::str($payload,'otp',6,6));
                unset($payload['otp']);
            }
            AmlCenter::handle($db,$actor,$method,$path,$payload);
        }
PHP;
amlReplace($root.'/src/Admin.php',"        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",$routes."\n        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){");
$d=$root.'/public/static/';
amlReplace($d.'admin.html','<button class="menu-item super-only" data-nav="compliance-trace">','<button class="menu-item super-only" data-nav="aml-center"><span>◇</span> Compliance · PLD/FT</button><button class="menu-item super-only" data-nav="compliance-trace">');
$view=file_get_contents('/tmp/aml-panel.html');if(!is_string($view))throw new RuntimeException('AML UI missing');
amlReplace($d.'admin.html','<section class="page" id="page-compliance-trace" hidden>',$view.'<section class="page" id="page-compliance-trace" hidden>');
amlReplace($d.'admin.html','</body>','<script defer src="/static/aml-center.js?v=1"></script></body>');
echo "PASS: AML superadmin review routes and UI mounted\n";
