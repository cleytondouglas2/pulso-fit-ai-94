<?php
declare(strict_types=1);
/** ARGUS IA release installer: applied after portal and notification patches. */
$root='/var/www/html';
function argusAIReplace(string $file,string $from,string $to,string $name):void {
    $raw=file_get_contents($file);
    if(!is_string($raw))throw new RuntimeException('ARGUS IA missing '.$name);
    $n=substr_count($raw,$from);
    if($n!==1)throw new RuntimeException('ARGUS IA patch mismatch '.$name.' ('.$n.')');
    if(file_put_contents($file,str_replace($from,$to,$raw))===false)throw new RuntimeException('ARGUS IA failed '.$name);
}
argusAIReplace("$root/src/Gateway.php",
    "require_once __DIR__ . '/Notifications.php';",
    "require_once __DIR__ . '/Notifications.php';\nrequire_once __DIR__ . '/AI.php';",
    'AI backend inclusion');
argusAIReplace("$root/src/Portal.php",
    "if(str_starts_with(\$path,'/api/portal/notifications'))Notifications::handle(\$db,\$method,\$path,'portal',\$account['id']);",
    "if(str_starts_with(\$path,'/api/portal/notifications'))Notifications::handle(\$db,\$method,\$path,'portal',\$account['id']);\n        if(str_starts_with(\$path,'/api/portal/ai/'))ArgusAI::handle(\$db,\$method,\$path,'portal',\$account);",
    'portal AI authenticated and CSRF protected');
argusAIReplace("$root/src/Admin.php",
    "if(str_starts_with(\$path,'/api/admin/notifications'))Notifications::handle(\$db,\$method,\$path,'admin',\$actor['id'],\$actor['role']==='superadmin');",
    "if(str_starts_with(\$path,'/api/admin/notifications'))Notifications::handle(\$db,\$method,\$path,'admin',\$actor['id'],\$actor['role']==='superadmin');\n        if(str_starts_with(\$path,'/api/admin/ai/'))ArgusAI::handle(\$db,\$method,\$path,'admin',\$actor);",
    'admin AI after authenticated MFA');
$ai=<<<'HTML'
<div class="ai-shell">
  <div class="ai-box">
    <div class="ai-heading"><h2>Assistente Argus IA</h2><button class="ai-refresh" type="button">Atualizar análises</button></div>
    <p class="ai-status" aria-live="polite">Carregando dados protegidos...</p>
    <div class="ai-conversation" role="log" aria-live="polite">
      <div class="ai-message ai-assistant"><small>Argus IA</small><p>Olá! Posso ajudar com Pix, integrações, análise financeira e alertas. Nunca envie senhas ou chaves secretas.</p></div>
    </div>
    <form class="ai-form" method="post">
      <textarea class="ai-question" maxlength="850" rows="2" required aria-label="Pergunte ao Argus IA" placeholder="Pergunte sobre seus pagamentos, alertas ou integração..."></textarea>
      <button class="ai-send" type="submit">Enviar</button>
    </form>
    <div class="ai-presets">
      <button type="button" data-ai-question="Quanto recebi de Pix hoje?">Pix de hoje</button>
      <button type="button" data-ai-question="Existem movimentações suspeitas?">Alertas</button>
      <button type="button" data-ai-question="Como integrar a API do ARGUS no meu site?">Integração API</button>
    </div>
  </div>
  <div class="ai-box">
    <h3>Análise financeira</h3><div class="ai-metrics" aria-live="polite"></div>
    <h3 style="margin-top:20px">Alertas inteligentes</h3><div class="ai-alerts" aria-live="polite"></div>
    <p class="ai-foot">Análises não autorizam nem executam transferências.</p>
  </div>
</div>
HTML;
$admin="$root/public/static/admin.html";
argusAIReplace($admin,
    '<section class="page" id="page-users" hidden>',
    '<section class="page argus-ai" id="page-argus-ai" hidden><div class="section-top"><div><p class="eyebrow">ARGUS PAYMENTS</p><h1>Argus IA</h1><p>Assistente financeiro, análises e alertas informativos.</p></div></div>'.$ai.'</section><section class="page" id="page-users" hidden>',
    'admin AI page');
argusAIReplace($admin,
    '<button class="menu-item super-only" data-nav="applications">',
    '<button class="menu-item super-only" data-nav="argus-ai"><span>✦</span> Argus IA</button><button class="menu-item super-only" data-nav="applications">',
    'admin AI navigation');
$portal="$root/public/static/client.html";
argusAIReplace($portal,
    '</section>'."\n".'<div id="notice" role="status" aria-live="polite" hidden></div>',
    '<section class="panel argus-ai" id="argus-portal-ai"><div class="panel-header"><div><h2>Argus IA</h2><p class="muted">Assistente, análises e alertas do seu estabelecimento.</p></div></div>'.$ai.'</section></section>'."\n".'<div id="notice" role="status" aria-live="polite" hidden></div>',
    'client AI page');
foreach([$admin,$portal] as $html){
    argusAIReplace($html,'</head>','<link rel="stylesheet" href="/static/ai-ui.css?v=1"></head>','AI stylesheet '.basename($html));
    argusAIReplace($html,'</body>','<script src="/static/ai-ui.js?v=1" defer></script></body>','AI script '.basename($html));
}
echo "ARGUS IA routes, menus, tenant controls wired; advisory worker installed separately.\n";
