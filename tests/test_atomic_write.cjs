const {test}=require('node:test'),assert=require('node:assert/strict');const write=require('../scripts/atomic-write.cjs');
test('temporary Windows rename lock retries and preserves the prior checkpoint',()=>{
  const files=new Map([['checkpoint','old']]);let attempts=0,waits=0;
  const io={writeFileSync:(p,v)=>files.set(p,v),existsSync:p=>files.has(p),unlinkSync:p=>files.delete(p),renameSync:(a,b)=>{assert.equal(files.get(b),'old');if(++attempts<3)throw Object.assign(Error('locked'),{code:'EPERM'});files.set(b,files.get(a));files.delete(a);}};
  write('checkpoint','new',io,()=>waits++);assert.equal(files.get('checkpoint'),'new');assert.equal(waits,2);assert.equal(files.size,1);
});
test('permanent write failure does not delete the last good checkpoint',()=>{
  const files=new Map([['checkpoint','old']]);
  const io={writeFileSync:(p,v)=>files.set(p,v),existsSync:p=>files.has(p),unlinkSync:p=>files.delete(p),renameSync:()=>{throw Object.assign(Error('denied'),{code:'EACCES'});}};
  assert.throws(()=>write('checkpoint','new',io,()=>{}),/denied/);assert.equal(files.get('checkpoint'),'old');assert.equal(files.size,1);
});
