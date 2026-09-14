/* Shared placement physics and live trained-model inference; also used by Node tests. */
(function(root){
  'use strict';
  const empty=()=>Array.from({length:20},()=>Array(10).fill(0));
  const copy=b=>b.map(r=>r.slice());
  const names=['I','O','T','S','Z','J','L'];
  function features(b,lines){
    const h=Array(10).fill(0);let holes=0,rt=0,ct=0;
    for(let x=0;x<10;x++){
      let seen=false,prev=true;
      for(let y=0;y<20;y++){
        const v=!!b[y][x];if(v&&!seen){h[x]=20-y;seen=true;}if(seen&&!v)holes++;
        if(v!==prev)ct++;prev=v;
      }if(!prev)ct++;
    }
    for(let y=0;y<20;y++){let prev=true;for(let x=0;x<10;x++){const v=!!b[y][x];if(v!==prev)rt++;prev=v;}if(!prev)rt++;}
    let bump=0,wells=0;for(let x=0;x<10;x++){if(x<9)bump+=Math.abs(h[x]-h[x+1]);wells+=Math.max(0,Math.min(x?h[x-1]:20,x<9?h[x+1]:20)-h[x]);}
    return [h.reduce((a,v)=>a+v,0)/200,holes/200,bump/180,Math.max(...h)/20,lines/4,wells/200,rt/220,ct/210].map(Math.fround);
  }
  function candidates(board,piece,shapes){
    const out=[],top=Array.from({length:10},(_,x)=>{const y=board.findIndex(r=>r[x]);return y<0?20:y;});
    shapes[piece].forEach((s,rotation)=>{
      const width=s[0].length,bottom=Array.from({length:width},(_,x)=>{let y=s.length-1;while(!s[y][x])y--;return y;});
      for(let x=0;x<=10-width;x++){
        const y=Math.min(...bottom.map((v,dx)=>top[x+dx]-v-1));if(y<0)continue;
        const placed=copy(board);s.forEach((row,dy)=>row.forEach((v,dx)=>{if(v)placed[y+dy][x+dx]=names.indexOf(piece)+1;}));
        const rows=placed.flatMap((row,y)=>row.every(Boolean)?[y]:[]);
        const after=placed.filter((_,y)=>!rows.includes(y));while(after.length<20)after.unshift(Array(10).fill(0));
        out.push({piece,action:{rotation,x,y},cleared:rows.length,board:after,features:features(after,rows.length)});
      }
    });return out;
  }
  class Policy{
    constructor(model){this.m=model;this.weights=model.weights.map(Math.fround);this.n=model.groups.length;this.counts=Array(8).fill(0);model.groups.forEach(g=>this.counts[g]++);}
    transform(x){
      const m=this.m,n=this.n,f=Math.fround,voltage=new Float32Array(n),spikes=new Float32Array(n),trace=new Float32Array(n),total=new Float32Array(n),mean=new Float32Array(n);
      const drive=Float32Array.from(m.groups,(g,i)=>f(m.bias[i]+f(f(1.8*m.input_gain[i])*x[g])));
      for(let step=0;step<m.metadata.steps;step++){
        for(let i=0;i<n;i++)trace[i]=f(f(.7*trace[i])+spikes[i]);
        for(let i=0;i<n;i++){
          let recurrent=0;for(let k=m.indptr[i];k<m.indptr[i+1];k++)recurrent=f(recurrent+f(m.data[k]*trace[m.indices[k]]));
          let v=Math.max(0,f(f(f(.9*voltage[i])+f(.2*drive[i]))+f(m.metadata.recurrent_gain*recurrent)));
          spikes[i]=v>=1?1:0;voltage[i]=f(v-spikes[i]);total[i]+=spikes[i];mean[i]=f(mean[i]+voltage[i]);
        }
      }
      const z=Array(8).fill(0);for(let i=0;i<n;i++){const g=m.groups[i],response=f(f(total[i]+f(.25*mean[i]))/m.metadata.steps);z[g]=f(z[g]+f(f(1/this.counts[g])*response));}return z;
    }
    choose(options){
      if(!options.length)return null;let best=options[0],score=-Infinity;
      for(const option of options){const z=this.transform(option.features);let s=0;for(let i=0;i<8;i++)s+=z[i]*this.weights[i];if(s>score){best=option;score=s;}}
      return best;
    }
  }
  class Sequence{
    constructor(seed){this.state=seed>>>0;this.pieces=[];}
    random(){let t=this.state+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
    at(index){while(this.pieces.length<=index){const bag=names.slice();for(let i=6;i>0;i--){const j=Math.floor(this.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}this.pieces.push(...bag);}return this.pieces[index];}
  }
  class Player{
    constructor(sequence,shapes){this.sequence=sequence;this.shapes=shapes;this.board=empty();this.lines=0;this.pieces=0;this.clears=[0,0,0,0];this.alive=true;}
    get piece(){return this.sequence.at(this.pieces);}
    options(){return candidates(this.board,this.piece,this.shapes);}
    commit(frame){this.board=copy(frame.board);this.lines+=frame.cleared;this.pieces++;if(frame.cleared)this.clears[frame.cleared-1]++;this.alive=this.options().length>0;}
  }
  // Human play uses cell collision, including reachable space beneath overhangs.
  // The trained fly retains its original placement action space.
  class FallingPlayer extends Player{
    constructor(sequence,shapes,gravityMs=500){super(sequence,shapes);this.gravityMs=gravityMs;this.spawn();}
    spawn(){
      this.active={x:Math.floor((10-this.shapes[this.piece][0][0].length)/2),y:0,rotation:0};
      this.fallTime=0;this.lockTime=0;this.lockResets=0;
      this.alive=this.fits(this.active);if(!this.alive)this.active=null;
    }
    fits(a){
      const s=this.shapes[this.piece][a.rotation];
      return s.every((row,dy)=>row.every((v,dx)=>!v||(a.x+dx>=0&&a.x+dx<10&&a.y+dy>=0&&a.y+dy<20&&!this.board[a.y+dy][a.x+dx])));
    }
    get grounded(){return !!this.active&&!this.fits({...this.active,y:this.active.y+1});}
    move(dx,dy=0){
      if(!this.alive||!this.active)return false;
      const a={...this.active,x:this.active.x+dx,y:this.active.y+dy};if(!this.fits(a))return false;
      const onGround=this.grounded;this.active=a;
      if(dy>0){this.lockTime=0;}else if(onGround&&this.lockResets<15){this.lockTime=0;this.lockResets++;}
      return true;
    }
    rotate(clockwise=true){
      if(!this.alive||!this.active)return false;
      const n=this.shapes[this.piece].length;if(n===1)return false;
      const rotation=(this.active.rotation+(clockwise?n-1:1))%n,onGround=this.grounded;
      // Small horizontal kicks keep rotations usable by walls; never cross occupied cells.
      for(const dx of [0,-1,1,-2,2]){
        const a={...this.active,rotation,x:this.active.x+dx};
        if(this.fits(a)){this.active=a;if(onGround&&this.lockResets<15){this.lockTime=0;this.lockResets++;}return true;}
      }return false;
    }
    ghost(){if(!this.active)return null;const a={...this.active};while(this.fits({...a,y:a.y+1}))a.y++;return a;}
    lock(){
      if(!this.active||!this.alive)return;
      const a=this.active,s=this.shapes[this.piece][a.rotation],id=names.indexOf(this.piece)+1;
      s.forEach((row,dy)=>row.forEach((v,dx)=>{if(v)this.board[a.y+dy][a.x+dx]=id;}));
      const remaining=this.board.filter(row=>!row.every(Boolean)),cleared=20-remaining.length;
      while(remaining.length<20)remaining.unshift(Array(10).fill(0));this.board=remaining;
      this.lines+=cleared;this.pieces++;if(cleared)this.clears[cleared-1]++;
      this.spawn();
    }
    hardDrop(){if(this.active&&this.alive){this.active=this.ghost();this.lock();}}
    tick(ms,soft=false){
      // Integrate short slices so landing never consumes time spent falling as lock delay.
      let left=Math.max(0,ms);
      while(left>0&&this.alive){
        const dt=Math.min(left,10);left-=dt;
        if(this.grounded){this.lockTime+=dt;if(this.lockTime>=500)this.lock();}
        else{
          this.lockTime=0;this.fallTime+=dt;const interval=soft?Math.min(50,this.gravityMs):this.gravityMs;
          while(this.fallTime>=interval){this.fallTime-=interval;if(!this.move(0,1)){this.fallTime=0;break;}}
        }
      }
    }
  }
  const defaultBindings={left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],soft:['ArrowDown','KeyS'],rotate:['ArrowUp','KeyW','KeyE','KeyX','Space','Enter'],reverse:['KeyQ','KeyZ'],hard:['ShiftLeft','ShiftRight'],pause:['KeyP','Escape']};
  const keyLabel=code=>code.startsWith('Key')?code.slice(3):code.startsWith('Digit')?code.slice(5):code;
  function parseBindings(fields){
    const result={},used=new Set();
    for(const action of Object.keys(defaultBindings)){
      const keys=String(fields[action]??'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>{
        if(/^[a-z]$/i.test(x))return 'Key'+x.toUpperCase();if(/^\d$/.test(x))return 'Digit'+x;
        const known=['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space','Enter','Escape','ShiftLeft','ShiftRight','NumpadEnter',...Array.from({length:26},(_,i)=>'Key'+String.fromCharCode(65+i)),...Array.from({length:10},(_,i)=>'Digit'+i)];
        const code=known.find(v=>v.toLowerCase()===x.toLowerCase());if(!code)throw new Error(`Unknown key “${x}”. Use letters, arrows, Space, Enter, Escape or ShiftLeft/ShiftRight.`);return code;
      });
      if(action!=='hard'&&!keys.length)throw new Error('Each action needs a key; hard drop may be left empty.');
      if(keys.length>10)throw new Error('Use at most 10 keys per action.');
      result[action]=[...new Set(keys)];
      for(const key of result[action]){if(used.has(key))throw new Error(`${keyLabel(key)} is assigned to more than one action.`);used.add(key);}
    }return result;
  }
  function result(human,fly,reason){
    if(reason==='human-topout')return 'fly';if(reason==='fly-topout')return 'human';
    if(human.lines!==fly.lines)return human.lines>fly.lines?'human':'fly';
    if(human.pieces!==fly.pieces)return human.pieces>fly.pieces?'human':'fly';return 'draw';
  }
  const api={empty,features,candidates,Policy,Sequence,Player,FallingPlayer,result,defaultBindings,keyLabel,parseBindings};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FlyVersus=api;
})(typeof window!=='undefined'?window:globalThis);
