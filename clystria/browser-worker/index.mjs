import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { chromium } from 'playwright-core';

const PORT=Number(process.env.PORT||10000);
const SECRET=process.env.BROWSER_WORKER_TOKEN||'';
const ALLOW=(process.env.ALLOWED_PANEL_HOSTS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
const BROWSER_PATH=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
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
async function safeUrl(input,documentRequest=false){
  let u;
  try{u=new URL(String(input));}catch{failure(400,'URL inválida');}
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')failure(400,'Somente URLs HTTPS comuns são aceitas');
  const host=u.hostname.toLowerCase();
  if(net.isIP(host)||!host.includes('.')||host==='localhost'||host.endsWith('.local'))failure(400,'Host não autorizado');
  if(documentRequest&&(!ALLOW.length||!ALLOW.includes(host)))failure(403,'Host não está na lista de painéis permitidos');
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
async function maybeLogin(page,username,password){
  if(await isChallenge(page))failure(409,'O fornecedor exige verificação Cloudflare. A automação não contorna desafios; solicite um método de acesso autorizado ao fornecedor.');
  const pw=page.locator('input[type="password"]').first();
  if(await pw.count()===0)return 'no_form';
  if(!username||!password)failure(422,'Configure usuário e senha do painel no Clystria');
  let user=page.locator('input[autocomplete="username"], input[name*="user" i], input[name*="login" i], input[name*="email" i], input[type="email"]').first();
  if(await user.count()===0)user=page.locator('input[type="text"]').first();
  if(await user.count()===0)failure(422,'Campo de usuário não identificado na página de login');
  const action=await pw.evaluate(el=>{
    const f=el.closest('form');return f?{action:f.action,method:f.method}:{action:'',method:''};
  }).catch(()=>({action:'',method:''}));
  if(action.action){
    const a=new URL(action.action);
    if(a.origin!==new URL(page.url()).origin)failure(422,'Login usa outro domínio. É necessário adaptar o fluxo autorizado desse fornecedor.');
  }
  await user.fill(username,{timeout:7000});await pw.fill(password,{timeout:7000});
  const form=pw.locator('xpath=ancestor::form[1]');
  const button=(await form.count())?form.locator('button[type="submit"], input[type="submit"], button').first():page.getByRole('button',{name:/entrar|acessar|login|sign in|conectar/i}).first();
  if(await button.count())await button.click({timeout:12000});else await pw.press('Enter');
  await page.waitForLoadState('domcontentloaded',{timeout:13000}).catch(()=>{});
  // SPAs may take seconds to mount the authenticated dashboard.
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle',{timeout:6500}).catch(()=>{});
  if(await isChallenge(page))failure(409,'Após o login, o fornecedor exigiu um desafio Cloudflare. Não é possível automatizar sua resolução.');
  if(await page.locator('input[type="password"]').count()){
    const text=await page.locator('body').innerText({timeout:2000}).catch(()=>'');
    if(/credenciais inv[aá]lidas|senha incorreta|login inv[aá]lido|invalid password|invalid credentials/i.test(text))failure(401,'Credenciais recusadas pelo painel');
    failure(422,'Login não confirmado. O formulário deste fornecedor precisa de um adaptador específico.');
  }
  return 'login_form_sent_not_verified';
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
  try{
    browser=await chromium.launch({executablePath:BROWSER_PATH,headless:true,timeout:18000,
      args:['--disable-dev-shm-usage','--no-sandbox','--disable-gpu','--no-first-run','--disable-background-networking']});
    const sigma=job.panel_kind==='sigma';
    context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',
      ...(sigma?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{}),
      acceptDownloads:false,serviceWorkers:'block',ignoreHTTPSErrors:false});
    await context.route('**/*',async route=>{
      try{
        const req=route.request(),url=req.url();
        if(!url.startsWith('https://')){if(url.startsWith('data:')||url.startsWith('blob:'))return route.continue();return route.abort();}
        await safeUrl(url,req.isNavigationRequest());
        await route.continue();
      }catch{await route.abort().catch(()=>{});}
    });
    const page=await context.newPage();
    page.setDefaultTimeout(9000);
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
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:27000});
    await page.waitForTimeout(900);
    const login=await maybeLogin(page,user,password);
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
      const fallback=records.size===0&&result.items.length===0?sigmaCards.items:[];
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
      const signals=await page.evaluate(()=>({
        login:!!document.querySelector('input[type="password"]'),
        links:Array.from(document.querySelectorAll('nav a,aside a,[role="navigation"] a')).length,
        visibleMenus:Array.from(document.querySelectorAll('a,button,[role="menuitem"]')).filter(el=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0}).length,
        ready:document.readyState
      })).catch(()=>({login:false,links:0,visibleMenus:0,ready:'unknown'}));
      const evidence=signals.login?'A tela ainda contém campo de senha; autenticação não confirmada.':'A autenticação ainda não pôde ser confirmada.';
      console.log('CLYSTRIA_SYNC_DIAGNOSTIC '+JSON.stringify({stage:destination,loginField:signals.login,navLinks:signals.links,controls:signals.visibleMenus,json:scannedJsonResponses,rows:rawRows,valid:records.size}));
      failure(422,evidence+' Navegação: '+reason+'. Menu(s): '+signals.links+'; respostas de dados: '+scannedJsonResponses+'. Nenhum cliente foi alterado.');
    }
    return {ok:true,clients:[...records.values()],plans:[],warning:'',
      diagnostics:{login,section:destination,pages:scanned,rows_seen:rawRows,valid_clients:records.size,json_responses:scannedJsonResponses,source:captured.size?'pagina_e_requisicoes_da_sessao':'pagina'}};
  }catch(e){
    if(/ERR_HTTP_RESPONSE_CODE_FAILURE|net::ERR_/i.test(String(e.message)))failure(502,'Falha de navegação ou resposta do fornecedor; confirme a URL e o acesso HTTPS.');
    throw e;
  }finally{
    if(context)await context.close().catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
  }
}
let browserSelfTest='pending';
async function testChromium(){
 let browser;
 try{
  browser=await chromium.launch({executablePath:BROWSER_PATH,headless:true,timeout:22000,
    args:['--disable-dev-shm-usage','--no-sandbox','--disable-gpu','--no-first-run','--disable-background-networking']});
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
    if(req.method!=='POST'||!['/sync','/ping'].includes(req.url))return json(res,404,{error:'Recurso não encontrado'});
    if(SECRET.length<32)return json(res,503,{error:'Serviço sem token de autenticação'});
    const supplied=(req.headers.authorization||'').replace(/^Bearer /i,'');
    if(!equals(supplied,SECRET))return json(res,401,{error:'Não autorizado'});
    if(req.url==='/ping')return json(res,browserSelfTest==='ok'?200:503,{ok:browserSelfTest==='ok',browser_self_test:browserSelfTest});
    if(busy)return json(res,429,{error:'Uma sincronização já está em execução; tente novamente'});
    busy=true;acquired=true;
    let body='';for await(const chunk of req){body+=chunk;if(body.length>12000)failure(413,'Solicitação muito grande');}
    let job;try{job=JSON.parse(body);}catch{failure(400,'JSON inválido');}
    const payload=await runJob(job);
    return json(res,200,payload);
  }catch(e){
    // Never print submitted credentials, cookies or HTML from authenticated pages.
    const status=Number(e.status)||502;
    return json(res,status,{error:clean(e.message||'Falha na navegação',250),code:status});
  }finally{if(acquired)busy=false;}
});
server.listen(PORT,'0.0.0.0',()=>console.log('CLYSTRIA_BROWSER_WORKER_READY'));
