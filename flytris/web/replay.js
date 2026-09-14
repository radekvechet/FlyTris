/* Deterministic replay timing. No model predictions or training happen here. */
(function (root) {
  'use strict';
  const emptyBoard = () => Array.from({length:20}, () => Array(10).fill(0));
  const copy = b => b.map(row => row.slice());
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const ease = t => t*t*(3-2*t);
  const ids = {I:1,O:2,T:3,S:4,Z:5,J:6,L:7};
  const LAND = 580, CLEAR_START = 680, CLEAR_END = 920;

  function prepare(replay, shapes) {
    return replay.frames.map((f,i) => {
      const before = i ? replay.frames[i-1].board : (replay.initialBoard || emptyBoard());
      const shape = shapes[f.piece][f.action.rotation];
      const placed = copy(before);
      shape.forEach((row,y) => row.forEach((v,x) => {
        if (v) placed[f.action.y+y][f.action.x+x] = ids[f.piece];
      }));
      const rows = placed.flatMap((row,y) => row.every(Boolean) ? [y] : []);
      const expected = placed.filter((_,y) => !rows.includes(y));
      while (expected.length < 20) expected.unshift(Array(10).fill(0));
      if (rows.length !== f.cleared || JSON.stringify(expected) !== JSON.stringify(f.board)) {
        throw new Error(`Replay placement ${i+1} does not reproduce the saved board.`);
      }
      return {...f,before,placed,shape,rows,duration:f.cleared ? 1280+f.cleared*150 : 900};
    });
  }

  class ReplayTimeline {
    constructor(replay,shapes) {
      this.frames = prepare(replay,shapes);
      this.position=0; this.elapsed=0; this.playing=false; this.single=false;
      this.linePrefix=[0];
      for (const f of this.frames) this.linePrefix.push(this.linePrefix.at(-1)+f.cleared);
    }
    seek(position) {
      this.position=clamp(Math.floor(position),0,this.frames.length);
      this.elapsed=0; this.playing=false; this.single=false;
    }
    play(single=false) {
      if (!this.frames.length) return;
      if (this.position===this.frames.length) this.seek(0);
      this.playing=true; this.single=single;
    }
    pause() { this.playing=false; }
    advance(ms) {
      if (!this.playing) return;
      this.elapsed+=Math.max(0,ms);
      while (this.position<this.frames.length && this.elapsed>=this.frames[this.position].duration) {
        this.elapsed-=this.frames[this.position].duration;
        this.position++;
        if (this.single || this.position===this.frames.length) {
          this.elapsed=0; this.playing=false; this.single=false; break;
        }
      }
    }
    sample() {
      const n=this.position, f=this.frames[n], t=this.elapsed;
      if (!f || (!this.playing && t===0)) {
        return {board:n ? this.frames[n-1].board:emptyBoard(),rows:[],flash:0,shake:0,
          controls:[0,0,0,0,0,0],lines:this.linePrefix[n],pieces:n,action:null,cleared:0};
      }
      const landed=t>=LAND, disappeared=f.cleared && t>=CLEAR_END;
      let board=copy(disappeared ? f.board : landed ? f.placed : f.before);
      if (!landed) {
        const x=Math.round(3+(f.action.x-3)*ease(clamp(t/300,0,1)));
        const y=Math.round(-4+(f.action.y+4)*ease(clamp((t-160)/(LAND-160),0,1)));
        f.shape.forEach((row,dy)=>row.forEach((v,dx)=>{
          if (v && y+dy>=0 && y+dy<20 && x+dx>=0 && x+dx<10) board[y+dy][x+dx]=ids[f.piece];
        }));
      }
      const controls=[0,0,0,0,0,0];
      if(t<330 && f.action.x!==3) controls[f.action.x<3 ? 0:1]=Math.max(0,Math.sin(t/330*Math.PI*3));
      if(t<360 && f.action.rotation) controls[2]=Math.max(0,Math.sin(t/360*Math.PI*(f.action.rotation*2+1)));
      if(t>=320 && t<LAND+100) controls[3]=Math.sin(clamp((t-320)/(LAND+100-320),0,1)*Math.PI);
      // Each successfully removed row contributes one small, damped shake pulse.
      let shake=0;
      for(let row=0;row<f.cleared;row++) {
        const age=(t-CLEAR_END-row*150)/1000;
        if(age>=0 && age<0.45) shake+=Math.sin(age*32)*Math.sin(age/0.45*Math.PI)*0.055;
      }
      return {board,rows:t>=CLEAR_START && t<CLEAR_END ? f.rows:[],
        flash:t>=CLEAR_START && t<CLEAR_END ? 0.45+0.55*Math.abs(Math.sin((t-CLEAR_START)/35)):0,
        shake,controls,lines:this.linePrefix[n]+(disappeared?f.cleared:0),pieces:n+(landed?1:0),
        action:{piece:f.piece,...f.action},cleared:disappeared ? f.cleared:0};
    }
  }
  const api={ReplayTimeline,prepare,emptyBoard,LAND,CLEAR_START,CLEAR_END};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.FlyReplay=api;
})(typeof window!=='undefined'?window:globalThis);
