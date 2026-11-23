<?php
declare(strict_types=1);
/**
 * Read existing marketing site HTML, discover visible copy with CSS-targeted
 * text-node selectors, and emit a stable editing manifest. No HTML mutation.
 * Tokens bound to financial demo, code, API examples, or generated ranking
 * never become editable through this public-site presentation studio.
 */
$root='/var/www/html/public/static/';
$html=file_get_contents($root.'landing.html');
if(!is_string($html)||strlen($html)<10000)throw new RuntimeException('Marketing page unavailable');
libxml_use_internal_errors(true);
$dom=new DOMDocument('1.0','UTF-8');
if(!$dom->loadHTML('<?xml encoding="UTF-8"?>'.$html,LIBXML_NONET))
 throw new RuntimeException('Could not parse marketing content');
libxml_clear_errors();
$xpath=new DOMXPath($dom);
$nodes=$xpath->query('//body//*[self::h1 or self::h2 or self::h3 or self::p or self::a or self::summary or self::span or self::strong or self::small or self::li]');
function editableAncestor(DOMNode $n):bool {
 for($x=$n;$x!==null;$x=$x->parentNode){
  if(!$x instanceof DOMElement)continue;
  $tag=strtolower($x->tagName);
  if(in_array($tag,['script','style','svg','code','pre','button','textarea','input','noscript'],true))
   return false;
  if($x->getAttribute('aria-hidden')==='true'||$x->hasAttribute('contenteditable'))return false;
  $class=' '.$x->getAttribute('class').' ';
  foreach([
   ' dashboard-window ',' float-card ',' code-window ',' story-visual ',
   ' ribbon-track ',' demo-pill ',' qr-spot ',' chart-legend ',
   ' visual-corner ',' dash-chart ',' argus-awards ',' argus-aw-plaque ',
   ' integration-tags ',' chart-axis ',' mini-illustration ',' step-icon '
  ] as $ignored)if(str_contains($class,$ignored))return false;
  $id=$x->getAttribute('id');
  if(in_array($id,[
   'simulation-revenue','simulation-qty-value','simulation-ticket-value',
   'simulation-volume','simulation-count','integration-code',
   'argus-awards-public','menu-toggle'],true))return false;
 }
 return true;
}
function selectNode(DOMElement $element):string {
 $parts=[];
 for($e=$element;$e instanceof DOMElement&&strtolower($e->tagName)!=='html';$e=$e->parentNode){
  $id=$e->getAttribute('id');
  if($id!==''&&preg_match('/^[A-Za-z][a-zA-Z0-9_-]*$/D',$id)){
   array_unshift($parts,'#'.$id);
   break;
  }
  $tag=strtolower($e->tagName);
  $num=1;
  for($sib=$e->previousSibling;$sib;$sib=$sib->previousSibling)
   if($sib instanceof DOMElement&&strtolower($sib->tagName)===$tag)$num++;
  array_unshift($parts,$tag.':nth-of-type('.$num.')');
  if($tag==='body')break;
 }
 return implode(' > ',$parts);
}
function categorize(DOMElement $el):string {
 for($x=$el;$x instanceof DOMElement;$x=$x->parentNode){
  $id=$x->getAttribute('id');
  $class=' '.$x->getAttribute('class').' ';
  if($id==='ranking')return 'Ranking';
  if($id==='plataforma'||str_contains($class,' intro-section '))return 'Plataforma';
  if($id==='gestao'||str_contains($class,' story-section '))return 'Gestão';
  if(str_contains($class,' steps-section '))return 'Jornada';
  if($id==='seguranca'||str_contains($class,' security-section '))return 'Segurança';
  if($id==='integracoes'||str_contains($class,' integration-section '))return 'Integrações';
  if($id==='perguntas'||str_contains($class,' faq-section '))return 'Perguntas';
  if(str_contains($class,' end-section '))return 'Chamada final';
  if(str_contains($class,' hero '))return 'Apresentação';
  if(strtolower($x->tagName)==='footer')return 'Rodapé';
  if(strtolower($x->tagName)==='header')return 'Cabeçalho';
 }
 return 'Informações';
}
$fields=[];$count=0;
foreach($nodes as $element){
 if(!$element instanceof DOMElement||!editableAncestor($element))continue;
 $selector=selectNode($element);
 foreach($element->childNodes as $idx=>$child){
  if(!$child instanceof DOMText)continue;
  $text=trim((string)$child->nodeValue);
  if(mb_strlen($text,'UTF-8')<4||mb_strlen($text,'UTF-8')>1150)continue;
  if(preg_match('/^[\d\W_]+$/u',$text))continue;
  if($count>=250)throw new RuntimeException('Too many site text fields');
  ++$count;$key=sprintf('copy_%03d',$count);
  $fields[]=['key'=>$key,'group'=>categorize($element),
   'label'=>mb_strlen($text,'UTF-8')>65?mb_substr($text,0,62,'UTF-8').'…':$text,
   'default'=>$text,
   'target'=>['selector'=>$selector,'node_index'=>$idx]];
 }
}
if($count<45)throw new RuntimeException('Marketing manifest incomplete: '.$count.' fields');
$json=json_encode(['revision'=>1,'count'=>$count,'fields'=>$fields],
 JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);
if(file_put_contents($root.'site-studio-manifest.json',$json)===false)
 throw new RuntimeException('Could not save site content manifest');
echo "PASS: ".count($fields)." editable website text segments catalogued; original HTML, checkout and financial examples unchanged.\n";
