<?php
declare(strict_types=1);
require_once __DIR__.'/core.php';

function publicUrl(string $input):string {
 $p=parse_url($input);if(!$p||!in_array(strtolower($p['scheme']??''),['https'],true)||empty($p['host'])||isset($p['user'])||isset($p['pass'])||isset($p['fragment']))throw new InvalidArgumentException('Informe uma URL HTTPS pública sem usuário/senha embutidos');
 $host=strtolower($p['host']);if($host==='localhost'||str_ends_with($host,'.local')||filter_var($host,FILTER_VALIDATE_IP))throw new InvalidArgumentException('Informe um domínio público válido');return $input;
}
function panelInput(array $x,?array $old=null):array {
 $name=clean($x['name']??'',90);$kind=clean($x['kind']??'',40);$url=publicUrl(clean($x['url']??'',500));$mode=clean($x['auth_mode']??'credentials',30);
 if(!$name||!in_array($kind,['sigma','painelfoda','xtream','custom'],true))throw new InvalidArgumentException('Nome ou tipo de painel inválido');
 if(!in_array($mode,['credentials','token','browser','remote_browser'],true))throw new InvalidArgumentException('Tipo de autenticação inválido');
 $apiUrl=empty($x['api_url'])?'':publicUrl(clean($x['api_url'],500));$user=clean($x['login_user']??'',140);$pass=(string)($x['login_pass']??'');$token=clean($x['token']??'',400);
 if(strlen($pass)>500)throw new InvalidArgumentException('Senha do painel muito longa');
 if(in_array($mode,['credentials','remote_browser'],true)&&(!$user||(!$pass&&empty($old['login_pass_enc']))))throw new InvalidArgumentException('Informe usuário e senha para conectar ao painel');
 if($mode==='token'&&(!$apiUrl||(!$token&&empty($old['token_enc']))))throw new InvalidArgumentException('Informe endpoint e token da API');
 foreach(['login_path'=>'/api/login','clients_path'=>'/api/clients','plans_path'=>'/api/plans'] as $f=>$fallback){$path=clean($x[$f]??$fallback,256);if($path!==''&&(!str_starts_with($path,'/')||str_starts_with($path,'//')||str_contains($path,'..')||!preg_match('~^/[a-zA-Z0-9_./?=&%-]*$~',$path)))throw new InvalidArgumentException('Rota da API inválida');$paths[$f]=$path;}
 $loginField=clean($x['login_field']??'username',40);$passwordField=clean($x['password_field']??'password',40);
 if(!preg_match('/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/',$loginField)||!preg_match('/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/',$passwordField)||$loginField===$passwordField)throw new InvalidArgumentException('Campos de autenticação inválidos');
 return ['name'=>$name,'kind'=>$kind,'url'=>$url,'api_url'=>$apiUrl,'auth_mode'=>$mode,'login_user'=>$user,'login_pass'=>$pass,'token'=>$token,'login_path'=>$paths['login_path'],'clients_path'=>$paths['clients_path'],'plans_path'=>$paths['plans_path'],'login_field'=>$loginField,'password_field'=>$passwordField,'auto_sync'=>($mode==='browser'||empty($x['auto_sync']))?0:1];
}
function goodIP(string $ip):bool {
 if(!filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE))return false;
 if(filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_IPV4)){
  $p=array_map('intval',explode('.',$ip));return !($p[0]===100&&$p[1]>=64&&$p[1]<=127||$p[0]===198&&in_array($p[1],[18,19],true)||$p[0]===192&&$p[1]===0||$p[0]===203&&$p[1]===0&&$p[2]===113);
 }
 return !str_starts_with(strtolower($ip),'64:ff9b:')&&!str_starts_with(strtolower($ip),'2002:')&&!str_starts_with(strtolower($ip),'2001:0:');
}
function pinnedIp(string $host):string {
 $records=dns_get_record($host,DNS_A|DNS_AAAA);$ips=[];foreach($records?:[] as $r){$v=$r['ip']??$r['ipv6']??'';if($v!=='')$ips[]=$v;}
 if(!$ips)throw new RuntimeException('Não foi possível resolver o endereço do painel');
 foreach($ips as $ip)if(!goodIP($ip))throw new RuntimeException('Destino de integração bloqueado por segurança de rede');
 foreach($ips as $ip)if(filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_IPV4))return $ip;
 return $ips[0];
}
function panelEndpoint(string $root,string $path):string {
 publicUrl($root);if(!str_starts_with($path,'/')||str_starts_with($path,'//')||str_contains($path,'..'))throw new InvalidArgumentException('Rota da API inválida');
 $parts=parse_url($root);return 'https://'.$parts['host'].(isset($parts['port'])?':'.$parts['port']:'').$path;
}
function requestPanel(string $url,string $method='GET',?array $data=null,array $headers=[],string $phase='consulta',int $timeout=16):array {
 publicUrl($url);if(!function_exists('curl_init'))throw new RuntimeException('Extensão PHP curl necessária');
 $p=parse_url($url);$host=$p['host'];$port=(int)($p['port']??443);$ip=pinnedIp($host);
 $resHeaders=[];$buf='';$ch=curl_init($url);if(!$ch)throw new RuntimeException('Falha ao inicializar conexão');
 $h=array_merge(['Accept: application/json','User-Agent: ClystriaPHP/1.0'],$headers);
 if($method==='POST'){curl_setopt($ch,CURLOPT_POST,true);$payload=json_encode($data,JSON_THROW_ON_ERROR);curl_setopt($ch,CURLOPT_POSTFIELDS,$payload);$h[]='Content-Type: application/json';}
 curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>false,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>$timeout,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>$h,CURLOPT_RESOLVE=>["$host:$port:$ip"],CURLOPT_HEADERFUNCTION=>static function($ch,$line)use(&$resHeaders){$parts=explode(':',$line,2);if(count($parts)===2){$key=strtolower(trim($parts[0]));$resHeaders[$key][] =trim($parts[1]);}return strlen($line);},CURLOPT_WRITEFUNCTION=>static function($ch,$chunk)use(&$buf){$buf.=$chunk;if(strlen($buf)>5242880)return 0;return strlen($chunk);}]);
 try{
  $ok=curl_exec($ch);$code=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);
  if($ok===false)throw new RuntimeException('Erro de rede/API: '.curl_error($ch));
  if(($resHeaders['cf-mitigated'][0]??'')==='challenge'||preg_match('/just a moment|checking your browser|attention required/i',substr($buf,0,500)))throw new RuntimeException('Cloudflare requer autenticação no navegador; solicite uma API autorizada ao fornecedor');
  if($code>=300&&$code<400)throw new RuntimeException('A API redirecionou a solicitação; confira as rotas');
  if($phase==='navegação Chromium'&&$code>=400){$result=json_decode($buf,true);$error=is_array($result)?clean($result['error']??'',220):'';throw new RuntimeException($error!==''?'Navegador remoto: '.$error:'Navegador remoto respondeu HTTP '.$code);}
  if($code===404)throw new RuntimeException('Rota de '.$phase.' não encontrada (HTTP 404). O endereço do painel não oferece essa rota genérica de API; confirme com o fornecedor o endpoint oficial de integração e ajuste as configurações avançadas.');
  if($code===405)throw new RuntimeException('A rota de '.$phase.' não aceita este método HTTP (405). Confira o contrato da API do fornecedor.');
  if($code<200||$code>=300)throw new RuntimeException($code===401?'Credenciais recusadas pela API na etapa de '.$phase:($code===403?'A API não autorizou a etapa de '.$phase:"A etapa de $phase retornou HTTP $code"));
  try{$json=json_decode($buf,true,512,JSON_THROW_ON_ERROR);}catch(Throwable){throw new RuntimeException('A API retornou conteúdo não JSON; confira o endereço de integração');}
  if(!is_array($json))throw new RuntimeException('A API retornou conteúdo inválido');
  if(($json['success']??true)===false||(!empty($json['error'])&&($json['success']??false)!==true))throw new RuntimeException('API: '.clean($json['message']??$json['error']??'falha',140));
  return ['data'=>$json,'cookies'=>$resHeaders['set-cookie']??[]];
 }finally{curl_close($ch);}
}
function listFrom(mixed $data,array $keys=['clients','users','customers','subscribers','results','items','records']):array {
 if(!is_array($data))throw new RuntimeException('Resposta da API inválida');
 foreach([$data,$data['data']??null,$data['data']['data']??null,$data['result']??null,$data['response']??null,$data['payload']??null] as $part){
  if(!is_array($part))continue;if(array_is_list($part))return $part;
  foreach($keys as $key)if(isset($part[$key])&&is_array($part[$key])&&array_is_list($part[$key]))return $part[$key];
 }
 throw new RuntimeException('API não retornou uma lista JSON reconhecível');
}
function field(array $item,array $keys):mixed{foreach($keys as $k){if(array_key_exists($k,$item)&&$item[$k]!==null&&$item[$k]!=='')return $item[$k];}return null;}
function parseDue(mixed $v):string{
 if($v===null||$v==='')return '';
 if((is_int($v)||is_float($v)||(is_string($v)&&preg_match('/^\d{10,13}$/',$v))))return gmdate('Y-m-d',(int)((float)$v > 9999999999 ? (float)$v/1000 : $v));
 $s=trim((string)$v);if(preg_match('/^\d{2}\/\d{2}\/\d{4}$/',$s)){[$day,$month,$year]=explode('/',$s);$s="$year-$month-$day";}
 $s=substr($s,0,10);return date_valid($s)?$s:'';
}
function normalizePlan(array $x):?array {$name=field($x,['name','title','plan_name','package_name','nome']);if($name===null)return null;$days=(int)(field($x,['days','duration_days','duration','period_days','validity_days'])??30);if($days<1||$days>730)$days=30;$price=field($x,['price','value','valor','amount'])??0;if(!is_numeric($price)||$price<0)$price=0;return ['key'=>clean(field($x,['id','plan_id','package_id','uuid'])??'',100),'name'=>clean($name,65),'days'=>$days,'price'=>(float)$price];}
function normalizeClient(array $x,array $plans):?array {
 $username=clean(field($x,['username','login','user','usuario','user_name','customer_username'])??'',100);
 $due=parseDue(field($x,['due_date','dueDate','expiration_date','expirationDate','expiry_date','expiration','exp_date','expires_at','expire_at','expired_at','expires','vencimento','data_vencimento','end_date','date_end','valid_until']));
 if(!$username||!$due)return null;
 $planObj=field($x,['plan','package','subscription']);$key=field($x,['plan_id','package_id','subscription_id'])??(is_array($planObj)?field($planObj,['id','plan_id','package_id']):null);
 $matched=null;foreach($plans as $p){if($p['key']!==''&&$p['key']===(string)$key){$matched=$p;break;}}
 $name=field($x,['plan_name','package_name','plano','pacote']);if($name===null)$name=is_string($planObj)?$planObj:(is_array($planObj)?field($planObj,['name','title']):null);$name??=$matched['name']??'';
 $raw=strtolower((string)(field($x,['status','state','situation','situacao'])??''));
 $status=preg_match('/cancel/i',$raw)?'canceled':(preg_match('/expire|expirad|inactiv|inativ|disabled|block|suspend|paus|vencid|bloque/i',$raw)||($x['active']??null)===false||($x['enabled']??null)===false?'paused':(preg_match('/trial|teste/i',$raw)?'trial':'active'));
 $price=field($x,['price','value','valor','amount']);$price=$price!==null&&is_numeric($price)&&$price>=0?(float)$price:null;
 return ['username'=>$username,'due_date'=>$due,'name'=>clean(field($x,['name','customer_name','nome','display_name','full_name','customerName'])??$username,100),'phone'=>clean(field($x,['phone','telefone','whatsapp','mobile'])??'',40),'email'=>clean($x['email']??'',180),'password'=>clean(field($x,['password','senha'])??'',180),'status'=>$status,'plan_name'=>clean($name,65),'price'=>$price];
}
function chromiumManual(string $action,array $payload,int $timeout=45):array {
 $endpoint=envv('BROWSER_WORKER_URL');$token=envv('BROWSER_WORKER_TOKEN');
 if($endpoint===''||strlen($token)<32)throw new RuntimeException('Navegador Chromium não configurado');
 if(!in_array($action,['open','frame','action','import','close'],true))throw new InvalidArgumentException('Operação inválida');
 $result=requestPanel(rtrim($endpoint,'/').'/live/'.$action,'POST',$payload,['Authorization: Bearer '.$token],'navegação Chromium',$timeout)['data'];
 if(($result['ok']??false)!==true)throw new RuntimeException('O Chromium não confirmou a operação');
 return $result;
}

