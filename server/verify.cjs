const V=require('../flytris/web/versus-core.js'),F=require('../flytris/web/falling-policy.cjs'),L=require('../flytris/web/falling-live.js');
const shapes=require('../site-data/shapes.json');
const fail=message=>{throw Object.assign(Error(message),{status:400,expose:true});};
function initial(run){return {human:L.snapshot(new V.FallingPlayer(new V.Sequence(run.seed),shapes,run.gravityMs),run.seed),fly:L.snapshot(new V.FallingPlayer(new V.Sequence(run.seed),shapes,run.gravityMs),run.seed),elapsedMs:0,gravityDue:false,controls:0,hardDrops:0,reason:null};}
function stats(p){return {lines:p.lines,pieces:p.pieces,clears:p.clears.slice(),alive:p.alive,board:p.board};}
function advance(saved,commands,run){
  if(typeof commands!=='string'||!commands.length||commands.length>2200||!/^[LRCDHABTS]+$/.test(commands))fail('Invalid input batch.');
  const state=structuredClone(saved),human=L.restore(state.human,shapes),fly=L.restore(state.fly,shapes),before=state.elapsedMs;
  for(const command of commands){
    if(state.reason)fail('Inputs continue after the game ended.');
    if(command==='B'){
      if(state.gravityDue||state.elapsedMs>=120000)fail('Invalid game clock.');
      const action=run.actions[state.elapsedMs/50];if(!action)fail('The fly recording is incomplete.');
      F.act(fly,action);state.elapsedMs+=50;state.gravityDue=true;
      if(state.elapsedMs-before>10000)fail('Checkpoint exceeds ten seconds.');
    }else if(command==='T'||command==='S'){
      if(!state.gravityDue)fail('Gravity tick is out of order.');
      human.tick(50,command==='S');state.gravityDue=false;state.controls=0;state.hardDrops=0;
      state.reason=!human.alive?'human-topout':!fly.alive?'fly-topout':state.elapsedMs===120000?'time':null;
    }else{
      if(++state.controls>8||(command==='H'&&++state.hardDrops>1))fail('Inputs exceed the control rate.');
      if(command==='L')human.move(-1);if(command==='R')human.move(1);if(command==='D')human.move(0,1);
      if(command==='C')human.rotate(true);if(command==='A')human.rotate(false);if(command==='H')human.hardDrop();
      if(!human.alive)state.reason='human-topout';
    }
  }
  if(state.gravityDue&&!state.reason)fail('Incomplete gravity tick.');
  if(state.elapsedMs===before&&!state.reason)fail('Checkpoint must advance the clock.');
  state.human=L.snapshot(human,run.seed);state.fly=L.snapshot(fly,run.seed);return state;
}
module.exports={initial,advance,stats};
