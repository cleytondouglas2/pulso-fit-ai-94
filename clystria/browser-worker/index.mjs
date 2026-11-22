import http from 'node:http';
import dns from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';

const PORT=Number(process.env.PORT||10000);
const SECRET=process.env.BROWSER_WORKER_TOKEN||'';
const ALLOW=(process.env.ALLOWED_PANEL_HOSTS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
const TRUSTED_REDIRECT_DOMAINS=(process.env.ALLOWED_PANEL_REDIRECT_SUFFIXES||'').toLowerCase().split(',').map(s=>s.trim()).filter(s=>/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)&&s.split('.').length>=2);
const BROWSER_PATH=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
const CLOUDFLARE_WIDGET_HOST=process.env.CLOUDFLARE_WIDGET_HOST==='challenges.cloudflare.com'?'challenges.cloudflare.com':'';
const CLOUDFLARE_OFFICIAL_RESOURCE_HOSTS=new Set(['challenges.cloudflare.com','hagen.challenges.cloudflare.com','brunhild.challenges.cloudflare.com']);
let busy=false;
const json=(res,status,payload)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(payload));};
const failure=(code,msg)=>{const e=new Error(msg);e.status=code;throw e;};
const equals=(a,b)=>{const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const isBadIp=ip=>{
  if(net.isIP(ip)!==4)return true;
  const p=ip.split('.').map(Number);
  return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||
    (p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||
    (p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||
    (p[0]===198&&[18,19].includes(p[1]))||
    (p[0]===192&&p[1]===0)||(p[0]===192&&p[1]===0&&p[2]===2)||
    (p[0]===198&&p[1]===51&&p[2]===100)||
    (p[0]===203&&p[1]===0&&p[2]===113);
};
async function safeUrl(input,documentRequest=false,allowCloudflareSubframe=false){
  let u;
  try{u=new URL(String(input));}catch{failure(400,'URL inválida');}
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')failure(400,'Somente URLs HTTPS comuns são aceitas');
  const host=u.hostname.toLowerCase();
  if(net.isIP(host)||!host.includes('.')||host==='localhost'||host.endsWith('.local'))failure(400,'Host não autorizado');
  // Only verified Cloudflare challenge resource hosts are exempt from the Node DNS precheck.
  // Cloudflare documents these subdomains can fail DNS lookups intentionally; the browser
  // must perform its own HTTPS/TLS validation. Top-level navigation stays restricted.
  const isOfficialChallengeResource=!!CLOUDFLARE_WIDGET_HOST&&
    CLOUDFLARE_OFFICIAL_RESOURCE_HOSTS.has(host)&&(!documentRequest||allowCloudflareSubframe);
  if(documentRequest){
    const sameProvider=TRUSTED_REDIRECT_DOMAINS.some(domain=>host===domain||host.endsWith('.'+domain));
    if(!ALLOW.includes(host)&&!sameProvider&&!isOfficialChallengeResource)failure(403,'Host não está na lista de painéis permitidos');
  }
  if(isOfficialChallengeResource)return u;
  const addresses=await dns.resolve4(host).catch(()=>[]);
  if(!addresses.length||addresses.some(isBadIp))failure(403,'DNS do painel não permitido');
  return u;
}
function clean(v,n=160){return String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);}
async function isChallenge(page){
  const title=await page.title().catch(()=>'');
  const txt=await page.locator('body').innerText({timeout:2200}).catch(()=>'');
  return /just a moment|checking your browser|verify you are human|attention required|challenge-platform|cloudflare.*(challenge|verification)|verifique se você é humano/i.test((title+' '+txt.slice(0,1700)).toLowerCase());
}
async function browserState(page){
  const info=await page.evaluate(()=>{
    const body=document.body?.innerText||'';
    return {
      contentType:document.contentType||'',
      controls:document.querySelectorAll('a,button,input,[role="button"],[role="tab"],[role="navigation"]').length,
      passwordFields:document.querySelectorAll('input[type="password"]').length,
      bodyLength:body.length,
      jsonLike:/^\s*[\[{]/.test(body.slice(0,40)),
      hasClientsTab:/\b(clientes|assinantes|linhas)\b/i.test(body.slice(0,3000))
    };
  }).catch(()=>({contentType:'unknown',controls:0,passwordFields:0,bodyLength:0,jsonLike:false,hasClientsTab:false}));
  let path='unknown';
  try{const uri=new URL(page.url());path=uri.pathname.slice(0,100);}catch{}
  return {...info,path};
}
// A native form sometimes navigates to a JSON login response rather than rendering the SPA.
// Interpret only success/failure markers; never log or expose credentials, tokens or JSON bodies.
async function classifyEntry(page,response){
  const state=await browserState(page);
  const httpStatus=response?.status()||0;
  const txt=String(await page.locator('body').innerText({timeout:1200}).catch(()=>'' )).trim().slice(0,240);
  const info=/^\s*[\[{]/.test(txt)?'json_text':
    /acesso negado|access denied|forbidden|unauthorized|bloquead|not allowed/i.test(txt)?'access_denied':
    /manuten|maintenance|service unavailable|temporarily unavailable/i.test(txt)?'unavailable':
    /404|not found|page not found/i.test(txt)?'not_found':
    /500|server error|internal error/i.test(txt)?'server_error':
    /verify you are human|just a moment|cloudflare|checking your browser/i.test(txt)?'challenge':
    'unrecognized';
  return {httpStatus,kind:info,controls:state.controls,bodyLength:state.bodyLength,
    pageType:state.contentType.includes('json')?'json':state.contentType.includes('html')?'html':'other',
    passwordFields:state.passwordFields};
}

async function jsonLoginStatus(page){
 return await page.evaluate(()=>{
   const raw=String(document.body?.innerText||'').trim();
   const ctype=document.contentType||'';
   if(!(/json/i.test(ctype)||/^[\[{]/.test(raw))||raw.length>50000)return {json:false,accepted:false,rejected:false};
   try{
     const data=JSON.parse(raw);
     if(!data||typeof data!=='object'||Array.isArray(data))return {json:true,accepted:false,rejected:false};
     const status=String(data.status||'').toLowerCase();
     return {
       json:true,
       rejected:data.success===false||data.ok===false||['error','failed','invalid','unauthorized'].includes(status)||data.valid===false,
       accepted:data.success===true||data.ok===true||data.authenticated===true||['success','ok','authenticated'].includes(status)||!!data.access_token||!!data.token,
     };
   }catch{return {json:/json/i.test(ctype),accepted:false,rejected:false};}
 }).catch(()=>({json:false,accepted:false,rejected:false}));
}
async function maybeLogin(page,username,password,entryUrl){
  if(await isChallenge(page))failure(409,'O fornecedor exige verificação Cloudflare. A automação não contorna desafios.');
  let pw=page.locator('input[type="password"]').first();
  if(await pw.count()===0){
    const state=await browserState(page);
    if(state.controls===0)await page.waitForTimeout(4500);
    pw=page.locator('input[type="password"]').first();
    if(await pw.count()===0){
      // A public provider landing page may require one click to expose the login form.
      const loginTarget=page.getByRole('link',{name:/^(entrar|login|fazer login|acessar|iniciar sess[aã]o|sign in)$/i}).first();
      const loginButton=page.getByRole('button',{name:/^(entrar|login|fazer login|acessar|iniciar sess[aã]o|sign in)$/i}).first();
      for(const target of [loginTarget,loginButton]){
        if(!await target.count()||!await target.isVisible().catch(()=>false))continue;
        const href=await target.getAttribute('href').catch(()=>null);
        if(href){try{await safeUrl(new URL(href,page.url()).href,true);}catch{continue;}}
        try{
          await target.click({timeout:5500});
          await page.waitForLoadState('domcontentloaded',{timeout:8500}).catch(()=>{});
          await page.waitForTimeout(900);
        }catch{}
        break;
      }
      pw=page.locator('input[type="password"]').first();
      if(await pw.count()===0)return 'sem_formulario_login_visivel';
    }
  }
  if(!username||!password)failure(422,'Configure usuário e senha do painel no Clystria');
  let user=page.locator('input[autocomplete="username"],input[name*="user" i],input[name*="login" i],input[name*="email" i],input[type="email"]').first();
  if(await user.count()===0)user=page.locator('input[type="text"]').first();
  if(await user.count()===0)failure(422,'Campo de usuário não identificado na página de login');
  const action=await pw.evaluate(el=>{
    const f=el.closest('form');return f?{action:f.action,method:f.method}:{action:'',method:''};
  }).catch(()=>({action:'',method:''}));
  if(action.action){
    const to=new URL(action.action);
    if(to.origin!==new URL(page.url()).origin)failure(422,'O login utiliza outro domínio e precisa de adaptação autorizada');
  }
  await user.fill(username,{timeout:7000});await pw.fill(password,{timeout:7000});
  const form=pw.locator('xpath=ancestor::form[1]');
  const button=(await form.count())?form.locator('button[type="submit"],input[type="submit"],button').first():page.getByRole('button',{name:/entrar|acessar|login|sign in|conectar/i}).first();
  if(await button.count())await button.click({timeout:12000});else await pw.press('Enter');
  await page.waitForLoadState('domcontentloaded',{timeout:13000}).catch(()=>{});
  await page.waitForTimeout(2200);
  if(await isChallenge(page))failure(409,'Após o login, o fornecedor exigiu verificação Cloudflare.');
  const response=await jsonLoginStatus(page);
  if(response.json){
    if(response.rejected)failure(401,'O painel rejeitou a autenticação. Confira as credenciais cadastradas.');
    if(!response.accepted)failure(422,'O formulário levou a uma resposta JSON sem confirmação de login, em vez de abrir a área administrativa do Sigma.');
    // Explicit success. Reopen the public entry URL in the same authenticated browser context.
    console.log('CLYSTRIA_LOGIN_JSON_REDIRECT detected; returning to panel entry');
    await page.goto(entryUrl,{waitUntil:'domcontentloaded',timeout:27000});
    await page.waitForTimeout(2300);
  }
  const state=await browserState(page);
  if(state.passwordFields){
    const txt=await page.locator('body').innerText({timeout:2000}).catch(()=>'');
    if(/credenciais inv[aá]lidas|senha incorreta|login inv[aá]lido|invalid password|invalid credentials/i.test(txt))failure(401,'Credenciais recusadas pelo painel');
    failure(422,'O formulário ainda está na tela. Não foi possível confirmar a autenticação do Sigma.');
  }
  if(state.controls===0&&state.bodyLength<100){
    await page.waitForTimeout(3000);
  }
  return response.json?'login_json_reabriu_painel':'formulario_enviado';
}
async function navigateClients(page){
  // The provider's mobile layout has a fixed "Clientes" bottom tab (often a div, not a link).
  const clientLabels=/^(clientes|assinantes|linhas|meus clientes|lista de clientes|clientes e linhas)$/i;
  const safeLink=async locator=>{
    const href=await locator.getAttribute('href').catch(()=>null);
    if(href&&href!=='#'){try{if(new URL(href,page.url()).origin!==new URL(page.url()).origin)return false;}catch{return false;}}
    return true;
  };
  const started=Date.now();
  for(let round=0;round<4;round++){
    const current=await extract(page);
    const cards=await extractSigmaCards(page);
    if(current.items.some(x=>x.username&&x.due_date)||cards.items.length)return 'clientes_visiveis';
    // Only click text directly associated with a navigation destination; text-only labels can bubble to parent.
    const labels=page.getByText(clientLabels,{exact:true});
    const count=Math.min(await labels.count().catch(()=>0),15);
    for(let i=count-1;i>=0;i--){
      const node=labels.nth(i);
      try{
        if(!await node.isVisible()||!await safeLink(node))continue;
        const section=await node.evaluate(el=>{
          const t=el.closest('nav,footer,[role="navigation"],[role="tablist"],[class*="bottom" i],[class*="tabbar" i],[class*="sidebar" i],[class*="menu" i]');
          return !!t;
        }).catch(()=>false);
        if(!section&&count>1)continue;
        await node.click({timeout:4500});
        await page.waitForTimeout(1250);
        const found=await extractSigmaCards(page);
        if(found.items.length||/mudar para tabela|limpar filtro/i.test((await page.locator('body').innerText({timeout:1900}).catch(()=>''))))return 'aba_clientes';
      }catch{}
    }
    const selector='a,button,[role="menuitem"],[role="link"],[role="tab"],[data-menu],[data-testid],[class*="menu-item" i],[class*="nav-item" i],[class*="sidebar-item" i],.menu-link,.sidebar-link';
    const candidates=await page.evaluate(sel=>Array.from(document.querySelectorAll(sel)).slice(0,550).map((el,index)=>{
      const box=el.getBoundingClientRect();
      if(box.width<2||box.height<2)return null;
      const label=String(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title')||'').replace(/\s+/g,' ').trim().slice(0,90);
      return {index,label,href:String(el.getAttribute('href')||'')};
    }).filter(Boolean),selector).catch(()=>[]);
    const choice=candidates.find(c=>clientLabels.test(c.label)&&!/\b(novo|adicionar|excluir|remover|editar)\b/i.test(c.label));
    if(choice){
      try{
        const node=page.locator(selector).nth(choice.index);
        if(await safeLink(node)){await node.click({timeout:4500});await page.waitForTimeout(1150);continue;}
      }catch{}
    }
    if(round===0){
      const toggle=page.locator('[aria-label*="menu" i],[aria-label*="navega" i],button[class*="hamburger" i],button[class*="sidebar-toggle" i]').first();
      if(await toggle.count()&&await toggle.isVisible().catch(()=>false)){try{await toggle.click({timeout:2500});continue;}catch{}}
    }
    if(Date.now()-started>14000)break;
    await page.waitForTimeout(1100);
  }
  return 'menu_clientes_nao_localizado';
}
// Sigma mobile card structure: identifier, details, "Vencimento", active status, plan.
async function extractSigmaCards(page){
 const output={items:[],cards:0};
 for(const frame of page.frames().slice(0,8)){
  let found;
  try{found=await frame.evaluate(()=>{
    const date=/\b(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})\b/;
    const leaves=Array.from(document.querySelectorAll('strong,b,span,label,p,div,h3,h4,h5'))
      .filter(el=>el.children.length<=1&&/^vencimento\s*:?$/i.test((el.innerText||'').trim())).slice(0,250);
    const items=[],seen=new Set();
    const getLine=(s)=>String(s||'').split('\n').map(v=>v.trim()).filter(Boolean);
    for(const leaf of leaves){
      let el=leaf,container=null,lines=null;
      for(let depth=0;el&&depth<10;depth++,el=el.parentElement){
        const raw=String(el.innerText||'');
        if(raw.length>2200)break;
        if(!/\bVencimento\b/i.test(raw)||!date.test(raw)||!/\b(Ativo|Vencido|Inativo|Expirado|Teste)\b/i.test(raw))continue;
        const before=raw.split(/\bVencimento\b/i)[0];
        const head=getLine(before);
        const first=head.find(t=>/^(?:\d{7,20}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[a-z0-9_.-]{8,60})$/i.test(t));
        if(first&&head.length>=1){container=raw;lines=head;break;}
      }
      if(!container)continue;
      const identifier=lines.find(t=>/^\d{7,20}$/.test(t))||
        lines.find(t=>/^[a-z0-9_.-]{8,60}$/i.test(t))||
        lines.find(t=>/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(t));
      if(!identifier||seen.has(identifier))continue;
      const expiration=container.match(/Vencimento\s*:?\s*(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})/i)
        ||container.match(/Vencimento[^\d]{0,35}(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})/i);
      if(!expiration)continue;
      seen.add(identifier);
      const mail=lines.find(t=>/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(t))||'';
      const detail=lines.find(t=>t!==identifier&&t!==mail&&/mes|tela|adulto|completo|basico|premium|iptv|pacote/i.test(t))||'';
      const price=container.match(/Plano\s*:\s*R\$\s*([\d.,]+)/i)?.[1]||'';
      const state=(container.match(/\b(Ativo|Inativo|Vencido|Expirado|Teste)\b/i)||[])[1]||'';
      const plan=detail||((container.match(/\b(IPTV|P2P)\b/i)||[])[1]||'');
      items.push({
        username:'sigma:'+identifier,
        name:identifier,
        phone:/^\d{10,11}$/.test(identifier)?identifier:'',
        due_date:expiration[1],
        plan_name:plan.slice(0,90),
        price:price.replace(/\./g,'').replace(',','.'),
        status:state,
      });
    }
    return items.slice(0,500);
  });}catch{continue;}
  output.cards+=found.length;
  output.items.push(...found);
 }
 return output;
}

async function extract(page){
 const results={items:[],recognized:0,tables:0,grids:0,frames:0};
 const frames=page.frames().slice(0,8);
 for(const frame of frames){
  let data;
  try{
   data=await frame.evaluate(()=>{
    const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const fields={
      username:/^(usuario|user|username|login|acesso|usuario de acesso|usuario iptv|login de acesso|user name|identificador|linha|usuario cliente|login cliente)( |$)/,
      due_date:/(vencimento|vence|expira|expiracao|expiration|expiry|validade|data final|data de validade|exp date|due date|valid until|validade ate)/,
      name:/^(nome|nome do cliente|nome completo|cliente|assinante|titular|customer|name|full name)( |$)/,
      phone:/(telefone|whatsapp|celular|phone|mobile|contato)/,
      status:/(situacao|status|estado)/,
      plan_name:/(plano|pacote|plan|package)/,
      price:/(valor|preco|price|mensalidade)/
    };
    const pick=k=>Object.keys(fields).find(f=>fields[f].test(norm(k)))||null;
    const datePattern=/\b(?:\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})\b/;
    const items=[];let recognized=0,tableCount=0,gridCount=0;
    const clean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,220);
    const push=i=>{
     if(!i||typeof i!=='object')return;
     const normalized={};
     for(const [key,val] of Object.entries(i))if(fields[key]&&val)normalized[key]=clean(val);
     if(normalized.username||normalized.due_date)items.push(normalized);
    };
    function mapCells(cells,headers){
      const out={};
      cells.forEach((node,j)=>{
       const rawLabel=node.getAttribute?.('data-field')||node.getAttribute?.('data-column')||
           node.getAttribute?.('aria-label')?.split(':')[0]||headers[j]||'';
       const key=pick(rawLabel)||pick(headers[j]||'');
       if(key&&!out[key])out[key]=clean(node.innerText||node.textContent);
      });
      return out;
    }
    const tables=Array.from(document.querySelectorAll('table')).slice(0,15);
    tableCount=tables.length;
    for(const table of tables){
     const headEls=Array.from(table.querySelectorAll('thead th, thead td'));
     const heads=(headEls.length?headEls:Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td'))).map(x=>clean(x.innerText||x.textContent));
     if(!heads.some(h=>pick(h)==='username'||pick(h)==='due_date'))continue;
     recognized++;
     let trs=Array.from(table.querySelectorAll('tbody tr'));
     if(!trs.length)trs=Array.from(table.querySelectorAll('tr')).slice(1);
     for(const tr of trs.slice(0,600)){
       const cells=Array.from(tr.querySelectorAll(':scope > td'));
       if(!cells.length)continue;
       push(mapCells(cells,heads));
     }
    }
    const grids=Array.from(document.querySelectorAll('[role="grid"],[role="table"],.MuiDataGrid-root,.ag-root,.ant-table,.p-datatable,[class*="data-grid" i]')).slice(0,12);
    gridCount=grids.length;
    for(const grid of grids){
     const headingNodes=Array.from(grid.querySelectorAll('[role="columnheader"],[data-col-id],.ag-header-cell')).slice(0,35);
     const heads=headingNodes.map(h=>clean(h.getAttribute('data-field')||h.getAttribute('col-id')||h.innerText||h.textContent));
     const rows=Array.from(grid.querySelectorAll('[role="row"],.ag-row,.MuiDataGrid-row')).filter(r=>r.querySelector('[role="gridcell"],[role="cell"],.ag-cell,[data-field]')).slice(0,650);
     if(!heads.some(h=>['username','due_date'].includes(pick(h)))&&!rows.some(r=>r.querySelector('[data-field*="user" i],[data-field*="login" i],[data-field*="expir" i],[data-field*="venc" i]')))continue;
     recognized++;
     for(const row of rows){
       const cells=Array.from(row.querySelectorAll(':scope > [role="gridcell"],:scope > [role="cell"],:scope > [data-field],:scope > .ag-cell'));
       const nested=cells.length?cells:Array.from(row.querySelectorAll('[role="gridcell"],[role="cell"],.ag-cell,[data-field]'));
       push(mapCells(nested.slice(0,35),heads));
     }
    }
    const cards=Array.from(document.querySelectorAll('[data-client-id],[data-user-id],[data-testid*="client" i],[data-testid*="customer" i],.client-card,.customer-card,.user-card,[class*="cliente-card" i],[class*="customer-item" i]')).slice(0,350);
    const value=(s,re)=>{const m=s.match(re);return m?clean(m[1]):'';};
    for(const el of cards){
      if(el.matches('table,tr,tbody,thead'))continue;
      const raw=String(el.innerText||'').slice(0,2000);
      const username=clean(el.getAttribute('data-username')||el.getAttribute('data-login')||value(raw,/(?:^|\n)\s*(?:login|usu[aá]rio|username|user)\s*[:\-]\s*([^\n]+)/i));
      const due=value(raw,/(?:^|\n)\s*(?:vencimento|vence|validade|expira(?:ção|cao)|expiration)\s*[:\-]\s*([^\n]+)/i);
      const date=due||clean(el.getAttribute('data-due-date')||el.getAttribute('data-expiration'));
      if(username&&datePattern.test(date)){
        push({username,due_date:date,name:value(raw,/(?:^|\n)\s*(?:nome|cliente)\s*[:\-]\s*([^\n]+)/i)||username,
          phone:value(raw,/(?:^|\n)\s*(?:telefone|whatsapp)\s*[:\-]\s*([^\n]+)/i),
          plan_name:value(raw,/(?:^|\n)\s*(?:plano|pacote)\s*[:\-]\s*([^\n]+)/i),
          status:value(raw,/(?:^|\n)\s*(?:status|situa(?:ção|cao))\s*[:\-]\s*([^\n]+)/i)});
        recognized++;
      }
    }
    return {items,recognized,tables:tableCount,grids:gridCount};
   });
  }catch{continue;}
  results.frames++;
  results.recognized+=data.recognized||0;results.tables+=data.tables||0;results.grids+=data.grids||0;
  results.items.push(...(data.items||[]));
 }
 return results;
}
// Parse only data the signed-in provider website already returns; no new API calls.
function extractJsonClients(payload){
 const keys={
  username:['username','user_name','userName','login','usuario','user_login','loginName','iptv_username','iptvUser','access_user'],
  due_date:['due_date','dueDate','expiration_date','expirationDate','expiry_date','expiryDate','expires_at','expire_at','expired_at','expires','exp_date','expDate','expireDate','expire_time','expireTime','expiration','valid_until','validUntil','vencimento','data_vencimento','date_end','end_date','dateEnd','validade','validity','expire','expiry','expire_timestamp','exp_timestamp'],
  name:['name','nome','customer_name','customerName','client_name','clientName','full_name','fullName','display_name','displayName','title'],
  phone:['phone','telefone','whatsapp','mobile','celular'],
  status:['status','situacao','situation','state'],
  plan_name:['plan_name','planName','package_name','packageName','plano','pacote'],
  price:['price','valor','amount','value','monthly_price']
 };
 const result=[],queue=[{value:payload,depth:0}];let visited=0;
 const pick=(obj,list)=>{for(const k of list)if(obj[k]!==undefined&&obj[k]!==null&&obj[k]!=='')return obj[k];return undefined;};
 const scalar=x=>typeof x==='string'||typeof x==='number'?String(x):'';
 while(queue.length&&visited++<7000&&result.length<10000){
  const {value,depth}=queue.shift();
  if(!value||typeof value!=='object'||depth>7)continue;
  if(Array.isArray(value)){for(const item of value.slice(0,10000))if(item&&typeof item==='object')queue.push({value:item,depth:depth+1});continue;}
  let username=scalar(pick(value,keys.username)),due=scalar(pick(value,keys.due_date));
  if(!due&&value.subscription&&typeof value.subscription==='object')due=scalar(pick(value.subscription,keys.due_date));
  if(!due&&value.plan&&typeof value.plan==='object')due=scalar(pick(value.plan,keys.due_date));
  if(!username&&value.credentials&&typeof value.credentials==='object')username=scalar(pick(value.credentials,keys.username));
  if(username&&due&&normalizeDate(due)){
   const plan=pick(value,keys.plan_name);
   result.push({username:clean(username,100),due_date:due,name:clean(scalar(pick(value,keys.name))||username,100),
    phone:clean(scalar(pick(value,keys.phone)),40),status:clean(scalar(pick(value,keys.status)),50),
    plan_name:clean(scalar(plan)||scalar(value.plan?.name)||scalar(value.package?.name),80),
    price:clean(scalar(pick(value,keys.price)),30)});
   continue;
  }
  for(const [key,child] of Object.entries(value)){
   if(!child||typeof child!=='object')continue;
   if(/^(session|cookies|headers|credentials|token|auth|settings|config|metadata|permissions)$/i.test(key))continue;
   queue.push({value:child,depth:depth+1});
  }
 }
 return result;
}

function normalizeDate(value){
  const s=clean(value,70);
  let m=s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if(m){const d=new Date(m[0]+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===m[0]?m[0]:'';}
  if(/^\d{10,13}$/.test(s)){
    const ms=s.length===13?Number(s):Number(s)*1000;
    const parsed=new Date(ms);
    return Number.isNaN(parsed.getTime())?'':parsed.toISOString().slice(0,10);
  }
  m=s.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/);
  if(!m)return '';
  const date=m[3]+'-'+m[2]+'-'+m[1];
  const d=new Date(date+'T12:00:00Z');
  return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===date?date:'';
}
function asClient(item){
  const username=clean(item.username,100);
  const due_date=normalizeDate(item.due_date);
  if(!username||!due_date)return null;
  return {username,due_date,name:clean(item.name||username,100),
    phone:clean(item.phone,40),status:clean(item.status,40),
    plan_name:clean(item.plan_name,80),price:clean(item.price,30)};
}
async function nextPage(page){
  const elements=[
   page.getByRole('button',{name:/pr[oó]xim[ao]|next(?: page)?|p[aá]gina seguinte|avan[cç]ar|go to next page/i}).last(),
   page.getByRole('link',{name:/pr[oó]xim[ao]|next(?: page)?|p[aá]gina seguinte|avan[cç]ar/i}).last(),
   page.locator('button[aria-label*="next" i],button[title*="próxim" i],button[title*="next" i],.ant-pagination-next button,.p-paginator-next,.MuiTablePagination-actions button:last-child').last()
  ];
  for(const target of elements){
   try{
    if(!await target.count()||!await target.isVisible()||!await target.isEnabled())continue;
    if(await target.getAttribute('aria-disabled')==='true'||await target.getAttribute('disabled')!==null)continue;
    await target.click({timeout:4500});
    await page.waitForTimeout(1300);
    return true;
   }catch{}
  }
  return false;
}
async function runJob(job){
  if(!ALLOW.length)failure(503,'Configure ALLOWED_PANEL_HOSTS no serviço');
  const url=(await safeUrl(job.url,true)).href;
  const user=clean(job.username,160),password=String(job.password||'');
  if(!user||!password)failure(422,'Credenciais de login não configuradas');
  let browser,context;
  let forcedTimeout=false,nearMemoryLimit=false,stopping=false;
  const stop=()=>{
   if(stopping)return;stopping=true;
   context?.close().catch(()=>{});
   browser?.close().catch(()=>{});
  };
  const deadline=setTimeout(()=>{forcedTimeout=true;stop();},35000);
  const monitor=setInterval(async()=>{
   if(stopping)return;
   if(await memoryPressure()>0.83){
    nearMemoryLimit=true;
    console.log('CLYSTRIA_BROWSER_MEMORY_GUARD');
    stop();
   }
  },900);
  try{
    browser=await chromium.launch({executablePath:BROWSER_PATH,headless:true,timeout:18000,
      args:CHROMIUM_ARGS});
    const diagnostics={blockedHttp:0,blockedUnsafe:0,failedRequests:0,pageErrors:0,documentResponses:0,blockedHost:'',blockedType:'',blockedResources:[],failedResourceTypes:[]};
    const sigma=job.panel_kind==='sigma';
    context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',
      ...(sigma?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:820,height:630}}),
      acceptDownloads:false,serviceWorkers:'block',ignoreHTTPSErrors:false});
    await context.route('**/*',async route=>{
      try{
        const req=route.request(),url=req.url();
        if(!url.startsWith('https://')){if(url.startsWith('data:')||url.startsWith('blob:'))return route.continue();diagnostics.blockedHttp++;return route.abort();}
        // Cloudflare Turnstile loads its verification UI in a nested document.
        // Permit only the official iframe host; never exempt top-level navigation.
        let isCloudflareFrame=false;
        if(req.isNavigationRequest()){
          try{
            const target=new URL(url);
            isCloudflareFrame=!!CLOUDFLARE_WIDGET_HOST&&CLOUDFLARE_OFFICIAL_RESOURCE_HOSTS.has(target.hostname)&&!!req.frame().parentFrame();
          }catch{}
        }
        await safeUrl(url,req.isNavigationRequest(),isCloudflareFrame);
        await route.continue();
      }catch(err){
        diagnostics.blockedUnsafe++;
        const blockedRequest=route.request();
        const reason=err?.status===403?'not_allowed':/dns/i.test(String(err?.message||''))?'dns_error':err?.status===400?'invalid_url':'other';
        let hostname='';
        try{hostname=new URL(blockedRequest.url()).hostname.slice(0,150);}catch{}
        const type=blockedRequest.resourceType().slice(0,20);
        if(diagnostics.blockedResources.length<4&&!diagnostics.blockedResources.some(x=>x.host===hostname&&x.type===type))
          diagnostics.blockedResources.push({host:hostname,type,reason});
        if(blockedRequest.isNavigationRequest()&&!diagnostics.blockedHost){
          diagnostics.blockedHost=hostname;
          diagnostics.blockedType=reason;
        }
        await route.abort().catch(()=>{});
      }
    });
    const page=await context.newPage();
    page.setDefaultTimeout(9000);
    page.on('pageerror',()=>{diagnostics.pageErrors++;});
    page.on('requestfailed',request=>{
      diagnostics.failedRequests++;
      if(diagnostics.failedResourceTypes.length<4){
        let hostname='';
        try{hostname=new URL(request.url()).hostname.slice(0,140);}catch{}
        const type=request.resourceType().slice(0,20);
        if(!diagnostics.failedResourceTypes.some(x=>x.host===hostname&&x.type===type))
          diagnostics.failedResourceTypes.push({host:hostname,type});
      }
    });
    page.on('response',response=>{if(response.request().isNavigationRequest())diagnostics.documentResponses++;});
    const captured=new Map(),inflight=new Set();
    let scannedJsonResponses=0;
    const host=new URL(url).hostname.toLowerCase();
    const suffix='.'+host.split('.').slice(-2).join('.');
    page.on('response',response=>{
      const work=(async()=>{
        try{
          if(scannedJsonResponses>=90||response.status()!==200)return;
          if(!['GET','POST'].includes(response.request().method()))return;
          const target=new URL(response.url());
          if(target.protocol!=='https:'||!(target.hostname===host||target.hostname.endsWith(suffix)))return;
          const headers=response.headers();
          if(!/application\/(?:[\w.+-]*\+)?json/i.test(headers['content-type']||''))return;
          if(Number(headers['content-length']||0)>3000000)return;
          scannedJsonResponses++;
          const bytes=await response.body().catch(()=>null);
          if(!bytes||bytes.length>3000000)return;
          let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{return;}
          for(const entry of extractJsonClients(data)){
            const item=asClient(entry);
            if(item)captured.set(item.username.toLowerCase(),item);
          }
        }catch{}
      })();
      inflight.add(work);
      work.finally(()=>inflight.delete(work));
    });
    const entryResponse=await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000});
    await page.waitForTimeout(900);
    if(await verificationPending(page))failure(409,'O painel exige verificação Cloudflare. Use Abrir navegador, conclua a verificação manualmente e importe da mesma sessão.');
    let initial=await classifyEntry(page,entryResponse);
    if(initial.controls===0&&initial.passwordFields===0){
      // Give slow SPAs a chance to mount; do not submit credentials to blank/error pages.
      await page.waitForFunction(()=>!!document.querySelector('input,button,a,[role="button"],[role="tab"]'),null,{timeout:6500}).catch(()=>{});
      initial=await classifyEntry(page,entryResponse);
      if(initial.controls===0&&initial.passwordFields===0){
        console.log('CLYSTRIA_ENTRY_DIAGNOSTIC '+JSON.stringify(initial));
        const message=initial.httpStatus>=400?
          'O servidor do Sigma respondeu HTTP '+initial.httpStatus+' para a VPS.':
          'A VPS recebeu uma página sem formulário nem controles do Sigma (HTTP '+initial.httpStatus+', '+initial.bodyLength+' caracteres, tipo '+initial.kind+').';
        failure(502,message+' Nenhuma autenticação foi realizada; verifique com o fornecedor se o acesso da VPS ao endereço cadastrado está autorizado.');
      }
    }
    const login=await maybeLogin(page,user,password,url);
    if(await verificationPending(page))failure(409,'A autenticação exige verificação Cloudflare. Use Abrir navegador, verifique manualmente e importe clientes desta sessão.');
    const destination=await navigateClients(page);
    await page.waitForTimeout(1300);
    await Promise.allSettled([...inflight]);
    if(await isChallenge(page))failure(409,'Painel protegido por desafio Cloudflare; automação não autorizada para resolver o desafio');
    const records=new Map(captured);
    let scanned=0,recognized=false,rawRows=0;
    for(let i=0;i<8;i++){
      const result=await extract(page);
      const sigmaCards=job.panel_kind==='sigma'?await extractSigmaCards(page):{items:[],cards:0};
      // Use card identifier as an external key only when the provider did not expose
      // actual client logins in its loaded JSON or table. Avoid duplicate identities.
      const fallback=records.size===0&&!result.items.some(item=>asClient(item))?sigmaCards.items:[];
      recognized=recognized||result.recognized>0||sigmaCards.cards>0;
      rawRows+=result.items.length+fallback.length;
      for(const r of [...result.items,...fallback]){
        const c=asClient(r);
        if(c)records.set(c.username.toLowerCase(),c);
      }
      scanned++;
      if(!result.recognized&&!sigmaCards.cards&&job.panel_kind==='sigma'&&i===0){
        const switcher=page.getByText(/mudar para tabela/i).first();
        if(await switcher.count()&&await switcher.isVisible().catch(()=>false)){
          try{await switcher.click({timeout:4000});await page.waitForTimeout(1200);continue;}catch{}
        }
      }
      if((!result.recognized&&!sigmaCards.cards)||!await nextPage(page))break;
    }
    await Promise.allSettled([...inflight]);
    for(const [key,item] of captured)if(!records.has(key))records.set(key,item);
    if(!records.size){
      const reason=destination==='menu_ausente'?'menu de clientes não identificado':destination==='menu_clientes_sem_acesso'?'não foi possível abrir o menu de clientes':destination==='menu_clientes_acionado'?'menu acionado, mas sem registros reconhecidos':'dados de clientes não reconhecidos';
      const state=await browserState(page);
      const fingerprint={
        stage:destination,loginFlow:login,pageKind:state.contentType.toLowerCase().includes('json')?'json':state.contentType.toLowerCase().includes('html')?'html':'other',
        route:state.path==='/'?'root':/\/(api|auth|login)(\/|$)/i.test(state.path)?'auth_or_api':'other',
        controls:state.controls,bodyLength:state.bodyLength,hasClientsTab:state.hasClientsTab,
        json:scannedJsonResponses,rows:rawRows,valid:records.size,
        blockedResources:diagnostics.blockedResources,failedResourceTypes:diagnostics.failedResourceTypes,
        blockedHttp:diagnostics.blockedHttp,blockedUnsafe:diagnostics.blockedUnsafe,
        blockedHost:diagnostics.blockedHost,blockedType:diagnostics.blockedType,
        failedRequests:diagnostics.failedRequests,pageErrors:diagnostics.pageErrors,
        documentResponses:diagnostics.documentResponses
      };
      console.log('CLYSTRIA_SYNC_DIAGNOSTIC '+JSON.stringify(fingerprint));
      const challengeVisible=await page.evaluate(()=>!!document.querySelector('iframe[src*="challenges.cloudflare.com"],.cf-turnstile,[data-sitekey],[id*="challenge" i],[class*="turnstile" i]')).catch(()=>false);
      const challengeFrame=page.frames().some(frame=>{try{const host=new URL(frame.url()).hostname;return host==='challenges.cloudflare.com'||host.endsWith('.challenges.cloudflare.com');}catch{return false;}});
      if((challengeVisible||challengeFrame)&&login==='sem_formulario_login_visivel'){
        console.log('CLYSTRIA_CHALLENGE_PENDING '+JSON.stringify({stage:destination,frames:page.frames().length,controls:state.controls,blockedResources:diagnostics.blockedResources}));
        failure(409,'O Zeus carregou uma verificação Cloudflare antes de exibir o login. Não foi possível confirmar a autenticação; é necessário concluir a verificação por meio autorizado.');
      }
      const problem=challengeVisible?
        'O Zeus está aguardando uma verificação Cloudflare na VPS; a autenticação precisa ser concluída por um método autorizado.':
        state.contentType.toLowerCase().includes('json')?
        'O navegador terminou em uma resposta JSON, não na tela de Clientes do Sigma.':
        state.controls===0?'A página carregada na VPS está sem controles visíveis.':
        state.passwordFields?'O formulário de acesso ainda aparece.':
        'A página carregou, mas a aba Clientes não foi reconhecida.';
      failure(422,problem+' Diagnóstico: '+reason+', '+diagnostics.failedRequests+' falha(s) de recurso, '+diagnostics.blockedHttp+' conexão(ões) HTTP bloqueada(s)'+(diagnostics.blockedHost?' (domínio: '+diagnostics.blockedHost+')':'')+'. Nenhum cliente foi alterado.');
    }
    return {ok:true,clients:[...records.values()],plans:[],warning:'',
      diagnostics:{login,section:destination,pages:scanned,rows_seen:rawRows,valid_clients:records.size,json_responses:scannedJsonResponses,source:captured.size?'pagina_e_requisicoes_da_sessao':'pagina'}};
  }catch(e){
    if(nearMemoryLimit)failure(503,'O Chromium se aproximou do limite de memória da VPS. Sincronização automática interrompida; use Abrir navegador.');
    if(forcedTimeout)failure(504,'A navegação automática ultrapassou o tempo seguro. Use Abrir navegador e importe após concluir a verificação.');
    if(/ERR_HTTP_RESPONSE_CODE_FAILURE|net::ERR_/i.test(String(e.message)))failure(502,'Falha de navegação ou resposta do fornecedor; confirme a URL e o acesso HTTPS.');
    throw e;
  }finally{
    clearTimeout(deadline);clearInterval(monitor);
    if(context)await context.close().catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
  }
}

