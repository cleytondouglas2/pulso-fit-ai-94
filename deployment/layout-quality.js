/* ARGUS Payments — progressive responsive table layout.
 * Never changes form state, event handlers, routes, data values or payments.
 * Only attaches presentation labels using existing trusted table headers.
 * Without JavaScript, horizontal table scrolling remains available.
 */
(()=>{
'use strict';
if(window.__argusLayoutQuality)return;
window.__argusLayoutQuality=true;

const ready=new WeakSet();
const tdReady=new WeakSet();
const MAX_ROWS=1000;
const normalize=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,75);

function tableHeaders(table){
 const thead=table.tHead||table.querySelector('thead');
 if(!thead)return null;
 const last=thead.rows[thead.rows.length-1];
 if(!last)return null;
 const cells=Array.from(last.cells||[]);
 // Two-column documentation tables already fit in an accessible scroll area.
 if(cells.length<3||cells.length>16||cells.some(c=>c.colSpan!==1||c.rowSpan!==1))return null;
 const labels=cells.map(c=>normalize(c.textContent));
 if(labels.some(v=>!v))return null;
 return labels;
}
function decorate(table){
 if(!table||!table.isConnected)return;
 if(table.dataset.argusLayoutSkip==='1')return;
 const labels=tableHeaders(table);
 if(!labels)return;
 const body=table.tBodies?.[0];
 if(!body)return;
 const rows=Array.from(body.rows||[]);
 if(!rows.length)return;
 // Respect complex merged tables and avoid reorganizing their semantics.
 if(rows.some(r=>r.cells.length!==labels.length||
     Array.from(r.cells).some(c=>c.colSpan!==1||c.rowSpan!==1)))return;
 table.classList.add('argus-layout-cards');
 ready.add(table);
 for(let index=0;index<Math.min(rows.length,MAX_ROWS);index++){
  const row=rows[index];
  for(let col=0;col<labels.length;col++){
   const cell=row.cells[col];
   if(!cell||tdReady.has(cell))continue;
   cell.dataset.argusLabel=labels[col];
   tdReady.add(cell);
  }
 }
}
let pending=false;
function scan(){
 pending=false;
 document.querySelectorAll('table').forEach(decorate);
}
function schedule(){
 if(pending)return;
 pending=true;
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(scan);
 else Promise.resolve().then(scan);
}
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',schedule,{once:true});
}else schedule();

// Administrative tables are populated asynchronously. Monitor added nodes
// only; label updates do not trigger a feedback loop.
const observe=()=>{
 const root=document.body;
 if(!root)return;
 const observer=new MutationObserver(mutations=>{
  if(mutations.some(m=>m.addedNodes.length||m.removedNodes.length))schedule();
 });
 observer.observe(root,{childList:true,subtree:true});
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});
else observe();

// Diagnostic is intentionally private to the current browser, only geometry.
// It never logs account names, bank details, API secrets, CPF, or request bodies.
window.ArgusLayoutQuality={
 scan:()=>{scan();return document.querySelectorAll('table.argus-layout-cards').length;},
 overflowCount:()=>{
  const vw=document.documentElement.clientWidth;
  let count=0;
  document.querySelectorAll('main,.page,.panel,.sheet,.table-container').forEach(node=>{
   if(node.hidden||!node.getClientRects().length)return;
   const r=node.getBoundingClientRect();
   if(r.right>vw+2||r.left< -2)count++;
  });
  return count;
 }
};
})();
