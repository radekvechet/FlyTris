const {test}=require('node:test'),assert=require('node:assert/strict');
const {localDatabase,migrate}=require('../server/db.cjs'),{makeRankedService}=require('../server/ranked.cjs'),verify=require('../server/verify.cjs');
const pool=require('../site-data/ranked-pool.json'),model=require('../site-data/versus-model.json');
async function fixture(){const db=localDatabase(':memory:');await migrate(db);let time=1000000;const service=makeRankedService(db,model.metadata.model_sha256,()=>time);const s=await service.start({difficulty:'medium',rulesVersion:4,modelHash:model.metadata.model_sha256});return {db,service,s,run:pool.runs.find(r=>r.id===s.flyRun.id),add:n=>time+=n};}
const credentials=s=>({id:s.id,token:s.token});
// Simulate whole ticks until the human stacks to the top; the last hard drop may end mid-tick.
function topout(run){let state=verify.initial(run),commands='';for(let i=0;i<100;i++){
  try{const next=verify.advance(state,'BHT',run);state=next;commands+='BHT';}catch(e){if(!e.message.includes('Inputs continue'))throw e;state=verify.advance(state,'BH',run);commands+='BH';}
  if(state.reason)return {commands,state};
}throw Error('Fixture did not finish');}
test('checkpoints compute both scores; invalid totals cannot be saved',async()=>{
  const f=await fixture();try{
    const {commands,state}=topout(f.run);f.add(state.elapsedMs);
    const input={...credentials(f.s),sequence:1,commands};const receipt=await f.service.checkpoint(input);
    assert.equal(receipt.reason,'human-topout');assert.equal(receipt.human.lines,0);
    assert.equal((await f.db.query('SELECT completed_at FROM flytris_matches WHERE id=$1',[f.s.id]))[0].completed_at,null);
    await assert.rejects(f.service.finish({...credentials(f.s),result:{reason:'time',elapsedSeconds:120}}),{status:400});
    assert.equal((await f.service.leaderboard('all')).summary.matches,0);
    const saved=await f.service.finish(credentials(f.s));assert.equal(saved.saved,true);
    await f.service.finish(credentials(f.s));assert.equal((await f.service.leaderboard('all')).summary.matches,1);
    const [row]=await f.db.query('SELECT * FROM flytris_matches WHERE id=$1',[f.s.id]);assert.equal(row.fly_lines,receipt.fly.lines);assert.equal(row.human_pieces,receipt.human.pieces);assert.equal(row.elapsed_ms,state.elapsedMs);assert.equal(row.winner,'fly');assert.equal(row.rules_version,4);
  }finally{f.db.close();}
});
test('retries are idempotent; altered past batches, future clocks and fabricated finishes fail',async()=>{
 const f=await fixture();try{
  const input={...credentials(f.s),sequence:1,commands:'BT'.repeat(200)};
  await assert.rejects(f.service.checkpoint(input),/ahead/);f.add(10000);
  const first=await f.service.checkpoint(input);assert.deepEqual(await f.service.checkpoint(input),first);
  await assert.rejects(f.service.checkpoint({...input,commands:'BS'.repeat(200)}),{status:409});
  await assert.rejects(f.service.checkpoint({...input,sequence:3}),{status:409});
  await assert.rejects(f.service.checkpoint({...input,sequence:2}),/ahead/);
  await assert.rejects(f.service.finish(credentials(f.s)),/not verified/);
  await assert.rejects(f.service.checkpoint({...input,sequence:2,commands:'evil'}),{status:400});
  assert.equal((await f.db.query('SELECT sequence FROM flytris_checkpoints WHERE match_id=$1',[f.s.id]))[0].sequence,1);
 }finally{f.db.close();}
});
test('verification bounds action rate and tick ordering',()=>{
 const run=pool.runs[0],state=verify.initial(run);
 for(const commands of ['T','BBT','B','HHLBT','LLLLLLLLLBT','BT'.repeat(201)])assert.throws(()=>verify.advance(state,commands,run),{status:400});
 assert.doesNotThrow(()=>verify.advance(state,'LRCABT',run));
});
test('concurrent checkpoints accept one revision and preserve a deterministic state',async()=>{
 const f=await fixture();try{f.add(10000);const input={...credentials(f.s),sequence:1,commands:'BT'.repeat(200)};
  const results=await Promise.allSettled([f.service.checkpoint(input),f.service.checkpoint(input)]);assert(results.some(r=>r.status==='fulfilled'));
  assert.equal((await f.db.query('SELECT sequence FROM flytris_checkpoints WHERE match_id=$1',[f.s.id]))[0].sequence,1);
  assert.equal((await f.service.checkpoint(input)).elapsedMs,10000);
 }finally{f.db.close();}
});
const actionCode={left:'L',right:'R',cw:'C',ccw:'A',hard:'H',soft:'',wait:''};
test('a full two-minute game is scored from twelve verified checkpoints',async()=>{
  const f=await fixture();try{
    let last;
    for(let offset=0;offset<2400;offset+=200){
      const commands=f.run.actions.slice(offset,offset+200).map(a=>actionCode[a]+'B'+(a==='soft'?'S':'T')).join('');
      f.add(10000);last=await f.service.checkpoint({...credentials(f.s),sequence:offset/200+1,commands});
    }
    assert.equal(last.elapsedMs,120000);assert.equal(last.reason,'time');assert.deepEqual(last.human,last.fly);
    const result={settings:{...f.s.settings,seed:f.s.seed},model:{model_sha256:model.metadata.model_sha256},reason:last.reason,elapsedSeconds:120,human:last.human,fly:last.fly};
    await f.service.finish({...credentials(f.s),result});
    const [row]=await f.db.query('SELECT winner,elapsed_ms,human_lines,fly_lines FROM flytris_matches WHERE id=$1',[f.s.id]);
    assert.equal(row.winner,'draw');assert.equal(row.elapsed_ms,120000);assert.equal(row.fly_lines,f.run.lines);
  }finally{f.db.close();}
});
test('every committed fly run reproduces its published score',()=>{
  for(const run of pool.runs){let state=verify.initial(run);
    for(let offset=0;offset<2400;offset+=200){const commands=run.actions.slice(offset,offset+200).map(a=>actionCode[a]+'B'+(a==='soft'?'S':'T')).join('');state=verify.advance(state,commands,run);}
    assert.equal(state.fly.state.lines,run.lines);assert.equal(state.fly.state.pieces,run.pieces);assert.equal(state.reason,'time');
  }
});
