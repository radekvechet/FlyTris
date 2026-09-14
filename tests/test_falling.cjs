const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const V=require('../flytris/web/versus-core.js');
const html=fs.readFileSync(path.join(__dirname,'../runs/local/report.html'),'utf8');
const shapes=JSON.parse(html.match(/window\.FLYTRIS_SHAPES=(.*?);<\/script>/s)[1]);
const make=(piece='O',ms=500)=>new V.FallingPlayer({at:()=>piece},shapes,ms);
test('gravity advances one row each tick, without instant placement',()=>{
  const p=make();p.tick(499);assert.equal(p.active.y,0);p.tick(1);assert.equal(p.active.y,1);assert.equal(p.pieces,0);
  p.tick(1000);assert.equal(p.active.y,3);assert.equal(p.pieces,0);
});
test('soft drop accelerates descent but keeps the piece active and movable',()=>{
  const p=make();p.tick(200,true);assert.equal(p.active.y,4);assert.equal(p.pieces,0);
  assert(p.move(1));p.tick(300);assert.equal(p.active.y,4);p.tick(200);assert.equal(p.active.y,5);
});
test('left/right movement can slide a falling piece beneath an overhang',()=>{
  const p=make();p.board[16][6]=1;p.board[16][7]=1;for(let x=4;x<8;x++)p.board[19][x]=1;
  p.active={x:4,y:17,rotation:0};assert(p.grounded);assert(p.move(1));assert(p.move(1));
  assert.equal(p.active.x,6);assert.equal(p.ghost().y,17);p.tick(500);
  assert.equal(p.board[17][6],2);assert.equal(p.board[18][7],2);assert.equal(p.pieces,1);
});
test('collision checks stop movement through walls and occupied cells',()=>{
  const p=make();p.active={x:0,y:8,rotation:0};assert.equal(p.move(-1),false);
  p.board[8][2]=1;assert.equal(p.move(1),false);assert.deepEqual(p.active,{x:0,y:8,rotation:0});
});
test('rotation works mid-fall in both directions and respects obstacles',()=>{
  const p=make('T');p.tick(2500);const y=p.active.y;assert(p.rotate(true));assert.equal(p.active.y,y);
  assert.equal(p.active.rotation,3);assert(p.rotate(false));assert.equal(p.active.rotation,0);
  const s=shapes.T[0];for(let row=0;row<20;row++)for(let x=0;x<10;x++)p.board[row][x]=1;
  s.forEach((row,dy)=>row.forEach((v,dx)=>{if(v)p.board[y+dy][p.active.x+dx]=0;}));
  assert.equal(p.rotate(true),false);assert.equal(p.active.rotation,0);
});
test('landing gives 500ms to adjust; soft drop never bypasses lock delay',()=>{
  const p=make();p.active.y=18;p.tick(499,true);assert.equal(p.pieces,0);assert(p.move(1));
  p.tick(499,true);assert.equal(p.pieces,0);p.tick(1,true);assert.equal(p.pieces,1);
});
test('grounded adjustments cannot reset the lock timer indefinitely',()=>{
  const p=make();p.active.y=18;for(let i=0;i<15;i++){p.tick(100);p.move(i%2?-1:1);}
  assert.equal(p.lockResets,15);p.tick(400);p.move(-1);p.tick(100);assert.equal(p.pieces,1);
});
test('locking clears rows, counts them and spawns the next piece',()=>{
  const p=make();for(let y=18;y<20;y++)for(let x=0;x<10;x++)if(x!==4&&x!==5)p.board[y][x]=1;
  p.active={x:4,y:18,rotation:0};p.tick(500);assert.equal(p.lines,2);assert.equal(p.clears[1],1);assert.equal(p.pieces,1);
  assert(p.board.flat().every(v=>v===0));assert.equal(p.active.y,0);
});
test('hard drop is separate and spawn collision produces top-out',()=>{
  const p=make();p.hardDrop();assert.equal(p.pieces,1);assert.equal(p.board[19][4],2);
  p.board[0][4]=1;p.spawn();assert.equal(p.alive,false);assert.equal(p.active,null);
});
test('default aliases include WASD, Q/E and Space/Enter rotation; Down is soft',()=>{
  const fields=Object.fromEntries(Object.entries(V.defaultBindings).map(([a,keys])=>[a,keys.map(V.keyLabel).join(',')]));
  const keys=V.parseBindings(fields);assert(keys.soft.includes('KeyS'));assert(keys.soft.includes('ArrowDown'));
  for(const code of ['Space','Enter','KeyW','KeyE'])assert(keys.rotate.includes(code));assert(keys.reverse.includes('KeyQ'));
  assert(!keys.hard.includes('Space'));assert(!keys.hard.includes('ArrowDown'));
  assert.throws(()=>V.parseBindings({...fields,left:'S'}),/more than one/);
  assert.throws(()=>V.parseBindings({...fields,left:'Tab'}),/Unknown key/);
  assert.deepEqual(V.parseBindings({...fields,hard:''}).hard,[]);
});
