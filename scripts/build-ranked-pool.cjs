// Offline only: amortize fly inference across ranked visitors.
const fs=require('node:fs'),crypto=require('node:crypto'),F=require('../flytris/web/falling-policy.cjs');
const model=require('../site-data/versus-model.json'),shapes=require('../site-data/shapes.json'),L=require('../flytris/web/falling-live.js');
const config=require('../game-config.json');
const runs=[];
for(const [difficulty,preset] of Object.entries(config.presets))for(const seed of [810001,810002,810003]){
  // A match can finish between fly actions; only simulate complete control ticks.
  const {gravityMs,flyMs,flyControlMs:controlTickMs}=preset,durationMs=Math.floor(preset.durationMs/controlTickMs)*50;
  const start=performance.now(),r=F.play(model,shapes,model.weights,seed,flyMs,{durationMs,record:true});
  const actions=r.trace.flatMap(t=>t.actions);while(actions.length<Math.floor(preset.durationMs/controlTickMs)&&r.alive)actions.push('wait');
  runs.push({id:difficulty+'-'+seed,difficulty,seed,gravityMs,flyMs,controlTickMs,durationMs:preset.durationMs,actions,lines:r.lines,pieces:r.pieces});
  console.log(difficulty,seed,r.lines,'lines',((performance.now()-start)/1000).toFixed(1)+'s');
}
const pool={version:2,rulesVersion:L.RANKED_RULES,modelId:model.metadata.model_sha256,configHash:crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex'),runs};
pool.poolId=crypto.createHash('sha256').update(JSON.stringify(pool)).digest('hex');
fs.writeFileSync('site-data/ranked-pool.json',JSON.stringify(pool));console.log('Ranked pool ready:',pool.poolId);
