// Integration checks against the same saved trace and rotations embedded in the report.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {ReplayTimeline,LAND,CLEAR_START,CLEAR_END}=require('../flytris/web/replay.js');
const root=path.resolve(__dirname,'..');
const replay=JSON.parse(fs.readFileSync(path.join(root,'runs/local/replay.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'runs/local/report.html'),'utf8');
const shapes=JSON.parse(html.match(/window\.FLYTRIS_SHAPES=(.*?);<\/script>/s)[1]);
const make=()=>new ReplayTimeline(replay,shapes);

test('every placement reproduces the saved post-clear board and line total',()=>{
  const t=make();
  assert.equal(t.frames.length,replay.frames.length);
  for(let i=0;i<t.frames.length;i++){
    t.seek(i);t.play();t.advance(t.frames[i].duration-1);
    assert.deepEqual(t.sample().board,replay.frames[i].board);
  }
  assert.equal(t.linePrefix.at(-1),replay.frames.reduce((n,f)=>n+f.cleared,0));
});
test('pause freezes the exact board, leg signals and head pose; resume continues',()=>{
  const t=make();t.play();t.advance(410);t.pause();
  const paused=t.sample();t.advance(10000);
  assert.deepEqual(t.sample(),paused);
  t.play();t.advance(20);assert.equal(t.elapsed,430);
});
test('row flashes precede disappearance and head shakes only follow actual clears',()=>{
  const t=make();
  for(let i=0;i<t.frames.length;i++){
    const f=t.frames[i];t.seek(i);t.play();t.advance(LAND);
    assert.deepEqual(t.sample().board,f.placed);
    assert.equal(t.sample().shake,0);
    if(!f.cleared){t.advance(200);assert.equal(t.sample().shake,0);continue;}
    t.advance(CLEAR_START-LAND+30);
    assert.equal(t.sample().rows.length,f.cleared);
    assert(t.sample().flash>0);assert.equal(t.sample().shake,0);
    assert.equal(t.sample().lines,t.linePrefix[i]);
    t.advance(CLEAR_END-t.elapsed);
    assert.deepEqual(t.sample().board,f.board);
    assert.equal(t.sample().lines,t.linePrefix[i+1]);
    assert.deepEqual(t.sample().rows,[]);
    t.advance(40);assert.notEqual(t.sample().shake,0);
  }
});
test('seeking resets transient motion and restores the exact recorded state',()=>{
  const t=make();t.play();t.advance(450);t.seek(30);
  assert.equal(t.playing,false);assert.equal(t.elapsed,0);
  assert.deepEqual(t.sample().board,replay.frames[29].board);
  assert.equal(t.sample().shake,0);assert(t.sample().controls.every(v=>v===0));
  t.seek(0);assert(t.sample().board.flat().every(v=>v===0));
});
test('next move stops after one placement even with a large time step',()=>{
  const t=make();t.seek(10);t.play(true);t.advance(10000);
  assert.equal(t.position,11);assert.equal(t.playing,false);
  assert.deepEqual(t.sample().board,replay.frames[10].board);
});
test('complete playback stops at the final board and Play restarts it',()=>{
  const t=make();t.play();t.advance(1e9);
  assert.equal(t.position,replay.frames.length);assert.equal(t.playing,false);
  assert.deepEqual(t.sample().board,replay.frames.at(-1).board);
  t.play();assert.equal(t.position,0);assert.equal(t.playing,true);
});
test('a corrupted recording is rejected instead of animating inconsistent moves',()=>{
  const bad=structuredClone(replay);bad.frames[0].board[0][0]=7;
  assert.throws(()=>new ReplayTimeline(bad,shapes),/does not reproduce/);
});
