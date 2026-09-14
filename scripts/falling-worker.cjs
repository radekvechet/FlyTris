const {parentPort,workerData}=require('node:worker_threads'),path=require('node:path'),fs=require('node:fs');
const F=require(path.join(workerData.input,'falling-policy.cjs'));
const model=require(path.join(workerData.input,'model.json')),shapes=require(path.join(workerData.input,'shapes.json'));
parentPort.on('message',job=>{
  try{
    const deadline=performance.now()+Math.max(0,job.deadline-Date.now());
    const result=F.play(model,shapes,job.weights,job.seed,job.gravityMs,{durationMs:job.durationMs,cap:job.cap,deadline,record:!!job.record,shouldStop:()=>fs.existsSync(workerData.stopFile)});
    parentPort.postMessage({id:job.id,result});
  }catch(error){parentPort.postMessage({id:job.id,error:error.message});}
});
