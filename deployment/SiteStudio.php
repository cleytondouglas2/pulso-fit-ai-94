<?php
declare(strict_types=1);
namespace ArgusPayments;

/**
 * Site Studio (public marketing content only).
 * Super Admin can safely edit copy, navigation presentation, brand/theme,
 * public contacts and SEO without changing payments, payout settings, fees,
 * provider keys, financial forms, checkout, legal contract, or private accounts.
 * Public endpoint discloses only published, prevalidated presentation settings.
 */
final class SiteStudio {
    private const MAX_JSON=125000;
    private const MANIFEST='/var/www/html/public/static/site-studio-manifest.json';
    private const BUILTIN=[
      'brand.name'=>['Identidade','Nome comercial','text','ARGUS Pay',80],
      'brand.logo'=>['Identidade','Endereço da logomarca','asset','/static/assets/argus-payments-logo-transparent.webp',800],
      'brand.favicon'=>['Identidade','Ícone do site','asset','/static/assets/argus-icon-192.png',800],
      'theme.gold'=>['Identidade','Cor de destaque','color','#e8c38d',7],
      'theme.gold2'=>['Identidade','Cor de destaque secundária','color','#c99a5d',7],
      'theme.bg'=>['Identidade','Cor de fundo','color','#080c12',7],
      'theme.muted'=>['Identidade','Texto secundário','color','#a2adbd',7],
      'seo.title'=>['SEO','Título no Google','text','ARGUS Pay | Pix, gestão de faturamento e API para negócios',130],
      'seo.description'=>['SEO','Descrição dos resultados','textarea','ARGUS Pay: gestão de cobranças Pix, carteiras individuais, conciliação e API para integrar sites, lojas e bots. Conheça a infraestrutura e crie sua conta.',500],
      'seo.og_title'=>['SEO','Título de compartilhamento','text','ARGUS Pay — Pagamentos no ritmo do seu negócio',130],
      'seo.og_description'=>['SEO','Descrição de compartilhamento','textarea','Cobranças Pix, gestão de faturamento, carteiras individuais e integração por API em um único painel.',500],
      'seo.og_image'=>['SEO','Imagem para compartilhamento','asset','/static/assets/argus-payments-logo-transparent.webp',800],
      'announcement.enabled'=>['Avisos','Mostrar barra de aviso','toggle',false,1],
      'announcement.text'=>['Avisos','Mensagem da barra','textarea','Novidades da ARGUS Pay',360],
      'announcement.url'=>['Avisos','Link da barra de aviso','url','/cadastro',800],
      'contact.email'=>['Contatos','E-mail de atendimento','email','',254],
      'contact.whatsapp'=>['Contatos','WhatsApp (apenas números com DDI)','phone','',20],
      'contact.instagram'=>['Contatos','Instagram (link HTTPS)','url','',800],
      'contact.telegram'=>['Contatos','Telegram (link HTTPS)','url','',800],
      'contact.support_url'=>['Contatos','Página central de suporte','url','',800],
      'social.display'=>['Contatos','Exibir os contatos no rodapé','toggle',true,1],
      'cta.signup_text'=>['Botões','Texto do botão de cadastro','text','Criar conta',100],
      'cta.signup_url'=>['Botões','Endereço do botão de cadastro','url','/cadastro',800],
      'cta.login_text'=>['Botões','Texto do botão de entrar','text','Entrar',100],
      'cta.login_url'=>['Botões','Endereço do botão de entrar','url','/conta',800],
      'hero.background_image'=>['Imagens','Imagem de fundo na apresentação','asset','',800],
      'hero.background_opacity'=>['Imagens','Intensidade da imagem (0–100)','number',25,3],
      'sections.platform'=>['Seções','Exibir funcionalidades','toggle',true,1],
      'sections.management'=>['Seções','Exibir gestão e faturamento','toggle',true,1],
      'sections.steps'=>['Seções','Exibir etapas','toggle',true,1],
      'sections.security'=>['Seções','Exibir segurança','toggle',true,1],
      'sections.integrations'=>['Seções','Exibir integrações','toggle',true,1],
      'sections.faq'=>['Seções','Exibir perguntas frequentes','toggle',true,1],
      'sections.ranking'=>['Seções','Exibir ranking público (somente participantes autorizados)','toggle',true,1],
      'footer.legal_name'=>['Rodapé','Nome empresarial exibido','text','ARGUS Payments',130],
      'footer.tagline'=>['Rodapé','Mensagem complementar','textarea','Feito para quem leva cada operação a sério.',250]
    ];
    private static function error(string $text,int $code=422):never {throw new ApiError($text,$code);}
    private static function emit(array $data):never {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: private, no-store, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        exit;
    }
    public static function install(Database $db):void {
        $db->pdo()->exec('CREATE TABLE IF NOT EXISTS argus_site_studio (
            id INTEGER PRIMARY KEY,
            published_json TEXT NOT NULL,
            draft_json TEXT NOT NULL,
            active_version INTEGER NOT NULL DEFAULT 0,
            draft_revision INTEGER NOT NULL DEFAULT 0,
            updated_at VARCHAR(40) NOT NULL,
            updated_by VARCHAR(100) NOT NULL
        )');
        $db->pdo()->exec('CREATE TABLE IF NOT EXISTS argus_site_studio_history (
            version INTEGER PRIMARY KEY,
            config_json TEXT NOT NULL,
            published_at VARCHAR(40) NOT NULL,
            published_by VARCHAR(100) NOT NULL
        )');
    }
    private static function manifest():array {
        static $manifest=null;
        if($manifest!==null)return $manifest;
        $raw=@file_get_contents(self::MANIFEST);
        $data=is_string($raw)?json_decode($raw,true):null;
        if(!is_array($data)||!isset($data['fields'])||!is_array($data['fields']))
            self::error('Catálogo do editor indisponível.',503);
        $manifest=$data;
        return $manifest;
    }
    private static function schema():array {
        $out=[];
        foreach(self::BUILTIN as $key=>$v){
            [$group,$label,$type,$default,$max]=$v;
            $out[$key]=compact('key','group','label','type','default','max');
        }
        foreach(self::manifest()['fields'] as $entry){
            if(!is_array($entry)||empty($entry['key'])||!preg_match('/^copy_[0-9]{3}$/D',$entry['key']))
                self::error('Catálogo do editor com campo inválido.',503);
            $key=$entry['key'];
            if(isset($out[$key]))self::error('Campo de editor duplicado.',503);
            $def=(string)($entry['default']??'');
            $out[$key]=['key'=>$key,
                'group'=>'Conteúdo · '.(string)($entry['group']??'Página'),
                'label'=>(string)($entry['label']??$key),
                'type'=>'textarea','default'=>$def,
                'max'=>1200,
                'target'=>$entry['target']??null];
        }
        return $out;
    }
    private static function defaults(array $schema):array {
        $v=[];foreach($schema as $k=>$spec)$v[$k]=$spec['default'];
        return $v;
    }
    private static function decode($raw):array {
        $a=is_string($raw)?json_decode($raw,true):null;
        return is_array($a)?$a:[];
    }
    private static function row(Database $db):array {
        self::install($db);
        return $db->one('SELECT published_json,draft_json,active_version,draft_revision,updated_at,updated_by FROM argus_site_studio WHERE id=1')?:[];
    }
    private static function normalized(array $values,array $schema,bool $requireAll=true):array {
        if(count($values)>count($schema))self::error('Dados de configuração desconhecidos.');
        $result=[];
        foreach($schema as $key=>$spec){
            if(!array_key_exists($key,$values)){
                if($requireAll)self::error('Falta o campo de configuração '.$key.'.');
                $v=$spec['default'];
            }else $v=$values[$key];
            if($spec['type']==='toggle'){
                if(!is_bool($v))self::error('O campo '.$key.' deve ser verdadeiro ou falso.');
            }elseif($spec['type']==='number'){
                if(!is_int($v)&&!is_float($v)&&!(is_string($v)&&ctype_digit($v)))
                    self::error('Número inválido no campo '.$key.'.');
                $v=(int)$v;
                if($v<0||$v>100)self::error('O campo '.$key.' aceita valores de 0 a 100.');
            }else{
                if(!is_string($v)||strlen($v)>(int)$spec['max']*4+8)
                    self::error('Texto muito longo em '.$key.'.');
                $v=trim(str_replace("\r\n","\n",$v));
                if(mb_strlen($v,'UTF-8')>(int)$spec['max'])
                    self::error('Limite de caracteres ultrapassado em '.$key.'.');
                if(str_contains($v,"\0")||preg_match('/[\x01-\x08\x0B\x0C\x0E-\x1F]/',$v))
                    self::error('Caracteres inválidos em '.$key.'.');
                if($spec['type']==='email'&&$v!==''&&!filter_var($v,FILTER_VALIDATE_EMAIL))
                    self::error('E-mail de contato inválido.');
                if($spec['type']==='phone'&&$v!==''&&!preg_match('/^[1-9][0-9]{9,14}$/D',$v))
                    self::error('WhatsApp inválido: informe DDI e número, sem sinais.');
                if($spec['type']==='color'&&!preg_match('/^#[a-fA-F0-9]{6}$/D',$v))
                    self::error('Informe cor hexadecimal de 6 dígitos.');
                if(in_array($spec['type'],['asset','url'],true)){
                    if($v!==''&&!self::safeUrl($v))self::error('Link ou imagem inválidos em '.$key.'. Use HTTPS ou caminho seguro do site.');
                }
            }
            $result[$key]=$v;
        }
        return $result;
    }
    private static function safeUrl(string $v):bool {
        if(preg_match('~^/(?!/)[a-zA-Z0-9/_\-.?#=&%]+$~D',$v))return true;
        if(!preg_match('~^https://[a-z0-9.-]+(?::443)?(?:/[^\s]*)?$~iD',$v))return false;
        $u=parse_url($v);
        if(!is_array($u)||!isset($u['host'])||isset($u['user'])||isset($u['pass']))return false;
        $host=strtolower($u['host']);
        if(str_contains($host,'..')||str_starts_with($host,'-')||
           filter_var($host,FILTER_VALIDATE_IP)||in_array($host,['localhost','metadata.google.internal'],true)||
           str_ends_with($host,'.internal')||str_ends_with($host,'.local'))
            return false;
        return true;
    }
    private static function current(array $row,array $schema,string $kind):array {
        return self::normalized(array_merge(self::defaults($schema),self::decode($row[$kind.'_json']??null)),$schema);
    }
    private static function save(Database $db,array $published,array $draft,int $version,int $draftVersion,string $actor):void {
        $pj=json_encode($published,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $dj=json_encode($draft,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $db->run('DELETE FROM argus_site_studio WHERE id=1');
        $db->run('INSERT INTO argus_site_studio(id,published_json,draft_json,active_version,draft_revision,updated_at,updated_by)
          VALUES(1,?,?,?,?,?,?)',[$pj,$dj,$version,$draftVersion,Database::stamp(),$actor]);
    }
    public static function publicConfig(Database $db):array {
        $schema=self::schema();$row=self::row($db);
        return ['published_version'=>(int)($row['active_version']??0),
            'settings'=>self::current($row,$schema,'published')];
    }
    public static function respondPublic(Database $db):never {self::emit(self::publicConfig($db));}
    private static function audit(Database $db,int $limit=12):array {
        return $db->all('SELECT version,published_at,published_by FROM argus_site_studio_history
          ORDER BY version DESC LIMIT '.max(1,min($limit,30)));
    }
    private static function status(Database $db):array {
        $schema=self::schema();$r=self::row($db);
        $published=self::current($r,$schema,'published');
        $draft=self::current($r,$schema,'draft');
        return ['ok'=>true,'published'=>$published,'draft'=>$draft,
            'version'=>(int)($r['active_version']??0),
            'draft_revision'=>(int)($r['draft_revision']??0),
            'updated_at'=>$r['updated_at']??null,
            'schema'=>array_values($schema),'history'=>self::audit($db),
            'site_url'=>'/','editor_version'=>'site-studio-v1'];
    }
    public static function handle(Database $db,string $method,string $path,array $actor,array $body=[]):never {
        if(($actor['role']??'')!=='superadmin')self::error('Apenas o Super Admin pode editar o site.',403);
        if($method==='GET'&&$path==='/api/admin/site-studio/status')
            self::emit(self::status($db));
        if($method==='GET'&&$path==='/api/admin/site-studio/history')
            self::emit(['history'=>self::audit($db,30)]);
        if($method!=='POST')self::error('Operação indisponível.',405);
        $schema=self::schema();$r=self::row($db);
        $published=self::current($r,$schema,'published');
        $draft=self::current($r,$schema,'draft');
        $version=(int)($r['active_version']??0);
        $draftVersion=(int)($r['draft_revision']??0);
        $actorId=substr((string)($actor['email']??$actor['id']??'Super Admin'),0,100);
        if(isset($body['expected_draft_revision'])&&(int)$body['expected_draft_revision']!==$draftVersion)
            self::error('O rascunho foi atualizado em outra sessão. Recarregue os dados antes de salvar.',409);
        if($path==='/api/admin/site-studio/draft'){
            $incoming=$body['settings']??null;
            if(!is_array($incoming))self::error('Informe os campos de configuração.');
            if(strlen(json_encode($incoming))>self::MAX_JSON)self::error('Rascunho muito grande.');
            $next=self::normalized($incoming,$schema);
            $db->transaction(static function(Database $db)use($published,$next,$version,$draftVersion,$actorId):void{
                self::save($db,$published,$next,$version,$draftVersion+1,$actorId);
            });
            self::emit(['ok'=>true,'draft_revision'=>$draftVersion+1,'message'=>'Rascunho salvo. As páginas públicas ainda não foram alteradas.']);
        }
        if($path==='/api/admin/site-studio/publish'){
            // Only publish a saved and reviewed draft; never publish raw browser changes.
            if(empty($r))self::error('Salve o rascunho antes de publicar.',409);
            $nextVersion=$version+1;
            $db->transaction(static function(Database $db)use($draft,$draftVersion,$nextVersion,$actorId):void {
                $db->run('INSERT INTO argus_site_studio_history(version,config_json,published_at,published_by)
                  VALUES(?,?,?,?)',[
                    $nextVersion,json_encode($draft,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
                    Database::stamp(),$actorId
                ]);
                self::save($db,$draft,$draft,$nextVersion,$draftVersion,$actorId);
            });
            self::emit(['ok'=>true,'version'=>$nextVersion,
                'message'=>'Versão '.$nextVersion.' publicada. O site público receberá as mudanças na próxima consulta.']);
        }
        if($path==='/api/admin/site-studio/restore'){
            $target=(int)($body['version']??0);
            if($target<1)self::error('Versão inválida.');
            $old=$db->one('SELECT config_json FROM argus_site_studio_history WHERE version=?',[$target]);
            if(!$old)self::error('Versão não encontrada.',404);
            $restore=self::normalized(self::decode($old['config_json']),$schema);
            $nextVersion=$version+1;
            $db->transaction(static function(Database $db)use($restore,$draftVersion,$nextVersion,$actorId):void {
                $db->run('INSERT INTO argus_site_studio_history(version,config_json,published_at,published_by)
                  VALUES(?,?,?,?)',[
                    $nextVersion,json_encode($restore,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
                    Database::stamp(),$actorId
                ]);
                self::save($db,$restore,$restore,$nextVersion,$draftVersion+1,$actorId);
            });
            self::emit(['ok'=>true,'version'=>$nextVersion,'draft_revision'=>$draftVersion+1,
                'message'=>'Versão anterior restaurada como publicação '.$nextVersion.'.']);
        }
        self::error('Rota do editor inexistente.',404);
    }
}
