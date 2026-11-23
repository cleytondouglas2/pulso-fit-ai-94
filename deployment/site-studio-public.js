/* ARGUS Pay Site Studio — public, published configuration only.
 * Every configurable field is textContent, a safe URL, theme color or a toggle.
 * No HTML injection, cookies, local storage or access to financial endpoints.
 */
(()=>{'use strict';
const get=id=>document.getElementById(id);
const previewMode=new URLSearchParams(location.search).has('argus_studio_preview');
let manifest=null,ready=false,pendingPreview=null;
const originalNodes=new WeakMap();
const validUrl=value=>typeof value==='string'&&(
 /^\/(?!\/)[a-zA-Z0-9/_\-.?#=&%]+$/.test(value)||
 /^https:\/\/[a-z0-9.-]+(?::443)?(?:\/[^\s]*)?$/i.test(value)
);
function setAttr(el,name,value){
 if(el&&validUrl(value))el.setAttribute(name,value);
}
function apply(settings){
 if(!settings||typeof settings!=='object'||!manifest)return;
 const root=document.documentElement;
 const colors={'theme.gold':'--gold','theme.gold2':'--gold-2','theme.bg':'--bg','theme.muted':'--muted'};
 for(const [field,variable] of Object.entries(colors)){
  const color=settings[field];
  if(typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))root.style.setProperty(variable,color);
 }
 const name=typeof settings['brand.name']==='string'&&settings['brand.name']?settings['brand.name']:'ARGUS Pay';
 if(typeof settings['seo.title']==='string'&&settings['seo.title'])document.title=settings['seo.title'];
 const meta={
  'seo.description':'meta[name="description"]',
  'seo.og_title':'meta[property="og:title"]',
  'seo.og_description':'meta[property="og:description"]'
 };
 for(const [key,selector] of Object.entries(meta)){
  if(typeof settings[key]==='string')
   document.querySelector(selector)?.setAttribute('content',settings[key]);
 }
 const logo=settings['brand.logo'];
 if(validUrl(logo))document.querySelectorAll('.brand img,.footer-about img').forEach(img=>{
  setAttr(img,'src',logo);img.alt=name;
 });
 if(validUrl(settings['brand.favicon'])){
  setAttr(document.querySelector('link[rel="icon"]'),'href',settings['brand.favicon']);
  setAttr(document.querySelector('link[rel="apple-touch-icon"]'),'href',settings['brand.favicon']);
 }
 setAttr(document.querySelector('meta[property="og:image"]'),'content',settings['seo.og_image']);
 // Copy fragments are assigned to original text nodes only. Inner markup,
 // emphasis, arrows and icon spans are never replaced or parsed as HTML.
 for(const field of manifest.fields||[]){
  const key=field.key,changed=settings[key];
  if(typeof changed!=='string'||!field.target)continue;
  const el=document.querySelector(field.target.selector);
  const node=el?.childNodes[field.target.node_index];
  if(!node||node.nodeType!==Node.TEXT_NODE)continue;
  if(!originalNodes.has(node))originalNodes.set(node,String(node.nodeValue||''));
  const original=originalNodes.get(node);
  const start=(original.match(/^\s*/u)||[''])[0],end=(original.match(/\s*$/u)||[''])[0];
  node.nodeValue=start+changed+end;
 }
 const signup=settings['cta.signup_url'],login=settings['cta.login_url'];
 if(validUrl(signup))document.querySelectorAll('a[href="/cadastro"],a[data-studio-signup]').forEach(a=>setAttr(a,'href',signup));
 if(validUrl(login))document.querySelectorAll('a[href="/conta"],a[data-studio-login]').forEach(a=>setAttr(a,'href',login));
 const actionText=settings['cta.signup_text'],loginText=settings['cta.login_text'];
 const action=document.querySelector('.header-cta'),loginAction=document.querySelector('.login-link');
 if(action&&typeof actionText==='string'){
  let node=[...action.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
  if(node)node.nodeValue=actionText+' ';
 }
 if(loginAction&&typeof loginText==='string')loginAction.textContent=loginText;
 for(const [key,selector] of Object.entries({
  'sections.platform':'.intro-section',
  'sections.management':'.story-section',
  'sections.steps':'.steps-section',
  'sections.security':'.security-section',
  'sections.integrations':'.integration-section',
  'sections.faq':'.faq-section',
  'sections.ranking':'#ranking'
 })){
  const element=document.querySelector(selector);
  if(element&&typeof settings[key]==='boolean')element.hidden=!settings[key];
 }
 const hero=document.querySelector('.hero');
 let image=get('argus-studio-hero-image');
 if(hero&&validUrl(settings['hero.background_image'])&&settings['hero.background_image']){
  if(!image){image=document.createElement('div');image.id='argus-studio-hero-image';hero.prepend(image);}
  image.style.backgroundImage='linear-gradient(90deg,rgba(8,12,18,.88),rgba(8,12,18,.4)),url("'+settings['hero.background_image'].replace(/["\\]/g,'')+'")';
  image.style.opacity=String(Math.max(0,Math.min(100,Number(settings['hero.background_opacity'])||25))/100);
  image.hidden=false;
 }else if(image)image.hidden=true;
 let banner=get('argus-studio-announcement');
 if(settings['announcement.enabled']){
  if(!banner){
   banner=document.createElement('div');banner.id='argus-studio-announcement';
   banner.className='argus-studio-announcement';
   const header=document.querySelector('.site-header');
   header?.insertAdjacentElement('afterend',banner);
  }
  banner.replaceChildren();
  const link=document.createElement('a');
  const url=settings['announcement.url'];
  if(validUrl(url))link.href=url;else link.removeAttribute('href');
  link.textContent=String(settings['announcement.text']||'')+'  ↗';
  banner.append(link);banner.hidden=false;
 }else if(banner)banner.hidden=true;
 const footer=document.querySelector('.footer-bottom span:first-child');
 if(footer&&typeof settings['footer.legal_name']==='string'){
  const year=new Date().getFullYear();
  footer.textContent='© '+year+' '+(settings['footer.legal_name']||name)+'. Todos os direitos reservados.';
 }
 const second=document.querySelector('.footer-bottom span:nth-child(2)');
 if(second&&typeof settings['footer.tagline']==='string'){
  // Keep the original Admin link unchanged.
  const child=[...second.childNodes].find(n=>n.nodeType===3);
  if(child)child.nodeValue=settings['footer.tagline']+'  ';
 }
 const contactRoot=document.querySelector('.site-footer .footer-top');
 let contacts=get('argus-studio-contact');
 if(contactRoot&&!contacts){contacts=document.createElement('div');contacts.id='argus-studio-contact';contacts.className='argus-studio-contact';contactRoot.append(contacts);}
 if(contacts){
  contacts.replaceChildren();
  const create=(label,url)=>{
   if(!validUrl(url))return;
   const a=document.createElement('a');a.textContent=label;a.href=url;
   if(!url.startsWith('/')){a.target='_blank';a.rel='noopener noreferrer';}
   contacts.append(a);
  };
  const email=settings['contact.email'];
  if(typeof email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
   const a=document.createElement('a');a.textContent='✉ '+email;a.href='mailto:'+email;contacts.append(a);
  }
  const phone=settings['contact.whatsapp'];
  if(typeof phone==='string'&&/^[1-9][0-9]{9,14}$/.test(phone))create('◉ WhatsApp','https://wa.me/'+phone);
  create('◎ Instagram',settings['contact.instagram']);
  create('↗ Telegram',settings['contact.telegram']);
  create('◈ Central de ajuda',settings['contact.support_url']);
  contacts.hidden=settings['social.display']===false||contacts.children.length===0;
 }
}
async function load(){
 try{
  const [m,c]=await Promise.all([
   fetch('/static/site-studio-manifest.json?v=1',{cache:'force-cache',credentials:'omit'}),
   fetch('/api/public/site-studio',{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}})
  ]);
  if(!m.ok||!c.ok)return;
  manifest=await m.json();const response=await c.json();
  if(response&&response.settings)apply(response.settings);
  ready=true;
  if(pendingPreview){apply(pendingPreview);pendingPreview=null;}
 }catch(_){/* Preserve the original functional website when configuration is unavailable. */}
}
if(previewMode){
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==window.parent||e.data?.kind!=='ARGUS_SITE_STUDIO_PREVIEW')return;
  if(!ready||!manifest){pendingPreview=e.data.settings;return;}
  apply(e.data.settings);
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();