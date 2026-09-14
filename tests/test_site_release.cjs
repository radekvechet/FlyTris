const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
test('released snapshot, evaluated model and browser physics agree',()=>{
  const model=require('../site-data/versus-model.json'),results=require('../site-data/falling-results.json'),replay=require('../site-data/falling-replay.json');
  assert.equal(model.task,'falling-v1');assert.equal(model.metadata.model_sha256,results.modelId);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('flytris/web/versus-core.js')).digest('hex'),model.controller.physicsSha256);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('flytris/web/falling-policy.cjs')).digest('hex'),model.controller.plannerSha256);
  assert.equal(results.pairs.length,24);assert.equal(replay.seed,7000000);assert.equal(replay.gravityMs,500);
  assert.equal(results.summary.afterMean,results.pairs.reduce((n,p)=>n+p.after.lines,0)/24);
});
test('static build includes exactly one current-model summary and valid inline scripts',()=>{
  const sentinel='postgresql://build-check:fake-only@invalid.example/test';
  require('node:child_process').execFileSync(process.execPath,['scripts/build.cjs'],{env:{...process.env,DATABASE_URL:sentinel}});
  const html=fs.readFileSync('public/index.html','utf8');assert(!html.includes(sentinel));
  assert.equal((html.match(/aria-label="Current falling-rules model"/g)||[]).length,1);
  assert(!html.includes('__FALLING_'));
  const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert(csp.includes("connect-src 'self'"));assert(!csp.includes('unsafe-eval'));
  for(const [,code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
    assert.doesNotThrow(()=>new vm.Script(code));assert(csp.includes("'sha256-"+crypto.createHash('sha256').update(code).digest('base64')+"'"));
  }
  assert(html.includes('<option value="120000" selected>2 minutes</option>'));
  for(const file of ['FALLING_RESULTS.md','falling-results.json','falling-replay.json','LICENSE','NOTICE.md','DATA_NOTICE.md'])assert(fs.existsSync('public/'+file),file);
});
test('publishing fails if a credential URL is accidentally included in public files',()=>{
  const file='public/credential-leak-test.txt';fs.writeFileSync(file,'postgresql://fake:credential@invalid.example/test');
  try{assert.throws(()=>require('node:child_process').execFileSync(process.execPath,['scripts/build.cjs'],{stdio:'pipe'}),e=>String(e.stderr).includes('Refusing to publish database credentials'));}
  finally{fs.unlinkSync(file);}
});
