// Uses the actual browser FallingPlayer: no alternate training collision model.
const V=require('./versus-core.js');
const CONTROL_MS=50,MAX_STATES=900;
function clone(p){
  const q=Object.create(V.FallingPlayer.prototype);Object.assign(q,p);
  q.active=p.active?{...p.active}:null;q.clears=p.clears.slice();q.board=p.board.map(r=>r.slice());return q;
}
function act(p,action,ms=CONTROL_MS){
  if(action==='left')p.move(-1);else if(action==='right')p.move(1);
  else if(action==='cw')p.rotate(true);else if(action==='ccw')p.rotate(false);
  else if(action==='hard')p.hardDrop();
  p.tick(ms,action==='soft');
}
function key(p){return p.active?`${p.active.x},${p.active.y},${p.active.rotation}`:'dead';}
function reachable(player,remainingMs,deadline=Infinity){
  // Keep the earliest route to each pose. This is a bounded, conservative planner,
  // not an exhaustive search over all timer/lock-reset states. Every returned route
  // is simulated with real gravity and collision; it never invents a landing.
  if(!player.alive||!player.active)return [];
  const queue=[{p:clone(player),path:[]}],seen=new Set([key(player)]),ends=new Map();
  function add(p,path){
    const boardKey=JSON.stringify(p.board),frame={piece:player.piece,board:p.board.map(r=>r.slice()),cleared:p.lines-player.lines,
      features:V.features(p.board,p.lines-player.lines),path,elapsedMs:path.length*CONTROL_MS,state:p};
    const old=ends.get(boardKey);if(!old||frame.elapsedMs<old.elapsedMs)ends.set(boardKey,frame);
  }
  for(let head=0;head<queue.length&&head<MAX_STATES;head++){
    if(head%32===0&&performance.now()>=deadline)throw Error('DEADLINE');
    const node=queue[head];if((node.path.length+1)*CONTROL_MS>remainingMs)continue;
    const drop=clone(node.p);act(drop,'hard');add(drop,node.path.concat('hard'));
    for(const action of ['left','right','cw','ccw','soft','wait']){
      const q=clone(node.p);act(q,action);const route=node.path.concat(action);
      if(q.pieces>player.pieces){add(q,route);continue;}
      const signature=key(q);if(q.alive&&!seen.has(signature)){seen.add(signature);queue.push({p:q,path:route});}
    }
  }
  return [...ends.values()];
}
function play(model,shapes,weights,seed,gravityMs,options={}){
  const durationMs=options.durationMs??180000,cap=options.cap??5000,deadline=options.deadline??Infinity;
  const p=new V.FallingPlayer(new V.Sequence(seed),shapes,gravityMs),policy=new V.Policy({...model,weights});
  let elapsedMs=0,decisions=0,rotations=0,slides=0;const trace=[];
  while(p.alive&&p.pieces<cap&&elapsedMs<durationMs){
    if(performance.now()>=deadline||options.shouldStop?.())throw Error('DEADLINE');
    const choices=reachable(p,durationMs-elapsedMs,deadline);if(!choices.length){p.tick(durationMs-elapsedMs);elapsedMs=durationMs;break;}
    const selected=policy.choose(choices),before=p.pieces;
    const start=options.record?{board:p.board.map(r=>r.slice()),piece:p.piece,active:{...p.active},fallTime:p.fallTime}:null;
    for(const action of selected.path){
      const y=p.active?.y||0;if(action==='cw'||action==='ccw')rotations++;if((action==='left'||action==='right')&&y>2)slides++;
      act(p,action);elapsedMs+=CONTROL_MS;
    }
    if(p.pieces!==before+1||JSON.stringify(p.board)!==JSON.stringify(selected.board))throw Error('Planner/execution mismatch');
    if(options.record)trace.push({...start,actions:selected.path,boardAfter:p.board.map(r=>r.slice()),cleared:selected.cleared,elapsedMs});
    decisions++;
  }
  return {seed,gravityMs,lines:p.lines,pieces:p.pieces,fitness:p.lines+p.pieces/10000,elapsedMs,
    capped:p.pieces>=cap,alive:p.alive,decisions,rotations,midairSlides:slides,...(options.record?{trace}:{}),rules:'falling-v1'};
}
module.exports={play,reachable,act,clone,CONTROL_MS,MAX_STATES};
