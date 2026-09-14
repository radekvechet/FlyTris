const fs=require('node:fs'),crypto=require('node:crypto');
const config=require('../game-config.json'),model=require('../site-data/versus-model.json');
if(!Number.isInteger(config.rulesVersion)||config.rulesVersion<6||!Object.hasOwn(config.presets,config.defaultDifficulty))throw Error('Invalid game config version or default difficulty.');
for(const difficulty of ['easy','medium','hard']){
  const p=config.presets[difficulty];
  if(!p||!['gravityMs','flyMs','flyControlMs','durationMs'].every(k=>Number.isInteger(p[k])&&p[k]>=50&&p[k]%50===0)||p.gravityMs>5000||p.flyMs>5000||p.flyControlMs>1000||p.durationMs>120000||p.durationMs%p.flyControlMs!==0)throw Error(`Invalid ${difficulty} preset: use positive 50 ms multiples, gravity at most 5000 ms, fly controls at most 1000 ms, duration at most 120000 ms and divisible by flyControlMs.`);
}
const configHash=crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
let pool;try{pool=JSON.parse(fs.readFileSync('site-data/ranked-pool.json','utf8'));}catch{}
if(pool?.configHash&&pool.configHash!==configHash&&pool.rulesVersion>=config.rulesVersion)throw Error('Increase rulesVersion in game-config.json when changing defaults to keep earlier scoreboards separate.');
if(pool?.configHash!==configHash||pool?.modelId!==model.metadata.model_sha256){
  console.log('Difficulty defaults changed; rebuilding ranked fly recordings.');
  require('./build-ranked-pool.cjs');
}
