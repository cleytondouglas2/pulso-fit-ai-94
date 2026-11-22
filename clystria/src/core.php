<?php
/** Clystria PHP 8.3+ — server-only bootstrap and shared helpers */
declare(strict_types=1);
date_default_timezone_set('America/Sao_Paulo');
ini_set('display_errors','0');
error_reporting(E_ALL);

function envv(string $name, string $fallback=''): string { $v=getenv($name); return $v===false?$fallback:$v; }
function production(): bool { return envv('APP_ENV','development')==='production'; }
function today(): string {return date('Y-m-d');}
function id(): string {return bin2hex(random_bytes(16));}
function clean(mixed $v,int $max=200):string {return mbcut(trim((string)($v??'')),$max);}
function mbcut(string $s,int $max):string {return function_exists('mb_substr')?mb_substr($s,0,$max):substr($s,0,$max);}
function due_diff(string $s):int {return (int)((strtotime($s.' 12:00 UTC')-strtotime(today().' 12:00 UTC'))/86400);}
function date_valid(mixed $d):bool {return is_string($d)&&preg_match('/^\d{4}-\d{2}-\d{2}$/',$d)===1&&DateTimeImmutable::createFromFormat('!Y-m-d',$d)?->format('Y-m-d')===$d;}
function money(mixed $v):int {if(!is_numeric($v) || (float)$v<0 || (float)$v>10000000)throw new InvalidArgumentException('Valor inválido'); return (int)round((float)$v*100);}
function fail(int $code,string $text):never{http_response_code($code);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');echo json_encode(['error'=>$text],JSON_UNESCAPED_UNICODE);exit;}
function jsonout(mixed $x,int $code=200):never {http_response_code($code);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');echo json_encode($x,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);exit;}
function body(): array {if((int)($_SERVER['CONTENT_LENGTH']??0)>2097152)throw new InvalidArgumentException('Arquivo maior que 2 MB'); $raw=file_get_contents('php://input');if(strlen($raw)>2097152)throw new InvalidArgumentException('Arquivo maior que 2 MB');if(trim($raw)==='')return [];try{$d=json_decode($raw,true,512,JSON_THROW_ON_ERROR);return is_array($d)?$d:[];}catch(Throwable){throw new InvalidArgumentException('JSON inválido');}}
function getDb():PDO {
 static $pdo=null;
 if($pdo instanceof PDO)return $pdo;
 $url=envv('DATABASE_URL');
 if($url!==''){
  $v=parse_url($url);if(!$v||!in_array($v['scheme']??'',['postgres','postgresql'],true))throw new RuntimeException('DATABASE_URL inválida');
  $dbname=ltrim($v['path']??'/postgres','/');$port=(int)($v['port']??5432);$host=$v['host']??'';
  $dsn="pgsql:host=$host;port=$port;dbname=$dbname;connect_timeout=8";
  if(str_contains($host,'supabase.')||envv('PGSSLMODE')==='require')$dsn.=';sslmode=require';
  $pdo=new PDO($dsn,urldecode($v['user']??''),urldecode($v['pass']??''),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
  $pdo->exec('CREATE SCHEMA IF NOT EXISTS clystria');$pdo->exec('SET search_path TO clystria');
 } else {
  if(production())throw new RuntimeException('Configure DATABASE_URL para armazenar clientes de forma persistente em produção');
  $folder=dirname(__DIR__).'/data';if(!is_dir($folder))mkdir($folder,0700,true);
  $pdo=new PDO('sqlite:'.$folder.'/clystria.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
  $pdo->exec('PRAGMA journal_mode=WAL');$pdo->exec('PRAGMA foreign_keys=ON');$pdo->exec('PRAGMA busy_timeout=5000');
 }
 initialize($pdo);
 return $pdo;
}
function initialize(PDO $pdo):void {
 $statements=[
 "CREATE TABLE IF NOT EXISTS staff(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,passhash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'operator',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,staff_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at BIGINT NOT NULL,FOREIGN KEY(staff_id) REFERENCES staff(id))",
 "CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,name TEXT NOT NULL,days INTEGER NOT NULL DEFAULT 30,price_cents BIGINT NOT NULL DEFAULT 0,color TEXT DEFAULT '#786CFF',created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS panels(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'custom',url TEXT NOT NULL,api_url TEXT NOT NULL DEFAULT '',token_enc TEXT NOT NULL DEFAULT '',last_sync TEXT NOT NULL DEFAULT '',last_status TEXT NOT NULL DEFAULT 'not_configured',created_at TEXT DEFAULT CURRENT_TIMESTAMP,auth_mode TEXT NOT NULL DEFAULT 'credentials',login_user TEXT NOT NULL DEFAULT '',login_pass_enc TEXT NOT NULL DEFAULT '',login_path TEXT NOT NULL DEFAULT '/api/login',clients_path TEXT NOT NULL DEFAULT '/api/clients',plans_path TEXT NOT NULL DEFAULT '/api/plans',login_field TEXT NOT NULL DEFAULT 'username',password_field TEXT NOT NULL DEFAULT 'password',auto_sync INTEGER NOT NULL DEFAULT 0,last_attempt TEXT NOT NULL DEFAULT '')",
 "CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',username TEXT NOT NULL DEFAULT '',password_enc TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',due_date TEXT NOT NULL,plan_id TEXT,price_cents BIGINT NOT NULL DEFAULT 0,panel_id TEXT,device TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,archived_at TEXT DEFAULT NULL,FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE SET NULL,FOREIGN KEY(panel_id) REFERENCES panels(id) ON DELETE SET NULL)",
 'CREATE INDEX IF NOT EXISTS idx_clients_due ON clients(due_date,status,archived_at)',
 "CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,amount_cents BIGINT NOT NULL,method TEXT NOT NULL DEFAULT 'pix',description TEXT DEFAULT '',paid_at TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE)",
 "CREATE TABLE IF NOT EXISTS reminders(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,channel TEXT NOT NULL,due_date TEXT NOT NULL,sent_on TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(client_id,channel,due_date,sent_on),FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE)",
 "CREATE TABLE IF NOT EXISTS activities(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
 'CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)'];
 foreach($statements as $sql)$pdo->exec($sql);
 foreach(['business_name'=>'Minha operação','reminder_days'=>'7,3,1,0,-1,-3,-7','reminder_template'=>'Olá, {nome}! Sua assinatura vence em {vencimento}. Para renovar, fale com a nossa equipe. 💜','email_subject'=>'Lembrete de vencimento da assinatura','email_enabled'=>'false'] as $k=>$v){$stmt=$pdo->prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING');$stmt->execute([$k,$v]);}
}
function all(string $sql,array $params=[]):array {$s=getDb()->prepare($sql);$s->execute($params);return $s->fetchAll();}
function one(string $sql,array $params=[]):?array{$s=getDb()->prepare($sql);$s->execute($params);$r=$s->fetch();return $r?:null;}
function run(string $sql,array $params=[]):int {$s=getDb()->prepare($sql);$s->execute($params);return $s->rowCount();}
function config(string $k,string $fallback=''):string {return one('SELECT value FROM settings WHERE key=?',[$k])['value']??$fallback;}
function setConfig(string $k,string $v):void {run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[$k,$v]);}
function activity(string $actor,string $action,string $detail=''):void{run('INSERT INTO activities(id,actor,action,detail) VALUES(?,?,?,?)',[id(),$actor,$action,clean($detail,250)]);}
function appKey():string {
 static $key=null;if($key!==null)return $key;
 $v=envv('APP_KEY');if($v!==''){if(!preg_match('/^[a-f0-9]{64}$/i',$v))throw new RuntimeException('APP_KEY exige 64 caracteres hexadecimais');return $key=hex2bin($v);}
 if(production())throw new RuntimeException('APP_KEY obrigatório em produção');
 $f=dirname(__DIR__).'/data/encryption.key';if(!is_file($f)){if(!is_dir(dirname($f)))mkdir(dirname($f),0700,true);file_put_contents($f,random_bytes(32),LOCK_EX);chmod($f,0600);}return $key=file_get_contents($f);
}
function seal(mixed $v):string{if((string)$v==='')return ''; $iv=random_bytes(12);$tag='';$enc=openssl_encrypt((string)$v,'aes-256-gcm',appKey(),OPENSSL_RAW_DATA,$iv,$tag);if($enc===false)throw new RuntimeException('Falha de criptografia');return base64_encode($iv.$tag.$enc);}
function unseal(?string $v):string{if(!$v)return ''; $raw=base64_decode($v,true);if($raw===false||strlen($raw)<29)return '';return openssl_decrypt(substr($raw,28),'aes-256-gcm',appKey(),OPENSSL_RAW_DATA,substr($raw,0,12),substr($raw,12,16))?:'';}
function cookie(string $value,int $age):void{setcookie('cly_session',$value,['expires'=>time()+$age,'path'=>'/','secure'=>production(),'httponly'=>true,'samesite'=>'Lax']);}
function sessionNew(array $u):string {$token=bin2hex(random_bytes(32));$csrf=bin2hex(random_bytes(24));run('INSERT INTO sessions(token_hash,staff_id,csrf,expires_at) VALUES(?,?,?,?)',[hash('sha256',$token),$u['id'],$csrf,(time()+604800)*1000]);cookie($token,604800);return $csrf;}
function currentSession():?array {$token=$_COOKIE['cly_session']??'';if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/',$token))return null;return one('SELECT s.staff_id,s.csrf,s.expires_at,u.name,u.email,u.role FROM sessions s JOIN staff u ON s.staff_id=u.id WHERE s.token_hash=? AND s.expires_at>?',[hash('sha256',$token),time()*1000]);}
function canManage(string $role):bool{return in_array($role,['admin','manager'],true);}
function publicly(array $c):array{unset($c['password_enc']);$c['price']=((int)$c['price_cents'])/100;$c['days_left']=due_diff($c['due_date']);$c['has_password']=!empty($c['has_password'])||!empty($c['password_enc']);return $c;}
function toPublic(array $c):array{$has=!empty($c['password_enc']);unset($c['password_enc']);$c['price']=((int)$c['price_cents'])/100;$c['days_left']=due_diff($c['due_date']);$c['has_password']=$has;return $c;}
function clientInput(array $x,?array $old=null):array{
 $name=clean($x['name']??'',100);$date=clean($x['due_date']??'',10);$status=clean($x['status']??'',20);
 if(!$name)throw new InvalidArgumentException('Nome obrigatório');if(!date_valid($date))throw new InvalidArgumentException('Vencimento inválido');
 if(!in_array($status,['active','trial','paused','canceled'],true))throw new InvalidArgumentException('Status inválido');
 $plan=clean($x['plan_id']??'',80)?:null;$panel=clean($x['panel_id']??'',80)?:null;
 if($plan&&!one('SELECT id FROM plans WHERE id=?',[$plan]))throw new InvalidArgumentException('Plano inexistente');
 if($panel&&!one('SELECT id FROM panels WHERE id=?',[$panel]))throw new InvalidArgumentException('Painel inexistente');
 return ['name'=>$name,'phone'=>clean($x['phone']??'',40),'email'=>clean($x['email']??'',180),'username'=>clean($x['username']??'',100),'password_enc'=>(array_key_exists('password',$x)&&$x['password']!==''?seal(clean($x['password'],180)):($old['password_enc']??'')),'status'=>$status,'due_date'=>$date,'plan_id'=>$plan,'price_cents'=>money($x['price']??0),'panel_id'=>$panel,'device'=>clean($x['device']??'',100),'notes'=>clean($x['notes']??'',3000),'tags'=>clean($x['tags']??'',250)];
}
function reminderRows():array{$days=array_map('intval',explode(',',config('reminder_days','7,3,1,0,-1,-3,-7')));$rows=all("SELECT c.*,p.name plan_name FROM clients c LEFT JOIN plans p ON c.plan_id=p.id WHERE c.archived_at IS NULL AND c.status IN ('active','trial')");$a=[];foreach($rows as $r){$d=due_diff($r['due_date']);if($d<0||in_array($d,$days,true)){$v=toPublic($r);$v['d']=$d;$a[]=$v;}}usort($a,fn($a,$b)=>$a['d']<=>$b['d']);return $a;}
function reminderMessage(array $c):string{return str_replace(['{nome}','{vencimento}','{plano}','{valor}'],[$c['name'],date('d/m/Y',strtotime($c['due_date'])),$c['plan_name']??'',number_format((int)$c['price_cents']/100,2,',','.')],config('reminder_template'));}
function dashboardData():array{
 $rows=all('SELECT * FROM clients WHERE archived_at IS NULL');$active=$overdue=$upcoming=$mrr=0;
 foreach($rows as $c){$d=due_diff($c['due_date']);if($c['status']==='active'){$mrr+=(int)$c['price_cents'];if($d>=0)$active++;else $overdue++;}if(in_array($c['status'],['active','trial'])&&$d>=0&&$d<=7)$upcoming++;}
 $payments=all('SELECT amount_cents,paid_at FROM payments');$buckets=[];for($i=5;$i>=0;$i--){$ym=date('Y-m',strtotime(date('Y-m-01')." -$i months"));$buckets[$ym]=0;}
 foreach($payments as $p){$ym=substr($p['paid_at'],0,7);if(isset($buckets[$ym]))$buckets[$ym]+=(int)$p['amount_cents'];}
 $recent=all('SELECT c.id,c.name,c.phone,c.status,c.due_date,c.price_cents,c.username,p.name plan_name FROM clients c LEFT JOIN plans p ON c.plan_id=p.id WHERE c.archived_at IS NULL ORDER BY c.created_at DESC LIMIT 7');
 return ['total'=>count($rows),'active'=>$active,'overdue'=>$overdue,'upcoming'=>$upcoming,'revenue_month'=>($buckets[date('Y-m')]??0)/100,'expected_mrr'=>$mrr/100,'chart'=>array_map(fn($ym,$val)=>['month'=>$ym,'value'=>$val/100],array_keys($buckets),array_values($buckets)),'recent'=>array_map('toPublic',$recent),'due'=>array_slice(reminderRows(),0,8)];
}
