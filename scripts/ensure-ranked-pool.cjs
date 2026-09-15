const fs=require('node:fs'),crypto=require('node:crypto');
const config=require('../game-config.json'),model=require('../site-data/versus-model.json');
if(!Number.isInteger(config.rulesVersion)||config.rulesVersion<6||!Object.hasOwn(config.presets,config.defaultDifficulty))throw Error('Invalid game config version or default difficulty.');
for(const difficulty of ['easy','medium','hard']){
  const p=config.presets[difficulty];
  for(const [field,max] of Object.entries({gravityMs:5000,flyMs:5000,flyControlMs:1000,durationMs:120000})){
    const value=p?.[field];
    const multiple=field!=='flyControlMs';
    if(!Number.isInteger(value)||value<50||value>max||(multiple&&value%50!==0))throw Error(`Invalid ${difficulty}.${field}: ${value}. Use ${multiple?'a multiple of 50':'whole'} milliseconds between 50 and ${max}.`);
  }
}
const configHash=crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
let pool;try{pool=JSON.parse(fs.readFileSync('site-data/ranked-pool.json','utf8'));}catch{}
if(pool?.configHash&&pool.configHash!==configHash&&pool.rulesVersion>=config.rulesVersion)throw Error('Increase rulesVersion in game-config.json when changing defaults to keep earlier scoreboards separate.');
if(pool?.configHash!==configHash||pool?.modelId!==model.metadata.model_sha256){
  console.log('Difficulty defaults changed; rebuilding ranked fly recordings.');
  require('./build-ranked-pool.cjs');
}
