(function(){
  'use strict';
  const $=id=>document.getElementById(id),V=window.FlyVersus,shapes=window.FLYTRIS_SHAPES,model=window.FLYTRIS_MODEL;
  const arena=$('versus'),report=document.querySelector('main'),stage=$('fly-stage'),home=stage.parentNode,anchor=stage.nextSibling;
  const humanCtx=$('human-board').getContext('2d'),flyCtx=$('fly-board').getContext('2d'),view=window.FlyReport;
  let opened=false,running=false,paused=false,worker=null,requestId=0,human,fly,settings,elapsed=0,animation=null,move=null,committed=false,baseLines=0,basePieces=0,lastResult=null,ready=false;
  let bindings=structuredClone(V.defaultBindings),scoreSession=null,startAttempt=0;
  const held=new Map(),cookieName='flytris_preferences_v2';let touchSoft=false;
  function clearHeld(){held.clear();touchSoft=false;}
  function showBindings(){for(const action of Object.keys(bindings))$('key-'+action).value=bindings[action].map(V.keyLabel).join(', ');}
  function readBindings(){return V.parseBindings(Object.fromEntries(Object.keys(V.defaultBindings).map(action=>[action,$('key-'+action).value])));}
  function loadPreferences(){
    try{
      const raw=document.cookie.split('; ').find(v=>v.startsWith(cookieName+'='));if(!raw)return;
      const p=JSON.parse(decodeURIComponent(raw.slice(cookieName.length+1)));
      if(p.version!==2)return;
      const parsed=V.parseBindings(Object.fromEntries(Object.keys(V.defaultBindings).map(a=>[a,(p.bindings[a]||[]).join(',')])));
      bindings=parsed;
      for(const [id,key] of [['human-pace','gravityMs'],['fly-pace','flyMs'],['match-length','durationMs']]){
        if([...$(id).options].some(o=>o.value===String(p[key])))$(id).value=String(p[key]);
      }
    }catch{/* Invalid or unavailable cookies leave safe defaults. */}
  }
  function savePreferences(){
    const data=encodeURIComponent(JSON.stringify({version:2,bindings,gravityMs:settings.gravityMs,flyMs:settings.flyMs,durationMs:settings.durationMs}));
    try{document.cookie=`${cookieName}=${data}; Max-Age=31536000; Path=/; SameSite=Lax`;}catch{}
    const saved=document.cookie.split('; ').some(v=>v===cookieName+'='+data);
    $('preferences-status').textContent=saved?'Controls and pace saved in this browser for one year.':'Cookie storage is unavailable here; settings will last for this open page.';
  }
  function controlHint(){return [['left','Left'],['right','Right'],['soft','Soft drop'],['rotate','↻'],['reverse','↺'],['hard','Hard drop'],['pause','Pause']].filter(([a])=>bindings[a].length).map(([a,label])=>`${label}: ${bindings[a].map(V.keyLabel).join('/')}`).join(' · ');}
  const idle=board=>({board,rows:[],flash:0,shake:0,controls:[0,0,0,0,0,0],lines:0,pieces:0,cleared:0,action:null});
  const clock=ms=>{const s=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;};
  function stopWorker(){requestId++;worker?.terminate();worker=null;}
  function setup(){
    startAttempt++;window.FlyScores?.syncPreset();
    running=false;paused=false;clearHeld();stopWorker();animation=null;move=null;showBindings();
    $('match-summary').hidden=true;$('match-setup').hidden=false;$('match-error').textContent='';$('match-pause').disabled=true;$('match-start').textContent='Start match →';
    $('match-status').textContent='CHOOSE YOUR PACE';$('seed-input').value=crypto.getRandomValues(new Uint32Array(1))[0];
    $('match-start').disabled=!model;
    if(!model)$('match-error').textContent='This report has no exported trained model. Regenerate it with its original checkpoint available.';
    $('match-clock').textContent=clock(Number($('match-length').value));$('human-pace').focus();
  }
  function open(){
    view.pause();opened=true;report.hidden=true;arena.hidden=false;document.body.classList.add('in-match');$('versus-scene-slot').appendChild(stage);
    $('model-description').textContent=model?`${model.metadata.neurons} fly neurons · ${model.metadata.edges.toLocaleString()} connections · trained seed ${model.training_seed}. Decisions run locally in your browser.`:'Live model unavailable.';
    view.scene?.reset();setup();
  }
  function close(){
    startAttempt++;
    running=false;opened=false;clearHeld();stopWorker();arena.hidden=true;report.hidden=false;document.body.classList.remove('in-match');home.insertBefore(stage,anchor);view.scene?.reset();view.restore();window.FlyScores?.refresh();
    if(document.fullscreenElement===arena)document.exitFullscreen().catch(()=>{});$('versus-open').focus();
  }
  function displayHuman(){
    view.drawBoard(humanCtx,idle(human.board));
    const a=human.active;
    if(a&&running){
      const s=shapes[human.piece][a.rotation],ghost=human.ghost();
      s.forEach((row,y)=>row.forEach((v,x)=>{if(!v)return;const px=(a.x+x)*26,py=(ghost.y+y)*26;
        humanCtx.strokeStyle='#b9ebc1';humanCtx.lineWidth=2;humanCtx.strokeRect(px+3,py+3,20,20);
        humanCtx.fillStyle='#b5e1c7';humanCtx.fillRect(px+3,(a.y+y)*26+3,20,20);
      }));
    }
    $('human-lines').textContent=human.lines;$('human-pieces').textContent=human.pieces;
    $('human-action').textContent=a?`${human.piece} · column ${a.x+1} · row ${a.y+1}${human.grounded?' · locking…':''}`:'Board topped out';
    $('drop-progress').style.transform=`scaleX(${human.grounded?Math.max(0,1-human.lockTime/500):1})`;
  }
  function displayFly(dt=0){
    const s=animation?animation.sample():idle(fly.board);
    view.drawBoard(flyCtx,s);view.drawBoard(view.lcd.getContext('2d'),s,true);
    view.scene?.update(s,dt,!!animation&&running&&!paused,matchMedia('(prefers-reduced-motion: reduce)').matches);
    $('fly-lines').textContent=animation?baseLines+s.lines:fly.lines;$('fly-pieces').textContent=animation?basePieces+s.pieces:fly.pieces;
    $('fly-action').textContent=s.action?`${s.action.piece} → column ${s.action.x+1} · rotation ${s.action.rotation*90}°`:(running?'Thinking through the circuit…':'Match finished');
    $('fly-clear').textContent=s.cleared?`+${s.cleared} ${s.cleared===1?'ROW':'ROWS'} · NICE MOVE`:'';
  }
  function think(){
    if(!running)return;
    if(!fly.alive){finish('fly-topout');return;}
    const id=++requestId;ready=false;
    worker.postMessage({type:'choose',id,board:fly.board,piece:fly.piece});
  }
  function receive(data){
    if(!running||data.id!==requestId)return;
    if(data.error){finish('error',data.error);return;}
    move=data.frame;if(!move){finish('fly-topout');return;}
    baseLines=fly.lines;basePieces=fly.pieces;committed=false;
    animation=new FlyReplay.ReplayTimeline({initialBoard:fly.board,frames:[move]},shapes);animation.play(true);ready=true;
  }
  async function start(event){
    event.preventDefault();if(!model)return;
    try{bindings=readBindings();}catch(error){$('match-error').textContent=error.message;return;}
    settings={seed:Number($('seed-input').value)>>>0,gravityMs:Number($('human-pace').value),flyMs:Number($('fly-pace').value),durationMs:Number($('match-length').value),bindings:structuredClone(bindings),humanRules:'falling gravity, 500ms lock delay, horizontal kicks',flyRules:'trained placement policy'};
    const attempt=++startAttempt;$('match-start').disabled=true;$('match-start').textContent='Preparing match…';
    const registeredSession=await window.FlyScores.begin(settings,model);
    if(attempt!==startAttempt||!opened)return;scoreSession=registeredSession;
    $('match-start').disabled=false;$('match-start').textContent='Start match →';
    if(scoreSession){settings.seed=scoreSession.seed;settings.difficulty=scoreSession.difficulty;settings.ranked=true;}else{settings.ranked=false;}
    savePreferences();$('keyboard-hint').textContent=controlHint();
    const seq=new V.Sequence(settings.seed);human=new V.FallingPlayer(seq,shapes,settings.gravityMs);fly=new V.Player(seq,shapes);
    stopWorker();
    try{
      const code=$('versus-core').textContent+`\nlet policy,shapes;onmessage=e=>{const d=e.data;try{if(d.type==='init'){policy=new FlyVersus.Policy(d.model);shapes=d.shapes;}else postMessage({id:d.id,frame:policy.choose(FlyVersus.candidates(d.board,d.piece,shapes))});}catch(error){postMessage({id:d.id,error:String(error.message)});}};`;
      const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);
      worker.onmessage=e=>receive(e.data);worker.onerror=e=>{e.preventDefault();if(running)finish('error','The local model worker stopped. Please restart the match.');};
      worker.postMessage({type:'init',model,shapes});
    }catch(error){$('match-error').textContent='Unable to start local inference: '+error.message;return;}
    elapsed=0;clearHeld();animation=null;move=null;paused=false;running=true;
    $('match-setup').hidden=true;$('match-summary').hidden=true;$('match-pause').disabled=false;$('match-pause').textContent='Pause match';$('match-status').textContent='MATCH IN PROGRESS';$('match-clock').textContent=clock(settings.durationMs);
    $('match-seed').textContent=`${settings.ranked?settings.difficulty.toUpperCase()+' · RANKED':'PRACTICE · UNRANKED'} · seed ${settings.seed}`;$('match-pause').focus();
    displayHuman();displayFly();think();
  }
  function control(action){
    if(!running||paused||!human.active)return;
    if(action==='left')human.move(-1);else if(action==='right')human.move(1);
    else if(action==='soft')human.move(0,1);else if(action==='hard')human.hardDrop();
    else human.rotate(action==='rotate');
    if(!human.alive){finish('human-topout');return;}displayHuman();
  }
  function pause(force){
    if(!running)return;paused=force===undefined?!paused:force;clearHeld();
    $('match-pause').textContent=paused?'Resume match':'Pause match';$('match-status').textContent=paused?'PAUSED · BOTH CLOCKS STOPPED':'MATCH IN PROGRESS';
    displayFly();
  }
  function finish(reason,error){
    if(!running)return;
    running=false;paused=false;clearHeld();stopWorker();$('match-pause').disabled=true;$('match-status').textContent='MATCH COMPLETE';
    const winner=reason==='error'?null:V.result(human,fly,reason);
    const stats=p=>({lines:p.lines,pieces:p.pieces,clears:p.clears.slice(),alive:p.alive,board:p.board});
    lastResult={version:2,date:new Date().toISOString(),reason,winner,elapsedSeconds:elapsed/1000,settings,model:{...model.metadata,training_seed:model.training_seed,generation:model.generation},human:stats(human),fly:stats(fly)};
    $('result-title').textContent=winner==='human'?'You win.':winner==='fly'?'The fly wins.':winner==='draw'?'An even match.':'Match interrupted.';
    $('result-reason').textContent=error||({'time':'Time is up. Ranked by lines cleared, then pieces placed.','human-topout':'Your board topped out. The fly takes this round.','fly-topout':'The fly topped out. You take this round.'}[reason]);
    const rows=[['Lines cleared',human.lines,fly.lines],['Pieces placed',human.pieces,fly.pieces],['Single / double / triple / Tetris',human.clears.join(' / '),fly.clears.join(' / ')],['Lines per minute',(human.lines/Math.max(elapsed/60000,1/60)).toFixed(1),(fly.lines/Math.max(elapsed/60000,1/60)).toFixed(1)]];
    $('result-rows').replaceChildren(...rows.map(row=>{const tr=document.createElement('tr');row.forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.appendChild(td);});return tr;}));
    $('result-settings').textContent=`Played ${clock(elapsed)} · seed ${settings.seed} · gravity ${settings.gravityMs}ms per row · fly pace ${settings.flyMs/1000}s. Shared sequence; human falling rules, fly placement rules.`;
    window.FlyScores.complete(lastResult,scoreSession);
    animation=null;displayHuman();displayFly();$('match-summary').hidden=false;$('match-again').focus();
  }
  $('versus-open').addEventListener('click',open);$('match-form').addEventListener('submit',start);
  for(const id of ['match-exit','setup-back','result-back'])$(id).addEventListener('click',close);
  $('match-again').addEventListener('click',setup);$('match-pause').addEventListener('click',()=>pause());
  $('match-fullscreen').addEventListener('click',()=>{if(document.fullscreenElement===arena)document.exitFullscreen().catch(()=>{});else arena.requestFullscreen?.().catch(()=>{});});
  document.querySelectorAll('[data-move]').forEach(b=>{
    if(b.dataset.move!=='soft'){b.addEventListener('click',()=>control(b.dataset.move));return;}
    b.addEventListener('pointerdown',e=>{e.preventDefault();if(!running||paused)return;b.setPointerCapture(e.pointerId);touchSoft=true;control('soft');});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>touchSoft=false);
    b.addEventListener('click',e=>{if(e.detail===0)control('soft');});
  });
  $('keys-reset').addEventListener('click',()=>{bindings=structuredClone(V.defaultBindings);showBindings();$('match-error').textContent='';});
  $('match-download').addEventListener('click',()=>{if(!lastResult)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`flytris-match-${lastResult.settings.seed}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  document.addEventListener('keydown',e=>{
    if(!opened)return;
    const overlay=!$('match-setup').hidden?$('match-setup'):!$('match-summary').hidden?$('match-summary'):null;
    if(overlay){if(e.key==='Tab'){const items=[...overlay.querySelectorAll('button:not(:disabled),input,select')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;}
    if(!running||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    const action=Object.keys(bindings).find(a=>bindings[a].includes(e.code));
    if(action){e.preventDefault();if(e.repeat||held.has(e.code))return;
      if(action==='pause'){pause();return;}
      if(paused)return;held.set(e.code,{action,age:0,next:170});control(action);
    }
  });
  document.addEventListener('keyup',e=>held.delete(e.code));
  window.addEventListener('blur',()=>{clearHeld();if(opened)pause(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&opened)pause(true);});
  let last=performance.now();
  function tick(now){
    const dt=Math.min(250,Math.max(0,now-last));last=now;
    if(opened&&running&&!paused&&!document.hidden){
      const activeDt=Math.min(dt,settings.durationMs-elapsed);elapsed+=activeDt;
      if(animation&&ready){
        const scaled=activeDt*animation.frames[0].duration/settings.flyMs;animation.advance(scaled);
        const threshold=move.cleared?FlyReplay.CLEAR_END:FlyReplay.LAND;
        if(!committed&&(!animation.playing||animation.elapsed>=threshold)){fly.commit(move);committed=true;}
        displayFly(scaled);
        if(!fly.alive){finish('fly-topout');}
        else if(!animation.playing){animation=null;move=null;think();}
      }
      if(running){
        for(const state of held.values()){if(state.action==='left'||state.action==='right'){state.age+=activeDt;while(state.age>=state.next){control(state.action);state.next+=65;}}}
        const soft=touchSoft||[...held.values()].some(s=>s.action==='soft');human.tick(activeDt,soft);
        if(!human.alive)finish('human-topout');
      }
      if(running){displayHuman();$('match-clock').textContent=clock(settings.durationMs-elapsed);if(elapsed>=settings.durationMs)finish('time');}
    }
    requestAnimationFrame(tick);
  }loadPreferences();showBindings();requestAnimationFrame(tick);
})();
