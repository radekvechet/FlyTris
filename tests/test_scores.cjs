const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {localDatabase,migrate}=require('../server/db.cjs');const {makeService,name}=require('../server/scores.cjs');
const empty=()=>Array.from({length:20},()=>Array(10).fill(0));
function stats(lines=2,pieces=5,alive=true){const board=empty();let n=pieces*4-lines*10;for(let y=19;y>=0;y--)for(let x=0;x<10;x++)if(n-->0)board[y][x]=1;return {lines,pieces,alive,clears:[lines,0,0,0],board};}
function result(s){return {settings:{...s.settings,seed:s.seed},model:{graph_sha256:'model-test'},elapsedSeconds:180,reason:'time',human:stats(),fly:stats(1,4)};}
async function fixture(){const db=localDatabase(':memory:');await migrate(db);let time=Date.UTC(2026,8,14,12);return {db,service:makeService(db,'model-test',()=>time),add:n=>time+=n,set:n=>time=n,now:()=>time};}
test('one timestamped match atomically records both scores; retries do not duplicate',async()=>{
  const f=await fixture();try{const s=await f.service.start({difficulty:'medium',modelHash:'model-test'});f.add(180000);
    const payload={...s,result:result(s)};const saved=await f.service.finish(payload);assert.equal(saved.name,'anonymous');assert.equal(saved.timestamp,new Date(f.now()).toISOString());
    await Promise.all([f.service.finish(payload),f.service.finish(payload)]);const d=await f.service.leaderboard('all');assert.equal(d.summary.matches,1);assert.equal(d.summary.human_lines,2);assert.equal(d.summary.fly_lines,1);assert.equal(d.summary.human_wins,1);
    await f.service.rename({...s,name:'   Radek   '});assert.equal((await f.service.leaderboard('all')).lists.medium[0].player_name,'Radek');
    await f.service.rename({...s,name:'   '});assert.equal((await f.service.leaderboard('all')).lists.medium[0].player_name,'anonymous');
  }finally{f.db.close();}
});
test('time windows, difficulty lists and chart filter use completed timestamps',async()=>{
  const f=await fixture(),end=f.now()+40*86400000;
  try{for(const [age,difficulty] of [[40,'easy'],[29,'medium'],[6,'hard'],[0,'easy']]){f.set(end-age*86400000-180000);const s=await f.service.start({difficulty,modelHash:'model-test'});f.add(180000);await f.service.finish({...s,result:result(s)});}
    f.set(end);for(const [window,count] of [['24h',1],['7d',2],['30d',3],['all',4]])assert.equal((await f.service.leaderboard(window)).summary.matches,count);
    const hard=await f.service.leaderboard('all','hard');assert.equal(hard.summary.matches,1);assert.equal(hard.lists.easy.length,2);assert.equal(hard.lists.medium.length,1);
  }finally{f.db.close();}
});
test('server rejects altered difficulty, model, timings, tokens and inconsistent scores',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.service.start({difficulty:'custom',modelHash:'model-test'}));await assert.rejects(f.service.start({difficulty:'easy',modelHash:'old-model'}));
    const s=await f.service.start({difficulty:'easy',modelHash:'model-test'});const r=result(s);
    await assert.rejects(f.service.finish({...s,result:r}),/duration/);f.add(180000);
    await assert.rejects(f.service.finish({...s,token:'0'.repeat(64),result:r}),/not found/);
    await assert.rejects(f.service.finish({...s,result:{...r,settings:{...r.settings,flyMs:1500}}}),/settings/);
    await assert.rejects(f.service.finish({...s,result:{...r,human:stats(500,5)}}),/board/);
    await assert.rejects(f.service.finish({...s,result:{...r,reason:'error'}}),/completed/);
    await assert.rejects(f.service.rename({...s,name:'early'}),/Finish/);
    await f.service.finish({...s,result:r});assert.equal((await f.service.leaderboard('all')).summary.matches,1);
  }finally{f.db.close();}
});
test('ranking sorts by lines then pieces; aborted sessions are excluded',async()=>{
  const f=await fixture();try{await f.service.start({difficulty:'medium',modelHash:'model-test'});
    for(const pieces of [5,6]){const s=await f.service.start({difficulty:'medium',modelHash:'model-test'});f.add(180000);const r=result(s);r.human=stats(2,pieces);await f.service.finish({...s,result:r});}
    const d=await f.service.leaderboard('all');assert.equal(d.summary.matches,2);assert.deepEqual(d.lists.medium.map(r=>r.human_pieces),[6,5]);
    await assert.rejects(f.service.leaderboard('invalid'));await assert.rejects(f.service.leaderboard('all','invalid'));
    assert.equal(name('\u0000  '),'anonymous');assert.equal(name('a'.repeat(40)).length,30);
  }finally{f.db.close();}
});
test('local scores persist after closing and reopening the database',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flytris-scores-')),file=path.join(dir,'scores.sqlite');let db;
  try{db=localDatabase(file);await migrate(db);let t=1000000;const service=makeService(db,'model-test',()=>t),s=await service.start({difficulty:'hard',modelHash:'model-test'});t+=180000;await service.finish({...s,result:result(s)});db.close();db=localDatabase(file);
    assert.equal((await makeService(db,'model-test',()=>t).leaderboard('all')).summary.matches,1);
  }finally{db?.close();for(const suffix of ['','-wal','-shm'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix);fs.rmdirSync(dir);}
});
