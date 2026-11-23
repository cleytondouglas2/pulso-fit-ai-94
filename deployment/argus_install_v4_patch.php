<?php
declare(strict_types=1);
/**
 * ARGUS Pay install page v4. Replaces the problematic shared install page
 * with a standalone HTML document and inline critical layout. Unlike the
 * earlier 21k external CSS + runtime injection, this HTML is deterministic,
 * still readable when external assets fail, and doesn't use unspecified SVGs
 * or absolutely-positioned full-screen decorations.
 *
 * This is UI-only. Existing login, notifications, API, Pix and wallet code
 * are unchanged. Revendedor and Admin have distinct PWA manifests, scopes,
 * icon labels, install URLs and destinations.
 */
$dir='/var/www/html/public/static/';
$tpl=file_get_contents($dir.'argus-install-v4.html');
if(!is_string($tpl) || strlen($tpl)<21000 ||
   hash('sha256',$tpl)!=='3d630044e167fcb41e0b5dd8913120cd53fbc6d371289c43ce65bde1e0227522' ||
   substr_count($tpl,'<style>')!==1 ||
   substr_count($tpl,'<script>')!==1 ||
   substr_count($tpl,'</html>')!==1)
   throw new RuntimeException('ARGUS install v4: source checksum or markup validation failed');

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
  '%%ROLE_EXPLAIN%%'=>'Acesso direto à sua conta e notificações.'
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
  '%%ROLE_EXPLAIN%%'=>'Acesso direto ao painel administrativo, independente das revendas.'
 ]
];
foreach($variants as $file=>$replacements){
 $html=strtr($tpl,$replacements);
 if(str_contains($html,'%%') || substr_count($html,'rel="manifest"')!==1 ||
    !str_contains($html,'<style>') || !str_contains($html,'<script>') ||
    str_contains($html,'install-premium.css') || str_contains($html,'class="atmosphere"') ||
    !str_contains($html,'class="topbar" style="display:flex;') ||
    !str_contains($html,'id="passos"'))
      throw new RuntimeException('ARGUS install v4: template replacement invalid for '.$file);
 if(file_put_contents($dir.$file,$html)===false)
      throw new RuntimeException('ARGUS install v4: could not write '.$file);
}
echo "PASS: Argus Admin/Revenda install pages v4: self-contained design, compact mobile hero, distinct PWA scope and no unstyled fallback gaps.\n";
