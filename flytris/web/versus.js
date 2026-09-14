(function(){
  'use strict';
  const $=id=>document.getElementById(id),V=window.FlyVersus,K=window.FlyKeyBindings,shapes=window.FLYTRIS_SHAPES,model=window.FLYTRIS_MODEL;
  const arena=$('versus'),report=document.querySelector('main'),stage=$('fly-stage'),home=stage.parentNode,anchor=stage.nextSibling;
  const humanCtx=$('human-board').getContext('2d'),flyCtx=$('fly-board').getContext('2d'),view=window.FlyReport;
  const falling=model?.task==='falling-v1';let bot=null,clockRemainder=0;
  let opened=false,running=false,paused=false,worker=null,requestId=0,human,fly,settings,elapsed=0,animation=null,move=null,committed=false,baseLines=0,basePieces=0,lastResult=null,ready=false;
  let bindings=structuredClone(V.defaultBindings),scoreSession=null,startAttempt=0;
  let rankedLog='',rankedSequence=0,rankedVerifiedMs=0,rankedWaiting=false,rankedControls=0,rankedHard=false;
  const held=new Map(),cookieName='flytris_preferences_v2';let touchSoft=false;
  function clearHeld(){held.clear();touchSoft=false;}
  const keySymbols={ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Space:'Space',Enter:'↵ Enter',Escape:'Esc',ShiftLeft:'⇧ Left',ShiftRight:'⇧ Right'};
  function keycaps(keys){
    const fragment=document.createDocumentFragment();
    for(const key of keys){
      const cap=document.createElement('kbd');cap.className='keyboard-key';
      cap.textContent=keySymbols[key]||V.keyLabel(key);cap.title=V.keyLabel(key);cap.setAttribute('aria-label',V.keyLabel(key));fragment.append(cap);
    }
    return fragment;
  }
  let captureAction=null;
  const capture=$('key-capture');
  function showBindings(){
    const fragment=document.createDocumentFragment(),missing=K.missing(bindings);
    for(const [action,label] of Object.entries(K.actions)){
      const group=document.createElement('div');group.className='key-group'+(missing.includes(action)?' missing':'');group.setAttribute('role','group');group.setAttribute('aria-label',label);
      const heading=document.createElement('strong');heading.textContent=label;group.append(heading);
      const keys=document.createElement('div');keys.className='key-preview';
      for(const code of bindings[action]){
        const remove=document.createElement('button');remove.type='button';remove.className='key-remove';remove.setAttribute('aria-label',`Remove ${V.keyLabel(code)} from ${label}`);remove.title=remove.getAttribute('aria-label');remove.append(keycaps([code]));
        const cross=document.createElement('span');cross.className='key-cross';cross.textContent='×';cross.setAttribute('aria-hidden','true');remove.append(cross);
        remove.addEventListener('click',()=>{bindings[action]=bindings[action].filter(k=>k!==code);showBindings();savePreferences();$('key-add-'+action).focus();});keys.append(remove);
      }
      const add=document.createElement('button');add.type='button';add.className='key-add';add.id='key-add-'+action;add.textContent='+ Add key';add.setAttribute('aria-label','Add key for '+label);
      add.addEventListener('click',()=>{captureAction=action;$('key-capture-title').textContent='Now press the key for '+label.toLowerCase()+'.';$('key-capture-error').textContent='';capture.showModal();});keys.append(add);group.append(keys);
      if(missing.includes(action)){const warning=document.createElement('span');warning.className='key-missing';warning.textContent='Add at least one key';group.append(warning);}
      fragment.append(group);
    }
    $('key-groups').replaceChildren(fragment);$('match-start').disabled=!model||missing.length>0;
  }
  function readBindings(){const result=K.normalize(bindings),missing=K.missing(result);if(missing.length)throw Error('Add a key for: '+missing.map(a=>K.actions[a]).join(', ')+'.');return result;}
  function loadPreferences(){
    try{
      const raw=document.cookie.split('; ').find(v=>v.startsWith(cookieName+'='));if(!raw)return;
      const p=JSON.parse(decodeURIComponent(raw.slice(cookieName.length+1)));
      if(![2,3,4].includes(p.version))return;
      if(p.version===2&&p.durationMs===180000)p.durationMs=120000;
      bindings=K.normalize(p.bindings);
      for(const [id,key] of [['human-pace','gravityMs'],['fly-pace','flyMs'],['fly-control-pace','flyControlMs'],['match-length','durationMs']]){
        const input=$(id),value=p[key];if(!Number.isInteger(value)||value<50||value%50!==0)continue;
        if(input.tagName==='SELECT'){if([...input.options].some(o=>Number(o.value)===value))input.value=value;}
        else if(value<=Number(input.max))input.value=value;
      }
      window.FlyScores.syncPreset();
    }catch{/* Invalid or unavailable cookies leave safe defaults. */}
  }
  function savePreferences(){
    const data=encodeURIComponent(JSON.stringify({version:4,bindings,...window.FlyScores.readSettings()}));
    try{document.cookie=`${cookieName}=${data}; Max-Age=31536000; Path=/; SameSite=Lax`;}catch{}
    const saved=document.cookie.split('; ').some(v=>v===cookieName+'='+data);
    $('preferences-status').textContent=saved?'Controls saved in this browser for one year.':'Cookie storage is unavailable here; settings will last for this open page.';
  }
  function stopCapture(){const action=captureAction;captureAction=null;capture.close();if(action)$('key-add-'+action).focus();}
  $('key-capture-cancel').addEventListener('click',stopCapture);
  capture.addEventListener('cancel',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{
    if(!capture.open)return;e.preventDefault();e.stopImmediatePropagation();
    if(e.repeat||e.isComposing)return;
    if(e.ctrlKey||e.metaKey||e.altKey){$('key-capture-error').textContent='Press one key without Ctrl, Alt or Command.';return;}
    try{bindings=K.assign(bindings,captureAction,e.code);showBindings();savePreferences();stopCapture();}catch(error){$('key-capture-error').textContent=error.message;}
  },true);
  function controlHint(){
    const fragment=document.createDocumentFragment();
    for(const [action,label] of [['left','Left'],['right','Right'],['soft','Soft drop'],['rotate','Rotate clockwise'],['reverse','Rotate counterclockwise'],['hard','Hard drop'],['pause','Pause']]){
      if(!bindings[action].length)continue;
      const group=document.createElement('span');group.className='keyboard-action';group.append(document.createTextNode(label+' '),keycaps(bindings[action]));fragment.append(group);
    }
    return fragment;
  }
  const idle=board=>({board,rows:[],flash:0,shake:0,controls:[0,0,0,0,0,0],lines:0,pieces:0,cleared:0,action:null});
  const clock=ms=>{const s=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;};
  function stopWorker(){requestId++;worker?.terminate();worker=null;}
  function setup(){
    startAttempt++;window.FlyScores?.syncPreset();
    running=false;paused=false;clearHeld();stopWorker();animation=null;move=null;showBindings();
    $('match-summary').hidden=true;$('match-setup').hidden=false;$('match-error').textContent='';$('match-pause').disabled=true;$('match-start').textContent='Start match →';
    $('match-status').textContent='CHOOSE YOUR PACE';$('seed-input').value=crypto.getRandomValues(new Uint32Array(1))[0];
    $('match-start').disabled=!model||K.missing(bindings).length>0;
    if(!model)$('match-error').textContent='This report has no exported trained model. Regenerate it with its original checkpoint available.';
    $('match-clock').textContent=clock(Number($('match-length').value));$('human-pace').focus();
  }
  function open(){
    view.pause();opened=true;report.hidden=true;arena.hidden=false;document.body.classList.add('in-match');$('versus-scene-slot').appendChild(stage);
    $('model-description').textContent=model?`${model.metadata.neurons} fly neurons · ${model.metadata.edges.toLocaleString()} connections · ${falling?'falling-rules checkpoint · generation '+model.generation:'trained seed '+model.training_seed}. Decisions run locally in your browser.`:'Live model unavailable.';
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
    if(falling&&bot){
      const s=bot.sample();view.drawBoard(flyCtx,s);view.drawBoard(view.lcd.getContext('2d'),s,true);
      view.scene?.update(s,dt,running&&!paused,matchMedia('(prefers-reduced-motion: reduce)').matches);
      $('fly-lines').textContent=fly.lines;$('fly-pieces').textContent=fly.pieces;
      $('fly-action').textContent=running&&!ready?'Planning the next route · match clock waiting':s.action?`${s.action.piece} · ${s.action.control} · row ${s.action.y+1}`:'Ready to play';
      $('fly-clear').textContent=s.cleared?`+${s.cleared} ${s.cleared===1?'ROW':'ROWS'} · NICE MOVE`:'';return;
    }
    const s=animation?animation.sample():idle(fly.board);
    view.drawBoard(flyCtx,s);view.drawBoard(view.lcd.getContext('2d'),s,true);
    view.scene?.update(s,dt,!!animation&&running&&!paused,matchMedia('(prefers-reduced-motion: reduce)').matches);
    $('fly-lines').textContent=animation?baseLines+s.lines:fly.lines;$('fly-pieces').textContent=animation?basePieces+s.pieces:fly.pieces;
    $('fly-action').textContent=s.action?`${s.action.piece} → column ${s.action.x+1} · rotation ${s.action.rotation*90}°`:(running?'Thinking through the circuit…':'Match finished');
    $('fly-clear').textContent=s.cleared?`+${s.cleared} ${s.cleared===1?'ROW':'ROWS'} · NICE MOVE`:'';
  }
  function think(){
    if(!running)return;
    if(scoreSession){ready=true;return;}
    if(!fly.alive){finish('fly-topout');return;}
    const id=++requestId;ready=false;
    worker.postMessage(falling?{type:'choose',id,snapshot:bot.snapshot(),remainingMs:(settings.durationMs-elapsed)*50/settings.flyControlMs}:{type:'choose',id,board:fly.board,piece:fly.piece});
  }
  function receive(data){
    if(!running||data.id!==requestId)return;
    if(data.error){finish('error',data.error);return;}
    if(falling){
      try{bot.accept(data.frame);ready=true;displayFly();}catch(error){finish('error',error.message);}return;
    }
    move=data.frame;if(!move){finish('fly-topout');return;}
    baseLines=fly.lines;basePieces=fly.pieces;committed=false;
    animation=new FlyReplay.ReplayTimeline({initialBoard:fly.board,frames:[move]},shapes);animation.play(true);ready=true;
  }
  async function start(event){
    event.preventDefault();if(!model)return;
    try{bindings=readBindings();}catch(error){$('match-error').textContent=error.message;return;}
    settings={seed:Number($('seed-input').value)>>>0,gravityMs:Number($('human-pace').value),flyMs:Number($('fly-pace').value),flyControlMs:Number($('fly-control-pace').value),durationMs:Number($('match-length').value),rulesVersion:falling?FlyFallingLive.RANKED_RULES:1,bindings:structuredClone(bindings),humanRules:'falling gravity, 500ms lock delay, horizontal kicks',flyRules:falling?'falling-v1, 50ms controls, midair rotation and slides':'trained placement policy'};
    const attempt=++startAttempt;$('match-start').disabled=true;$('match-start').textContent='Preparing match…';
    const registeredSession=await window.FlyScores.begin(settings,model);
    if(attempt!==startAttempt||!opened)return;scoreSession=registeredSession;
    $('match-start').disabled=false;$('match-start').textContent='Start match →';
    if(scoreSession){settings.seed=scoreSession.seed;settings.difficulty=scoreSession.difficulty;settings.ranked=true;settings.flyControlMs=scoreSession.settings.flyControlMs;}else{settings.ranked=false;}
    if(falling)settings.flyRules=`falling-v1, ${settings.flyControlMs}ms controls, ${50/settings.flyControlMs}x speed`;
    savePreferences();$('keyboard-hint').replaceChildren(controlHint());
    const seq=new V.Sequence(settings.seed);human=new V.FallingPlayer(seq,shapes,settings.gravityMs);
    bot=falling?new FlyFallingLive.Controller(settings.seed,shapes,settings.flyMs):null;fly=falling?bot.player:new V.Player(seq,shapes);
    stopWorker();
    if(!scoreSession){try{
      const code='globalThis.FLYTRIS_CONFIG='+JSON.stringify(window.FLYTRIS_CONFIG)+';\n'+($('versus-core')?.textContent||window.FLYTRIS_SOURCES?.['versus-core']||'')+(falling?'\n'+($('falling-policy')?.textContent||window.FLYTRIS_SOURCES?.['falling-policy']||'')+'\n'+($('falling-live')?.textContent||window.FLYTRIS_SOURCES?.['falling-live']||''):'')+`\nlet policy,shapes;onmessage=e=>{const d=e.data;try{if(d.type==='init'){policy=new FlyVersus.Policy(d.model);shapes=d.shapes;}else postMessage({id:d.id,frame:${falling?'FlyFallingLive.plan(d.snapshot,shapes,policy,d.remainingMs)':'policy.choose(FlyVersus.candidates(d.board,d.piece,shapes))'}});}catch(error){postMessage({id:d.id,error:String(error.message)});}};`;
      const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);
      worker.onmessage=e=>receive(e.data);worker.onerror=e=>{e.preventDefault();if(running)finish('error','The local model worker stopped. Please restart the match.');};
      worker.postMessage({type:'init',model,shapes});
    }catch(error){$('match-error').textContent='Unable to start local inference: '+error.message;return;}}
    rankedLog='';rankedSequence=0;rankedVerifiedMs=0;rankedWaiting=false;rankedControls=0;rankedHard=false;$('match-verify-retry').hidden=true;
    document.querySelector('.live-badge').textContent=scoreSession?'VERIFIED FLY RUN · SERVER CHECKPOINTS':'LIVE MODEL · FRESH DECISIONS';
    $('model-description').textContent=scoreSession?'Ranked opponent: a recorded run of the trained fly. The server verifies both games every 10 seconds.':'The trained fly chooses fresh moves locally in your browser.';
    elapsed=0;clockRemainder=0;clearHeld();animation=null;move=null;paused=false;running=true;
    $('match-setup').hidden=true;$('match-summary').hidden=true;$('match-pause').disabled=false;$('match-pause').textContent='Pause match';$('match-status').textContent='MATCH IN PROGRESS';$('match-clock').textContent=clock(settings.durationMs);
    $('match-seed').textContent=`${settings.ranked?settings.difficulty.toUpperCase()+' · RANKED':'PRACTICE · UNRANKED'} · seed ${settings.seed}`;$('match-pause').focus();
    displayHuman();displayFly();think();
  }
  function control(action){
    if(!running||paused||rankedWaiting||!human.active||(falling&&!ready))return;
    if(scoreSession){if(rankedControls>=8||(action==='hard'&&rankedHard))return;rankedControls++;if(action==='hard')rankedHard=true;rankedLog+=({left:'L',right:'R',soft:'D',hard:'H',rotate:'C',reverse:'A'})[action];}
    if(action==='left')human.move(-1);else if(action==='right')human.move(1);
    else if(action==='soft')human.move(0,1);else if(action==='hard')human.hardDrop();
    else human.rotate(action==='rotate');
    if(!human.alive){finish('human-topout');return;}displayHuman();
  }
  function pause(force){
    if(!running||rankedWaiting)return;paused=force===undefined?!paused:force;clearHeld();
    $('match-pause').textContent=paused?'Resume match':'Pause match';$('match-status').textContent=paused?'PAUSED · BOTH CLOCKS STOPPED':'MATCH IN PROGRESS';
    displayFly();
  }
  function finish(reason,error){
    if(!running)return;
    running=false;paused=false;clearHeld();stopWorker();$('match-pause').disabled=true;$('match-status').textContent='MATCH COMPLETE';
    const winner=reason==='error'?null:V.result(human,fly,reason);
    const stats=p=>({lines:p.lines,pieces:p.pieces,clears:p.clears.slice(),alive:p.alive,board:p.board});
    lastResult={version:falling?3:2,date:new Date().toISOString(),reason,winner,elapsedSeconds:elapsed/1000,settings,model:{...model.metadata,training_seed:model.training_seed,generation:model.generation,task:model.task},human:stats(human),fly:stats(fly)};
    $('result-title').textContent=winner==='human'?'You win.':winner==='fly'?'The fly wins.':winner==='draw'?'An even match.':'Match interrupted.';
    $('result-reason').textContent=error||({'time':'Time is up. Ranked by lines cleared, then pieces placed.','human-topout':'Your board topped out. The fly takes this round.','fly-topout':'The fly topped out. You take this round.'}[reason]);
    const rows=[['Lines cleared',human.lines,fly.lines],['Pieces placed',human.pieces,fly.pieces],['Single / double / triple / Tetris',human.clears.join(' / '),fly.clears.join(' / ')],['Lines per minute',(human.lines/Math.max(elapsed/60000,1/60)).toFixed(1),(fly.lines/Math.max(elapsed/60000,1/60)).toFixed(1)]];
    $('result-rows').replaceChildren(...rows.map(row=>{const tr=document.createElement('tr');row.forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.appendChild(td);});return tr;}));
    $('result-settings').textContent=falling?`Played ${clock(elapsed)} · seed ${settings.seed} · human / fly gravity ${settings.gravityMs} / ${settings.flyMs*settings.flyControlMs/50}ms. Shared sequence and falling rules; fly controls every ${settings.flyControlMs}ms. Ranked moves are verified in 10-second batches; practice pauses while the fly plans.`:`Played ${clock(elapsed)} · seed ${settings.seed} · legacy placement match.`;
    window.FlyScores.complete(lastResult,scoreSession,()=>verifyProgress(true));
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
  $('keys-reset').addEventListener('click',()=>{bindings=structuredClone(V.defaultBindings);showBindings();savePreferences();$('match-error').textContent='';});
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
  async function verifyProgress(final=false){
    if(!scoreSession||!rankedLog)return;
    const session=scoreSession,attempt=startAttempt,sequence=rankedSequence+1,commands=rankedLog;
    const expected={human:{lines:human.lines,pieces:human.pieces,board:structuredClone(human.board)},fly:{lines:fly.lines,pieces:fly.pieces,board:structuredClone(fly.board)},elapsedMs:elapsed};
    rankedWaiting=true;$('match-verify-retry').hidden=true;$('match-pause').disabled=true;
    if(!final)$('match-status').textContent='VERIFYING MOVES';
    try{
      const receipt=await window.FlyScores.checkpoint(session,sequence,commands);
      if(scoreSession!==session||attempt!==startAttempt)throw Error('The match changed.');
      if(receipt.elapsedMs!==expected.elapsedMs||['human','fly'].some(side=>['lines','pieces','board'].some(key=>JSON.stringify(receipt[side][key])!==JSON.stringify(expected[side][key]))))throw Error('The game differs from the server verification.');
      rankedSequence=sequence;rankedLog='';rankedVerifiedMs=elapsed;rankedWaiting=false;
      if(!final){$('match-pause').disabled=false;$('match-status').textContent=paused?'PAUSED':'MATCH IN PROGRESS';}
    }catch(error){if(scoreSession===session&&attempt===startAttempt&&!final){$('match-status').textContent='VERIFICATION PAUSED · '+error.message;$('match-verify-retry').hidden=false;}throw error;}
  }
  $('match-verify-retry').addEventListener('click',()=>verifyProgress().catch(()=>{}));
  function fallingTick(dt){
    if(rankedWaiting)return;
    if(!ready){displayFly();return;}
    clockRemainder+=dt;
    while(clockRemainder>=50&&running&&ready){
      clockRemainder-=50;elapsed+=50;if(scoreSession)rankedLog+='B';
      const flyIndex=FlyFallingLive.actionIndex(elapsed,settings.flyControlMs);
      if(flyIndex!==null)bot.step(scoreSession?scoreSession.flyRun.actions[flyIndex]:undefined);
      for(const state of held.values()){if(state.action==='left'||state.action==='right'){state.age+=50;while(state.age>=state.next){control(state.action);state.next+=65;}}}
      if(!running)break;
      const soft=touchSoft||[...held.values()].some(s=>s.action==='soft');if(scoreSession)rankedLog+=soft?'S':'T';
      human.tick(50,soft);rankedControls=0;rankedHard=false;
      if(!human.alive){finish('human-topout');break;}if(!fly.alive){finish('fly-topout');break;}
      if(elapsed>=settings.durationMs){finish('time');break;}
      if(scoreSession&&elapsed-rankedVerifiedMs>=10000){clockRemainder=0;verifyProgress().catch(()=>{});break;}
      if(!scoreSession&&!bot.ready){clockRemainder=0;think();}
    }
    if(running){displayHuman();displayFly(dt);$('match-clock').textContent=clock(settings.durationMs-elapsed);}
  }
  function tick(now){
    const dt=Math.min(250,Math.max(0,now-last));last=now;
    if(opened&&running&&!paused&&!document.hidden){
      if(falling){fallingTick(dt);requestAnimationFrame(tick);return;}
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