/* Browser session under the Clystria account. A human controls the page; the worker
   never solves, clicks through or fabricates a Cloudflare challenge. */
let live=null;
const CHROMIUM_ARGS=['--disable-dev-shm-usage','--no-sandbox','--disable-gpu','--no-first-run',
 '--disable-background-networking','--disable-extensions','--disable-component-update','--renderer-process-limit=2'];
async function memoryPressure(){
 try{
  const [usage,maximum]=await Promise.all([
   readFile('/sys/fs/cgroup/memory.current','utf8'),
   readFile('/sys/fs/cgroup/memory.max','utf8')
  ]);
  const used=Number(usage.trim()),max=Number(maximum.trim());
  return Number.isFinite(max)&&max>0&&Number.isFinite(used)?used/max:0;
 }catch{return 0;}
}
async function verificationPending(page){
 if(await isChallenge(page))return true;
 const passwordVisible=await page.locator('input[type="password"]').count().catch(()=>0)>0;
 const widgetFrame=page.frames().some(frame=>{
  try{const host=new URL(frame.url()).hostname;return host==='challenges.cloudflare.com'||host.endsWith('.challenges.cloudflare.com');}
  catch{return false;}
 });
 if(widgetFrame&&!passwordVisible)return true;
 const challengeElements=await page.locator('.cf-turnstile,[data-sitekey],[id*="challenge" i]').count().catch(()=>0);
 return !passwordVisible&&challengeElements>0;
}

