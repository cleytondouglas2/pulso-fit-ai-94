<?php
declare(strict_types=1);
/** Install document registry pre-screening, provider authentication diagnosis, and PWA icon fix. */
$root='/var/www/html';
function argusNewReplace(string $path,string $old,string $new,string $label):void{
    $s=file_get_contents($path);
    if(!is_string($s)||substr_count($s,$old)!==1)throw new RuntimeException('ARGUS update anchor: '.$label);
    if(file_put_contents($path,str_replace($old,$new,$s))===false)throw new RuntimeException('ARGUS update write: '.$label);
}
argusNewReplace("$root/src/Gateway.php",
    "require_once __DIR__ . '/AI.php';",
    "require_once __DIR__ . '/AI.php';\nrequire_once __DIR__ . '/DocumentValidation.php';\nrequire_once __DIR__ . '/PixDiagnostics.php';",
    'backend dependencies');
argusNewReplace("$root/src/Admin.php",
    "if(str_starts_with(\$path,'/api/admin/ai/'))ArgusAI::handle(\$db,\$method,\$path,'admin',\$actor);",
    "if(str_starts_with(\$path,'/api/admin/ai/'))ArgusAI::handle(\$db,\$method,\$path,'admin',\$actor);\n        if(\$path==='/api/admin/pix/diagnostics')PixDiagnostics::status(\$db,\$method,\$path,\$actor);",
    'MFA-protected Pix diagnostics');
$admin="$root/public/static/admin.html";$client="$root/public/static/client.html";
argusNewReplace($admin,
    '<section class="page argus-ai" id="page-argus-ai" hidden>',
    '<section class="page argus-ai" id="page-argus-ai" hidden><div class="panel" id="pix-diagnostics" style="margin-bottom:16px"><h2>Emissão Pix · diagnóstico seguro</h2><p id="pix-diagnostics-message" class="muted">Confira a autenticação do provedor sem gerar cobrança.</p><button id="pix-diagnostics-check" class="btn secondary" type="button">Verificar geração Pix</button><p class="muted">Este teste é somente leitura. Se o provedor recusar as chaves, atualize Client ID e Client Secret nas variáveis protegidas do servidor.</p></div>',
    'Pix status panel in admin');
foreach([$admin,$client,"$root/public/static/install.html","$root/public/static/docs.html"] as $html){
    $raw=file_get_contents($html);
    if(!is_string($raw)||substr_count($raw,'</head>')!==1)throw new RuntimeException('ARGUS icon missing HTML head');
    $old='<link rel="apple-touch-icon" href="/static/assets/argus-icon-180.png">';
    $icon='<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=4">';
    if(str_contains($raw,$old))$raw=str_replace($old,$icon,$raw);
    elseif(!str_contains($raw,'rel="apple-touch-icon"'))$raw=str_replace('</head>',$icon.'</head>',$raw);
    $raw=str_replace('href="/static/manifest.webmanifest"','href="/static/manifest.webmanifest?v=4"',$raw);
    if($html===$admin)$raw=str_replace('</body>','<script src="/static/pix-diagnostics.js?v=4" defer></script></body>',$raw);
    file_put_contents($html,$raw);
}
$manifest="$root/public/static/manifest.webmanifest";
$m=json_decode((string)file_get_contents($manifest),true,16,JSON_THROW_ON_ERROR);
$m['icons']=[
 ['src'=>'/static/assets/argus-icon-192.png?v=4','sizes'=>'192x192','type'=>'image/png','purpose'=>'any'],
 ['src'=>'/static/assets/argus-icon-512.png?v=4','sizes'=>'512x512','type'=>'image/png','purpose'=>'any'],
 ['src'=>'/static/assets/argus-icon-512.png?v=4','sizes'=>'512x512','type'=>'image/png','purpose'=>'maskable']
];
file_put_contents($manifest,json_encode($m,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
echo "ARGUS Pix status and document pre-check wired; iOS icon paths now opaque and cache-versioned.\n";
