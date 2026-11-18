/* Curated official instructor-led exercise classes.
 * All source pages contain the respective official class videos.
 * No third-party media files are copied to the PulsoFit server.
 */
(function(root){
"use strict";
if(root.PulsoWellbeingLessons)return;
const lessons=[
 {id:"pilates-basics",category:"pilates",title:"Pilates para iniciantes",level:"Iniciante",minutes:45,emoji:"🧘",focus:"Equilíbrio, postura e mobilidade",equip:"Colchonete opcional",video:"WS9Yzh-XiIs",url:"https://www.nhs.uk/live-well/exercise/pilates-and-yoga/pilates-for-beginners/",source:"NHS • InstructorLive"},
 {id:"pilates-pyjama",category:"pilates",title:"Pilates suave em casa",level:"Intermediário",minutes:45,emoji:"🌿",focus:"Controle, força e flexibilidade",equip:"Tapete confortável",video:"J5cjrqpaAWY",url:"https://www.nhs.uk/live-well/exercise/pilates-and-yoga/pyjama-pilates/",source:"NHS • InstructorLive"},
 {id:"pilates-chair",category:"pilates",title:"Pilates com apoio da cadeira",level:"Adaptável",minutes:30,emoji:"🪑",focus:"Mobilidade com suporte",equip:"Cadeira firme",url:"https://www.nhs.uk/live-well/exercise/pilates-and-yoga/chair-based-pilates-exercise-video/",source:"NHS • InstructorLive"},
 {id:"dance-latin",category:"dance",title:"Dança fitness: La Bomba",level:"Iniciante",minutes:45,emoji:"💃",focus:"Dança latina, ritmo e movimento",equip:"Tênis e água",url:"https://www.nhs.uk/live-well/exercise/aerobic-exercises/dance-la-bomba/",source:"NHS • InstructorLive"},
 {id:"dance-belly",category:"dance",title:"Dança do ventre para iniciantes",level:"Iniciante",minutes:45,emoji:"✨",focus:"Coordenação, dança e expressão",equip:"Roupa confortável",url:"https://www.nhs.uk/live-well/exercise/aerobic-exercises/belly-dancing-for-beginners/",source:"NHS • InstructorLive"},
 {id:"yoga-vinyasa",category:"yoga",title:"Yoga: fluxo e respiração",level:"Intermediário",minutes:50,emoji:"🌸",focus:"Movimento, flexibilidade e respiração",equip:"Colchonete e água",url:"https://www.nhs.uk/live-well/exercise/pilates-and-yoga/yoga-with-lj/",source:"NHS • InstructorLive"},
 {id:"cardio-intro",category:"cardio",title:"Aeróbica para começar",level:"Iniciante",minutes:45,emoji:"⚡",focus:"Condicionamento com acompanhamento",equip:"Tênis e água",video:"a44ayeoSfKM",url:"https://www.nhs.uk/live-well/exercise/aerobic-exercises/aerobics-for-beginners/",source:"NHS • InstructorLive"},
 {id:"cardio-morning",category:"cardio",title:"Movimento para começar o dia",level:"Iniciante",minutes:45,emoji:"☀️",focus:"Energia e atividade leve a moderada",equip:"Tênis, água e colchonete",url:"https://www.nhs.uk/live-well/exercise/aerobic-exercises/wake-up-workout/",source:"NHS • InstructorLive"},
 {id:"warm-up",category:"mobility",title:"Aquecimento do corpo",level:"Todos os níveis",minutes:10,emoji:"🤸",focus:"Preparar articulações e músculos",equip:"Espaço livre",url:"https://www.nhs.uk/live-well/exercise/strength-and-resistance/body-blast-warm-up/",source:"NHS • InstructorLive"},
 {id:"cool-down",category:"mobility",title:"Alongamento após a aula",level:"Todos os níveis",minutes:10,emoji:"🍃",focus:"Desacelerar e relaxar o corpo",equip:"Toalha opcional",url:"https://www.nhs.uk/live-well/exercise/strength-and-resistance/body-blast-cool-down/",source:"NHS • InstructorLive"},
 {id:"mindful-evening",category:"mindfulness",title:"Meditação para descansar",level:"Iniciante",minutes:35,emoji:"🌙",focus:"Atenção plena e relaxamento",equip:"Almofada ou cobertor",url:"https://www.nhs.uk/live-well/sleep-and-tiredness/bedtime-meditation/",source:"NHS • InstructorLive"},
 {id:"stretch-warmup",category:"strength",title:"Força e flexibilidade: aquecimento",level:"Iniciante",minutes:10,emoji:"💪",focus:"Aquecimento antes da sessão",equip:"Espaço livre",url:"https://www.nhs.uk/live-well/exercise/strength-and-flex-exercise-plan-how-to-videos/",source:"NHS"},
 {id:"pilates-posture",category:"pilates",title:"Pilates e postura: fundamentos",level:"Iniciante",minutes:45,emoji:"🧍",focus:"Conscientização corporal sem pressão estética",equip:"Colchonete opcional",video:"WS9Yzh-XiIs",url:"https://www.nhs.uk/live-well/exercise/pilates-and-yoga/pilates-for-beginners/",source:"NHS • InstructorLive"}
];
for(const item of lessons)Object.freeze(item);
root.PulsoWellbeingLessons=Object.freeze({
 list:Object.freeze(lessons),
 categories:Object.freeze([
  {id:"all",label:"Todas"},
  {id:"pilates",label:"Pilates"},
  {id:"dance",label:"Dança"},
  {id:"yoga",label:"Yoga"},
  {id:"cardio",label:"Cardio"},
  {id:"mobility",label:"Mobilidade"},
  {id:"mindfulness",label:"Bem-estar"},
  {id:"strength",label:"Funcional"}
 ]),
 byId:id=>lessons.find(x=>x.id===id)||null
});
})(window);