function remoteBrowserFetch(array $panel):array {
 $endpoint=envv('BROWSER_WORKER_URL');
 $token=envv('BROWSER_WORKER_TOKEN');
 if($endpoint===''||strlen($token)<32)throw new RuntimeException('O navegador remoto ainda não está configurado no Clystria');
 if(!$panel['login_user']||!$panel['login_pass_enc'])throw new RuntimeException('Configure o usuário e a senha da conexão');
 set_time_limit(110);
 $payload=[
  'url'=>$panel['url'],
  'username'=>$panel['login_user'],
  'password'=>unseal($panel['login_pass_enc']),
  'panel_kind'=>$panel['kind'],
 ];
 $response=requestPanel(rtrim($endpoint,'/').'/sync','POST',$payload,['Authorization: Bearer '.$token],'navegação Chromium',95);
 $json=$response['data'];
 if(($json['ok']??false)!==true||!isset($json['clients'])||!is_array($json['clients']))throw new RuntimeException('O navegador não retornou uma lista válida de clientes');
 if(count($json['clients'])>10000)throw new RuntimeException('O navegador retornou clientes demais');
 $diag=is_array($json['diagnostics']??null)?$json['diagnostics']:[];
 $details=isset($diag['valid_clients'])?'Navegador real: '.((int)$diag['valid_clients']).' clientes lidos da interface.':'';
 return ['clients'=>$json['clients'],'plans'=>[],'warning'=>trim($details.' '.clean($json['warning']??'',150))];
}
function fetchPanel(array $panel):array {
 if($panel['auth_mode']==='remote_browser'||($panel['auth_mode']==='credentials'&&in_array($panel['kind'],['sigma','painelfoda'],true)&&envv('BROWSER_WORKER_URL')!==''))return remoteBrowserFetch($panel);
 if($panel['auth_mode']==='browser')throw new RuntimeException('Login pelo Safari/Chrome não libera acesso do servidor à sessão externa. Abra o painel no navegador e importe o arquivo de clientes exportado, ou configure uma API autorizada.');
 if($panel['auth_mode']==='token'){
  if(!$panel['api_url']||!$panel['token_enc'])throw new RuntimeException('Configure endpoint e token autorizado');
  $response=requestPanel($panel['api_url'],'GET',null,['Authorization: Bearer '.unseal($panel['token_enc'])],'consulta de clientes');
  $clients=listFrom($response['data']);$p=$response['data']['plans']??$response['data']['data']['plans']??[];
  return ['clients'=>$clients,'plans'=>array_values(array_filter(array_map('normalizePlan',is_array($p)?$p:[]))),'warning'=>''];
 }
 if(!$panel['login_user']||!$panel['login_pass_enc'])throw new RuntimeException('Configure usuário e senha do painel');
 $login=requestPanel(panelEndpoint($panel['url'],$panel['login_path']),'POST',[$panel['login_field']=>$panel['login_user'],$panel['password_field']=>unseal($panel['login_pass_enc'])],[],'autenticação');
 $d=$login['data'];$token=field($d,['access_token','accessToken','token','jwt'])??field(is_array($d['data']??null)?$d['data']:[],['access_token','accessToken','token','jwt'])??field(is_array($d['result']??null)?$d['result']:[],['token','access_token']);
 $cookies=[];foreach($login['cookies'] as $s){$first=explode(';',$s,2)[0];if(preg_match('/^[\w.\-]+=[^;\r\n]*$/',$first))$cookies[]=$first;}
 if(!$token&&!$cookies)throw new RuntimeException('API não retornou token nem cookie de sessão; é necessário um adaptador do fornecedor');
 $headers=[];if($token)$headers[]='Authorization: Bearer '.$token;if($cookies)$headers[]='Cookie: '.implode('; ',$cookies);
 $clients=listFrom(requestPanel(panelEndpoint($panel['url'],$panel['clients_path']),'GET',null,$headers,'consulta de clientes')['data']);
 $plans=[];$warning='';if($panel['plans_path']){try{$json=requestPanel(panelEndpoint($panel['url'],$panel['plans_path']),'GET',null,$headers,'consulta de planos')['data'];$plans=array_values(array_filter(array_map('normalizePlan',listFrom($json,['plans','packages','products','items']))));}catch(Throwable $e){$warning='Planos não disponíveis: '.$e->getMessage();}}
 return ['clients'=>$clients,'plans'=>$plans,'warning'=>$warning];
}
function syncPanel(string $id,string $actor='Clystria automático',?array $manualResult=null):array {
 $panel=one('SELECT * FROM panels WHERE id=?',[$id]);if(!$panel)throw new RuntimeException('Painel não encontrado');
 run('UPDATE panels SET last_attempt=CURRENT_TIMESTAMP WHERE id=?',[$id]);
 try{
  $remote=$manualResult??fetchPanel($panel);$rows=$remote['clients'];$plans=$remote['plans'];if(count($rows)>10000)throw new RuntimeException('Máximo de 10.000 clientes por sincronização');
  $pdo=getDb();$pdo->beginTransaction();$created=$updated=$ignored=$plansCreated=0;
  $map=[];
  foreach($plans as $r){$name=clean($r['name'].' • '.$panel['name'],80);$found=one('SELECT id FROM plans WHERE name=?',[$name]);if(!$found){$new=id();run('INSERT INTO plans(id,name,days,price_cents,color) VALUES(?,?,?,?,?)',[$new,$name,$r['days'],money($r['price']),'#31DAB3']);$found=['id'=>$new];$plansCreated++;}$map[strtolower($r['name'])]=$found['id'];}
  foreach($rows as $item){$c=is_array($item)?normalizeClient($item,$plans):null;if(!$c){$ignored++;continue;}
   $localPlan=$c['plan_name']!==''?($map[strtolower($c['plan_name'])]??null):null;
   if($c['plan_name']!==''&&!$localPlan){$name=clean($c['plan_name'].' • '.$panel['name'],80);$found=one('SELECT id FROM plans WHERE name=?',[$name]);if(!$found){$new=id();run('INSERT INTO plans(id,name,days,price_cents,color) VALUES(?,?,?,?,?)',[$new,$name,30,0,'#31DAB3']);$found=['id'=>$new];$plansCreated++;}$localPlan=$found['id'];$map[strtolower($c['plan_name'])]=$localPlan;}
   $existing=one('SELECT * FROM clients WHERE panel_id=? AND username=? AND archived_at IS NULL',[$id,$c['username']]);
   if($existing){run('UPDATE clients SET name=?,phone=?,email=?,due_date=?,status=?,password_enc=?,plan_id=?,price_cents=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[$c['name'],$c['phone']?:$existing['phone'],$c['email']?:$existing['email'],$c['due_date'],$c['status'],$c['password']?seal($c['password']):$existing['password_enc'],$localPlan?:$existing['plan_id'],$c['price']!==null?money($c['price']):$existing['price_cents'],$existing['id']]);$updated++;}
   else{run('INSERT INTO clients(id,name,phone,email,username,password_enc,status,due_date,plan_id,price_cents,panel_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id(),$c['name'],$c['phone'],$c['email'],$c['username'],seal($c['password']),$c['status'],$c['due_date'],$localPlan,$c['price']!==null?money($c['price']):($localPlan?(int)(one('SELECT price_cents FROM plans WHERE id=?',[$localPlan])['price_cents']??0):0),$id]);$created++;}
  }
  run('UPDATE panels SET last_status=?,last_sync=CURRENT_TIMESTAMP WHERE id=?',['ok',$id]);$pdo->commit();activity($actor,'painel.sincronizar',"{$panel['name']}: $created novos, $updated atualizados");
  return ['ok'=>true,'created'=>$created,'updated'=>$updated,'ignored'=>$ignored,'total'=>count($rows),'plans_created'=>$plansCreated,'warning'=>$remote['warning']];
 }catch(Throwable $e){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();run('UPDATE panels SET last_status=? WHERE id=?',['error: '.clean($e->getMessage(),150),$id]);activity($actor,'painel.falha',$panel['name'].': '.clean($e->getMessage(),160));throw $e;}
}
