/* PulsoFit • instructor-led classes selected for in-app YouTube embedding.
 * Only official YouTube iframe player is used, not downloaded/rehosted media.
 * Source and durations correspond to the actual listed recording.
 */
(function(root){
"use strict";
if(root.PulsoWellbeingLessons)return;
const rows=[
 ["pilates-basics","pilates","Pilates completo para iniciantes","Iniciante",30,"🧘","Movimento, força e mobilidade","Tapete","ywzZXO-A7Pg","Move With Nicole"],
 ["pilates-pyjama","pilates","Pilates suave a moderado","Intermediário",30,"🌿","Controle corporal e flexibilidade","Tapete","wtVyZmHnlxM","Move With Nicole"],
 ["pilates-chair","pilates","Pilates sentado com cadeira","Iniciante",12,"🪑","Mobilidade leve com apoio","Cadeira estável","MLPpV9biD7U","Lottie Murphy"],
 ["dance-latin","dance","Dança latina para iniciantes","Iniciante",21,"💃","Salsa, merengue e outros ritmos","Espaço livre e água","xTwUmGySwNc","Flow Dance Studios"],
 ["dance-belly","dance","Dança do ventre fitness","Todos os níveis",32,"✨","Expressão, coordenação e ritmo","Roupa confortável","ly9if9_0PCM","PS Fit • Leilah Isaac"],
 ["yoga-vinyasa","yoga","Yoga: fluxo e relaxamento","Todos os níveis",30,"🌸","Respiração e mobilidade","Tapete e manta","fxpgunu-bya","Yoga With Adriene"],
 ["cardio-intro","cardio","Cardio sem saltos para iniciantes","Iniciante",30,"⚡","Condicionamento sem precisar de aparelhos","Tênis e água","PvEnWsPrL4w","Body Project"],
 ["cardio-morning","cardio","Cardio leve para começar o dia","Iniciante",11,"☀️","Movimentos de baixo impacto","Tênis e água","SibjPw9Khz4","FitnessBlender"],
 ["warm-up","mobility","Aquecimento dinâmico do corpo","Iniciante",6,"🤸","Preparar o corpo com movimentos simples","Espaço livre","utBERF6BPxQ","Renew Medical Fitness"],
 ["cool-down","mobility","Alongamento e volta à calma","Iniciante",14,"🍃","Desacelerar após o exercício","Espaço livre","Xyto7aO3rsA","British Heart Foundation"],
 ["mindful-evening","mindfulness","Meditação guiada para relaxar","Iniciante",20,"🌙","Desacelerar e cuidar do bem-estar","Lugar tranquilo","mK-kGgypeI0","Great Meditation"],
 ["stretch-warmup","strength","Aeróbica em ritmo tranquilo","Iniciante",44,"💪","Passos básicos, coordenação e resistência","Degrau firme (opcional)","XOwU2wJBTME","Paul Eugene"],
 ["pilates-posture","pilates","Pilates para postura e mobilidade","Todos os níveis",14,"🧍","Ombros, coluna torácica e mobilidade","Tapete","RtZ_AyYhpFM","Annie Pilates Physical Therapist"]
];
const lessons=Object.freeze(rows.map(([id,category,title,level,minutes,emoji,focus,equip,video,source])=>Object.freeze({
 id,category,title,level,minutes,emoji,focus,equip,video,source,
 url:"https://www.youtube.com/watch?v="+video
})));
root.PulsoWellbeingLessons=Object.freeze({
 list:lessons,
 categories:Object.freeze([
  {id:"all",label:"Todas"},{id:"pilates",label:"Pilates"},{id:"dance",label:"Dança"},
  {id:"yoga",label:"Yoga"},{id:"cardio",label:"Cardio"},{id:"mobility",label:"Mobilidade"},
  {id:"mindfulness",label:"Bem-estar"},{id:"strength",label:"Funcional"}
 ]),
 byId:id=>lessons.find(x=>x.id===id)||null
});
})(window);