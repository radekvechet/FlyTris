const assert=require('node:assert/strict');
const V=require('../flytris/web/versus-core.js');
const {ReplayTimeline}=require('../flytris/web/replay.js');
const payload=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const policy=new V.Policy(payload.model);
let decisions=0,ties=0;
for(const c of payload.cases){
  const options=V.candidates(c.board,c.piece,payload.shapes);
  assert.equal(options.length,c.options.length);
  options.forEach((actual,i)=>{
    const expected=c.options[i];assert.deepEqual(actual.action,expected.action);assert.deepEqual(actual.board,expected.board);assert.equal(actual.cleared,expected.cleared);
    actual.features.forEach((v,j)=>assert(Math.abs(v-expected.features[j])<1e-7,'feature parity'));
    const z=policy.transform(actual.features);z.forEach((v,j)=>assert(Math.abs(v-expected.response[j])<3e-6,`reservoir parity ${v} vs ${expected.response[j]}`));
  });
  const chosen=policy.choose(options);
  if(options.length){
    const index=options.indexOf(chosen),gap=c.options[c.selected].score-c.options[index].score;
    // BLAS and JS sum floats in different orders; tied symmetric placements can differ.
    const tolerance=3e-6*policy.weights.reduce((n,w)=>n+Math.abs(w),0);
    assert(gap<=tolerance,`trained decision is suboptimal by ${gap}`);
    if(index!==c.selected)ties++;decisions++;
    const replay=new ReplayTimeline({initialBoard:c.board,frames:[chosen]},payload.shapes);replay.play();replay.advance(1e4);assert.deepEqual(replay.sample().board,chosen.board);
  }else assert.equal(chosen,null);
}
const a=new V.Sequence(123),b=new V.Sequence(123);
for(let i=0;i<140;i++){assert.equal(a.at(i),b.at(i));if(i%7===6)assert.equal(new Set(a.pieces.slice(i-6,i+1)).size,7);}
const player=new V.Player(a,payload.shapes);const first=player.options()[0];player.commit(first);assert.equal(player.pieces,1);assert.deepEqual(player.board,first.board);
assert.equal(V.result({lines:2,pieces:5},{lines:1,pieces:100},'time'),'human');
assert.equal(V.result({lines:2,pieces:5},{lines:2,pieces:6},'time'),'fly');
assert.equal(V.result({lines:2,pieces:5},{lines:2,pieces:5},'time'),'draw');
assert.equal(V.result({lines:99,pieces:100},{lines:0,pieces:1},'human-topout'),'fly');
console.log(`Verified ${decisions} live decisions (${ties} numerical near-ties), all candidate boards/features, Python/JS reservoir parity, seven-bag fairness, live animation and match ranking.`);
