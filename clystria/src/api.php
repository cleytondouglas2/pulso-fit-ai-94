<?php
/** Clystria — PHP JSON API with login sessions, CSRF, RBAC and full CRUD */
declare(strict_types=1);
require_once __DIR__.'/integrations.php';
require_once __DIR__.'/growth.php';

function csvCell(mixed $x):string{$s=(string)($x??'');if(preg_match('/^[=+@\-\t\r]/',$s))$s="'".$s;return $s;}
function csvRows(string $csv):array {
 if(strlen($csv)>1100000)throw new InvalidArgumentException('Arquivo CSV muito grande');
 $csv=preg_replace('/^\xEF\xBB\xBF/','',$csv);
 $first=strtok($csv,"\r\n")?:'';$delimiter=substr_count($first,';')>substr_count($first,',')?';':',';
 $f=fopen('php://temp','w+');fwrite($f,$csv);rewind($f);$head=fgetcsv($f,0,$delimiter,'"','');if($head===false){fclose($f);return [];}
 $head=array_map(function($s){$s=strtolower(trim($s));return strtr($s,['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','é'=>'e','ê'=>'e','í'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ú'=>'u','ç'=>'c']);},$head);
 $result=[];while(($cells=fgetcsv($f,0,$delimiter,'"',''))!==false){if(!array_filter($cells,fn($v)=>trim($v)!==''))continue;$result[]=array_combine($head,array_slice(array_pad($cells,count($head),''),0,count($head)));if(count($result)>1000)break;}fclose($f);return $result;
}
function validPlan(array $x):array{$name=clean($x['name']??'',80);$days=$x['days']??null;$price=money($x['price']??0);$color=$x['color']??'';$color=is_string($color)&&preg_match('/^#[a-f\d]{6}$/i',$color)?$color:'#786CFF';if(!$name||!filter_var((string)$days,FILTER_VALIDATE_INT)||$days<1||$days>730)throw new InvalidArgumentException('Dados do plano inválidos');return [$name,(int)$days,$price,$color];}
function api():never{
 $method=$_SERVER['REQUEST_METHOD']??'GET';$route=explode('?',$_SERVER['REQUEST_URI']??'',2)[0];$segments=explode('/',trim($route,'/'));
 if($route==='/api/health'&&$method==='GET')jsonout(['ok'=>true,'service'=>'clystria-php','date'=>today()]);
 if($route==='/api/ready'&&$method==='GET'){
  if(envv('APP_ENV')!=='production'||envv('DATABASE_URL')===''||!(preg_match('/^[a-f0-9]{64}$/i',envv('APP_KEY'))||(strlen(base64_decode(envv('APP_KEY'),true)?:'')===32)))fail(503,'Armazenamento persistente e segredos de produção não configurados');
  $db=getDb();$db->query('SELECT 1')->fetch();
  if(!one('SELECT 1 FROM staff LIMIT 1')&&strlen(envv('SETUP_TOKEN'))<20)fail(503,'Configure a chave inicial SETUP_TOKEN antes de criar o administrador');
  jsonout(['ok'=>true,'service'=>'clystria-php','storage'=>'postgres']);
 }

 if($route==='/api/bootstrap'&&$method==='GET')jsonout(['initialized'=>(bool)one('SELECT 1 FROM staff LIMIT 1'),'brand'=>'Clystria']);
 if($route==='/api/setup'&&$method==='POST'){
  if(one('SELECT 1 FROM staff LIMIT 1'))fail(409,'Configuração inicial já realizada');
  $x=body();if(production()){$expected=envv('SETUP_TOKEN');$received=(string)($x['setup_token']??'');if(strlen($expected)<20||!hash_equals($expected,$received))fail(403,'Informe a chave SETUP_TOKEN configurada no servidor');}
  $name=clean($x['name']??'',100);$email=strtolower(clean($x['email']??'',180));$pass=(string)($x['password']??'');
  if(!$name||!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($pass)<10)fail(400,'Informe nome, e-mail válido e senha de 10 caracteres ou mais');
  $pdo=getDb();$pdo->beginTransaction();try{$id=id();run('INSERT INTO staff(id,name,email,passhash,role) VALUES(?,?,?,?,?)',[$id,$name,$email,password_hash($pass,PASSWORD_DEFAULT),'admin']);if(envv('APP_ENV')!=='production'){run('INSERT INTO plans(id,name,days,price_cents,color) VALUES(?,?,?,?,?)',[id(),'Mensal',30,3000,'#776BFC']);run('INSERT INTO plans(id,name,days,price_cents,color) VALUES(?,?,?,?,?)',[id(),'Trimestral',90,8000,'#31DAB3']);}setConfig('business_name',$name);activity($email,'setup','Conta de administrador criada');$pdo->commit();}catch(Throwable $e){$pdo->rollBack();throw $e;}
  $csrf=sessionNew(['id'=>$id]);jsonout(['ok'=>true,'csrf'=>$csrf],201);
 }
 if($route==='/api/login'&&$method==='POST'){
  $x=body();$email=strtolower(clean($x['email']??'',180));$ip=$_SERVER['REMOTE_ADDR']??'';
  // Persistent rate limits across PHP requests/instances.
  $key='loginfail:'.hash('sha256',$ip);$raw=config($key,'');$attempts=$raw?json_decode($raw,true):[];$now=time();$attempts=array_values(array_filter(is_array($attempts)?$attempts:[],fn($t)=>is_numeric($t)&&$now-(int)$t<900));
  if(count($attempts)>=8)fail(429,'Muitas tentativas; aguarde 15 minutos');
  $u=one('SELECT * FROM staff WHERE email=?',[$email]);if(!$u||!password_verify((string)($x['password']??''),$u['passhash'])){$attempts[]=$now;setConfig($key,json_encode($attempts));fail(401,'E-mail ou senha incorretos');}
  if(!verifyGrowth2fa($u,$x['otp']??null))fail(401,'Código de autenticação de dois fatores inválido ou ausente');
  setConfig($key,'');run('DELETE FROM sessions WHERE expires_at<?',[time()*1000]);$csrf=sessionNew($u);activity($email,'login','Entrada no sistema');jsonout(['ok'=>true,'csrf'=>$csrf]);
 }
 $s=currentSession();if(!$s)fail(401,'Faça login novamente');
 if(!in_array($method,['GET','HEAD'],true)&&!hash_equals($s['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))fail(403,'Verificação de segurança inválida');
 $actor=$s['email'];$role=$s['role'];$x=null;
 if($route==='/api/me'&&$method==='GET')jsonout(['name'=>$s['name'],'email'=>$s['email'],'role'=>$role,'csrf'=>$s['csrf']]);
 if($route==='/api/logout'&&$method==='POST'){run('DELETE FROM sessions WHERE token_hash=?',[hash('sha256',$_COOKIE['cly_session']??'')]);cookie('',-3600);jsonout(['ok'=>true]);}
 if($route==='/api/dashboard'&&$method==='GET')jsonout(dashboardData());
 if($route==='/api/clients'&&$method==='GET')jsonout(['clients'=>array_map('toPublic',all('SELECT c.*,p.name plan_name,pa.name panel_name FROM clients c LEFT JOIN plans p ON c.plan_id=p.id LEFT JOIN panels pa ON c.panel_id=pa.id WHERE c.archived_at IS NULL ORDER BY c.due_date ASC'))]);
 if($route==='/api/clients'&&$method==='POST'){
  $d=clientInput(body());$id=id();$cols=array_keys($d);
  run('INSERT INTO clients(id,'.implode(',',$cols).') VALUES('.implode(',',array_fill(0,count($cols)+1,'?')).')',array_merge([$id],array_values($d)));activity($actor,'cliente.criar',$d['name']);jsonout(['id'=>$id],201);
 }
 if(preg_match('~^/api/clients/([a-f0-9]{32})$~',$route,$m)){
  $id=$m[1];$c=one('SELECT * FROM clients WHERE id=? AND archived_at IS NULL',[$id]);if(!$c)fail(404,'Cliente não encontrado');
  if($method==='GET')jsonout(toPublic($c));
  if($method==='PUT'){$d=clientInput(body(),$c);$cols=array_keys($d);run('UPDATE clients SET '.implode(',',array_map(fn($col)=>"$col=?",$cols)).',updated_at=CURRENT_TIMESTAMP WHERE id=?',array_merge(array_values($d),[$id]));activity($actor,'cliente.editar',$d['name']);jsonout(['ok'=>true]);}
  if($method==='DELETE'){if(!canManage($role))fail(403,'Acesso restrito');run('UPDATE clients SET archived_at=CURRENT_TIMESTAMP WHERE id=?',[$id]);activity($actor,'cliente.arquivar',$c['name']);jsonout(['ok'=>true]);}
 }
 if(preg_match('~^/api/clients/([a-f0-9]{32})/secret$~',$route,$m)&&$method==='GET'){
  $c=one('SELECT password_enc FROM clients WHERE id=? AND archived_at IS NULL',[$m[1]]);if(!$c)fail(404,'Cliente não encontrado');activity($actor,'cliente.ver_senha',$m[1]);jsonout(['password'=>unseal($c['password_enc'])]);
 }
 if(preg_match('~^/api/clients/([a-f0-9]{32})/renew$~',$route,$m)&&$method==='POST'){
  $c=one('SELECT * FROM clients WHERE id=? AND archived_at IS NULL',[$m[1]]);if(!$c)fail(404,'Cliente não encontrado');$x=body();$plan=$c['plan_id']?one('SELECT * FROM plans WHERE id=?',[$c['plan_id']]):null;$days=(int)($x['days']??$plan['days']??30);if($days<1||$days>730)fail(400,'Período inválido');
  $start=max($c['due_date'],today());$new=(new DateTimeImmutable($start))->modify("+$days days")->format('Y-m-d');$amount=money($x['amount']??$c['price_cents']/100);
  $db=getDb();$db->beginTransaction();try{run("UPDATE clients SET due_date=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?",[$new,$m[1]]);if(($x['record_payment']??true)!==false)run('INSERT INTO payments(id,client_id,amount_cents,method,description,paid_at) VALUES(?,?,?,?,?,?)',[id(),$m[1],$amount,clean($x['method']??'pix',30),'Renovação de '.$days.' dias',today()]);$db->commit();}catch(Throwable $e){$db->rollBack();throw $e;}activity($actor,'cliente.renovar',$c['name'].' até '.$new);jsonout(['ok'=>true,'due_date'=>$new]);
 }
 if($route==='/api/plans'&&$method==='GET')jsonout(['plans'=>array_map(fn($r)=>array_merge($r,['price'=>$r['price_cents']/100]),all('SELECT * FROM plans ORDER BY days ASC'))]);
 if($route==='/api/plans'&&$method==='POST'){if(!canManage($role))fail(403,'Acesso restrito');[$name,$days,$price,$color]=validPlan(body());$id=id();run('INSERT INTO plans(id,name,days,price_cents,color) VALUES(?,?,?,?,?)',[$id,$name,$days,$price,$color]);activity($actor,'plano.criar',$name);jsonout(['id'=>$id],201);}
 if(preg_match('~^/api/plans/([a-f0-9]{32})$~',$route,$m)&&in_array($method,['PUT','DELETE'],true)){
  if(!canManage($role))fail(403,'Acesso restrito');if(!one('SELECT id FROM plans WHERE id=?',[$m[1]]))fail(404,'Plano não encontrado');
  if($method==='DELETE'){run('DELETE FROM plans WHERE id=?',[$m[1]]);activity($actor,'plano.excluir',$m[1]);jsonout(['ok'=>true]);}
  [$name,$days,$price,$color]=validPlan(body());run('UPDATE plans SET name=?,days=?,price_cents=?,color=? WHERE id=?',[$name,$days,$price,$color,$m[1]]);activity($actor,'plano.editar',$name);jsonout(['ok'=>true]);
 }
 if($route==='/api/panels'&&$method==='GET')jsonout(['panels'=>all("SELECT id,name,kind,url,api_url,auth_mode,login_user,login_path,clients_path,plans_path,login_field,password_field,auto_sync,last_attempt,last_sync,last_status,created_at,CASE WHEN token_enc<>'' THEN 1 ELSE 0 END has_token,CASE WHEN login_pass_enc<>'' THEN 1 ELSE 0 END has_credentials FROM panels ORDER BY name")]);
 if($route==='/api/panels'&&$method==='POST'){
  if(!canManage($role))fail(403,'Acesso restrito');$d=panelInput(body());$id=id();run('INSERT INTO panels(id,name,kind,url,api_url,token_enc,auth_mode,login_user,login_pass_enc,login_path,clients_path,plans_path,login_field,password_field,auto_sync,last_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$d['name'],$d['kind'],$d['url'],$d['api_url'],seal($d['token']),$d['auth_mode'],$d['login_user'],seal($d['login_pass']),$d['login_path'],$d['clients_path'],$d['plans_path'],$d['login_field'],$d['password_field'],$d['auto_sync'],'pending_validation']);activity($actor,'painel.adicionar',$d['name']);jsonout(['id'=>$id],201);
 }
 if(preg_match('~^/api/panels/([a-f0-9]{32})$~',$route,$m)&&in_array($method,['PUT','DELETE'],true)){
  if(!canManage($role))fail(403,'Acesso restrito');$old=one('SELECT * FROM panels WHERE id=?',[$m[1]]);if(!$old)fail(404,'Painel não encontrado');
  if($method==='DELETE'){run('DELETE FROM panels WHERE id=?',[$m[1]]);activity($actor,'painel.remover',$old['name']);jsonout(['ok'=>true]);}
  $d=panelInput(body(),$old);run('UPDATE panels SET name=?,kind=?,url=?,api_url=?,token_enc=?,auth_mode=?,login_user=?,login_pass_enc=?,login_path=?,clients_path=?,plans_path=?,login_field=?,password_field=?,auto_sync=?,last_status=? WHERE id=?',[$d['name'],$d['kind'],$d['url'],$d['api_url'],$d['token']?seal($d['token']):$old['token_enc'],$d['auth_mode'],$d['login_user'],$d['login_pass']?seal($d['login_pass']):$old['login_pass_enc'],$d['login_path'],$d['clients_path'],$d['plans_path'],$d['login_field'],$d['password_field'],$d['auto_sync'],'pending_validation',$m[1]]);activity($actor,'painel.editar',$d['name']);jsonout(['ok'=>true]);
 }
 if(preg_match('~^/api/panels/([a-f0-9]{32})/sync$~',$route,$m)&&$method==='POST'){
  if(!canManage($role))fail(403,'Acesso restrito');try{$data=syncPanel($m[1],$actor);}catch(Throwable $e){fail(502,'Falha de sincronização: '.$e->getMessage());}jsonout($data);
 }
 if($route==='/api/payments'&&$method==='GET')jsonout(['payments'=>array_map(fn($r)=>array_merge($r,['amount'=>$r['amount_cents']/100]),all('SELECT p.*,c.name client_name FROM payments p JOIN clients c ON c.id=p.client_id ORDER BY p.paid_at DESC,p.created_at DESC LIMIT 1000'))]);
 if($route==='/api/payments'&&$method==='POST'){
  $x=body();$cid=clean($x['client_id']??'',90);$c=one('SELECT name FROM clients WHERE id=? AND archived_at IS NULL',[$cid]);if(!$c)fail(400,'Cliente inválido');if(!date_valid($x['paid_at']??null))fail(400,'Data inválida');
  run('INSERT INTO payments(id,client_id,amount_cents,method,description,paid_at) VALUES(?,?,?,?,?,?)',[id(),$cid,money($x['amount']??null),clean($x['method']??'pix',30),clean($x['description']??'',200),$x['paid_at']]);activity($actor,'pagamento.registrar',$c['name']);jsonout(['ok'=>true],201);
 }
 if($route==='/api/reminders'&&$method==='GET'){$rows=reminderRows();foreach($rows as &$c)$c['message']=reminderMessage($c);unset($c);jsonout(['reminders'=>$rows,'history'=>all('SELECT r.*,c.name client_name FROM reminders r JOIN clients c ON r.client_id=c.id ORDER BY r.created_at DESC LIMIT 50')]);}
 if($route==='/api/reminders/mark'&&$method==='POST'){$x=body();$c=one('SELECT * FROM clients WHERE id=?',[$x['client_id']??'']);if(!$c)fail(404,'Cliente inexistente');run('INSERT INTO reminders(id,client_id,channel,due_date,sent_on,status) VALUES(?,?,?,?,?,?) ON CONFLICT(client_id,channel,due_date,sent_on) DO NOTHING',[id(),$c['id'],clean($x['channel']??'whatsapp',30),$c['due_date'],today(),'manual']);activity($actor,'lembrete.registrar',$c['name']);jsonout(['ok'=>true]);}
 if($route==='/api/activity'&&$method==='GET')jsonout(['activity'=>all('SELECT * FROM activities ORDER BY created_at DESC LIMIT 100')]);
 if($route==='/api/settings'&&$method==='GET')jsonout(['business_name'=>config('business_name'),'reminder_days'=>config('reminder_days'),'reminder_template'=>config('reminder_template'),'email_subject'=>config('email_subject'),'email_enabled'=>config('email_enabled'),'smtp_ready'=>(bool)(envv('SMTP_HOST')&&envv('SMTP_FROM'))]);
 if($route==='/api/settings'&&$method==='PUT'){
  if(!canManage($role))fail(403,'Acesso restrito');$x=body();if(!preg_match('/^-?\d+(,-?\d+)*$/',clean($x['reminder_days']??'',60)))fail(400,'Use dias separados por vírgula, como 7,3,1,0');
  foreach(['business_name','reminder_days','reminder_template','email_subject'] as $k)setConfig($k,clean($x[$k]??'',$k==='reminder_template'?1000:180));setConfig('email_enabled',empty($x['email_enabled'])?'false':'true');activity($actor,'configuracoes.atualizar','Ajustes gerais');jsonout(['ok'=>true]);
 }
 if($route==='/api/account/password'&&$method==='POST'){
  $x=body();$u=one('SELECT passhash FROM staff WHERE id=?',[$s['staff_id']]);if(!$u||!password_verify((string)($x['current_password']??''),$u['passhash']))fail(403,'Senha atual incorreta');$new=(string)($x['new_password']??'');if(strlen($new)<10||strlen($new)>200)fail(400,'A nova senha precisa ter 10 a 200 caracteres');run('UPDATE staff SET passhash=? WHERE id=?',[password_hash($new,PASSWORD_DEFAULT),$s['staff_id']]);run('DELETE FROM sessions WHERE staff_id=? AND token_hash<>?',[$s['staff_id'],hash('sha256',$_COOKIE['cly_session']??'')]);activity($actor,'conta.alterar_senha','Outras sessões encerradas');jsonout(['ok'=>true]);
 }
 if($route==='/api/staff'&&$method==='GET'){if(!canManage($role))fail(403,'Acesso restrito');jsonout(['staff'=>all('SELECT id,name,email,role,created_at FROM staff ORDER BY created_at')]);}
 if($route==='/api/staff'&&$method==='POST'){
  if($role!=='admin')fail(403,'Somente administrador');$x=body();$name=clean($x['name']??'',90);$email=strtolower(clean($x['email']??'',180));$pw=(string)($x['password']??'');$newRole=clean($x['role']??'',20);
  if(!$name||!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($pw)<10||!in_array($newRole,['manager','operator'],true))fail(400,'Dados inválidos');run('INSERT INTO staff(id,name,email,passhash,role) VALUES(?,?,?,?,?)',[id(),$name,$email,password_hash($pw,PASSWORD_DEFAULT),$newRole]);activity($actor,'equipe.criar',$email);jsonout(['ok'=>true],201);
 }
 if($route==='/api/export/clients'&&$method==='GET'){
  header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="clystria-clientes.csv"');header('Cache-Control: no-store');$out=fopen('php://output','w');echo "\xEF\xBB\xBF";
  fputcsv($out,['nome','telefone','email','login','status','vencimento','plano','valor','painel','dispositivo','observacoes'],',','"','');
  foreach(all('SELECT c.*,p.name plan_name,pa.name panel_name FROM clients c LEFT JOIN plans p ON p.id=c.plan_id LEFT JOIN panels pa ON pa.id=c.panel_id WHERE c.archived_at IS NULL ORDER BY c.name') as $c)fputcsv($out,array_map('csvCell',[$c['name'],$c['phone'],$c['email'],$c['username'],$c['status'],$c['due_date'],$c['plan_name']??'',number_format((int)$c['price_cents']/100,2,'.',''),$c['panel_name']??'',$c['device'],$c['notes']]),',','"','');exit;
 }
 if($route==='/api/import/clients'&&$method==='POST'){
  if(!canManage($role))fail(403,'Acesso restrito');$x=body();$rows=csvRows((string)($x['csv']??''));if(count($rows)>1000)fail(400,'Limite de 1.000 clientes por importação');$panelId=$x['panel_id']??'';if($panelId&&!one('SELECT id FROM panels WHERE id=?',[$panelId]))fail(400,'Painel não encontrado');$created=$ignored=0;$db=getDb();$db->beginTransaction();try{
   foreach($rows as $r){$username=clean($r['login']??$r['username']??$r['usuario']??'',100);$name=clean($r['nome']??$r['name']??$r['cliente']??$username,100);$due=parseDue($r['vencimento']??$r['due_date']??$r['expiration']??'');
    if(!$name||!$due||($username&&one("SELECT 1 FROM clients WHERE username=? AND COALESCE(panel_id,'')=? AND archived_at IS NULL",[$username,$panelId]))){$ignored++;continue;}
    $price=(string)($r['valor']??$r['price']??'0');$price=str_replace(',','.',preg_replace('/[R$\s]/','',$price));if(!is_numeric($price)||$price<0)$price='0';$status=in_array($r['status']??'',['active','trial','paused','canceled'],true)?$r['status']:'active';
    run('INSERT INTO clients(id,name,phone,email,username,password_enc,status,due_date,panel_id,price_cents,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id(),$name,clean($r['telefone']??$r['phone']??'',40),clean($r['email']??'',180),$username,seal(clean($r['senha']??$r['password']??'',180)),$status,$due,$panelId?:null,money($price),clean($r['observacoes']??$r['notes']??'',3000)]);$created++;
   }$db->commit();}catch(Throwable $e){$db->rollBack();throw $e;}activity($actor,'cliente.importar',"$created clientes importados");jsonout(['created'=>$created,'ignored'=>$ignored,'total'=>count($rows)]);
 }
 growthApi($route,$method,$role,$actor,$s);
 fail(404,'Recurso não encontrado');
}
try{api();}catch(PDOException $e){error_log('Clystria DB error: '.$e->getMessage());fail(($e->getCode()==='23505'||str_contains($e->getMessage(),'UNIQUE constraint'))?409:503,($e->getCode()==='23505'||str_contains($e->getMessage(),'UNIQUE constraint'))?'Registro duplicado':'Falha ao acessar o banco de dados');}catch(InvalidArgumentException $e){fail(400,$e->getMessage());}catch(Throwable $e){error_log('Clystria PHP error: '.$e->getMessage());fail(500,production()?'Falha interna do servidor':$e->getMessage());}
