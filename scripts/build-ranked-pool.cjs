// Offline only: amortize fly inference across ranked visitors.
const fs=require('node:fs'),crypto=require('node:crypto'),F=require('../flytris/web/falling-policy.cjs');
const model=require('../site-data/versus-model.json'),shapes=require('../site-data/shapes.json'),L=require('../flytris/web/falling-live.js');
const runs=[];
for(const [difficulty,gravityMs] of Object.entries({easy:800,medium:500,hard:250}))for(const seed of [810001,810002,810003]){
  const controlTickMs=L.controlTickMs(difficulty),durationMs=120000*50/controlTickMs;
  const start=performance.now(),r=F.play(model,shapes,model.weights,seed,gravityMs,{durationMs,record:true});
  const actions=r.trace.flatMap(t=>t.actions);while(actions.length<120000/controlTickMs&&r.alive)actions.push('wait');
  runs.push({id:difficulty+'-'+seed,difficulty,seed,gravityMs,controlTickMs,actions,lines:r.lines,pieces:r.pieces});
  console.log(difficulty,seed,r.lines,'lines',((performance.now()-start)/1000).toFixed(1)+'s');
}
const pool={version:2,rulesVersion:L.RANKED_RULES,modelId:model.metadata.model_sha256,durationMs:120000,runs};
pool.poolId=crypto.createHash('sha256').update(JSON.stringify(pool)).digest('hex');
fs.writeFileSync('site-data/ranked-pool.json',JSON.stringify(pool));console.log('Ranked pool ready:',pool.poolId);
