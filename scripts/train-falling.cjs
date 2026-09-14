const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const out=path.resolve(get('out','runs/falling_overnight')),hours=Number(get('hours',6)),workers=Number(get('workers',4)),smoke=args.includes('--smoke'),resume=args.includes('--resume');
const input=path.join(out,'input'),sessionFile=path.join(out,'session.json'),stopFile=path.join(out,'STOP'),lockFile=path.join(out,'trainer.lock');
function write(file,value){const temp=file+'.tmp';fs.writeFileSync(temp,typeof value==='string'?value:JSON.stringify(value,null,2));fs.renameSync(temp,file);}
const norm=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const mean=a=>a.reduce((n,v)=>n+v,0)/a.length;
function random(state){let x=state.rng>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x>>>0;return (state.rng+.5)/4294967296;}
const normal=state=>Math.sqrt(-2*Math.log(random(state)))*Math.cos(2*Math.PI*random(state));
function log(message){const line=`${new Date().toISOString()} ${message}`;console.log(line);fs.appendFileSync(path.join(out,'training.log'),line+'\n');}
class Pool{
  constructor(){this.pool=Array.from({length:workers},()=>new Worker(path.join(__dirname,'falling-worker.cjs'),{workerData:{input,stopFile}}));this.counter=0;}
  async batch(tasks,deadline,save,stopped){
    let cursor=0,error=null;
    await Promise.all(this.pool.map(async worker=>{
      while(cursor<tasks.length&&!error&&!stopped()&&Date.now()<deadline){
        const task=tasks[cursor++],id=++this.counter;
        try{const result=await new Promise((resolve,reject)=>{
          const onMessage=m=>{if(m.id!==id)return;cleanup();m.error?reject(Error(m.error)):resolve(m.result);};
          const onError=e=>{cleanup();reject(e);};const onExit=code=>onError(Error('Worker exited: '+code));
          const cleanup=()=>{worker.off('message',onMessage);worker.off('error',onError);worker.off('exit',onExit);};
          worker.on('message',onMessage);worker.once('error',onError);worker.once('exit',onExit);worker.postMessage({...task.job,id,deadline});
        });task.accept(result);save();}catch(e){error=e;}
      }
    }));
    if(error&&error.message!=='DEADLINE')throw error;
    return !error&&cursor===tasks.length&&!stopped()&&Date.now()<deadline;
  }
  async close(){await Promise.all(this.pool.map(w=>w.terminate()));}
}
async function main(){
  if(!Number.isFinite(hours)||hours<=0||!Number.isInteger(workers)||workers<1||workers>8)throw Error('Invalid hours/workers.');
  fs.mkdirSync(out,{recursive:true});
  if(fs.existsSync(lockFile)){
    const pid=Number(fs.readFileSync(lockFile,'utf8'));if(!Number.isInteger(pid)||pid<1)throw Error('Invalid trainer lock; inspect before resuming.');
    let active=true;try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')active=false;else throw e;}
    if(active)throw Error('Another trainer is active in this directory.');fs.unlinkSync(lockFile);
  }
  fs.writeFileSync(lockFile,String(process.pid),{flag:'wx'});
  let pool,state,timer;
  try{
    const manifest=JSON.parse(fs.readFileSync(path.join(input,'manifest.json')));
    for(const [name,expected] of Object.entries(manifest.hashes))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(input,name))).digest('hex')!==expected)throw Error('Input snapshot changed: '+name);
    const model=JSON.parse(fs.readFileSync(path.join(input,'model.json')));
    const cfg={task:'falling-v1',hours,smoke,population:smoke?4:16,games:3,validationGames:smoke?3:9,testGames:smoke?3:24,
      cap:smoke?15:5000,durationMs:smoke?6000:180000,gravity:[800,500,250],controllerMs:50,trainFraction:.92,patience:12};
    if(fs.existsSync(sessionFile)){
      if(!resume)throw Error('Session exists. Use --resume or a fresh output directory.');
      state=JSON.parse(fs.readFileSync(sessionFile));if(JSON.stringify(state.config)!==JSON.stringify(cfg))throw Error('Resume configuration mismatch.');
      if(['complete','deadline_reached'].includes(state.status)){log('Session already finished; no new training started.');return;}
    }else state={version:1,config:cfg,status:'prepared',startedAt:new Date().toISOString(),elapsedSeconds:0,generation:0,rng:712349,
      initialWeights:norm(model.weights),mean:norm(model.weights),std:Array(8).fill(.3),bestWeights:norm(model.weights),
      baseline:[],bestScore:null,bestValidation:[],anchor:null,stale:0,restarts:0,history:[],pending:null,tests:[],testBefore:[],testAfter:[]};
    if(fs.existsSync(stopFile))fs.unlinkSync(stopFile);
    const start=Date.now(),prior=state.elapsedSeconds,deadline=start+Math.max(0,hours*3600000-prior*1000),trainDeadline=start+Math.max(0,hours*3600000*cfg.trainFraction-prior*1000);
    state.pid=process.pid;state.workers=workers;state.resumedAt=new Date(start).toISOString();state.deadlineAt=new Date(deadline).toISOString();
    const stopped=()=>fs.existsSync(stopFile);
    const signal=()=>{fs.writeFileSync(stopFile,'Graceful pause requested\n');};process.on('SIGINT',signal);process.on('SIGTERM',signal);
    function report(){
      const baseline=state.baseline.filter(Boolean),bestValidation=state.bestValidation.filter(Boolean);
      const rows=state.history.slice(-15).map(h=>`| ${h.generation} | ${h.validationLines.toFixed(2)} | ${h.bestScore.toFixed(4)} | ${h.restarts} |`).join('\n');
      let text=`# Falling-rules training\n\nStatus: **${state.status}**. Active process time ${(state.elapsedSeconds/3600).toFixed(3)} / ${hours} hours.\n\nStarted: ${state.startedAt}. Current deadline: ${state.deadlineAt}. CPU workers: ${workers}.\n\nExact browser FallingPlayer physics, 50 ms controller ticks, gravity 800/500/250 ms, 500 ms lock delay, horizontal kicks, soft drop and explicit hard drop.\n\nOnly eight readout weights learn. A fixed bounded planner finds legal tick routes, including slides beneath overhangs. It retains earliest routes to poses and is not exhaustive over all timer states. Warm start: ${manifest.source_checkpoint}.\n\nFitness = lines + pieces / 10000, preserving lines-first ranking. Training seeds change each generation; fixed validation seeds select weights. Fresh test seeds never affect selection.\n\nBaseline validation: ${baseline.length?mean(baseline.map(r=>r.lines)).toFixed(2):'pending'} lines/game. Best validation: ${bestValidation.length?mean(bestValidation.map(r=>r.lines)).toFixed(2):'pending'} lines/game.\n\n| Generation | Validation lines/game | Best fitness | Restarts |\n|---|---:|---:|---:|\n${rows}\n\n## Fresh held-out tests\n\n`;
      for(const gravity of cfg.gravity){const pairs=state.tests.filter(t=>t.after.gravityMs===gravity);text+=`${gravity} ms gravity: ${pairs.length} complete pairs`;if(pairs.length)text+=`, ${mean(pairs.map(t=>t.before.lines)).toFixed(2)} → ${mean(pairs.map(t=>t.after.lines)).toFixed(2)} lines/game`;text+='\n\n';}
      text+=`Overall test pairs: ${state.tests.length}/${cfg.testGames}. Incomplete games are discarded; a partial test set is not a full evaluation. Validation improvement alone is not proof of generalization.\n\nCheckpoints and input snapshots are independent of placement models. Nothing is automatically published to the game or leaderboards. Use best-model.json only with the falling controller, not the old placement worker.\n\nTo stop safely, create a file named STOP in this run directory. Resume with the same command and --resume.\n`;
      write(path.join(out,'MORNING_REPORT.md'),text);
    }
    function save(){
      state.elapsedSeconds=prior+(Date.now()-start)/1000;write(sessionFile,state);
      write(path.join(out,'checkpoint.json'),{config:{task:'falling-v1',seed:71,neurons:model.metadata.neurons,steps:model.metadata.steps,mode:'fly'},generation:state.generation,best_weights:state.bestWeights,initial_weights:state.initialWeights,best_validation_fitness:state.bestScore,model:model.metadata,rules:manifest,resume_with:'falling-overnight --resume',train_seconds:state.elapsedSeconds});
      write(path.join(out,'best-model.json'),{...model,weights:state.bestWeights,generation:state.generation,task:'falling-v1',controller:{tickMs:50,planner:'bounded-reachable-v1',physicsSha256:manifest.hashes['versus-core.js']}});
    }
    function job(weights,seed,gravityMs,record=false){return {weights,seed,gravityMs,cap:cfg.cap,durationMs:cfg.durationMs,record};}
    async function evaluate(weights,results,count,seedBase,end,record=false){
      const tasks=[];for(let i=0;i<count;i++)if(!results[i])tasks.push({job:job(weights,seedBase+Math.floor(i/3),cfg.gravity[i%3],record&&i===1),accept:r=>{results[i]=r;}});
      return pool.batch(tasks,end,save,stopped);
    }
    state.status='training';save();report();timer=setInterval(()=>{save();report();},30000);pool=new Pool();
    log(`Falling-rules run started: ${hours}h budget, ${workers} CPU workers, deadline ${state.deadlineAt}.`);
    log(`Frozen browser physics: ${manifest.hashes['versus-core.js']}; warm start ${manifest.source_checkpoint}.`);
    if(Array.from({length:cfg.validationGames},(_,i)=>state.baseline[i]).some(r=>!r)){
      const ok=await evaluate(state.initialWeights,state.baseline,cfg.validationGames,6000000,trainDeadline);if(!ok){state.status=stopped()?'paused':'deadline_reached';save();report();return;}
    }
    if(state.bestScore===null){state.bestScore=mean(state.baseline.map(r=>r.fitness));state.anchor=state.bestScore;state.bestValidation=state.baseline.slice();save();log(`Baseline: ${mean(state.baseline.map(r=>r.lines)).toFixed(2)} validation lines/game.`);}
    while(Date.now()<trainDeadline&&!stopped()&&(!smoke||state.generation<2)){
      if(!state.pending){const candidates=Array.from({length:cfg.population},()=>norm(state.mean.map((v,i)=>v+state.std[i]*normal(state))));candidates[0]=state.mean.slice();candidates[1]=state.bestWeights.slice();state.pending={candidates,scores:candidates.map(()=>[]),validation:[],proposal:null};save();}
      const p=state.pending,tasks=[];
      for(let i=0;i<cfg.population;i++)for(let g=0;g<cfg.games;g++)if(!p.scores[i][g])tasks.push({job:job(p.candidates[i],10000000+state.generation,cfg.gravity[g]),accept:r=>{p.scores[i][g]=r;}});
      if(!await pool.batch(tasks,trainDeadline,save,stopped))break;
      if(!p.proposal){const ranked=p.candidates.map((w,i)=>({w,score:mean(p.scores[i].map(r=>r.fitness))})).sort((a,b)=>b.score-a.score).slice(0,Math.max(2,cfg.population/4));
        const center=Array.from({length:8},(_,i)=>mean(ranked.map(c=>c.w[i])));
        p.proposal=norm(center.map((v,i)=>.2*state.mean[i]+.8*v));p.std=center.map((v,i)=>Math.max(.04,.2*state.std[i]+.8*Math.sqrt(mean(ranked.map(c=>(c.w[i]-v)**2)))));save();}
      if(!await evaluate(p.proposal,p.validation,cfg.validationGames,6000000,trainDeadline))break;
      const score=mean(p.validation.map(r=>r.fitness));state.mean=p.proposal;state.std=p.std;
      if(score>state.bestScore){state.bestScore=score;state.bestWeights=p.proposal.slice();state.bestValidation=p.validation.slice();}
      if(state.bestScore>=state.anchor+Math.max(1,Math.abs(state.anchor)*.01)){state.anchor=state.bestScore;state.stale=0;}else state.stale++;
      if(state.stale>=cfg.patience){state.restarts++;state.stale=0;state.mean=state.restarts%3===0?norm(Array.from({length:8},()=>normal(state))):state.bestWeights.slice();state.std=Array(8).fill(state.restarts%3===0?.7:.4);}
      state.generation++;const row={generation:state.generation,validationLines:mean(p.validation.map(r=>r.lines)),bestScore:state.bestScore,restarts:state.restarts};state.history.push(row);state.pending=null;save();report();
      log(`Generation ${row.generation}: validation ${row.validationLines.toFixed(2)} lines; best fitness ${row.bestScore.toFixed(4)}; restarts ${row.restarts}.`);
    }
    if(stopped()){state.status='paused';save();report();return;}
    state.status='evaluating';save();report();log('Training window ended. Evaluating on fresh seeds.');
    // Interleave baseline/final tests so a deadline leaves useful paired results.
    const tasks=[];for(let i=0;i<cfg.testGames;i++)for(const [label,weights] of [['testBefore',state.initialWeights],['testAfter',state.bestWeights]])if(!state[label][i])tasks.push({job:job(weights,7000000+Math.floor(i/3),cfg.gravity[i%3],label==='testAfter'&&i===1),accept:r=>{
      if(r.trace){write(path.join(out,'falling-replay.json'),r);delete r.trace;}state[label][i]=r;
      state.tests=[];for(let j=0;j<cfg.testGames;j++)if(state.testBefore[j]&&state.testAfter[j])state.tests.push({before:state.testBefore[j],after:state.testAfter[j]});
    }});
    await pool.batch(tasks,deadline,save,stopped);state.status=stopped()?'paused':state.tests.length===cfg.testGames?'complete':'deadline_reached';save();report();log(`${state.status}: ${state.tests.length}/${cfg.testGames} held-out pairs. See MORNING_REPORT.md.`);
  }catch(error){if(state){state.status='failed';state.error=error.stack;write(sessionFile,state);}throw error;}
  finally{if(timer)clearInterval(timer);if(pool)await pool.close();if(fs.existsSync(lockFile))fs.unlinkSync(lockFile);}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
