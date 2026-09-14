const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function prepare(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flytris-runner-')),input=path.join(dir,'input');fs.mkdirSync(input);
  const files={'model.json':'site-data/versus-model.json','shapes.json':'site-data/shapes.json','versus-core.js':'flytris/web/versus-core.js','falling-policy.cjs':'flytris/web/falling-policy.cjs'},hashes={};
  for(const [name,source] of Object.entries(files)){const raw=fs.readFileSync(path.join(root,source));fs.writeFileSync(path.join(input,name),raw);hashes[name]=crypto.createHash('sha256').update(raw).digest('hex');}
  fs.writeFileSync(path.join(input,'manifest.json'),JSON.stringify({hashes,source_checkpoint:'test fixture'}));return dir;
}
function run(dir,hours,stopAfterFirst=false,resume=false){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(root,'scripts/train-falling.cjs'),'--out',dir,'--hours',String(hours),'--workers','1','--smoke',...(resume?['--resume']:[])],{windowsHide:true});let stderr='';child.stdout.resume();child.stderr.on('data',b=>stderr+=b);
  const timeout=setTimeout(()=>{child.kill();reject(Error('Trainer test timed out'));},60000);
  const poll=stopAfterFirst?setInterval(()=>{try{const s=JSON.parse(fs.readFileSync(path.join(dir,'session.json')));if(s.baseline.filter(Boolean).length)fs.writeFileSync(path.join(dir,'STOP'),'test pause');}catch{}},5):null;
  child.on('error',reject);child.on('close',code=>{clearTimeout(timeout);if(poll)clearInterval(poll);code===0?resolve(JSON.parse(fs.readFileSync(path.join(dir,'session.json')))):reject(Error(stderr));});
});}
test('pause mid-baseline, resume deterministically, and honor the wall-clock budget',async()=>{
  const dir=prepare();const paused=await run(dir,.05,true);
  assert.equal(paused.status,'paused');assert(paused.baseline.filter(Boolean).length>0);
  // Exercise sparse, serialized partial results on resume as well as normal pause.
  paused.baseline=[paused.baseline[0],null];fs.writeFileSync(path.join(dir,'session.json'),JSON.stringify(paused));
  const resumed=await run(dir,.05,false,true),control=await run(prepare(),.05);
  assert.equal(resumed.status,'complete');assert.equal(resumed.generation,2);
  for(const key of ['rng','mean','std','bestWeights','history','tests'])assert.deepEqual(resumed[key],control[key],key);
  assert(!fs.existsSync(path.join(dir,'trainer.lock')));
  const start=Date.now(),limited=await run(prepare(),.00005);
  assert.equal(limited.status,'deadline_reached');assert(Date.now()-start<5000);assert.equal(limited.generation,0);
});
