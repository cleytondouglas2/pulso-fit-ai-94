<?php
declare(strict_types=1);
/**
 * Customer UI-only patch: mobile header, checkbox dimensions, sensible
 * account-section order, and hide unavailable Pix forms until authorized.
 * Applied LAST so historical PHP/JS financial regression tests are intact.
 */
$root='/var/www/html/public/static';
$client=$root.'/client.html';
$html=file_get_contents($client);
if(!is_string($html)||substr_count($html,'</head>')!==1||
   substr_count($html,'</body>')!==1)
    throw new RuntimeException('Mobile registration repair: client HTML malformed');
foreach(['client-mobile-fix.css','client-mobile-fix.js'] as $asset)
    if(!is_file($root.'/'.$asset)||filesize($root.'/'.$asset)<1000)
        throw new RuntimeException('Missing client layout asset '.$asset);
if(str_contains($html,'client-mobile-fix.css'))
    throw new RuntimeException('Duplicate customer layout style');
$html=str_replace('</head>',
    '<link rel="stylesheet" href="/static/client-mobile-fix.css?v=20261119-2"></head>',$html);
$html=str_replace('</body>',
    '<script defer src="/static/client-mobile-fix.js?v=20261119-2"></script></body>',$html);
if(file_put_contents($client,$html)===false)
    throw new RuntimeException('Failed to install mobile customer page UI');

$portalPath=$root.'/portal.js';
$portal=file_get_contents($portalPath);
$from="const result=await request('/api/portal/session');render(result.account)}catch(e)";
$to="const result=await request('/api/portal/session');".
    "if(location.pathname==='/cadastro'&&result.account){history.replaceState(null,'','/conta');window.scrollTo(0,0);}".
    "render(result.account)}catch(e)";
if(!is_string($portal)||substr_count($portal,$from)!==1)
    throw new RuntimeException('Mobile registration repair: portal session bootstrap changed');
$portal=str_replace($from,$to,$portal);
if(file_put_contents($portalPath,$portal)===false)
    throw new RuntimeException('Failed to repair /cadastro authenticated route');
$html=file_get_contents($client);
$fromJs='/static/portal.js?v=landing-1';
if(!is_string($html)||substr_count($html,$fromJs)!==1)
    throw new RuntimeException('Mobile registration repair: signup JS cache not found');
$html=str_replace($fromJs,'/static/portal.js?v=mobile-nov19-2',$html);
if(file_put_contents($client,$html)===false)
    throw new RuntimeException('Failed to refresh signup JavaScript');

$merchantPath=$root.'/merchant-portal.js';
$merchant=file_get_contents($merchantPath);
if(!is_string($merchant))
    throw new RuntimeException('Mobile registration repair: merchant JS missing');
$old="  top.after(root);";
$new="  const accountGrid=E('dashboard')?.querySelector('.grid');\n".
     "  (accountGrid||top).after(root);";
if(substr_count($merchant,$old)!==1)
    throw new RuntimeException('Mobile registration repair: financial account section anchor changed');
$merchant=str_replace($old,$new,$merchant);
$old=<<<'JS'
 function walletRender(w){
  if(!w){E('seller-balances').textContent='Aguardando validação documental e aprovação financeira. Nenhuma API, recebimento ou saque está habilitado.';return}
JS;
$new=<<<'JS'
 function financeForms(w){
  const flags=[
   ['seller-withdraw-form','seller-withdraw-gate',!!w?.withdrawals_enabled,
    'Saques estarão disponíveis após a homologação financeira e autorização do provedor.'],
   ['seller-deposit-form','seller-deposit-gate',!!w?.deposits_enabled,
    'A emissão de Pix estará disponível após a análise cadastral e a habilitação do provedor.']
  ];
  for(const [formId,noteId,enabled,message] of flags){
   const form=E(formId);if(!form)continue;
   form.hidden=!enabled;
   let note=E(noteId);
   if(!note){
    note=document.createElement('p');note.id=noteId;
    note.className='seller-form-gate';form.before(note);
   }
   note.textContent=message;note.hidden=enabled;
  }
 }
 function walletRender(w){
  financeForms(w);
  if(!w){E('seller-balances').textContent='Identidade em análise ou operações financeiras ainda não autorizadas. Você pode acompanhar o cadastro e o histórico sem gerar Pix ou saques.';return}
JS;
if(substr_count($merchant,$old)!==1)
    throw new RuntimeException('Mobile registration repair: wallet availability anchor changed');
$merchant=str_replace($old,$new,$merchant);
if(file_put_contents($merchantPath,$merchant)===false)
    throw new RuntimeException('Failed to repair wallet UI gating/order');
$html=file_get_contents($client);
$fromMerchant='/static/merchant-portal.js?v=4';
if(!is_string($html)||substr_count($html,$fromMerchant)!==1)
    throw new RuntimeException('Mobile registration repair: merchant JS cache not found');
$html=str_replace($fromMerchant,'/static/merchant-portal.js?v=mobile-nov19-2',$html);
if(file_put_contents($client,$html)===false)
    throw new RuntimeException('Failed to refresh wallet JavaScript');

echo "PASS: compact non-overlapping iPhone header, correct /cadastro session URL, CPF checkbox controls, account-before-finance order and unavailable financial forms hidden.\n";
