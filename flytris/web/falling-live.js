/* Live and recorded controls use the same 50 ms action steps as training. */
(function(root){
  'use strict';
  const V=typeof module!=='undefined'?require('./versus-core.js'):root.FlyVersus;
  const F=typeof module!=='undefined'?require('./falling-policy.cjs'):root.FlyFalling;
  const copy=b=>b.map(r=>r.slice()),ids={I:1,O:2,T:3,S:4,Z:5,J:6,L:7};
  function snapshot(player,seed){
    const state={};for(const key of ['board','active','lines','pieces','clears','alive','fallTime','lockTime','lockResets','gravityMs'])state[key]=structuredClone(player[key]);
    return {seed,state};
  }
  function restore(s,shapes){const p=new V.FallingPlayer(new V.Sequence(s.seed),shapes,s.state.gravityMs);Object.assign(p,structuredClone(s.state));return p;}
  function plan(s,shapes,policy,remainingMs){
    const choice=policy.choose(F.reachable(restore(s,shapes),remainingMs));
    return choice?{path:choice.path,board:choice.board,cleared:choice.cleared}:null;
  }
  function picture(p){
    const board=copy(p.board),a=p.active;
    if(a)p.shapes[p.piece][a.rotation].forEach((row,y)=>row.forEach((v,x)=>{if(v)board[a.y+y][a.x+x]=ids[p.piece];}));
    return board;
  }
  class Controller{
    constructor(seed,shapes,gravityMs){this.seed=seed;this.player=new V.FallingPlayer(new V.Sequence(seed),shapes,gravityMs);this.route=null;this.index=0;this.time=0;this.events=[];this.lastAction=null;this.actionTime=-Infinity;}
    get ready(){return !!this.route&&this.index<this.route.path.length;}
    snapshot(){return snapshot(this.player,this.seed);}
    accept(route){
      if(!route||!Array.isArray(route.path)||!route.path.length||route.path.some(a=>!['left','right','cw','ccw','soft','wait','hard'].includes(a)))throw Error('Invalid falling route.');
      const q=F.clone(this.player);for(const action of route.path)F.act(q,action);
      if(q.pieces!==this.player.pieces+1||JSON.stringify(q.board)!==JSON.stringify(route.board))throw Error('Falling route no longer matches the board.');
      this.route=route;this.index=0;
    }
    step(action){
      if(action===undefined){if(!this.ready)throw Error('Wait for a route before advancing.');action=this.route.path[this.index++];}
      const p=this.player,piece=p.piece,pose=p.active?{...(action==='hard'?p.ghost():p.active)}:null,before=p.lines;
      F.act(p,action);this.time+=F.CONTROL_MS;
      this.lastAction=pose?{piece,...pose,control:action}:null;this.actionTime=this.time;
      if(p.lines>before)this.events.push({time:this.time,count:p.lines-before});
      this.events=this.events.filter(e=>this.time-e.time<1000);
      return this.ready;
    }
    sample(offset=0){return sample({board:picture(this.player),lines:this.player.lines,pieces:this.player.pieces,action:this.lastAction,actionTime:this.actionTime,events:this.events},this.time+offset);}
  }
  function sample(state,time){
    const controls=[0,0,0,0,0,0],a=state.action,age=time-state.actionTime;
    if(a&&age>=0&&age<150){const index={left:0,right:1,cw:2,ccw:5,soft:3,hard:3}[a.control];if(index!==undefined)controls[index]=Math.max(0,1-age/150);}
    let shake=0,cleared=0;
    for(const e of state.events){if(time-e.time>=0&&time-e.time<750)cleared=e.count;
      for(let row=0;row<e.count;row++){const t=(time-e.time-row*150)/1000;if(t>=0&&t<.45)shake+=Math.sin(t*32)*Math.sin(t/.45*Math.PI)*.055;}}
    return {board:state.board,rows:[],flash:0,shake,controls,lines:state.lines,pieces:state.pieces,action:a,cleared};
  }
  class ReplayTimeline{
    constructor(replay,shapes){
      this.frames=[];const c=new Controller(replay.seed,shapes,replay.gravityMs);let start=0;
      const capture=()=>({board:picture(c.player),lines:c.player.lines,pieces:c.player.pieces,action:c.lastAction,actionTime:c.actionTime,events:c.events.slice()});
      this.initial=capture();
      for(const trace of replay.trace){
        if(JSON.stringify(c.player.board)!==JSON.stringify(trace.board)||c.player.piece!==trace.piece)throw Error('Replay starting board differs from recording.');
        const states=[capture()];for(const action of trace.actions){c.step(action);states.push(capture());}
        if(JSON.stringify(c.player.board)!==JSON.stringify(trace.boardAfter))throw Error('Falling replay did not reproduce the recorded board.');
        const duration=trace.actions.length*F.CONTROL_MS;this.frames.push({duration,start,states});start+=duration;
      }
      this.final=capture();this.total=start;this.position=0;this.elapsed=0;this.playing=false;this.single=false;
    }
    seek(n){this.position=Math.max(0,Math.min(this.frames.length,Math.floor(n)));this.elapsed=0;this.playing=false;this.single=false;}
    play(single=false){if(!this.frames.length)return;if(this.position===this.frames.length)this.seek(0);this.playing=true;this.single=single;}
    pause(){this.playing=false;}
    advance(ms){if(!this.playing)return;this.elapsed+=Math.max(0,ms);while(this.position<this.frames.length&&this.elapsed>=this.frames[this.position].duration){this.elapsed-=this.frames[this.position].duration;this.position++;if(this.single||this.position===this.frames.length){this.elapsed=0;this.playing=false;this.single=false;break;}}}
    sample(){const f=this.frames[this.position];if(!f)return sample(this.final,this.total);const i=Math.min(f.states.length-1,Math.floor(this.elapsed/F.CONTROL_MS));return sample(f.states[i],f.start+this.elapsed);}
  }
  const controlTickMs=difficulty=>difficulty==='medium'?100:50;
  const actionIndex=(elapsedMs,tickMs)=>elapsedMs>0&&elapsedMs%tickMs===0?elapsedMs/tickMs-1:null;
  const api={Controller,ReplayTimeline,plan,snapshot,restore,controlTickMs,actionIndex,RANKED_RULES:5};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FlyFallingLive=api;
})(typeof window!=='undefined'?window:globalThis);
