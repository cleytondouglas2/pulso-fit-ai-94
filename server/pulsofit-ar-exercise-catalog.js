/* The Treino Vivo exercise registry, including every session movement (73).
 * Keys are stable exercise IDs; do not silently fall back to jumping jacks.
 * Animation poses are illustrative and do not replace technical instruction.
 */
(function(root){
"use strict";
if(root.PulsoARExercises)return;
const definitions=[
 ["march","Marcha confortável no lugar","none","warm"],
 ["shoulder_roll","Círculos de ombro","none","warm"],
 ["arm_swing","Balanço controlado de braços","none","warm"],
 ["ankle_pump","Mobilização de tornozelos","none","warm"],
 ["side_step","Passo lateral","none","warm"],
 ["hip_circle","Círculos pequenos de quadril","none","warm"],
 ["chair_squat","Sentar e levantar de cadeira","none","lower"],
 ["body_squat","Agachamento livre","none","lower"],
 ["goblet_squat","Agachamento com halter","dumbbell","lower"],
 ["leg_press","Leg press controlado","machine","lower"],
 ["box_step","Subida em degrau baixo","step","lower"],
 ["split_squat","Afundo estático assistido","none","lower"],
 ["wall_push","Flexão de braços na parede","none","upper"],
 ["incline_push","Flexão em superfície elevada firme","none","upper"],
 ["floor_push","Flexão de braços no chão","mat","upper"],
 ["dumbbell_press","Supino com halteres","dumbbell","upper"],
 ["machine_chest","Empurrar no aparelho peitoral","machine","upper"],
 ["band_row","Remada com faixa","band","upper"],
 ["dumbbell_row","Remada unilateral com halter","dumbbell","upper"],
 ["cable_row","Remada sentada na máquina","machine","upper"],
 ["wall_pull","Retração das escápulas","none","upper"],
 ["hip_hinge","Inclinação de quadril sem peso","none","posterior"],
 ["glute_bridge","Ponte de glúteos","mat","posterior"],
 ["dumbbell_deadlift","Levantamento romeno leve","dumbbell","posterior"],
 ["machine_hamstring","Flexão de joelhos na máquina","machine","posterior"],
 ["calf_raise","Elevação de panturrilhas","none","posterior"],
 ["dead_bug","Dead bug controlado","mat","core"],
 ["bird_dog","Braço e perna opostos","mat","core"],
 ["side_plank","Prancha lateral adaptada","mat","core"],
 ["forearm_plank","Prancha de antebraço","mat","core"],
 ["standing_knee","Elevação alternada de joelhos","none","core"],
 ["pallof_band","Pressão antirrotação com faixa","band","core"],
 ["standing_twist","Rotação de tronco leve","none","core"],
 ["incline_walk","Caminhada vigorosa leve","outdoors","walk"],
 ["walk_easy","Caminhada tranquila","outdoors","walk"],
 ["walk_interval","Caminhada com mudança de ritmo","outdoors","walk"],
 ["easy_jog","Trote leve opcional","outdoors","walk"],
 ["indoor_walk","Passos em circuito pequeno","none","walk"],
 ["step_taps","Toques alternados no degrau","step","cardio"],
 ["shadow_box","Boxe sem impacto e sem saltos","none","cardio"],
 ["heel_dig","Calcanhares à frente alternados","none","cardio"],
 ["skater_step","Passo lateral estilo patinador","none","cardio"],
 ["squat_pulse","Agachamento parcial ritmado","none","cardio"],
 ["low_jack","Polichinelo sem salto","none","cardio"],
 ["jump_jack","Polichinelo com salto opcional","none","cardio"],
 ["mountain_walk","Escalador lento em bancada","none","cardio"],
 ["high_knee","Marcha alta rápida","none","cardio"],
 ["hip_open","Abertura suave de quadril","none","mobility"],
 ["thoracic_rotate","Rotação torácica em quatro apoios","mat","mobility"],
 ["cat_cow","Gato e vaca lentos","mat","mobility"],
 ["wall_slide","Deslizamento de braços na parede","none","mobility"],
 ["neck_relax","Relaxamento lateral do pescoço","none","mobility"],
 ["breathing","Respiração confortável e calma","none","mobility"],
 ["seated_march","Marcha sentada","none","mobility"],
 ["hamstring_glide","Deslizamento leve de posterior","none","mobility"],
 ["quad_stretch","Alongamento de quadríceps com apoio","none","mobility"],
 ["calf_stretch","Alongamento de panturrilha na parede","none","mobility"],
 ["back_relax","Postura confortável de descanso","mat","mobility"],
 ["balance_touch","Equilíbrio com apoio","none","mobility"],
 ["band_press","Empurrar faixa à frente","band","extra"],
 ["band_pull","Puxada de faixa na frente do peito","band","extra"],
 ["dumbbell_carry","Caminhada curta carregando halteres","dumbbell","extra"],
 ["step_reach","Passo lateral com alcance","none","extra"],
 ["sit_reach","Sentar, levantar e alcançar","none","extra"],
 ["fast_feet","Passinhos rápidos sem salto","none","extra"],
 ["single_balance","Passo com equilíbrio","none","extra"],
 ["seated_reach","Alcance alternado sentado","none","extra"],
 ["decline_pushup","Flexão declinada (peito)","step","advanced"],
 ["diamond_pushup","Flexão diamante (peito e tríceps)","none","advanced"],
 ["pseudo_planche","Flexão pseudo planche (peito, ombros e core)","none","advanced"],
 ["bulgarian_squat","Agachamento búlgaro (pernas)","step","advanced"],
 ["nordic_curl","Flexão nórdica assistida (posterior de coxa)","mat","advanced"],
 ["chinup_supinated","Barra fixa supinada (bíceps e costas)","bar","advanced"],
 ["squat","Agachamento (rápido)","none","lower"],
 ["lunge","Afundo (rápido)","none","lower"],
 ["jumping_jack","Polichinelo (rápido)","none","cardio"],
 ["curl","Rosca bíceps (rápido)","dumbbell","upper"],
 ["arm_raise","Elevação lateral (rápido)","dumbbell","upper"],
 ["pushup","Flexão (rápido)","mat","upper"],
 ["plank","Prancha (rápido)","mat","core"],
 ["bridge","Ponte de glúteos (rápido)","mat","posterior"]
];
const list=Object.freeze(definitions.map(([id,label,gear,group])=>Object.freeze({id,label,gear,group})));
const byId=new Map(list.map(p=>[p.id,p]));
const normalize=s=>String(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," ");
const byLabel=new Map(list.map(x=>[normalize(x.label),x]));
const aliases={
 "polichinelo":"jump_jack","polichinelo com salto":"jump_jack","polichinelo sem salto":"low_jack",
 "agachamento":"body_squat","agachamento bulgaro":"bulgarian_squat","flexao":"floor_push",
 "flexao diamante":"diamond_pushup","flexao declinada":"decline_pushup","flexao pseudo planche":"pseudo_planche",
 "flexao nordica":"nordic_curl","barra supinada":"chinup_supinated","barra fixa supinada":"chinup_supinated",
 "rosca biceps":"curl","rosca direta":"curl","elevacao lateral":"arm_raise",
 "ponte de gluteos":"glute_bridge","prancha":"forearm_plank","remada":"band_row",
 "corrida":"easy_jog","caminhada":"walk_easy","supino":"dumbbell_press",
 "abdominal":"dead_bug","afundo":"split_squat","passada":"split_squat",
 "levantamento terra":"dumbbell_deadlift","panturrilha":"calf_raise","alongamento":"back_relax"
};
function resolve(input){
 if(input&&typeof input==="object")input=input.id||input.name||input.label||"";
 const raw=String(input||"").trim();
 if(byId.has(raw))return byId.get(raw);
 const n=normalize(raw);
 if(!n)return null;
 if(byLabel.has(n))return byLabel.get(n);
 if(aliases[n]&&byId.has(aliases[n]))return byId.get(aliases[n]);
 const priority=[
  [/nordic|nordica/, "nordic_curl"],
  [/bulgar/, "bulgarian_squat"],
  [/diamante/, "diamond_pushup"],
  [/pseudo.*planche/, "pseudo_planche"],
  [/declinad/, "decline_pushup"],
  [/supinad|chin.?up/, "chinup_supinated"],
  [/polichinelo.*sem salto/, "low_jack"],
  [/polichinelo|jumping jack/, "jump_jack"],
  [/flexao.*parede/, "wall_push"],
  [/flexao.*inclinad/, "incline_push"],
  [/flexao|push.?up/, "floor_push"],
  [/agachamento|squat/, "body_squat"],
  [/afundo|passada|lunge/, "split_squat"],
  [/ponte.*glute/, "glute_bridge"],
  [/prancha.*lateral/, "side_plank"],
  [/prancha|plank/, "forearm_plank"],
  [/rosca|biceps/, "curl"],
  [/elevacao lateral/, "arm_raise"],
  [/remada/, "band_row"],
  [/barra fixa/, "chinup_supinated"],
  [/caminhad/, "walk_easy"],
  [/corrida|trote/, "easy_jog"],
  [/alongamento|relaxamento/, "back_relax"]
 ];
 for(const [regex,id] of priority)if(regex.test(n))return byId.get(id);
 return null;
}
root.PulsoARExercises=Object.freeze({list,resolve,byId:id=>byId.get(id)||null,normalize});
})(window);
