(function(){
  'use strict';const $=id=>document.getElementById(id);
  const config=window.FLYTRIS_CONFIG,presets=config.presets;
  const fields={'human-pace':'gravityMs','fly-pace':'flyMs','fly-control-pace':'flyControlMs','match-length':'durationMs'};
  let pending=null,savePromise=null,generation=0,loading=0;
  async function api(body){
    const response=await fetch('/api/scores',{method:'POST',keepalive:body.action==='finish',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save scores.');return data;
  }
  const readSettings=()=>Object.fromEntries(Object.entries(fields).map(([id,key])=>[key,Number($(id).value)]));
  const level=s=>Object.keys(presets).find(key=>Object.entries(presets[key]).every(([k,v])=>s[k]===v))||'custom';
  function applyPreset(difficulty){
    const p=presets[difficulty];if(!p)return;
    if(![...$('match-length').options].some(o=>Number(o.value)===p.durationMs))$('match-length').add(new Option(`${p.durationMs/1000} seconds`,p.durationMs));
    for(const [id,key] of Object.entries(fields))$(id).value=p[key];
    syncPreset();
  }
  function syncPreset(){
    const s=readSettings(),difficulty=level(s);$('match-difficulty').value=difficulty;$('seed-input').disabled=difficulty!=='custom';
    $('ranking-note').textContent=(difficulty==='custom'?'Custom practice. ':'Default '+difficulty+' difficulty. ')+`Fly controls: ${s.flyControlMs} ms; effective fly gravity: ${s.flyMs*s.flyControlMs/50} ms. Only default difficulty values qualify for the leaderboard.`;
  }
  $('match-difficulty').addEventListener('change',()=>{const difficulty=$('match-difficulty').value;if(presets[difficulty])applyPreset(difficulty);else{$('seed-input').disabled=false;$('ranking-note').textContent='Custom practice. Only default difficulty values qualify for the leaderboard.';}});
  for(const id of Object.keys(fields)){ $(id).addEventListener('change',syncPreset);$(id).addEventListener('input',syncPreset); }
  applyPreset(config.defaultDifficulty);
  for(const [difficulty,p] of Object.entries(presets)){
    const heading=$('scores-'+difficulty).closest('section').querySelector('h3 small');
    heading.textContent=`${p.gravityMs} ms human gravity · ${p.flyControlMs} ms fly controls`;
  }
  document.querySelector('.score-context').textContent='The same trained weights play every difficulty. Fly control ticks: '+Object.entries(presets).map(([level,p])=>`${level} ${p.flyControlMs} ms`).join(' · ')+'. Totals include matches verified under the current rules; earlier scores are preserved separately.';
  function format(n){return Number(n).toLocaleString();}
  async function refresh(){
    const request=++loading;$('scores-status').textContent='Loading scores…';
    try{
      const query=new URLSearchParams({window:$('scores-window').value,difficulty:$('scores-difficulty').value});
      const response=await fetch('/api/scores?'+query,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const d=await response.json();if(request!==loading)return;
      for(const key of Object.keys(presets)){
        const body=$('scores-'+key);body.replaceChildren();
        if(!d.lists[key].length){const row=body.insertRow(),cell=row.insertCell();cell.colSpan=3;cell.className='score-empty';cell.textContent='No matches in this window. Set the first score.';}
        d.lists[key].forEach((r,i)=>{const row=body.insertRow(),who=row.insertCell();who.textContent=`${i+1}. ${r.player_name}`;const date=document.createElement('small');date.textContent=new Date(r.timestamp).toLocaleString();who.appendChild(date);for(const side of ['human','fly']){const cell=row.insertCell();cell.textContent=format(r[side+'_lines']);const detail=document.createElement('small');detail.textContent=`${r[side+'_pieces']} pieces`;cell.appendChild(detail);}});
      }
      const s=d.summary,total=s.human_lines+s.fly_lines,share=total?s.human_lines/total*100:0;
      $('score-ring').style.background=total?`conic-gradient(var(--mint) 0 ${share}%,var(--gold) ${share}% 100%)`:'#2c4148';
      $('score-ring').setAttribute('aria-label',`Humans cleared ${s.human_lines} lines; fly cleared ${s.fly_lines} lines, across ${s.matches} matches.`);
      $('score-total').textContent=format(total);$('total-human').textContent=format(s.human_lines)+(s.human_lines===1?' line':' lines');$('total-fly').textContent=format(s.fly_lines)+(s.fly_lines===1?' line':' lines');$('score-match-count').textContent=`${format(s.matches)} completed ${s.matches===1?'match':'matches'}`;
      $('score-wins').textContent=`Wins: human ${s.human_wins} · fly ${s.fly_wins} · draws ${s.draws}`;
      $('scores-status').textContent=(d.storage==='local'?'Local score database · ':'')+'Server-verified games · Updated '+new Date(d.generatedAt).toLocaleTimeString();
    }catch{if(request!==loading)return;$('scores-status').textContent='Scorebook offline. Connect the score database to enable shared high scores.';for(const key of Object.keys(presets)){const body=$('scores-'+key);body.replaceChildren();const cell=body.insertRow().insertCell();cell.colSpan=3;cell.className='score-empty';cell.textContent='Scores unavailable.';}}
  }
  async function save(){
    if(!pending)return false;if(savePromise)return savePromise;
    const current=pending,id=generation;
    savePromise=(async()=>{try{if(current.verify)await current.verify();await api({action:'finish',id:current.session.id,token:current.session.token,result:current.result});if(id!==generation)return false;current.saved=true;$('score-name-status').textContent='Both scores saved as anonymous. Add your name below.';$('score-name-save').disabled=false;$('score-retry').hidden=true;refresh();return true;}catch(error){if(id===generation){$('score-name-status').textContent='Scores not saved: '+error.message;$('score-retry').hidden=false;}return false;}finally{savePromise=null;}})();return savePromise;
  }
  $('score-name-save').addEventListener('click',async()=>{
    if(!pending||!pending.saved)return;const current=pending,id=generation;$('score-name-save').disabled=true;
    try{const d=await api({action:'rename',id:current.session.id,token:current.session.token,name:$('score-player-name').value});if(id!==generation)return;$('score-name-entry').hidden=true;$('score-name-status').classList.add('score-congratulations');$('score-name-status').textContent=`Congratulations ${d.name}. You're #${d.rank} in today's scoreboard on ${d.difficulty} difficulty.`;refresh();}catch(error){if(id===generation)$('score-name-status').textContent='Name not saved: '+error.message;}finally{if(id===generation)$('score-name-save').disabled=false;}
  });
  $('score-retry').addEventListener('click',save);
  $('scores-refresh').addEventListener('click',refresh);for(const id of ['scores-window','scores-difficulty'])$(id).addEventListener('change',refresh);
  window.FlyScores={syncPreset,readSettings,refresh,checkpoint(session,sequence,commands){return api({action:'checkpoint',id:session.id,token:session.token,sequence,commands});},async begin(settings,model){
    if(model.task!=='falling-v1')return null;
    const difficulty=level(settings);if(difficulty==='custom'||$('match-difficulty').value==='custom')return null;
    try{return await api({action:'start',difficulty,rulesVersion:settings.rulesVersion,modelHash:model.metadata.model_sha256});}catch{return null;}
  },complete(result,session,verify){
    generation++;savePromise=null;pending=null;$('score-name-entry').hidden=!session||result.reason==='error';$('score-name-status').classList.remove('score-congratulations');$('score-player-name').value='';$('score-name-save').disabled=true;$('score-retry').hidden=true;
    if(!session||result.reason==='error'){$('score-name-status').textContent='Unranked match: custom settings or the score service was unavailable at the start.';return;}
    pending={result,session,verify,saved:false};$('score-name-status').textContent='Saving both scores as anonymous…';save();
  }};
  refresh();
})();
