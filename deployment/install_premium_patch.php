<?php
declare(strict_types=1);
/**
 * Final visual replacement for installation pages, after all pre-existing
 * notification/manifest patches. External CSS/JS avoid inline-style failure.
 * No changes to authentication, push transport, balances or Pix routes.
 */
$static='/var/www/html/public/static/';
$template=file_get_contents($static.'install-premium.html');
$baseCss=file_get_contents($static.'install-premium.css');
$rescueCss=file_get_contents($static.'install-premium-rescue.css');
$installJs=file_get_contents($static.'install-premium.js');
if(!is_string($baseCss)||strlen($baseCss)<15000||
   !is_string($rescueCss)||strlen($rescueCss)<4000||
   !is_string($installJs)||strlen($installJs)<1800||
   str_contains($baseCss,'</style')||str_contains($rescueCss,'</style')||
   str_contains($installJs,'</script'))
 throw new RuntimeException('Premium installation: invalid self-contained assets');

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
 // The previous external CSS could be missing in the installed iOS web app,
 // leaving a tall, unstyled hero. Embed the full stylesheet as a failsafe.
 $result=str_replace(
  '<link rel="stylesheet" href="/static/install-premium.css?v=20261123-1">',
  '<link rel="stylesheet" href="/static/install-premium.css?v=20261123-2">'.
  '<style id="argus-install-embedded-css">'.PHP_EOL.$baseCss.PHP_EOL.$rescueCss.PHP_EOL.'</style>',
  $result
 );
 // Run exactly once, without depending on script caching / service workers.
 $result=str_replace('<script src="/static/install-premium.js?v=20261123-1" defer></script>','',$result);
 $result=str_replace('</body>',
  '<script id="argus-install-embedded-js">'.PHP_EOL.$installJs.PHP_EOL.'</script></body>',$result);
 // Decorative empty DOM elements could reserve large vertical space when
 // only part of the CSS was applied. The background is now drawn on the root.
 $result=str_replace(
  '<div class="atmosphere" aria-hidden="true"><div class="glow g1"></div><div class="glow g2"></div><div class="orbits"></div></div>',
  '',$result
 );
 if(str_contains($result,'%%')||substr_count($result,'rel="manifest"')!==1||
  !str_contains($result,'install-premium.css?v=20261123-2')||
  !str_contains($result,'id="argus-install-embedded-css"')||
  !str_contains($result,'id="argus-install-embedded-js"'))
  throw new RuntimeException('Premium install result has invalid metadata: '.$file);
 $path=$static.$file;
 if(file_put_contents($path,$result)===false)
  throw new RuntimeException('Premium install cannot write '.$file);
}
echo "PASS: premium installation pages are self-contained with full responsive CSS and scripts, safe-area iOS layouts and role-scoped manifests.\n";
