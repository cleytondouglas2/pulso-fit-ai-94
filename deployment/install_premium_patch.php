<?php
declare(strict_types=1);
/**
 * Final visual replacement for installation pages, after all pre-existing
 * notification/manifest patches. External CSS/JS avoid inline-style failure.
 * No changes to authentication, push transport, balances or Pix routes.
 */
$static='/var/www/html/public/static/';
$template=file_get_contents($static.'install-premium.html');
if(!is_string($template)||strlen($template)<7000||
   substr_count($template,'</html>')!==1)
 throw new RuntimeException('Premium install page template unavailable');
$common=[
 '%%ROLE%%','%%WORKER%%','%%SCOPE%%','%%SHORT_NAME%%','%%APP_NAME%%',
 '%%MANIFEST%%','%%ROLE_LABEL%%','%%ROLE_BADGE%%','%%TARGET%%',
 '%%ROLE_EXPLAIN%%'
];
foreach($common as $token)
 if(!str_contains($template,$token))
  throw new RuntimeException('Premium install missing token '.$token);
$variants=[
 'install.html'=>[
  '%%ROLE%%'=>'revenda',
  '%%WORKER%%'=>'sw-revenda.js',
  '%%SCOPE%%'=>'/conta',
  '%%SHORT_NAME%%'=>'ARGUS Revenda',
  '%%APP_NAME%%'=>'ARGUS Revenda',
  '%%MANIFEST%%'=>'/static/manifest.webmanifest?v=revenda-20261123-v8',
  '%%ROLE_LABEL%%'=>'Portal do Revendedor',
  '%%ROLE_BADGE%%'=>'REVENDAS',
  '%%TARGET%%'=>'/conta',
  '%%ROLE_EXPLAIN%%'=>'Acesse sua própria conta, com área exclusiva para cobranças, saldos e notificações.'
 ],
 'install-admin.html'=>[
  '%%ROLE%%'=>'admin',
  '%%WORKER%%'=>'sw-admin.js',
  '%%SCOPE%%'=>'/admin',
  '%%SHORT_NAME%%'=>'ARGUS Admin',
  '%%APP_NAME%%'=>'ARGUS Admin',
  '%%MANIFEST%%'=>'/static/manifest-admin.webmanifest?v=admin-20261123-v8',
  '%%ROLE_LABEL%%'=>'Painel Administrativo',
  '%%ROLE_BADGE%%'=>'ADMINISTRAÇÃO',
  '%%TARGET%%'=>'/admin',
  '%%ROLE_EXPLAIN%%'=>'Entre diretamente na administração ARGUS Pay, sem redirecionar para o painel do revendedor.'
 ]
];
foreach($variants as $file=>$vars){
 $result=strtr($template,$vars);
 if(str_contains($result,'%%')||substr_count($result,'rel="manifest"')!==1||
  !str_contains($result,'install-premium.css?v=20261123-1')||
  !str_contains($result,'install-premium.js?v=20261123-1'))
  throw new RuntimeException('Premium install result has invalid metadata: '.$file);
 $path=$static.$file;
 if(file_put_contents($path,$result)===false)
  throw new RuntimeException('Premium install cannot write '.$file);
}
echo "PASS: premium installation pages rebuilt for Admin and reseller with scoped manifests, accessible responsive layout and external assets.\n";
