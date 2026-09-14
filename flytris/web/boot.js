(function(){
  'use strict';
  const timeline=new FlyReplay.ReplayTimeline(window.FLYTRIS_DATA,window.FLYTRIS_SHAPES);
  const board=document.getElementById('board'),ctx=board.getContext('2d');
  const lcd=document.createElement('canvas');lcd.width=260;lcd.height=520;const lc=lcd.getContext('2d');
  const playButton=document.getElementById('play'),stepButton=document.getElementById('step');
  const slider=document.getElementById('scrub'),speed=document.getElementById('speed');slider.max=timeline.frames.length;
  const colors=['#14242a','#7ecbd1','#e2ca6b','#b9a1d7','#8ec9a8','#d99582','#85aace','#d9b180'];
  let scene=null;
  try{scene=makeFlyScene(document.getElementById('fly-stage'),lcd);}catch(error){document.getElementById('scene-error').hidden=false;console.error('FlyTris 3D scene:',error);}
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  function drawBoard(context,sample,mono=false){
    context.fillStyle=mono?'#9fae85':'#0a151b';context.fillRect(0,0,260,520);
    for(let y=0;y<20;y++)for(let x=0;x<10;x++){
      const value=sample.board[y][x];context.fillStyle=mono?(value?'#263c32':'#95a47d'):colors[value];
      context.fillRect(x*26+2,y*26+2,22,22);
      if(value){context.fillStyle=mono?'#3b4f3d':'#ffffff22';context.fillRect(x*26+4,y*26+3,18,2);}
    }
    if(sample.rows.length){context.fillStyle=mono?`rgba(229,241,169,${sample.flash})`:`rgba(240,234,169,${sample.flash})`;for(const y of sample.rows)context.fillRect(0,y*26,260,26);}
  }
  let previousPlaying=false;
  function draw(dt=0){
    const sample=timeline.sample();drawBoard(ctx,sample);drawBoard(lc,sample,true);
    scene?.update(sample,dt,timeline.playing,reducedMotion.matches);
    playButton.innerHTML=timeline.playing?'Ⅱ <span>Pause</span>':'▶ <span>Play replay</span>';
    document.getElementById('live-dot').classList.toggle('playing',timeline.playing);
    document.getElementById('play-status').textContent=timeline.playing?'PLAYING THE RECORDING':timeline.position===timeline.frames.length?'REPLAY COMPLETE':'READY TO PLAY';
    document.getElementById('counter').textContent=`${timeline.position} / ${timeline.frames.length}`;
    document.getElementById('piece-count').textContent=sample.pieces;
    document.getElementById('line-count').textContent=sample.lines;
    document.getElementById('piece-label').textContent=sample.action?sample.action.piece+' PIECE':'—';
    document.getElementById('action-label').textContent=sample.action?`${sample.action.piece} → column ${sample.action.x+1} · rotate ${sample.action.rotation*90}°`:'Recorded game · seed '+window.FLYTRIS_DATA.seed;
    document.getElementById('clear-message').textContent=sample.cleared?`+${sample.cleared} ${sample.cleared===1?'ROW':'ROWS'} · NICE MOVE`:' ';
    slider.value=timeline.position;
    if(previousPlaying&&!timeline.playing)scene?.invalidate();
    previousPlaying=timeline.playing;
  }
  playButton.addEventListener('click',()=>{if(timeline.playing)timeline.pause();else timeline.play();scene?.invalidate();draw();});
  stepButton.addEventListener('click',()=>{timeline.pause();timeline.play(true);scene?.invalidate();draw();});
  slider.addEventListener('input',()=>{timeline.seek(Number(slider.value));scene?.invalidate();draw();});
  document.getElementById('reset-view').addEventListener('click',()=>{scene?.reset();draw();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){timeline.pause();scene?.invalidate();draw();}});
  let last=performance.now();
  function animate(now){
    const dt=Math.min(50,now-last);last=now;
    if(!document.hidden){
      if(timeline.playing){timeline.advance(dt*Number(speed.value));draw(dt*Number(speed.value));}
      else scene?.renderIfNeeded();
    }
    requestAnimationFrame(animate);
  }
  window.FlyReport={scene,lcd,drawBoard,pause(){timeline.pause();scene?.invalidate();draw();},restore:draw};
  draw();requestAnimationFrame(animate);
})();