const VIEWPORT={width:960,height:720};
async function closeLive(){
 const previous=live;live=null;
 if(previous){
  await previous.context.close().catch(()=>{});
  await previous.browser.close().catch(()=>{});
 }
}
function getLive(job){
 if(!live||live.id!==String(job.session||'')||live.panelId!==String(job.panel_id||'')||
    live.owner!==String(job.owner||''))failure(404,'Sessão encerrada ou não autorizada');
 if(Date.now()-live.lastActive>20*60*1000)failure(410,'Sessão expirada por inatividade; abra novamente');
 live.lastActive=Date.now();
 return live;
}
async function liveCapture(item){
 const page=item.page;
 if(page.isClosed())failure(410,'A página foi encerrada');
 const screenshot=await page.screenshot({type:'jpeg',quality:56,animations:'disabled',timeout:12000});
 let hostname='';
 try{hostname=new URL(page.url()).hostname;}catch{}
 return {ok:true,session:item.id,width:VIEWPORT.width,height:VIEWPORT.height,
  image:'data:image/jpeg;base64,'+screenshot.toString('base64'),
  host:hostname,verification:await isChallenge(page),password_form:(await page.locator('input[type="password"]').count())>0};
}
async function startLive(job){
 if(!ALLOW.length)failure(503,'Navegador não configurado');
 const entry=(await safeUrl(job.url,true)).href;
 const panelId=clean(job.panel_id,40),owner=clean(job.owner,64);
 if(!/^[a-f0-9]{32}$/.test(panelId)||!/^[a-f0-9]{32}$/.test(owner))failure(400,'Identificação inválida');
 if(live){
  if(live.panelId===panelId&&live.owner===owner){
   live.lastActive=Date.now();
   return await liveCapture(live);
  }
  failure(409,'Já existe uma sessão de navegador em uso; encerre-a antes de abrir outra');
 }
 let browser=null,context=null;
 try{
  browser=await chromium.launch({executablePath:BROWSER_PATH,headless:true,timeout:22000,
    args:CHROMIUM_ARGS});
  context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',
    viewport:VIEWPORT,deviceScaleFactor:1,acceptDownloads:false,
    serviceWorkers:'block',ignoreHTTPSErrors:false});
  // Restrict every request to public HTTPS and allowed provider / Cloudflare resource domains.
  await context.route('**/*',async route=>{
   const request=route.request();
   try{
    const u=request.url();
    if(u.startsWith('data:')||u.startsWith('blob:'))return route.continue();
    let cfFrame=false;
    if(request.isNavigationRequest()){
     const target=new URL(u);
     cfFrame=!!CLOUDFLARE_WIDGET_HOST&&CLOUDFLARE_OFFICIAL_RESOURCE_HOSTS.has(target.hostname)&&!!request.frame().parentFrame();
    }
    await safeUrl(u,request.isNavigationRequest(),cfFrame);
    return route.continue();
   }catch{return route.abort().catch(()=>{});}
  });
  const page=await context.newPage();
  page.setDefaultTimeout(9500);
  // Credentials are retained server-side only for user-requested autofill, never sent to the phone.
  const item={id:randomUUID(),panelId,owner,browser,context,page,
    username:clean(job.username,160),password:String(job.password||''),lastActive:Date.now()};
  await page.goto(entry,{waitUntil:'domcontentloaded',timeout:30000});
  live=item;
  console.log('CLYSTRIA_INTERACTIVE_OPEN panel_kind='+clean(job.panel_kind,24));
  return await liveCapture(item);
 }catch(e){
  if(context)await context.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(live?.browser===browser)live=null;
  throw e;
 }
}
async function interactLive(job){
 const item=getLive(job),page=item.page;
 const kind=clean(job.action,22);
 if(kind==='click'){
  const x=Number(job.x),y=Number(job.y);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>VIEWPORT.width||y>VIEWPORT.height)failure(400,'Clique fora da área visível');
  await page.mouse.click(x,y,{timeout:9000});
 }else if(kind==='type'){
  const content=String(job.text||'');
  if(content.length>500)failure(413,'Texto muito longo');
  await page.keyboard.insertText(content);
 }else if(kind==='key'){
  const k=clean(job.key,30);
  if(!['Enter','Tab','Escape','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k))failure(400,'Tecla inválida');
  await page.keyboard.press(k);
 }else if(kind==='scroll'){
  const dy=Number(job.dy);
  if(!Number.isFinite(dy))failure(400,'Rolagem inválida');
  await page.mouse.wheel(0,Math.max(-700,Math.min(700,dy)));
 }else if(kind==='reload'){
  await page.reload({waitUntil:'domcontentloaded',timeout:25000});
 }else if(kind==='autofill'){
  if(!item.username||!item.password)failure(422,'A conexão precisa ter usuário e senha salvos');
  let username=page.locator('input[autocomplete="username"],input[type="email"],input[name*="user" i],input[name*="login" i]').first();
  if(!await username.count())username=page.locator('input[type="text"]').first();
  const password=page.locator('input[type="password"]').first();
  if(!await username.count()||!await password.count())failure(422,'Abra a tela de login antes de preencher');
  await username.fill(item.username);
  await password.fill(item.password);
 }else failure(400,'Comando não autorizado');
 await page.waitForTimeout(600);
 return await liveCapture(item);
}
async function importLive(job){
 const item=getLive(job),page=item.page;
 if(await isChallenge(page))failure(409,'Conclua a verificação Cloudflare manualmente nesta sessão');
 if(await page.locator('input[type="password"]').count())failure(409,'Conclua o login do fornecedor antes de importar');
 let rows=new Map();
 const section=await navigateClients(page);
 const captures=[];
 for(let i=0;i<8;i++){
  const table=await extract(page);
  const cards=job.panel_kind==='sigma'?await extractSigmaCards(page):{items:[],cards:0};
  for(const value of [...table.items,...cards.items]){
   const client=asClient(value);
   if(client)rows.set(client.username.toLowerCase(),client);
  }
  captures.push({table:table.recognized,cards:cards.cards});
  if(!(table.recognized||cards.cards)||!await nextPage(page))break;
 }
 if(!rows.size)failure(422,'O navegador chegou à página, mas nenhum cliente válido foi reconhecido. Abra a seção Clientes na tela e tente novamente; nenhum dado foi alterado.');
 console.log('CLYSTRIA_INTERACTIVE_IMPORT section='+clean(section,50)+' count='+rows.size);
 return {ok:true,clients:[...rows.values()],plans:[],diagnostics:{valid_clients:rows.size,section}};
}
setInterval(()=>{if(live&&Date.now()-live.lastActive>20*60*1000)closeLive().catch(()=>{});},60000).unref();

let browserSelfTest='pending';
async function testChromium(){
 let browser;
 try{
  browser=await chromium.launch({executablePath:BROWSER_PATH,headless:true,timeout:22000,
    args:CHROMIUM_ARGS});
  const page=await browser.newPage();
  await page.setContent('<table><thead><tr><th>Usuário</th><th>Vencimento</th></tr></thead><tbody><tr><td>teste</td><td>22/12/2026</td></tr></tbody></table>');
  const result=await extract(page);
  if(result.items[0]?.username==='teste'&&normalizeDate(result.items[0]?.due_date)==='2026-12-22'){
   browserSelfTest='ok';console.log('CLYSTRIA_CHROMIUM_SELFTEST_OK');
  }else{browserSelfTest='extract_failed';console.error('CLYSTRIA_CHROMIUM_SELFTEST_EXTRACT_FAILED');}
 }catch(e){browserSelfTest='launch_failed';console.error('CLYSTRIA_CHROMIUM_SELFTEST_LAUNCH_FAILED: '+clean(e.message||'',140));}
 finally{if(browser)await browser.close().catch(()=>{});}
}
testChromium().catch(()=>{});
const server=http.createServer(async(req,res)=>{
  let acquired=false;
  if(req.method==='POST')console.log('CLYSTRIA_WORKER_REQUEST_'+(req.url==='/ping'?'PING':req.url==='/sync'?'SYNC':'OTHER'));
  try{
    if((req.method==='GET'||req.method==='HEAD')&&(req.url==='/'||req.url==='/health'))return json(res,200,{ok:true,service:'clystria-browser-worker',browser:'chromium',browser_self_test:browserSelfTest,configured:SECRET.length>=32&&ALLOW.length>0});
    if(req.method!=='POST'||!['/sync','/ping','/live/open','/live/frame','/live/action','/live/import','/live/close'].includes(req.url))return json(res,404,{error:'Recurso não encontrado'});
    if(SECRET.length<32)return json(res,503,{error:'Serviço sem token de autenticação'});
    const supplied=(req.headers.authorization||'').replace(/^Bearer /i,'');
    if(!equals(supplied,SECRET))return json(res,401,{error:'Não autorizado'});
    if(req.url==='/ping')return json(res,browserSelfTest==='ok'?200:503,{ok:browserSelfTest==='ok',browser_self_test:browserSelfTest,interactive:true});
    if(busy)return json(res,429,{error:'O Chromium está atendendo outra operação; tente novamente'});
    busy=true;acquired=true;
    let body='';for await(const chunk of req){body+=chunk;if(body.length>12000)failure(413,'Solicitação muito grande');}
    let job;try{job=JSON.parse(body);}catch{failure(400,'JSON inválido');}
    if(req.url==='/live/open')return json(res,200,await startLive(job));
    if(req.url==='/live/frame')return json(res,200,await liveCapture(getLive(job)));
    if(req.url==='/live/action')return json(res,200,await interactLive(job));
    if(req.url==='/live/import')return json(res,200,await importLive(job));
    if(req.url==='/live/close'){getLive(job);await closeLive();return json(res,200,{ok:true});}
    if(live)failure(409,'Existe uma sessão manual aberta; encerre-a para executar a sincronização automática');
    const payload=await runJob(job);
    return json(res,200,payload);
  }catch(e){
    // Never print submitted credentials, cookies or HTML from authenticated pages.
    const status=Number(e.status)||502;
    return json(res,status,{error:clean(e.message||'Falha na navegação',250),code:status});
  }finally{if(acquired)busy=false;}
});
server.listen(PORT,'0.0.0.0',()=>console.log('CLYSTRIA_BROWSER_WORKER_READY'));
