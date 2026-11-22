import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';
import { timingSafeEqual, randomUUID } from 'node:crypto';
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
  await page.waitForTimeout(1600);
  if(await isChallenge(page))failure(409,'Após o login, o fornecedor exigiu um desafio Cloudflare. Não é possível automatizar sua resolução.');
  if(await page.locator('input[type="password"]').count()){
    const text=await page.locator('body').innerText({timeout:2000}).catch(()=>'');
    if(/credenciais inv[aá]lidas|senha incorreta|login inv[aá]lido|invalid password|invalid credentials/i.test(text))failure(401,'Credenciais recusadas pelo painel');
    failure(422,'Login não confirmado. O formulário deste fornecedor precisa de um adaptador específico.');
  }
  return 'form_submitted';
}
async function navigateClients(page){
  const current=await extract(page);
  if(current.items.length&&current.recognized)return 'already_on_clients';
  const sections=page.locator('a, button, [role="menuitem"], [role="tab"], [role="link"], [data-menu], [data-testid]');
  const count=Math.min(await sections.count(),260);
  let candidate=null;
  for(let i=0;i<count;i++){
    const node=sections.nth(i);
    const label=clean(await node.innerText({timeout:350}).catch(()=>''),90).replace(/\s+/g,' ').trim();
    if(!label||label.length>60||!/^(clientes|assinantes|linhas|usuários|usuarios|meus clientes|minhas linhas|gerenciar clientes|lista de clientes|lista de usuários|lista de usuarios|clientes ativos|gerenciar linhas|acessos)(\s*\(\d+\))?$/i.test(label))continue;
    const href=await node.getAttribute('href').catch(()=>null);
    if(href&&href!=='#'){
      try{const url=new URL(href,page.url());if(url.origin!==new URL(page.url()).origin)continue;}catch{continue;}
    }
    candidate=node;break;
  }
  if(!candidate)return 'client_menu_not_found';
  const name=clean(await candidate.innerText().catch(()=>''),70);
  try{
    await candidate.click({timeout:5000});
    await page.waitForLoadState('domcontentloaded',{timeout:9000}).catch(()=>{});
    await page.waitForTimeout(1800);
    return name||'client_section';
  }catch{return 'menu_click_failed';}
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
function normalizeDate(value){
  const s=clean(value,70);
  let m=s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if(m){const d=new Date(m[0]+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===m[0]?m[0]:'';}
  m=s.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
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
    context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',
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
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:27000});
    await page.waitForTimeout(900);
    const login=await maybeLogin(page,user,password);
    const destination=await navigateClients(page);
    if(await isChallenge(page))failure(409,'Painel protegido por desafio Cloudflare; automação não autorizada para resolver o desafio');
    const records=new Map();
    let scanned=0,recognized=false,rawRows=0;
    for(let i=0;i<8;i++){
      const result=await extract(page);
      recognized=recognized||result.recognized>0;
      rawRows+=result.items.length;
      for(const r of result.items){const c=asClient(r);if(c)records.set(c.username.toLowerCase(),c);}
      scanned++;
      if(!result.recognized||!await nextPage(page))break;
    }
    if(!recognized)failure(422,'Login efetuado, mas nenhuma lista de clientes foi reconhecida. Use Navegador VPS para abrir manualmente a tela Clientes/Linhas e importar a partir dessa página.');
    if(!records.size)failure(422,'O painel carregou, mas não foi possível validar login e vencimento de nenhum cliente. Nenhum dado foi importado. Abra a lista Clientes/Linhas pelo Navegador VPS.');
    return {ok:true,clients:[...records.values()],plans:[],warning:records.size===0?'Lista de clientes vazia ou não reconhecida; revise antes de considerar sincronizado.':'',
      diagnostics:{login,section:destination,pages:scanned,rows_seen:rawRows,valid_clients:records.size}};
  }catch(e){
    if(/ERR_HTTP_RESPONSE_CODE_FAILURE|net::ERR_/i.test(String(e.message)))failure(502,'Falha de navegação ou resposta do fornecedor; confirme a URL e o acesso HTTPS.');
    throw e;
  }finally{
    if(context)await context.close().catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
  }
}

