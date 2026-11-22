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
  const links=page.locator('a, button, [role="menuitem"], [role="tab"]');
  const count=Math.min(await links.count(),130);
  for(let i=0;i<count;i++){
    const node=links.nth(i);
    const text=clean(await node.innerText({timeout:600}).catch(()=>''),80);
    if(!/^(clientes|assinantes|usuários|usuarios|meus clientes|gerenciar clientes|lista de clientes|linhas)$/i.test(text))continue;
    const href=await node.getAttribute('href').catch(()=>null);
    if(href&&href!=='#'){
      try{let url=new URL(href,page.url());if(url.hostname!==new URL(page.url()).hostname)continue;}catch{continue;}
    }
    try{await node.click({timeout:4000});await page.waitForLoadState('domcontentloaded',{timeout:7000}).catch(()=>{});await page.waitForTimeout(1000);return text;}catch{}
  }
  return 'no_link';
}
async function extract(page){
 return await page.evaluate(()=>{
   const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
   const rules={
    username:/^(usuario|login|user|username|acesso|identificador|linha|usuario de acesso)$/,
    name:/^(nome|nome completo|cliente|assinante|titular|name|customer|full name)$/,
    due_date:/(vencimento|expiracao|expires|expiration|validade|data vencimento|valid until|due date)/,
    phone:/(telefone|whatsapp|celular|phone|mobile)/,
    status:/(situacao|status|estado)/,
    plan_name:/(plano|pacote|plan|package)/,
    price:/(valor|preco|price|mensalidade)/
   };
   const pick=h=>Object.keys(rules).find(k=>rules[k].test(normalized(h)))||null;
   let found=[],recognized=0;
   const tables=Array.from(document.querySelectorAll('table')).slice(0,6);
   for(const table of tables){
    const headerCells=Array.from(table.querySelectorAll('thead th'));
    const fallback=headerCells.length?headerCells:Array.from(table.querySelectorAll('tr:first-child th'));
    const heads=fallback.map(x=>pick(x.textContent));
    if(!heads.includes('username')&&!heads.includes('due_date'))continue;
    recognized++;
    const rows=Array.from(table.querySelectorAll('tbody tr')).slice(0,300);
    for(const tr of rows){
      const cells=Array.from(tr.querySelectorAll('td'));
      if(!cells.length)continue;
      const item={};
      cells.forEach((cell,i)=>{const field=heads[i];if(field&&field!=='password')item[field]=(cell.innerText||cell.textContent||'').trim().slice(0,220);});
      if(item.username||item.due_date)found.push(item);
    }
   }
   if(!found.length){
    const cards=Array.from(document.querySelectorAll('[data-client-id], [data-user-id], .client-card, .customer-card, .user-card')).slice(0,220);
    for(const el of cards){
      const txt=(el.innerText||'').slice(0,1300);
      const match=(re)=>txt.match(re)?.[1]?.trim()||'';
      const username=match(/(?:login|usu[aá]rio|user)\s*[:\-]\s*([^\n]+)/i);
      const due_date=match(/(?:vencimento|validade|expira(?:ção|cao))\s*[:\-]\s*([^\n]+)/i);
      if(username&&due_date)found.push({
       username,due_date,name:match(/(?:nome|cliente)\s*[:\-]\s*([^\n]+)/i)||username,
       phone:match(/(?:telefone|whatsapp)\s*[:\-]\s*([^\n]+)/i),
       status:match(/(?:situa(?:ção|cao)|status)\s*[:\-]\s*([^\n]+)/i)
      });
    }
    if(cards.length&&found.length)recognized++;
   }
   return {items:found,recognized,tables:tables.length};
 });
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
  const n=page.getByRole('button',{name:/^pr[oó]xim[ao]|^next/i}).last();
  if(await n.count()&&await n.isEnabled().catch(()=>false)){
    try{await n.click({timeout:2000});await page.waitForTimeout(700);return true;}catch{}
  }
  const a=page.getByRole('link',{name:/^pr[oó]xim[ao]|^next/i}).last();
  if(await a.count()){
    try{await a.click({timeout:2000});await page.waitForTimeout(700);return true;}catch{}
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
    if(!recognized)failure(422,'Login realizado, mas não foi possível identificar a tabela de clientes no painel. Será necessário configurar os seletores específicos desta versão.');
    if(!records.size&&rawRows)failure(422,'Tabela de clientes localizada, mas faltam login e vencimento reconhecíveis; nenhum registro foi importado.');
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
const server=http.createServer(async(req,res)=>{
  let acquired=false;
  try{
    if((req.method==='GET'||req.method==='HEAD')&&(req.url==='/'||req.url==='/health'))return json(res,200,{ok:true,service:'clystria-browser-worker',browser:'chromium',configured:SECRET.length>=32&&ALLOW.length>0});
    if(req.method!=='POST'||req.url!=='/sync')return json(res,404,{error:'Recurso não encontrado'});
    if(SECRET.length<32)return json(res,503,{error:'Serviço sem token de autenticação'});
    const supplied=(req.headers.authorization||'').replace(/^Bearer /i,'');
    if(!equals(supplied,SECRET))return json(res,401,{error:'Não autorizado'});
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
