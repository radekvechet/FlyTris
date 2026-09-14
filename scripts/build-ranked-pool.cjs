// Offline only: amortize fly inference across ranked visitors.
const fs=require('node:fs'),crypto=require('node:crypto'),F=require('../flytris/web/falling-policy.cjs');
const model=require('../site-data/versus-model.json'),shapes=require('../site-data/shapes.json');
const runs=[];
for(const [difficulty,gravityMs] of Object.entries({easy:800,medium:500,hard:250}))for(const seed of [810001,810002,810003]){
  const start=performance.now(),r=F.play(model,shapes,model.weights,seed,gravityMs,{durationMs:120000,record:true});
  const actions=r.trace.flatMap(t=>t.actions);while(actions.length<2400&&r.alive)actions.push('wait');
  runs.push({id:difficulty+'-'+seed,difficulty,seed,gravityMs,actions,lines:r.lines,pieces:r.pieces});
  console.log(difficulty,seed,r.lines,'lines',((performance.now()-start)/1000).toFixed(1)+'s');
}
const pool={version:1,modelId:model.metadata.model_sha256,durationMs:120000,runs};
pool.poolId=crypto.createHash('sha256').update(JSON.stringify(pool)).digest('hex');
fs.writeFileSync('site-data/ranked-pool.json',JSON.stringify(pool));console.log('Ranked pool ready:',pool.poolId);
