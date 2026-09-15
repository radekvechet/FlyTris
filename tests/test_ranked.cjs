const {test}=require('node:test'),assert=require('node:assert/strict');
const {localDatabase,migrate}=require('../server/db.cjs'),{makeRankedService}=require('../server/ranked.cjs'),verify=require('../server/verify.cjs');
const pool=require('../site-data/ranked-pool.json'),model=require('../site-data/versus-model.json');
async function fixture(difficulty='medium'){const db=localDatabase(':memory:');await migrate(db);let time=1000000;const service=makeRankedService(db,model.metadata.model_sha256,()=>time);const s=await service.start({difficulty,rulesVersion:config.rulesVersion,modelHash:model.metadata.model_sha256});return {db,service,s,run:pool.runs.find(r=>r.id===s.flyRun.id),add:n=>time+=n};}
const config=require('../game-config.json');
const credentials=s=>({id:s.id,token:s.token});
test('saving a name returns its full 24-hour rank with difficulty and tie-break isolation',async()=>{
  const f=await fixture();try{
    const {commands,state}=topout(f.run);f.add(state.elapsedMs);
    await f.service.checkpoint({...credentials(f.s),sequence:1,commands});await f.service.finish(credentials(f.s));
    const [target]=await f.db.query('SELECT * FROM flytris_matches WHERE id=$1',[f.s.id]);
    async function rival(id,changes={}){
      const r={...target,id,...changes};
      await f.db.query('INSERT INTO flytris_matches (id,token_hash,difficulty,model_hash,seed,started_at,rules_version,completed_at,human_lines,human_pieces) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[r.id,r.token_hash,r.difficulty,r.model_hash,r.seed,r.started_at,r.rules_version,r.completed_at,r.human_lines,r.human_pieces]);
    }
    for(let i=0;i<12;i++)await rival('higher-'+i,{human_lines:1});
    await rival('000-tied-earlier-id');
    await rival('zzz-tied-later-id');
    await rival('older',{completed_at:Number(target.completed_at)-86400001,human_lines:100});
    await rival('other-difficulty',{difficulty:'hard',human_lines:100});
    await rival('retired',{rules_version:5,human_lines:100});
    const result=await f.service.rename({...credentials(f.s),name:' Radek '});
    assert.equal(result.name,'Radek');assert.equal(result.rank,14);assert.equal(result.difficulty,'medium');assert.equal(result.window,'24h');
    assert.equal((await f.service.rename({...credentials(f.s),name:''})).name,'anonymous');
  }finally{f.db.close();}
});
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
    const [row]=await f.db.query('SELECT * FROM flytris_matches WHERE id=$1',[f.s.id]);assert.equal(row.fly_lines,receipt.fly.lines);assert.equal(row.human_pieces,receipt.human.pieces);assert.equal(row.elapsed_ms,state.elapsedMs);assert.equal(row.winner,'fly');assert.equal(row.rules_version,config.rulesVersion);
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
test('configured fly cadence keeps human time and browser/server verification in sync',()=>{
  const L=require('../flytris/web/falling-live.js'),shapes=require('../site-data/shapes.json');
  for(const difficulty of ['easy','medium','hard']){
    const run=pool.runs.find(r=>r.difficulty===difficulty),bot=new L.Controller(run.seed,shapes,run.flyMs);
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
    assert.equal(steps,Math.floor(10000/L.controlTickMs(difficulty)));
    assert.equal(bot.time,Math.floor(10000/L.controlTickMs(difficulty))*50);
  }
});
test('ranked cadence comes from the server and retired rules cannot start or enter rankings',async()=>{
  const f=await fixture();try{
    assert.equal(f.s.settings.flyControlMs,config.presets.medium.flyControlMs);
    await assert.rejects(f.service.start({difficulty:'medium',rulesVersion:config.rulesVersion-1,modelHash:model.metadata.model_sha256}),{status:409});
    const {commands,state}=topout(f.run);f.add(state.elapsedMs);
    await f.service.checkpoint({...credentials(f.s),sequence:1,commands});
    await f.service.finish(credentials(f.s));
    await f.db.query('UPDATE flytris_matches SET rules_version=$1 WHERE id=$2',[config.rulesVersion-1,f.s.id]);
    assert.equal((await f.service.leaderboard('all')).summary.matches,0);
  }finally{f.db.close();}
});
test('350 and 360 ms intervals dispatch every complete action once without drifting',()=>{
  const L=require('../flytris/web/falling-live.js');
  for(const interval of [350,360]){
    const indices=[];
    for(let elapsed=50;elapsed<=120000;elapsed+=50){
      const index=L.actionIndex(elapsed,interval);
      if(index!==null){indices.push(index);assert(elapsed>=(index+1)*interval);assert(elapsed-(index+1)*interval<50);}
    }
    assert.deepEqual(indices,Array.from({length:Math.floor(120000/interval)},(_,i)=>i));
  }
});
test('a match ending between fly ticks verifies without an extra action',()=>{
  const L=require('../flytris/web/falling-live.js'),shapes=require('../site-data/shapes.json');
  const source=pool.runs.find(r=>r.controlTickMs>50);
  const run={...source,durationMs:Math.ceil(source.controlTickMs*3/50)*50+50};
  const bot=new L.Controller(run.seed,shapes,run.flyMs);
  for(const action of run.actions.slice(0,3))bot.step(action);
  const state=verify.advance(verify.initial(run),'BT'.repeat(run.durationMs/50),run);
  assert.equal(state.reason,'time');assert.equal(state.elapsedMs,run.durationMs);
  assert.deepEqual(state.fly,L.snapshot(bot.player,run.seed));
});
test('every committed fly run reproduces its published score at its assigned pace',()=>{
  const L=require('../flytris/web/falling-live.js'),shapes=require('../site-data/shapes.json');
  for(const run of pool.runs){
    const bot=new L.Controller(run.seed,shapes,run.flyMs);
    assert.equal(run.controlTickMs,L.controlTickMs(run.difficulty));
    assert.equal(run.actions.length,Math.floor(run.durationMs/run.controlTickMs));
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
    assert.equal(row.fly_lines,f.run.lines);assert.equal(row.rules_version,config.rulesVersion);
  }finally{f.db.close();}
});
