const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../flytris/web/versus-core.js'),F=require('../flytris/web/falling-policy.cjs');
const shapes=require('../site-data/shapes.json'),model=require('../site-data/versus-model.json');
test('every candidate route executes through gravity and locks exactly its advertised board',()=>{
  const p=new V.FallingPlayer(new V.Sequence(123),shapes,250),routes=F.reachable(p,180000);
  assert(routes.length>10);
  for(const route of routes){const q=F.clone(p);for(const action of route.path)F.act(q,action);assert.equal(q.pieces,p.pieces+1);assert.deepEqual(q.board,route.board);assert.equal(route.elapsedMs,route.path.length*50);}
});
test('planner finds a tick-by-tick slide under an overhang that direct placement cannot reach',()=>{
  const p=new V.FallingPlayer({at:()=> 'O'},shapes,500);p.active={x:4,y:0,rotation:0};p.board[16][6]=1;p.board[16][7]=1;
  for(let x=4;x<8;x++)p.board[19][x]=1;
  const route=F.reachable(p,180000).find(r=>r.board[17][6]===2&&r.board[18][7]===2);
  assert(route,'reachable underhang landing is included');
  assert(!V.candidates(p.board,'O',shapes).some(r=>r.board[17][6]===2&&r.board[18][7]===2));
  const q=F.clone(p);let midairSlide=false;
  for(const action of route.path){if(['left','right'].includes(action)&&q.active.y>=17)midairSlide=true;F.act(q,action);}
  assert(midairSlide);assert.deepEqual(q.board,route.board);
});
test('remaining game time limits routes and expired compute deadlines discard partial games',()=>{
  const p=new V.FallingPlayer(new V.Sequence(1),shapes,800);
  assert.equal(F.reachable(p,49).length,0);
  assert.throws(()=>F.play(model,shapes,model.weights,1,500,{deadline:performance.now()-1}),/DEADLINE/);
  assert.throws(()=>F.play(model,shapes,model.weights,1,500,{shouldStop:()=>true}),/DEADLINE/);
});
test('training episodes are reproducible and record actual timed control actions',()=>{
  const a=F.play(model,shapes,model.weights,123,250,{cap:8,record:true}),b=F.play(model,shapes,model.weights,123,250,{cap:8,record:true});
  assert.deepEqual(a,b);assert.equal(a.pieces,8);assert(a.rotations>0);assert(a.elapsedMs>0);assert.equal(a.trace.length,8);
  const p=new V.FallingPlayer(new V.Sequence(123),shapes,250);
  for(const frame of a.trace){for(const action of frame.actions)F.act(p,action);assert.deepEqual(p.board,frame.boardAfter);}
  assert.equal(p.lines,a.lines);assert.equal(a.fitness,a.lines+a.pieces/10000);
});