/* Interactive, human-operated Chromium session. No automated challenge solving. */
let live=null;
const LAUNCH_ARGS=['--disable-dev-shm-usage','--no-sandbox','--disable-gpu','--no-first-run','--disable-background-networking'];
async function liveClose(){
  const old=live;live=null;
  if(old){await old.context.close().catch(()=>{});await old.browser.close().catch(()=>{});}
}
function liveSession(job){
  if(!live||live.id!==String(job.session||'')||live.panelId!==String(job.panel_id||''))failure(404,'Sessão do navegador encerrada. Abra novamente.');
  if(Date.now()-live.lastSeen>15*60*1000)failure(410,'Sessão expirada por inatividade. Abra novamente.');
  live.lastSeen=Date.now();
  return live;
}
async function liveFrame(item){
  const page=item.page;
  if(page.isClosed())failure(410,'Página encerrada; abra uma nova sessão');
  const image=await page.screenshot({type:'jpeg',quality:57,animations:'disabled',timeout:18000});
  return {ok:true,session:item.id,screen:'data:image/jpeg;base64,'+image.toString('base64'),
    width:1100,height:720,url:clean(page.url(),450),title:clean(await page.title().catch(()=>''),130)};
}
async function liveOpen(job){
  if(!ALLOW.length)failure(503,'Configure ALLOWED_PANEL_HOSTS no serviço Chromium');
  const url=(await safeUrl(job.url,true)).href;
  const panelId=clean(job.panel_id,64);
  if(!/^[a-f0-9]{32}$/.test(panelId))failure(400,'Identificação do painel inválida');
  await liveClose();
  let browser,context;
  try{
    browser=await chromium.launch({executablePath:BROWSER_PATH,headless:true,timeout:23000,args:LAUNCH_ARGS});
    context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',
      viewport:{width:1100,height:720},deviceScaleFactor:1,acceptDownloads:false,
      serviceWorkers:'block',ignoreHTTPSErrors:false});
    await context.route('**/*',async route=>{
      try{
        const req=route.request(),target=req.url();
        if(!target.startsWith('https://')){
          if(target.startsWith('data:')||target.startsWith('blob:'))return route.continue();
          return route.abort();
        }
        await safeUrl(target,req.isNavigationRequest());
        return route.continue();
      }catch{return route.abort().catch(()=>{});}
    });
    const page=await context.newPage();page.setDefaultTimeout(10000);
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    live={id:randomUUID(),panelId,username:clean(job.username,160),password:String(job.password||''),
      browser,context,page,lastSeen:Date.now()};
    return await liveFrame(live);
  }catch(e){
    if(context)await context.close().catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
    throw e;
  }
}
async function liveAction(job){
  const item=liveSession(job),page=item.page,action=clean(job.action,30);
  if(action==='click'){
    const x=Number(job.x),y=Number(job.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1100||y<0||y>720)failure(400,'Posição inválida');
    await page.mouse.click(x,y,{timeout:8000});
  }else if(action==='type'){
    const value=String(job.text||'');
    if(value.length>1000)failure(413,'Texto excessivo');
    await page.keyboard.insertText(value);
  }else if(action==='key'){
    const key=clean(job.key,30);
    if(!['Enter','Tab','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key))failure(400,'Tecla não aceita');
    await page.keyboard.press(key);
  }else if(action==='scroll'){
    const dy=Math.max(-900,Math.min(900,Number(job.dy)||0));
    await page.mouse.wheel(0,dy);
  }else if(action==='reload'){
    await page.reload({waitUntil:'domcontentloaded',timeout:25000});
  }else if(action==='autofill'){
    if(!item.username||!item.password)failure(422,'Salve usuário e senha na conexão antes de preencher o login');
    let user=page.locator('input[autocomplete="username"],input[name*="user" i],input[name*="login" i],input[name*="email" i],input[type="email"]').first();
    if(!await user.count())user=page.locator('input[type="text"]').first();
    const pass=page.locator('input[type="password"]').first();
    if(!await user.count()||!await pass.count())failure(422,'Campos de login ainda não visíveis; navegue até o login no site');
    await user.fill(item.username);await pass.fill(item.password);
  }else failure(400,'Ação não permitida');
  await page.waitForTimeout(380);
  return await liveFrame(item);
}
async function liveImport(job){
  const item=liveSession(job),page=item.page;
  if(await isChallenge(page))failure(409,'O painel ainda exibe verificação de segurança. Conclua manualmente no navegador, se permitido, antes de importar.');
  const destination='manual_selection';
  const records=new Map();let scanned=0,rawRows=0,recognized=false;
  for(let i=0;i<8;i++){
    const result=await extract(page);scanned++;
    recognized=recognized||result.recognized>0;rawRows+=result.items.length;
    for(const entry of result.items){const client=asClient(entry);if(client)records.set(client.username.toLowerCase(),client);}
    if(!result.recognized||!await nextPage(page))break;
  }
  if(!recognized)failure(422,'A sessão está aberta, mas não identifiquei a tabela de clientes. Abra a lista de clientes no navegador e tente novamente.');
  if(!records.size)failure(422,'Nenhum cliente com usuário e vencimento válido nesta tela. Abra a lista de Clientes/Linhas e tente novamente; nada foi importado.');
  return {ok:true,clients:[...records.values()],plans:[],
    warning:records.size?'':'A lista encontrada está vazia. Confira o resultado antes de usar.',
    diagnostics:{section:destination,pages:scanned,rows_seen:rawRows,valid_clients:records.size}};
}
setInterval(()=>{if(live&&Date.now()-live.lastSeen>15*60*1000)liveClose().catch(()=>{});},60000).unref();

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
    if(req.method!=='POST'||!['/sync','/ping','/live/open','/live/frame','/live/action','/live/import','/live/close'].includes(req.url))return json(res,404,{error:'Recurso não encontrado'});
    if(SECRET.length<32)return json(res,503,{error:'Serviço sem token de autenticação'});
    const supplied=(req.headers.authorization||'').replace(/^Bearer /i,'');
    if(!equals(supplied,SECRET))return json(res,401,{error:'Não autorizado'});
    if(req.url==='/ping')return json(res,browserSelfTest==='ok'?200:503,{ok:browserSelfTest==='ok',browser_self_test:browserSelfTest,interactive:true});
    const heavy=['/sync','/live/open','/live/import'].includes(req.url);
    if(heavy&&busy)return json(res,429,{error:'O Chromium está atendendo outra operação'});
    if(req.url==='/sync'&&live)return json(res,409,{error:'Encerre a sessão interativa antes de usar a sincronização automática'});
    if(heavy){busy=true;acquired=true;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>12000)failure(413,'Solicitação muito grande');}
    let job;try{job=JSON.parse(body);}catch{failure(400,'JSON inválido');}
    if(req.url==='/live/open')return json(res,200,await liveOpen(job));
    if(req.url==='/live/frame')return json(res,200,await liveFrame(liveSession(job)));
    if(req.url==='/live/action')return json(res,200,await liveAction(job));
    if(req.url==='/live/import')return json(res,200,await liveImport(job));
    if(req.url==='/live/close'){liveSession(job);await liveClose();return json(res,200,{ok:true});}
    return json(res,200,await runJob(job));
  }catch(e){
    // Never print submitted credentials, cookies or HTML from authenticated pages.
    const status=Number(e.status)||502;
    return json(res,status,{error:clean(e.message||'Falha na navegação',250),code:status});
  }finally{if(acquired)busy=false;}
});
server.listen(PORT,'0.0.0.0',()=>console.log('CLYSTRIA_BROWSER_WORKER_READY'));
