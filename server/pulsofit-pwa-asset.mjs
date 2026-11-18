/* PulsoFit icon generated on demand, with no external dependencies. */
import {deflateSync} from "node:zlib";
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=(buf)=>{let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
function chunk(type,bytes){
 const name=Buffer.from(type),n=Buffer.alloc(4),tail=Buffer.alloc(4);
 n.writeUInt32BE(bytes.length);tail.writeUInt32BE(crc(Buffer.concat([name,bytes])));
 return Buffer.concat([n,name,bytes,tail]);
}
function icon(n){
 if(![192,512].includes(n))throw Error("Bad icon size");
 const pixels=Buffer.alloc(n*(n*4+1));let k=0;
 const rect=(x,y,x1,y1,x2,y2,r)=>{
  const nx=Math.max(x1,Math.min(x,x2)),ny=Math.max(y1,Math.min(y,y2));
  return Math.hypot(x-nx,y-ny)<=r;
 };
 for(let iy=0;iy<n;iy++){
  pixels[k++]=0;
  for(let ix=0;ix<n;ix++){
   const x=ix/n,y=iy/n;
   let rr=Math.round(18+22*(1-y)),gg=Math.round(19+17*x),bb=Math.round(45+30*(1-x));
   const dx=x-.55,dy=y-.28,glow=Math.max(0,1-Math.hypot(dx,dy)/.7);
   rr+=Math.round(glow*40);bb+=Math.round(glow*42);
   // Brand P: a strong rounded stem and a hollow upper loop.
   const stem=x>=.29&&x<=.40&&y>=.18&&y<=.79;
   const outer=rect(x,y,.33,.19,.65,.55,.11);
   const inner=rect(x,y,.45,.31,.55,.43,.045);
   const upper=stem||(outer&&!inner&&x>=.33);
   const pulse=(xx,yy,ax,ay,bx,by)=>{
    const t=Math.max(0,Math.min(1,((xx-ax)*(bx-ax)+(yy-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));
    return Math.hypot(xx-(ax+t*(bx-ax)),yy-(ay+t*(by-ay)))<.015;
   };
   const track=[[-.01,.67],[.24,.67],[.30,.60],[.36,.76],[.46,.51],[.53,.68],[.68,.68],[.76,.61],[1.01,.61]];
   let beat=false;
   for(let p=1;p<track.length;p++)if(pulse(x,y,track[p-1][0],track[p-1][1],track[p][0],track[p][1])){beat=true;break}
   if(upper){const a=Math.max(0,Math.min(1,(x+y)/2));rr=140+Math.round(10*a);gg=55+Math.round(160*a);bb=248-Math.round(40*a)}
   if(beat){rr=178;gg=255;bb=238}
   pixels[k++]=Math.min(255,rr);pixels[k++]=Math.min(255,gg);pixels[k++]=Math.min(255,bb);pixels[k++]=255;
  }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(n,0);ihdr.writeUInt32BE(n,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",deflateSync(pixels,{level:9})),chunk("IEND",Buffer.alloc(0))]);
}
const cache=new Map();
export function pulsoIcon(n){if(!cache.has(n))cache.set(n,icon(n));return cache.get(n)}
export function pulsoManifest(){return {
 id:"/",name:"PulsoFit AI — Treinos & Performance",short_name:"PulsoFit",description:"Treinos, metas e desempenho com acompanhamento de IA.",
 start_url:"/?source=app#/home",scope:"/",display:"standalone",background_color:"#12172e",theme_color:"#6c31c9",
 lang:"pt-BR",orientation:"portrait-primary",categories:["health","fitness"],
 icons:[{src:"/pulsofit-icon-192.png",sizes:"192x192",type:"image/png",purpose:"any maskable"},
        {src:"/pulsofit-icon-512.png",sizes:"512x512",type:"image/png",purpose:"any maskable"}]
 }}
