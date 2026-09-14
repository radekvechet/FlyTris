const {test}=require('node:test'),assert=require('node:assert/strict');
const {localDatabase,migrate}=require('../server/db.cjs'),{makeRankedService}=require('../server/ranked.cjs'),verify=require('../server/verify.cjs');
const pool=require('../site-data/ranked-pool.json'),model=require('../site-data/versus-model.json');
async function fixture(difficulty='medium'){const db=localDatabase(':memory:');await migrate(db);let time=1000000;const service=makeRankedService(db,model.metadata.model_sha256,()=>time);const s=await service.start({difficulty,rulesVersion:5,modelHash:model.metadata.model_sha256});return {db,service,s,run:pool.runs.find(r=>r.id===s.flyRun.id),add:n=>time+=n};}
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
    const [row]=await f.db.query('SELECT * FROM flytris_matches WHERE id=$1',[f.s.id]);assert.equal(row.fly_lines,receipt.fly.lines);assert.equal(row.human_pieces,receipt.human.pieces);assert.equal(row.elapsed_ms,state.elapsedMs);assert.equal(row.winner,'fly');assert.equal(row.rules_version,5);
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
test('Medium halves fly simulation speed while human time and verification stay in sync',()=>{
  const L=require('../flytris/web/falling-live.js'),shapes=require('../site-data/shapes.json');
  for(const difficulty of ['easy','medium','hard']){
    const run=pool.runs.find(r=>r.difficulty===difficulty),bot=new L.Controller(run.seed,shapes,run.gravityMs);
    let state=verify.initial(run),steps=0;
    for(let elapsed=50;elapsed<=10000;elapsed+=50){
      const index=L.actionIndex(elapsed,L.controlTickMs(difficulty));
      if(index!==null){bot.step(run.actions[index]);steps++;}
      state=verify.advance(state,'BT',run);
      assert.deepEqual(state.fly,L.snapshot(bot.player,run.seed));
      assert.equal(state.elapsedMs,elapsed);
      if(elapsed===50&&difficulty==='medium'){
        assert.equal(state.fly.state.fallTime,0);
        assert.equal(state.human.state.fallTime,50);
      }
    }
    assert.equal(steps,difficulty==='medium'?100:200);
    assert.equal(bot.time,difficulty==='medium'?5000:10000);
  }
});
test('ranked cadence comes from the server and retired rules cannot start or enter rankings',async()=>{
  const f=await fixture();try{
    assert.equal(f.s.settings.flyControlMs,100);
    await assert.rejects(f.service.start({difficulty:'medium',rulesVersion:4,modelHash:model.metadata.model_sha256}),{status:409});
    const {commands,state}=topout(f.run);f.add(state.elapsedMs);
    await f.service.checkpoint({...credentials(f.s),sequence:1,commands});
    await f.service.finish(credentials(f.s));
    await f.db.query('UPDATE flytris_matches SET rules_version=4 WHERE id=$1',[f.s.id]);
    assert.equal((await f.service.leaderboard('all')).summary.matches,0);
  }finally{f.db.close();}
});
test('a full two-minute game is scored from twelve verified checkpoints',async()=>{
  const f=await fixture('easy');try{
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
test('every committed fly run reproduces its published score at its assigned pace',()=>{
  const L=require('../flytris/web/falling-live.js'),shapes=require('../site-data/shapes.json');
  for(const run of pool.runs){
    const bot=new L.Controller(run.seed,shapes,run.gravityMs);
    assert.equal(run.controlTickMs,L.controlTickMs(run.difficulty));
    assert.equal(run.actions.length,120000/run.controlTickMs);
    for(let elapsed=50;elapsed<=120000;elapsed+=50){
      const index=L.actionIndex(elapsed,run.controlTickMs);
      if(index!==null)bot.step(run.actions[index]);
    }
    assert.equal(bot.player.lines,run.lines);assert.equal(bot.player.pieces,run.pieces);
  }
});
test('a full Medium game saves the slower fly score after all twelve checkpoints',async()=>{
  const f=await fixture();try{
    const F=require('../flytris/web/falling-policy.cjs'),shapes=require('../site-data/shapes.json');
    // Independent legal human input at normal speed keeps both boards alive for two minutes.
    const human=F.play(model,shapes,model.weights,f.run.seed,500,{durationMs:120000,record:true});
    const actions=human.trace.flatMap(t=>t.actions);while(actions.length<2400)actions.push('wait');
    let receipt;
    for(let offset=0;offset<2400;offset+=200){
      const commands=actions.slice(offset,offset+200).map(a=>actionCode[a]+'B'+(a==='soft'?'S':'T')).join('');
      f.add(10000);receipt=await f.service.checkpoint({...credentials(f.s),sequence:offset/200+1,commands});
    }
    assert.equal(receipt.reason,'time');assert.equal(receipt.elapsedMs,120000);
    assert.equal(receipt.fly.lines,f.run.lines);assert.equal(receipt.fly.pieces,f.run.pieces);
    assert.equal(receipt.human.lines,human.lines);
    await f.service.finish({...credentials(f.s),result:{settings:{...f.s.settings,seed:f.s.seed},model:{model_sha256:model.metadata.model_sha256},reason:'time',elapsedSeconds:120,human:receipt.human,fly:receipt.fly}});
    const [row]=await f.db.query('SELECT fly_lines,rules_version FROM flytris_matches WHERE id=$1',[f.s.id]);
    assert.equal(row.fly_lines,f.run.lines);assert.equal(row.rules_version,5);
  }finally{f.db.close();}
});
