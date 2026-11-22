/* ELNEX Experience • nova interface independente das rotinas de autenticacao */
let elnexSenseMode='opener';
let elnexPendingReaction=false;
const elnexSkills=[
 {mode:'opener',title:'Coach de conversa',hint:'Quebre o gelo naturalmente',icon:'💬',cta:'Criar abertura',placeholder:'Ex.: Nós dois gostamos de cinema, viagens e comida japonesa. Quero começar uma conversa divertida.'},
 {mode:'insight',title:'Chemistry Lab',hint:'Explore afinidades com cuidado',icon:'⚡',cta:'Explorar afinidades',placeholder:'Ex.: Gosto de viajar, rotina tranquila e conversas profundas. O que posso observar numa conexão?'},
 {mode:'profile',title:'Perfil magnético',hint:'Mostre sua personalidade',icon:'✦',cta:'Melhorar minha apresentação',placeholder:'Ex.: Sou uma pessoa divertida, gosto de música, trilhas e cozinhar no fim de semana.'},
 {mode:'date',title:'Real Date',hint:'Ideias de encontros seguros',icon:'☕',cta:'Sugerir encontro',placeholder:'Ex.: Primeiro encontro, gosto de cafeterias e lugares movimentados, prefiro algo leve.'}
];
function elxButton(id,text,cl='btn'){return '<button class="'+cl+'" id="'+id+'">'+text+'</button>'}
function elxFirst(){return String(profile?.display_name||'').trim().split(/\s+/)[0]||'Você'}
function elxMyChecks(){return [
 {key:'display_name',done:Boolean(profile?.display_name?.trim()),title:'Nome de apresentação'},
 {key:'birth_date',done:Boolean(privateProfile?.birth_date),title:'Maioridade e idade'},
 {key:'bio',done:Boolean(profile?.bio?.trim()),title:'Sua história'},
 {key:'photo',done:Boolean(profile?.photos?.length),title:'Foto autêntica'},
 {key:'interests',done:Boolean(profile?.interests?.length),title:'Gostos e interesses'},
 {key:'location',done:Boolean(privateProfile?.location_enabled),title:'Localização opcional'}
 ]}
