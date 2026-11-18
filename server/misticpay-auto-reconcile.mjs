/**
 * Real-production, read-only-on-creation PIX verification worker.
 * Only checks pre-existing registered Pix orders, then applies strictly verified,
 * idempotent settlement to the rightful account. Never creates or pays a charge.
 */
export function createProductionPixReconciler({store,gateway,settle,logger=()=>{},batch=10}={}){
 if(typeof store?.claimPendingForVerification!=="function"||typeof gateway?.getTransaction!=="function"||typeof settle!=="function")
  throw Error("Verificação de pagamentos incompleta.");
 let running=false;
 async function check(){
  if(running)return {skipped:true};
  running=true;
  const summary={checked:0,confirmed:0,pending:0,declined:0,unverified:0,created:0};
  try{
   const orders=await store.claimPendingForVerification(Math.min(15,Math.max(1,batch)));
   for(const order of orders){
    summary.checked++;
    try{
     const transaction=await gateway.getTransaction(order.providerPaymentId);
     const status=await settle(store,order,transaction);
     if(status==="COMPLETO")summary.confirmed++;
     else if(status==="PENDENTE")summary.pending++;
     else if(["CANCELADO","FALHA","DEVOLVIDO","DEVOLVIDO_PARCIAL"].includes(status))summary.declined++;
     else summary.unverified++;
    }catch{
     // Never mark a payment as paid after provider failure, wrong amounts or ID mismatch.
     summary.unverified++;
    }
   }
   logger(summary);
   return summary;
  }finally{running=false}
 }
 return {check};
}
