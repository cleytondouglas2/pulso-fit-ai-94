<?php
/** Apache entry point: only /api routes go to PHP backend. */
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
if(str_starts_with(parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)??'/','/api/')){
 require dirname(__DIR__).'/src/api.php';
 exit;
}
if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET'){http_response_code(405);exit;}
header('Content-Type: text/html; charset=utf-8');
$html=file_get_contents(__DIR__.'/index.html');
if(getenv('APP_ENV')==='demo'){
  $warning='<div role="status" style="position:relative;z-index:999;background:#50252e;color:#fff1e3;padding:10px 16px;text-align:center;font:600 12px/1.5 system-ui,sans-serif">⚠ AMBIENTE DE DEMONSTRAÇÃO — use apenas dados fictícios. Os registros podem ser perdidos a qualquer reinício. Banco de dados de produção ainda não configurado.</div>';
  $html=str_replace('<body>','<body>'.$warning,$html);
}
echo $html;
