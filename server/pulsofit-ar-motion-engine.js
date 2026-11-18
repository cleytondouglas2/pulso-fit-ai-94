/* Exercise-specific animated pose engine for 73 Treino Vivo movements.
 * Procedural educational approximations, not clinical form verification.
 * Every known movement uses its own variant; never silently falls back to jacks.
 */
(function(root){
"use strict";
if(root.PulsoARMotions)return;
const groups={
 march:"march incline_walk walk_easy walk_interval indoor_walk dumbbell_carry",
 quick:"easy_jog fast_feet high_knee",
 warm:"shoulder_roll arm_swing ankle_pump side_step hip_circle",
 squat:"chair_squat body_squat goblet_squat squat_pulse sit_reach squat",
 press:"wall_push incline_push floor_push decline_pushup diamond_pushup pseudo_planche pushup",
 row:"band_row dumbbell_row cable_row wall_pull band_pull",
 hinge:"hip_hinge dumbbell_deadlift",
 plank:"forearm_plank plank side_plank",
 walk:"box_step step_taps standing_knee single_balance",
 mobility:"hip_open thoracic_rotate cat_cow wall_slide neck_relax breathing seated_march hamstring_glide quad_stretch calf_stretch back_relax balance_touch seated_reach",
 step:"side_step heel_dig skater_step low_jack step_reach",
 extras:"band_press pallof_band standing_twist shadow_box",
 advanced:"bulgarian_squat nordic_curl chinup_supinated"
};
const interval={
 squat:1750,lunge:2000,jumping_jack:1250,curl:1700,arm_raise:1800,march:1250,pushup:2000,plank:3000,bridge:1900,
 easy_jog:910,fast_feet:650,high_knee:930,jump_jack:1300,low_jack:1580,skater_step:1650,shadow_box:900,
 breathing:4300,neck_relax:3200,back_relax:4300,balance_touch:3000,calf_stretch:3400,
 thoracic_rotate:3150,cat_cow:3200,nordic_curl:3600,chinup_supinated:2650,
 bulgarian_squat:2600,dead_bug:2600,bird_dog:3000,decline_pushup:2400,
 pseudo_planche:2400,glute_bridge:2300,side_plank:3500,forearm_plank:3500
};
const all=new Set(Object.values(groups).join(" ").split(/\s+/).concat([
 "goblet_squat","leg_press","split_squat","dumbbell_press","machine_chest","glute_bridge",
 "machine_hamstring","calf_raise","dead_bug","bird_dog","standing_knee","pallof_band",
 "jump_jack","mountain_walk","squat_pulse","dumbbell_carry","band_press","step_reach",
 "sit_reach","nordic_curl","chinup_supinated","lunge","arm_raise","curl","bridge",
 "jumping_jack","pushup","plank","step_taps"
]));
function apply(rig,id,elapsed){
 if(!rig||!all.has(id))return false;
 const {body,arms,elbows,legs,knees,head}=rig;
 if(!body||arms?.length!==2||legs?.length!==2||elbows?.length!==2||knees?.length!==2)return false;
 const speed=interval[id]||1980;
 const theta=Math.max(0,elapsed)/speed*Math.PI*2;
 const wave=Math.sin(theta),phase=(1-Math.cos(theta))/2;
 const alternating=Math.max(0,wave),opposing=Math.max(0,-wave);
 body.position.set(0,0,0);body.rotation.set(0,0,0);body.scale.set(1,1,1);
 if(head)head.rotation.set(0,0,0);
 for(const part of [...arms,...elbows,...legs,...knees])part.rotation.set(0,0,0);
 const armsTogether=(x,z=0)=>{for(const a of arms){a.rotation.x=x;a.rotation.z=z}};
 const kneesTogether=x=>{for(const k of knees)k.rotation.x=x};
 const squat=(depth=1)=>{
  body.position.y=-.37*depth*phase;body.rotation.x=.14*depth*phase;
  legs[0].rotation.x=-.65*depth*phase;legs[1].rotation.x=-.65*depth*phase;
  kneesTogether(1.12*depth*phase);
  armsTogether(-.50*depth*phase);
 };
 const walk=(stride=.48)=>{
  legs[0].rotation.x=stride*wave;legs[1].rotation.x=-stride*wave;
  knees[0].rotation.x=.58*alternating;knees[1].rotation.x=.58*opposing;
  arms[0].rotation.x=-.38*wave;arms[1].rotation.x=.38*wave;
  body.position.y=.04*Math.sin(theta*2);
 };
 const tabletop=(height=-.17)=>{
  body.rotation.z=-Math.PI/2;
  body.position.set(-.90,height,0);
 };
 const plank=()=>{
  tabletop(-.10);
  arms[0].rotation.z=-.35;arms[1].rotation.z=.35;
 };
 const push=(depth=1)=>{
  plank();
  body.position.y=-.17+.16*(1-phase)*depth;
  elbows[0].rotation.x=.63*phase;elbows[1].rotation.x=.63*phase;
  arms[0].rotation.z=-.23-.42*phase;arms[1].rotation.z=.23+.42*phase;
 };
 const lunge=(depth=1)=>{
  body.position.y=-.24*phase*depth;
  legs[0].rotation.x=.69*phase*depth;legs[1].rotation.x=-.63*phase*depth;
  knees[0].rotation.x=1.16*phase*depth;knees[1].rotation.x=.79*phase*depth;
 };
 const seated=()=>{
  body.position.y=-.26;
  legs[0].rotation.x=-.92;legs[1].rotation.x=-.92;
  kneesTogether(1.32);
 };
 const forwardPress=(amount=phase)=>{
  armsTogether(.15+1.20*amount);
  elbows[0].rotation.x=.75*(1-amount);elbows[1].rotation.x=.75*(1-amount);
 };
 const row=(amount=phase)=>{
  armsTogether(.95);
  elbows[0].rotation.x=-1.23*amount;elbows[1].rotation.x=-1.23*amount;
 };
 const hinge=(amount=phase)=>{
  body.rotation.x=.65*amount;
  body.position.y=-.12*amount;
  legs[0].rotation.x=.16*amount;legs[1].rotation.x=.16*amount;
  kneesTogether(.12*amount);
 };
 const jack=(jump=true)=>{
  if(jump)body.position.y=.11*Math.max(0,wave);
  legs[0].rotation.z=-.44*phase;legs[1].rotation.z=.44*phase;
  arms[0].rotation.z=-2.32*phase;arms[1].rotation.z=2.32*phase;
 };
 const stretch=(side=1)=>{
  body.rotation.z=.20*side*phase;
  if(head)head.rotation.z=.10*side*phase;
 };
 const is=(...names)=>names.includes(id);
 // WARM-UP & GAIT — no jumping during low-impact movements.
 if(is("march","incline_walk","walk_easy","walk_interval","indoor_walk","dumbbell_carry")){
  walk(id==="walk_easy"?.32:id==="dumbbell_carry"?.33:.49);
  if(id==="dumbbell_carry"){armsTogether(.05);body.rotation.z=.04*wave}
  if(id==="walk_interval")body.position.y=.065*Math.abs(wave);
 }else if(is("easy_jog","fast_feet","high_knee")){
  walk(id==="fast_feet"?.31:.68);
  if(id==="high_knee"){legs[0].rotation.x=.88*alternating;legs[1].rotation.x=.88*opposing}
  body.position.y=.08*Math.abs(wave);
 }else if(id==="shoulder_roll"){
  arms[0].rotation.x=.20*wave;arms[1].rotation.x=.20*wave;
  arms[0].rotation.z=-.16*Math.cos(theta);arms[1].rotation.z=.16*Math.cos(theta);
  body.position.y=.045*phase;
 }else if(id==="arm_swing"){
  arms[0].rotation.x=.83*wave;arms[1].rotation.x=-.83*wave;
 }else if(id==="ankle_pump"){
  knees[0].rotation.x=.30*alternating;knees[1].rotation.x=.30*opposing;
  body.position.y=.018*wave;
 }else if(id==="side_step"){
  body.position.x=.21*wave;
  legs[0].rotation.z=-.31*alternating;legs[1].rotation.z=.31*opposing;
 }else if(id==="hip_circle"){
  body.position.x=.10*Math.cos(theta);body.position.z=.08*Math.sin(theta);
  body.rotation.z=.07*Math.sin(theta);
 }else if(is("chair_squat","body_squat","squat","goblet_squat","squat_pulse","sit_reach")){
  squat(id==="squat_pulse"?.52:id==="chair_squat"?.80:1);
  if(id==="goblet_squat"){armsTogether(.60);elbows[0].rotation.x=-.45;elbows[1].rotation.x=-.45}
  if(id==="sit_reach")armsTogether(.55+.52*phase);
 }else if(is("split_squat","lunge","bulgarian_squat")){
  lunge(id==="bulgarian_squat"?.92:1);
  if(id==="bulgarian_squat"){legs[1].rotation.x=-.78;knees[1].rotation.x=1.45;armsTogether(.24)}
 }else if(id==="leg_press"){
  seated();body.rotation.z=-.40;
  legs[0].rotation.x=-1.16+.58*phase;legs[1].rotation.x=-1.16+.58*phase;
  kneesTogether(1.42-.94*phase);
 }else if(id==="box_step"){
  body.position.y=.19*phase;
  legs[0].rotation.x=.67*phase;knees[0].rotation.x=.87*phase;
  arms[1].rotation.x=.33*phase;
 }else if(is("floor_push","pushup","diamond_pushup","decline_pushup","pseudo_planche","incline_push","wall_push")){
  if(id==="wall_push"){
   body.position.z=.28*phase;body.rotation.x=.11*phase;
   forwardPress(1-phase);
  }else if(id==="incline_push"){
   body.rotation.z=-.90;body.position.x=-.50;
   elbows[0].rotation.x=.70*phase;elbows[1].rotation.x=.70*phase;
   armsTogether(.25+.50*phase);
  }else{
   push(id==="decline_pushup"?.84:1);
   if(id==="diamond_pushup"){arms[0].rotation.z=-.10;arms[1].rotation.z=.10}
   if(id==="decline_pushup"){legs[0].rotation.x=.19;legs[1].rotation.x=.19;body.rotation.z=-1.42}
   if(id==="pseudo_planche"){body.position.x=-1.07-.10*phase;armsTogether(.20)}
  }
 }else if(is("dumbbell_press","machine_chest","band_press")){
  if(id==="dumbbell_press"){tabletop(-.45);armsTogether(1.17-.78*phase);elbows[0].rotation.x=.77*phase;elbows[1].rotation.x=.77*phase}
  else forwardPress(phase);
 }else if(is("band_row","dumbbell_row","cable_row","wall_pull","band_pull")){
  row(phase);
  if(id==="dumbbell_row"){hinge(.38);arms[1].rotation.x=.24;elbows[1].rotation.x=-1.45*phase;elbows[0].rotation.x=.10}
  if(id==="cable_row")seated();
  if(id==="band_pull"){arms[0].rotation.z=-.85*phase;arms[1].rotation.z=.85*phase}
  if(id==="wall_pull")armsTogether(.45);
 }else if(is("curl","machine_hamstring")){
  if(id==="curl"){
   elbows[0].rotation.x=-1.55*phase;elbows[1].rotation.x=-1.55*phase;
  }else{
   tabletop(-.21);kneesTogether(1.4*phase);legs[0].rotation.x=.22;legs[1].rotation.x=.22;
  }
 }else if(id==="arm_raise"){
  arms[0].rotation.z=-1.33*phase;arms[1].rotation.z=1.33*phase;
 }else if(is("hip_hinge","dumbbell_deadlift")){
  hinge(phase);
  if(id==="dumbbell_deadlift")armsTogether(.28);
 }else if(is("glute_bridge","bridge")){
  tabletop(-.43+.28*phase);body.rotation.z=-.86;
  legs[0].rotation.x=-.42;legs[1].rotation.x=-.42;kneesTogether(.95);
 }else if(id==="calf_raise"){
  body.position.y=.13*phase;kneesTogether(.04);
 }else if(id==="dead_bug"){
  tabletop(-.32);
  arms[0].rotation.x=.75*wave;arms[1].rotation.x=-.75*wave;
  legs[0].rotation.x=-.65*alternating;legs[1].rotation.x=-.65*opposing;
  knees[0].rotation.x=1.0*opposing;knees[1].rotation.x=1.0*alternating;
 }else if(id==="bird_dog"){
  tabletop(-.35);body.rotation.x=-.18;
  arms[0].rotation.x=-1.0*alternating;legs[1].rotation.x=1.1*alternating;
  arms[1].rotation.x=-1.0*opposing;legs[0].rotation.x=1.1*opposing;
 }else if(is("forearm_plank","plank","side_plank")){
  plank();
  if(id==="side_plank"){body.rotation.y=.9;arms[0].rotation.z=-1.32;body.position.y=-.18}
  body.position.y+=.015*Math.sin(theta);
 }else if(id==="standing_knee"){
  walk(.14);legs[0].rotation.x=.85*alternating;legs[1].rotation.x=.85*opposing;
 }else if(id==="pallof_band"){
  forwardPress(phase);body.rotation.y=.045*Math.sin(theta);
 }else if(id==="standing_twist"){
  body.rotation.y=.40*wave;armsTogether(.38);
 }else if(is("step_taps","heel_dig","skater_step","step_reach","single_balance")){
  body.position.x=id==="skater_step"?.25*wave:id==="step_reach"?.16*wave:0;
  legs[0].rotation.x=.51*alternating;legs[1].rotation.x=.51*opposing;
  if(id==="heel_dig"){knees[0].rotation.x=.25*alternating;knees[1].rotation.x=.25*opposing}
  if(id==="step_reach"){arms[0].rotation.x=.85*alternating;arms[1].rotation.x=.85*opposing}
  if(id==="single_balance")body.position.y=.07*phase;
 }else if(is("jump_jack","jumping_jack","low_jack")){
  jack(id!=="low_jack");
  if(id==="low_jack"){legs[0].rotation.z=-.34*alternating;legs[1].rotation.z=.34*opposing}
 }else if(id==="mountain_walk"){
  plank();legs[0].rotation.x=.85*alternating;legs[1].rotation.x=.85*opposing;
  knees[0].rotation.x=1.25*alternating;knees[1].rotation.x=1.25*opposing;
 }else if(id==="shadow_box"){
  arms[0].rotation.x=.95+1.05*alternating;arms[1].rotation.x=.95+1.05*opposing;
  elbows[0].rotation.x=-.65*opposing;elbows[1].rotation.x=-.65*alternating;
  body.rotation.y=.13*wave;
 }else if(id==="hip_open"){
  legs[0].rotation.x=.63*phase;legs[0].rotation.z=-.35*phase;knees[0].rotation.x=.50*phase;
  armsTogether(.20);
 }else if(id==="thoracic_rotate"){
  body.rotation.x=.43;body.rotation.y=.42*wave;
  elbows[0].rotation.x=-1.20;arms[0].rotation.x=.46;
 }else if(id==="cat_cow"){
  tabletop(-.35);body.rotation.x=.22*wave;body.position.y+=.08*wave;
  kneesTogether(.35);
 }else if(id==="wall_slide"){
  arms[0].rotation.z=-1.70*phase;arms[1].rotation.z=1.70*phase;
  elbows[0].rotation.x=-.32;elbows[1].rotation.x=-.32;
 }else if(id==="neck_relax"){
  if(head)head.rotation.z=.20*wave;
  body.rotation.z=.02*wave;
 }else if(id==="breathing"){
  body.scale.x=1+.055*phase;
  armsTogether(.08);body.position.y=.016*wave;
 }else if(id==="seated_march"){
  seated();
  legs[0].rotation.x=-.92+.43*alternating;legs[1].rotation.x=-.92+.43*opposing;
  arms[0].rotation.x=.24*wave;arms[1].rotation.x=-.24*wave;
 }else if(id==="hamstring_glide"){
  seated();
  knees[0].rotation.x=1.3-.77*alternating;knees[1].rotation.x=1.3-.77*opposing;
 }else if(id==="quad_stretch"){
  legs[0].rotation.x=-.16;knees[0].rotation.x=1.53*phase;
  arms[0].rotation.x=.35;
 }else if(id==="calf_stretch"){
  lunge(.19);legs[1].rotation.x=-.29;armsTogether(.35);
 }else if(id==="back_relax"){
  tabletop(-.37);body.rotation.z=-1.21;legs[0].rotation.x=-.40;legs[1].rotation.x=-.40;
  kneesTogether(1.16);body.scale.x=1+.03*phase;
 }else if(id==="balance_touch"){
  body.position.y=.035*phase;legs[0].rotation.x=.32*phase;arms[0].rotation.z=-.63;
 }else if(id==="seated_reach"){
  seated();arms[0].rotation.x=.88*alternating;arms[1].rotation.x=.88*opposing;
 }else if(id==="nordic_curl"){
  body.position.y=-.44;legs[0].rotation.x=-.54;legs[1].rotation.x=-.54;
  kneesTogether(1.12);
  body.rotation.z=-.65*phase;armsTogether(.65*phase);
 }else if(id==="chinup_supinated"){
  body.position.y=.35*phase;
  arms[0].rotation.z=-2.85;arms[1].rotation.z=2.85;
  elbows[0].rotation.x=.80*phase;elbows[1].rotation.x=.80*phase;
 }else{
  // Nonmatching exercise ID is never "pretended" to be a jumping jack.
  return false;
 }
 return true;
}
function equipment(THREE,id){
 // Lightweight symbolic equipment only: this does not certify safe technique.
 if(!THREE)return null;
 const equipmentById={
  chair_squat:"chair",sit_reach:"chair",seated_march:"chair",seated_reach:"chair",hamstring_glide:"chair",
  box_step:"step",step_taps:"step",bulgarian_squat:"step",decline_pushup:"step",
  goblet_squat:"dumbbell",dumbbell_press:"dumbbell",dumbbell_row:"dumbbell",dumbbell_deadlift:"dumbbell",dumbbell_carry:"dumbbell",curl:"dumbbell",arm_raise:"dumbbell",
  band_row:"band",band_press:"band",band_pull:"band",pallof_band:"band",
  chinup_supinated:"bar",nordic_curl:"mat",floor_push:"mat",pushup:"mat",diamond_pushup:"mat",pseudo_planche:"mat",
  forearm_plank:"mat",plank:"mat",side_plank:"mat",glute_bridge:"mat",bridge:"mat",dead_bug:"mat",bird_dog:"mat"
 };
 const type=equipmentById[id];if(!type)return null;
 const group=new THREE.Group();
 const metal=new THREE.MeshStandardMaterial({color:0x97f4d0,metalness:.22,roughness:.54});
 const dark=new THREE.MeshStandardMaterial({color:0x364268,roughness:.8});
 const makeBox=(w,h,d,x,y,z,mat=dark)=>{
  const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);group.add(o);return o;
 };
 if(type==="mat")makeBox(2.6,.025,1.10,0,-.09,.05);
 if(type==="step")makeBox(.95,.22,.65,-.55,.10,.08,metal);
 if(type==="chair"){
  makeBox(.80,.07,.66,-.14,.66,-.26,metal);
  makeBox(.80,1.03,.075,-.14,1.15,-.58,dark);
  for(const x of [-.42,.14])makeBox(.07,.57,.07,x,.31,-.26);
 }
 if(type==="bar"){
  makeBox(2.2,.07,.07,0,3.01,0,metal);
  for(const x of [-1.04,1.04])makeBox(.06,3.0,.06,x,1.5,0);
 }
 if(type==="dumbbell"){
  for(const x of [-.82,.82]){
   makeBox(.28,.06,.07,x,.65,.27,metal);
   for(const z of [.20,.34])makeBox(.075,.18,.17,x,.65,z,dark);
  }
 }
 if(type==="band")makeBox(1.05,.018,.018,0,1.49,.54,metal);
 group.userData.pfEquipment=type;
 return group;
}
root.PulsoARMotions=Object.freeze({apply,equipment,supported:id=>all.has(id),count:all.size});
})(window);
