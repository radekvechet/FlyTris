const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const V=require('../flytris/web/versus-core.js'),F=require('../flytris/web/falling-policy.cjs'),L=require('../flytris/web/falling-live.js');
const shapes=require('../site-data/shapes.json'),model=require('../site-data/versus-model.json');
test('live control routes match training at all three gravity speeds',()=>{
  for(const gravity of [800,500,250]){
    const expected=F.play(model,shapes,model.weights,71001,gravity,{cap:12}),c=new L.Controller(71001,shapes,gravity),policy=new V.Policy(model);
    while(c.player.pieces<12&&c.player.alive){c.accept(L.plan(c.snapshot(),shapes,policy,180000-c.time));while(c.ready)c.step();}
    assert.equal(c.player.lines,expected.lines);assert.equal(c.player.pieces,expected.pieces);assert.equal(c.time,expected.elapsedMs);
  }
});
test('saved full replay reproduces final score and board, supports pause and seeking',()=>{
  const replay=require('../site-data/falling-replay.json'),t=new L.ReplayTimeline(replay,shapes);
  t.play();t.advance(250);t.pause();const paused=t.sample();t.advance(10000);assert.deepEqual(t.sample(),paused);
  t.seek(10);t.play(true);t.advance(100000);assert.equal(t.position,11);assert.equal(t.playing,false);
  t.seek(0);t.play();t.advance(1e9);assert.equal(t.position,replay.trace.length);assert.equal(t.sample().lines,replay.lines);assert.equal(t.sample().pieces,replay.pieces);
  const c=new L.Controller(replay.seed,shapes,replay.gravityMs);for(const frame of replay.trace)for(const action of frame.actions)c.step(action);
  assert.deepEqual(c.player.board,replay.trace.at(-1).boardAfter);assert.deepEqual(t.sample().board,c.sample().board);
});
test('line clears animate head shake and real control pulses',()=>{
  const c=new L.Controller(1,shapes,500),p=c.player;p.sequence={at:()=> 'I'};p.board[19]=[1,1,1,0,0,0,0,1,1,1];p.active={x:3,y:0,rotation:1};
  // Pick the horizontal variant rather than assuming rotation ordering.
  p.active.rotation=shapes.I.findIndex(s=>s.length===1);c.step('hard');
  assert.equal(p.lines,1);assert.equal(c.sample(75).cleared,1);assert.notEqual(c.sample(75).shake,0);assert(c.sample(75).controls[3]>0);
});
test('browser wrapper and worker-style loading use the same controller without Node globals',()=>{
  const context=vm.createContext({performance,structuredClone});
  vm.runInContext(fs.readFileSync('flytris/web/versus-core.js','utf8'),context);
  vm.runInContext(`(function(){const module={exports:{}},require=()=>FlyVersus;${fs.readFileSync('flytris/web/falling-policy.cjs','utf8')};globalThis.FlyFalling=module.exports;})();`,context);
  vm.runInContext(fs.readFileSync('flytris/web/falling-live.js','utf8'),context);
  assert.equal(vm.runInContext('typeof FlyFallingLive.plan',context),'function');
});