function elxPercent(){const a=elxMyChecks();return Math.round(a.filter(x=>x.done).length/a.length*100)}
function elxEmpty(opts={}){
const ico=opts.icon||'♡',title=opts.title||'Sua próxima conexão começa aqui',description=opts.description||'Conexões reais levam tempo. Explore as possibilidades do ELNEX.',cta=opts.cta||'Completar perfil',cb=opts.action||'profile';
return '<section class="empty-elegant motion-in"><div class="empty-illustration" aria-hidden="true">'+ico+'</div><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p><button class="btn" data-nav="'+esc(cb)+'">'+esc(cta)+'</button></section>'
}
function elxWireNav(root=document){root.querySelectorAll('[data-nav]').forEach(node=>{node.onclick=()=>switchTab(node.dataset.nav)})}
function elxWireStandard(root=document){elxWireNav(root);root.querySelectorAll('[data-filters]').forEach(node=>node.onclick=elxOpenFilters)}
function elxSafeProfilePhoto(p){const src=safeImg(p?.photos?.[0]||p?.other_avatar||'');return src?'<img src="'+esc(src)+'" loading="lazy" alt="Foto do perfil">':'<span aria-hidden="true">♡</span>'}
function elxWelcome(){
const percent=elxPercent();const checks=elxMyChecks();const count=checks.filter(x=>x.done).length;
return '<div class="home-steps"><div class="section-head"><div><div class="eyebrow">SEU COMEÇO</div><h3>Seu perfil, sua essência.</h3></div><span class="tag-rose">✦ '+percent+'% completo</span></div><div class="progress-bg" role="progressbar" aria-label="Progresso do seu perfil" aria-valuenow="'+percent+'" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:'+percent+'%"></div></div><p class="muted small">'+count+' de '+checks.length+' etapas completadas. '+(percent===100?'Tudo pronto para conhecer novas pessoas.':'Quanto mais você se apresenta, melhor será a experiência.')+'</p><div class="feature-list">'+checks.filter(x=>!x.done).slice(0,3).map(x=>'<div class="feature-row"><span class="feature-icon">✦</span><div><strong>'+esc(x.title)+'</strong><small>Personalize seu espaço ELNEX</small></div></div>').join('')+(percent===100?'<div class="welcome-signal"><span class="emoji">💜</span><div><strong>Perfil preparado!</strong><p>Experimente descobrir pessoas e explorar a IA Sense.</p></div></div>':'')+'</div><button class="btn" data-nav="profile" style="margin-top:18px">Editar meu perfil</button></div>';
}
async function loadHome(){
 const route=elnexNavigationToken;
 const first=esc(elxFirst()),complete=elxPercent(),ready=Boolean(privateProfile?.birth_date&&privateProfile?.location_enabled);
 let people=[];
 if(ready){try{const r=await rpc('discover_people',{p_limit:8});if(Array.isArray(r))people=r}catch{}}
 if(route!==elnexNavigationToken)return;
 const snippets=people.length?
  '<div class="tiny-list">'+people.slice(0,6).map(p=>'<button class="tiny-profile" data-nav="discover"><div class="tiny-photo">'+elxSafeProfilePhoto(p)+'</div><strong>'+esc(p.display_name||'Pessoa ELNEX')+', '+esc(p.age||'18+')+'</strong><small>'+esc(p.city||'')+' · '+esc(p.compatibility)+'% afinidade</small></button>').join('')+'</div>':
  '<div class="welcome-signal"><span class="emoji">🌷</span><div><strong>A comunidade ELNEX está começando</strong><p>Ainda não há pessoas disponíveis nos seus filtros. Não mostramos perfis fictícios: as conexões aparecerão quando usuários reais participarem.</p></div></div>';
 $('#content').innerHTML='<div class="home motion-in">'+
 '<section class="home-hero"><div class="hero-copy"><div class="tag">♡ FEITO PARA CONEXÕES DE VERDADE</div><h2>Oi, '+first+'.<br>Alguém especial pode estar <span>mais perto</span> do que imagina.</h2><p>Descubra histórias, compartilhe afinidades e viva uma experiência de relacionamento com personalidade.</p><div class="hero-actions">'+elxButton('homeDiscover','♡ Explorar conexões')+elxButton('homeSense','✦ Conhecer o Sense','btn alt')+'</div></div><div class="hero-art" aria-hidden="true"><div class="orbit-three"></div><div class="orbit-one"></div><div class="orbit-two"></div><div class="art-core"><span class="heart-art">♡</span></div><div class="art-pill p1">✦ Boa energia</div><div class="art-pill p2">💜 Afinidades reais</div><div class="art-pill p3">☀ Novas histórias</div></div></section>'+
 '<section class="start-cards"><button data-nav="discover" class="start-tile"><i>💞</i><strong>Descobrir</strong><small>Perfis reais</small></button><button data-nav="sense" class="start-tile"><i>✨</i><strong>ELNEX Sense</strong><small>IA para você</small></button><button data-nav="events" class="start-tile"><i>☕</i><strong>Experiências</strong><small>Conexão fora da tela</small></button></section>'+
 '<div class="home-grid"><section class="home-section">'+elxWelcome()+'</section><section class="home-section"><div class="section-head"><div><div class="eyebrow">ELNEX SENSE</div><h3>Mais do que aparência.</h3></div><span class="tag-rose">✨ SUA IA</span></div><div class="ai-orb" style="margin:7px 0 22px">✦</div><p>Ajuda para escrever uma biografia autêntica, conversar com naturalidade, entender afinidades e planejar encontros seguros.</p><div class="feature-list"><div class="feature-row"><span class="feature-icon">💬</span><div><strong>Coach de conversa</strong><small>Inspirações sem cantadas prontas</small></div></div><div class="feature-row"><span class="feature-icon">⚡</span><div><strong>Chemistry Lab</strong><small>Compatibilidade explicável</small></div></div></div><button data-nav="sense" class="btn" style="margin-top:19px">Entrar no ELNEX Sense ✦</button></section></div>'+
 '<section class="home-section"><div class="section-head"><div><div class="eyebrow">PESSOAS QUE COMBINAM</div><h3>Possibilidades perto de você</h3></div><button class="btn alt" data-nav="discover">Explorar →</button></div>'+snippets+'</section></div>';
 $('#homeDiscover').onclick=()=>switchTab('discover');$('#homeSense').onclick=()=>switchTab('sense');elxWireStandard($('#content'));
}
function elxIntroCard({icon='♡',title,text,action='profile',label='Personalizar meu perfil',secondary='Explorar ELNEX Sense'}){
 $('#content').innerHTML='<div class="home" style="max-width:980px;margin:auto">'+elxEmpty({icon,title,description:text,action,cta:label})+
 '<div class="start-cards"><button class="start-tile" data-nav="sense"><i>✨</i><strong>Sense</strong><small>Seu assistente</small></button><button class="start-tile" data-nav="events"><i>☕</i><strong>Experiências</strong><small>Conexões reais</small></button><button class="start-tile" data-nav="home"><i>🏡</i><strong>Início</strong><small>Seu ELNEX</small></button></div></div>';elxWireStandard($('#content'))
}
async function discover(){
 const route=elnexNavigationToken;
 if(!privateProfile?.birth_date){
  elxIntroCard({icon:'♡',title:'O começo de uma boa história',text:'Complete seu perfil e informe sua data de nascimento para descobrir conexões reais. O ELNEX é para adultos de 18 anos ou mais.',label:'Completar perfil'});return;
 }
 if(!privateProfile?.location_enabled||privateProfile?.latitude===null||privateProfile?.longitude===null){
  $('#content').innerHTML='<div class="home" style="max-width:930px;margin:auto"><section class="home-hero"><div class="hero-copy"><div class="tag">⌁ CONEXÕES POR PERTO</div><h2>O amor pode estar <span>a alguns quilômetros</span> de você.</h2><p>Autorize a localização apenas se desejar. O app apresenta distâncias aproximadas e nunca mostra suas coordenadas.</p><div class="hero-actions"><button id="elxLocate" class="btn">Ativar localização</button><button data-nav="profile" class="btn alt">Minhas preferências</button></div></div><div class="hero-art" aria-hidden="true"><div class="art-core"><span class="heart-art">⌁</span></div><div class="orbit-one"></div><div class="orbit-two"></div></div></section></div>';
  $('#elxLocate').onclick=()=>locate();elxWireStandard($('#content'));return;
 }
 const found=await rpc('discover_people',{p_limit:40});
 if(route!==elnexNavigationToken)return;
 candidateList=found;
 if(!Array.isArray(candidateList))candidateList=[];
 renderPerson();
}
function renderPerson(){
 currentCandidate=candidateList.shift()||null;
 const p=currentCandidate;
 if(!p){
 $('#content').innerHTML='<div class="discover-wrap motion-in"><div class="discover-intro"><div><div class="tag">ELNEX DISCOVERY</div><h2>Encontros no seu ritmo</h2></div><button class="btn alt" data-filters>☷ Filtros</button></div><div style="grid-column:1/-1">'+elxEmpty({icon:'♡',title:'Toda história tem seu tempo.',description:'Ainda não há perfis reais dentro de seus filtros. Você pode ampliar a distância ou a faixa etária e procurar novamente.',action:'profile',cta:'Ajustar preferências'})+'<div class="start-cards" style="margin-top:16px"><button class="start-tile" data-nav="sense"><i>✦</i><strong>ELNEX Sense</strong><small>Explore sua afinidade</small></button><button class="start-tile" data-nav="events"><i>☕</i><strong>Eventos</strong><small>Conheça experiências</small></button><button class="start-tile" id="refreshPeople"><i>⌁</i><strong>Atualizar</strong><small>Buscar novamente</small></button></div></div></div>';
 $('#refreshPeople').onclick=()=>discover();elxWireStandard($('#content'));return;
 }
 const summary=(p.bio||'Uma nova história para conhecer.').slice(0,200);
 const matches=(p.interests||[]).slice(0,5).map(x=>'<span class="chip">'+esc(x)+'</span>').join('');
 $('#content').innerHTML='<div class="discover-wrap motion-in"><div class="discover-intro"><div><div class="tag"><span class="pulse-dot"></span> DESCOBRIR</div><h2>Alguém pode combinar com você</h2></div><button class="btn alt" data-filters>☷ Filtros</button></div>'+
 '<div class="discover-deck"><div class="person" id="activePerson">'+personImg(p)+'<div class="personText"><span class="person-badge">📍 '+esc(p.city||'Brasil')+' · '+esc(p.distance_km)+' km aprox.</span><h2>'+esc(p.display_name||'Pessoa ELNEX')+', '+esc(p.age)+'</h2><p>'+esc(summary)+'</p><div class="chips">'+matches+'</div></div></div><div class="actions"><button class="round" id="pass" aria-label="Passar perfil">✕</button><button class="round super" id="goSenseFromDeck" aria-label="Entender a compatibilidade">✦</button><button class="round like" id="like" aria-label="Curtir perfil">♡</button></div><p class="muted small" style="text-align:center">Deslize para a esquerda para passar ou para a direita para curtir.</p></div>'+
 '<div class="deck-side"><div class="card"><div class="eyebrow">✦ CONEXÃO EM POTENCIAL</div><div class="metric">'+esc(p.compatibility)+'%</div><div class="metric-label">Afinidade estimada</div><div class="progress-bg"><div class="progress-fill" style="width:'+esc(p.compatibility)+'%"></div></div><p class="muted small">Calculada a partir de interesses, valores e intenção em comum. Não é previsão de sentimentos.</p><button id="deckSense" class="btn alt">Entender minha afinidade</button></div><div class="card"><div class="eyebrow">SOBRE O PERFIL</div><h3 style="margin:10px 0">Muito mais que uma foto.</h3><p class="muted">'+esc(summary)+'</p><div class="chips">'+matches+'</div><button id="deckOpenAI" class="btn">✦ Conversa com IA</button></div></div></div>';
 $('#pass').onclick=()=>react('pass');
 $('#like').onclick=()=>react('like');
 for(const id of ['goSenseFromDeck','deckSense','deckOpenAI'])$('#'+id).onclick=()=>{elnexSenseMode=id==='deckSense'?'insight':'opener';switchTab('sense')};
 let sx=0,sy=0;
 const card=$('#activePerson');
 card.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
 card.addEventListener('touchend',e=>{
 const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
 if(Math.abs(dx)>78&&Math.abs(dx)>Math.abs(dy)*1.6)react(dx>0?'like':'pass');
 },{passive:true});
 elxWireStandard($('#content'));
}
async function react(action){
 const route=elnexNavigationToken;
 if(elnexPendingReaction||!currentCandidate)return;
 elnexPendingReaction=true;
 const selected=currentCandidate;
 const card=$('#activePerson');
 if(card){card.style.transform='translateX('+(action==='like'?60:-60)+'px) rotate('+(action==='like'?5:-5)+'deg)';card.style.opacity='.52'}
 try{
  const result=await rpc('react_to_profile',{p_target:selected.id,p_action:action});
  if(route!==elnexNavigationToken)return;
  if(navigator.vibrate)try{navigator.vibrate(action==='like'?35:15)}catch{}
  if(result?.matched){
    $('#content').innerHTML='<div class="match-celebrate card" style="max-width:650px;margin:30px auto;padding:45px 24px"><div class="hearts">💗</div><div class="tag">A HISTÓRIA COMEÇA AQUI</div><h2>É um match!</h2><p class="muted">Vocês se curtiram. Uma conexão real acaba de começar.</p><div class="hero-actions" style="justify-content:center"><button class="btn" id="startChat">Começar conversa</button><button class="btn alt" id="keepExploring">Continuar explorando</button></div></div>';
    $('#startChat').onclick=()=>switchTab('matches');$('#keepExploring').onclick=renderPerson;
  }else{renderPerson()}
 }catch(e){flash(e.message);if(card){card.style.transform='';card.style.opacity=''}}
 finally{elnexPendingReaction=false}
}
function elxOpenFilters(){
 if(!me)return;
 const prior=document.querySelector('#elxFilterModal');if(prior)prior.remove();
 const min=Number(privateProfile?.age_min||18),max=Number(privateProfile?.age_max||75),radius=Number(privateProfile?.radius_km||80);
 const overlay=document.createElement('div');overlay.id='elxFilterModal';overlay.style.cssText='position:fixed;inset:0;z-index:500;background:#08111cbd;backdrop-filter:blur(12px);display:grid;place-items:end center;padding:16px';
 overlay.innerHTML='<section style="width:min(100%,440px);background:linear-gradient(145deg,#233042,#17202d);border:1px solid #4c76b1;border-radius:27px;padding:25px 22px;box-shadow:0 25px 70px #0009"><div class="section-head"><h2 style="margin:0">Seus filtros ♡</h2><button class="btn alt" id="closeFilters">✕</button></div><p class="muted">Você escolhe quem deseja conhecer. Os filtros são respeitados pelos dois lados.</p><form id="filterForm"><label>Idade mínima</label><input type="number" id="elxAgeMin" min="18" max="100" value="'+min+'" required><label>Idade máxima</label><input type="number" id="elxAgeMax" min="18" max="100" value="'+max+'" required><label>Distância máxima (km)</label><input type="number" id="elxRadius" min="1" max="500" value="'+radius+'" required><button class="btn" style="width:100%;margin-top:20px">Aplicar filtros</button></form><p class="muted small">A distância é exibida de forma aproximada, nunca exata.</p></section>';
 document.body.appendChild(overlay);
 overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
 overlay.querySelector('#closeFilters').onclick=()=>overlay.remove();
 overlay.querySelector('#filterForm').onsubmit=async e=>{
  e.preventDefault();const a=+overlay.querySelector('#elxAgeMin').value,b=+overlay.querySelector('#elxAgeMax').value,c=+overlay.querySelector('#elxRadius').value;
  if(a<18||b>100||a>b||c<1||c>500)return flash('Verifique as faixas de idade e distância.');
  try{await request('/rest/v1/profile_private?user_id=eq.'+me.id,{method:'PATCH',body:JSON.stringify({age_min:a,age_max:b,radius_km:c})});await loadSelf();overlay.remove();await discover()}catch(err){flash(err.message)}
 };
}
async function getMatches(){
 const route=elnexNavigationToken;
 const found=await rpc('list_conversations');
 if(route!==elnexNavigationToken)return;
 matches=found;
 if(!Array.isArray(matches))matches=[];
 if(!matches.length){
  $('#content').innerHTML='<div class="home">'+elxEmpty({icon:'💞',title:'Toda conexão começa por um oi.',description:'Quando duas pessoas se curtirem, elas aparecerão aqui para conversar. Enquanto isso, descubra perfis e deixe o Sense ajudar com novas ideias.',action:'discover',cta:'Conhecer pessoas'})+'<div class="start-cards"><button class="start-tile" data-nav="sense"><i>💬</i><strong>Coach IA</strong><small>Quebre o gelo</small></button><button class="start-tile" data-nav="profile"><i>♡</i><strong>Meu perfil</strong><small>Mostre sua essência</small></button><button class="start-tile" data-nav="events"><i>☕</i><strong>Encontros</strong><small>Experiências</small></button></div></div>';
  elxWireStandard($('#content'));return;
 }
 $('#content').innerHTML='<div class="home"><div class="home-section"><div class="section-head"><div><div class="tag">SUAS CONEXÕES</div><h3>'+matches.length+' '+(matches.length===1?'conversa':'conversas')+' esperando por você</h3></div><button class="btn alt" data-nav="sense">✦ Coach IA</button></div>'+
 matches.map((m,i)=>'<button class="line" style="display:flex;width:100%;border:0;background:none;color:inherit;text-align:left;cursor:pointer" data-chat="'+i+'"><div class="face" style="overflow:hidden;display:grid;place-items:center">'+elxSafeProfilePhoto(m)+'</div><div class="details"><strong>'+esc(m.other_name||'Sua conexão')+'</strong><small>'+esc(m.last_message||'Uma nova conversa pode começar aqui.')+'</small></div><span class="tag-rose">Conversar →</span></button>').join('')+'</div></div>';
 $('#content').querySelectorAll('[data-chat]').forEach(btn=>btn.onclick=()=>openChat(matches[+btn.dataset.chat]));
 elxWireStandard($('#content'));
}
async function getEvents(){
 const route=elnexNavigationToken;
 const r=await request('/rest/v1/events?select=id,title,description,city,start_at,capacity,location_hint&published=eq.true&start_at=gt.'+encodeURIComponent(new Date().toISOString())+'&order=start_at.asc&limit=100');
 if(route!==elnexNavigationToken)return;
 const list=Array.isArray(r)?r:[];
 $('#content').innerHTML='<div class="home"><section class="home-hero" style="min-height:270px"><div class="hero-copy"><div class="tag">REAL DATE EXPERIENCE</div><h2>As melhores histórias acontecem <span>fora da tela</span>.</h2><p>Experiências em lugares públicos, encontros leves e atividades em comum. Segurança sempre em primeiro lugar.</p></div><div class="hero-art" aria-hidden="true"><div class="orbit-one"></div><div class="art-core"><span class="heart-art">☕</span></div></div></section>'+
 (list.length?'<div class="home-grid" style="display:block">'+list.map((e,i)=>'<article class="event-card"><div class="event-icon">✦</div><span class="event-meta">📅 '+esc(fmt(e.start_at))+' · '+esc(e.city)+'</span><h3>'+esc(e.title)+'</h3><p>'+esc(e.description||'Compartilhe experiências com pessoas reais.')+'</p><p class="muted small">📍 '+esc(e.location_hint||'Local divulgado pela organização')+'</p><button class="btn" data-event="'+i+'">Quero participar</button></article>').join('')+'</div>':
 '<div class="home-section"><div class="welcome-signal"><span class="emoji">🌷</span><div><strong>Eventos em preparação</strong><p>Ainda não há eventos oficiais publicados. Quando a equipe divulgar experiências reais, elas aparecerão aqui.</p></div></div><div class="showcase-tiles"><div class="showcase-tile"><span>☕</span><strong>Primeiros cafés</strong><small>Encontros em locais públicos</small></div><div class="showcase-tile"><span>🎭</span><strong>Cultura & lazer</strong><small>Atividades em comum</small></div><div class="showcase-tile"><span>🌿</span><strong>Ao ar livre</strong><small>Experiências seguras</small></div></div></div>')+'</div>';
 $('#content').querySelectorAll('[data-event]').forEach(btn=>btn.onclick=async()=>{
 const e=list[+btn.dataset.event];try{await request('/rest/v1/event_attendees',{method:'POST',body:JSON.stringify({user_id:me.id,event_id:e.id})});flash('Sua inscrição foi registrada!')}catch(error){flash(error.message)}
 });
}
function elxSenseScore(){
 const checks=elxMyChecks();return {count:checks.filter(x=>x.done).length,percent:elxPercent(),missing:checks.filter(x=>!x.done).map(x=>x.title)};
}
async function loadSense(){
 const s=elxSenseScore();
 const active=elnexSkills.find(x=>x.mode===elnexSenseMode)||elnexSkills[0];
 const guide=s.missing.length?'Para começar, vale completar: '+s.missing.slice(0,3).join(', ')+'.':'Seu perfil básico está preenchido. Continue sendo você mesmo: a qualidade da conexão depende das duas pessoas.';
 $('#content').innerHTML='<div class="sense motion-in"><section class="sense-hero"><div><div class="tag">✦ ELNEX SENSE • INTELIGÊNCIA PARA CONEXÕES REAIS</div><h2 class="display-title">O match começa<br>com <span style="color:#bee6f3">uma boa conexão.</span></h2><p>Um espaço exclusivo para desenvolver conversas, valorizar sua personalidade e pensar em encontros mais significativos.</p><div class="tag-rose"><span class="pulse-dot"></span> ASSISTENTE ELNEX SENSE</div></div><div class="sense-orb" aria-hidden="true">✦</div></section>'+
 '<div class="sense-grid">'+elnexSkills.map(x=>'<button class="sense-skill '+(x.mode===elnexSenseMode?'selected':'')+'" data-mode="'+x.mode+'"><span class="skill-symbol">'+x.icon+'</span><strong>'+x.title+'</strong><small>'+x.hint+'</small></button>').join('')+'</div>'+
 '<div class="sense-workspace"><section class="card"><div class="tag">✦ ASSISTÊNCIA PERSONALIZADA</div><h2 id="senseTitle" style="margin:12px 0">'+esc(active.title)+'</h2><p class="muted">'+esc(active.hint)+'</p><label for="senseInput">O que você quer conversar ou melhorar?</label><textarea id="senseInput" rows="5" maxlength="600" placeholder="'+esc(active.placeholder)+'"></textarea><button id="senseGenerate" class="btn" style="margin-top:13px;width:100%">'+esc(active.cta)+' ✦</button><p class="sense-status">O Sense responde em modo básico, sem chave de API. Com IA generativa ativada, as sugestões ficam mais personalizadas. O contexto só é enviado ao tocar no botão.</p></section>'+
 '<section class="card"><div class="tag">SEU RESULTADO</div><h2 style="margin:12px 0">Para você, com cuidado.</h2><div id="senseResult" class="sense-result"><div class="empty">✦ Escolha um recurso, escreva seu contexto e peça uma sugestão.</div></div><div style="margin-top:18px" class="welcome-signal"><span class="emoji">💜</span><div><strong>Análise inicial de perfil</strong><p>'+esc(s.percent)+'% preenchido. '+esc(guide)+'</p><p style="font-size:11px">Indicador de preenchimento, não avaliação do seu valor ou de sua personalidade.</p></div></div></section></div>'+
 '<section class="home-section"><div class="section-head"><h3>Seu jeito de se conectar</h3><span class="tag-rose">ELNEX SENSE 360</span></div><div class="showcase-tiles"><div class="showcase-tile"><span>🧠</span><strong>Autoconhecimento</strong><small>Valorize seus valores e interesses</small></div><div class="showcase-tile"><span>💬</span><strong>Conversas sinceras</strong><small>Sem manipulação nem scripts prontos</small></div><div class="showcase-tile"><span>☕</span><strong>Segurança</strong><small>Encontros em locais públicos</small></div></div></section></div>';
 $('#content').querySelectorAll('[data-mode]').forEach(btn=>btn.onclick=()=>{
 elnexSenseMode=btn.dataset.mode;
 const info=elnexSkills.find(x=>x.mode===elnexSenseMode);
 $('#content').querySelectorAll('[data-mode]').forEach(el=>el.classList.toggle('selected',el===btn));
 $('#senseTitle').textContent=info.title;$('#senseInput').placeholder=info.placeholder;
 $('#senseGenerate').textContent=info.cta+' ✦';
 $('#senseResult').textContent='✦ Agora descreva um pouco do seu contexto e toque em gerar.';
 elxAddQuickPrompts();
 });
 $('#senseGenerate').onclick=elxAskSense;
 elxAddQuickPrompts();
}
function elxAddQuickPrompts(){
 const input=$('#senseInput');if(!input)return;
 let host=$('#senseQuickPrompts');
 if(!host){host=document.createElement('div');host.id='senseQuickPrompts';host.className='sense-quick';input.insertAdjacentElement('afterend',host)}
 const suggestions={
  opener:[['Como começar?', 'Quero começar uma conversa interessante com alguém que acabei de conhecer. O que posso dizer?'],['Interesses em comum','Nós dois gostamos de cinema, mas ainda não conversamos. Como abordar com naturalidade?']],
  insight:[['Nossos valores','Quero entender a importância de valores em comum antes de conhecer alguém melhor.'],['Compatibilidade','Quais perguntas ajudam a conhecer a compatibilidade de forma respeitosa?']],
  profile:[['Minha biografia','Gosto de músicas, viagens e passar tempo com pessoas queridas. Quero uma biografia autêntica.'],['Mostrar personalidade','Quero deixar meu perfil mais interessante sem parecer artificial ou exagerado.']],
  date:[['Primeiro encontro','Quero uma sugestão de primeiro encontro seguro, leve e em local público.'],['Café ou passeio','Estamos planejando o primeiro encontro e gostamos de café e passeios culturais.']]
 };
 const choices=suggestions[elnexSenseMode]||suggestions.opener;
 host.innerHTML='<div class="sense-quick-label">EXPERIMENTE UMA SUGESTÃO</div>'+choices.map((item,i)=>'<button type="button" class="sense-prompt" data-prompt-index="'+i+'">✦ '+esc(item[0])+'</button>').join('');
 host.querySelectorAll('[data-prompt-index]').forEach(b=>{
  b.onclick=()=>{
   input.value=choices[Number(b.dataset.promptIndex)][1];
   input.focus();input.scrollIntoView({block:'center',behavior:'smooth'});
  };
 });
}
async function elxAskSense(){
 const input=$('#senseInput'),result=$('#senseResult'),btn=$('#senseGenerate');
 const context=input.value.trim();
 if(context.length<10){result.textContent='Conte um pouco mais sobre o que você procura (pelo menos 10 caracteres), para receber uma sugestão contextualizada.';input.focus();return}
 if(!me){result.textContent='Entre na sua conta para usar este recurso.';return}
 btn.disabled=true;btn.textContent='✨ Pensando na sua sugestão...';result.textContent='Conectando ao ELNEX Sense...';
 try{
 const r=await request('/functions/v1/elnex-ai',{method:'POST',body:JSON.stringify({mode:elnexSenseMode,context:context.slice(0,600)})});
 if(!r||!r.text)throw Error('O assistente não retornou texto. Tente novamente.');
 const title=r.source==='basic'?'✦ SUGESTÃO ELNEX · MODO BÁSICO':'✦ ELNEX SENSE · IA GENERATIVA';
 result.textContent=title+'\n\n'+r.text+(r.source==='basic'?'\n\nModo básico: orientações produzidas por regras, não por um modelo de IA. A IA generativa exige configurar o provedor no Supabase.':'');
 result.scrollIntoView({block:'nearest',behavior:'smooth'});
 }catch(e){
 const message=String(e.message||e);
 if(/OPENAI_API_KEY|não ativada|503|indisponível/i.test(message))result.textContent='Serviço de sugestões temporariamente indisponível. Tente novamente. A versão básica pode funcionar sem a API generativa externa.';
 else if(/Limite diário|429/i.test(message))result.textContent='Seu limite diário de sugestões foi atingido. Você poderá continuar em outro dia.';
 else result.textContent='Não foi possível gerar a sugestão agora: '+message;
 }finally{btn.disabled=false;btn.textContent=(elnexSkills.find(x=>x.mode===elnexSenseMode)||elnexSkills[0]).cta+' ✦'}
}
const elxOriginalGetProfile=getProfile;
getProfile=async function(){
 const route=elnexNavigationToken;
 await elxOriginalGetProfile();
 if(route!==elnexNavigationToken||!$('#profileForm'))return;
 const progress=elxPercent();
 const hero='<section class="profile-overview motion-in"><div><div class="tag">✦ SEU PERFIL ELNEX</div><strong>'+esc(profile?.display_name||'Sua história começa aqui')+'</strong><p class="muted small" style="margin:8px 0">Perfil '+progress+'% completo — personalize com autenticidade.</p><div class="progress-bg"><div class="progress-fill" style="width:'+progress+'%"></div></div></div><div class="profile-big-avatar">♡</div></section>';
 $('#content').insertAdjacentHTML('afterbegin',hero);
 $('#content').insertAdjacentHTML('beforeend','<section class="card" style="margin-top:20px"><h3>Minha conta</h3><p class="muted small">Seu perfil e suas preferências estão sob seu controle.</p><button class="btn alt" id="elnexLogoutMobile" type="button">↪ Sair da minha conta</button></section>');
 const exitMobile=$('#elnexLogoutMobile');if(exitMobile)exitMobile.onclick=()=>$('#exit')?.click();
};
(function elxInit(){
 document.querySelectorAll('.sidebar .nav[data-tab="sense"]').forEach(el=>{el.title='ELNEX Sense • Inteligência Artificial'});
 const avatar=$('#meAvatar');if(avatar)avatar.addEventListener('click',()=>switchTab('profile'));
})();
