// Freeze one saved checkpoint, then run the predeclared fresh test seeds.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const write=require('./atomic-write.cjs');
const args=process.argv.slice(2),get=(k,f)=>{const i=args.indexOf('--'+k);return i<0?f:args[i+1];};
const run=path.resolve(get('run','runs/falling_overnight')),out=path.resolve(get('out','runs/falling_release'));
const source=JSON.parse(fs.readFileSync(path.join(run,'session.json'))),input=path.join(run,'input');
const manifest=JSON.parse(fs.readFileSync(path.join(input,'manifest.json')));
for(const [name,hash] of Object.entries(manifest.hashes))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(input,name))).digest('hex')!==hash)throw Error('Frozen input mismatch: '+name);
fs.mkdirSync(out,{recursive:true});
const frozenInput=path.join(out,'input');fs.mkdirSync(frozenInput,{recursive:true});
for(const name of [...Object.keys(manifest.hashes),'manifest.json']){
  const target=path.join(frozenInput,name),raw=fs.readFileSync(path.join(input,name));
  if(fs.existsSync(target)&&!fs.readFileSync(target).equals(raw))throw Error('Evaluation input changed: '+name);
  if(!fs.existsSync(target))fs.writeFileSync(target,raw);
}
const checkpoint={task:'falling-v1',generation:source.generation,weights:source.bestWeights,initialWeights:source.initialWeights,trainingSeconds:source.elapsedSeconds,trainingStatus:source.status,baselineValidation:source.baseline,bestValidation:source.bestValidation,manifest};
if(fs.existsSync(path.join(out,'checkpoint.json'))&&JSON.stringify(JSON.parse(fs.readFileSync(path.join(out,'checkpoint.json'))))!==JSON.stringify(checkpoint))throw Error('Evaluation directory belongs to another checkpoint. Choose a new --out.');
write(path.join(out,'checkpoint.json'),checkpoint);
const progressFile=path.join(out,'evaluation.json'),state=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile)):{status:'evaluating',startedAt:new Date().toISOString(),games:[]};
if(state.status==='complete'){console.log('Evaluation already complete; existing results retained.');process.exit(0);}
const tasks=[];for(let i=0;i<24;i++)for(const side of ['before','after'])if(!state.games.some(g=>g.index===i&&g.side===side))tasks.push({index:i,side,seed:7000000+Math.floor(i/3),gravityMs:[800,500,250][i%3]});
let cursor=0;const deadline=Date.now()+20*60000;
async function lane(){
  const worker=new Worker(path.join(__dirname,'falling-worker.cjs'),{workerData:{input:frozenInput,stopFile:path.join(out,'STOP')}});
  try{while(cursor<tasks.length){const task=tasks[cursor++],id=task.index*2+(task.side==='after'?1:0);
    const result=await new Promise((resolve,reject)=>{
      const clean=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exit);};
      const message=m=>{clean();m.error?reject(Error(m.error)):resolve(m.result);},error=e=>{clean();reject(e);},exit=code=>error(Error('Worker exited '+code));
      worker.once('message',message);worker.once('error',error);worker.once('exit',exit);
      worker.postMessage({id,weights:task.side==='before'?checkpoint.initialWeights:checkpoint.weights,seed:task.seed,gravityMs:task.gravityMs,durationMs:180000,cap:5000,deadline,record:task.side==='after'&&task.index===1});
    });
    if(result.trace){write(path.join(out,'replay.json'),result);delete result.trace;}
    state.games.push({...task,result});state.games.sort((a,b)=>a.index-b.index||a.side.localeCompare(b.side));write(progressFile,state);console.log(`${state.games.length}/48 ${task.side} ${task.gravityMs}ms: ${result.lines} lines`);
  }}finally{await worker.terminate();}
}
Promise.allSettled(Array.from({length:4},lane)).then(results=>{
  const error=results.find(r=>r.status==='rejected');if(error){state.status='failed';state.error=String(error.reason);write(progressFile,state);throw error.reason;}
  const mean=a=>a.reduce((n,v)=>n+v,0)/a.length;
  state.pairs=Array.from({length:24},(_,index)=>({before:state.games.find(g=>g.index===index&&g.side==='before').result,after:state.games.find(g=>g.index===index&&g.side==='after').result}));
  // Bootstrap piece-sequence clusters, since each seed is repeated at three speeds.
  const gains=Array.from({length:8},(_,seed)=>mean(state.pairs.slice(seed*3,seed*3+3).map(p=>p.after.lines-p.before.lines)));
  let randomState=91626;const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const samples=Array.from({length:10000},()=>mean(gains.map(()=>gains[Math.floor(random()*gains.length)]))).sort((a,b)=>a-b);
  state.summary={beforeMean:mean(state.pairs.map(p=>p.before.lines)),afterMean:mean(state.pairs.map(p=>p.after.lines)),pairedGain:mean(gains),paired95CI:[samples[250],samples[9749]],independentSeeds:8,pairs:24};
  state.status='complete';state.completedAt=new Date().toISOString();write(progressFile,state);console.log(JSON.stringify(state.summary));
}).catch(e=>{console.error(e);process.exitCode=1;});
