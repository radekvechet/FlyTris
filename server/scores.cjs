const crypto=require('node:crypto');
const PRESETS={easy:{gravityMs:800,flyMs:800,durationMs:120000,rulesVersion:3},medium:{gravityMs:500,flyMs:500,durationMs:120000,rulesVersion:3},hard:{gravityMs:250,flyMs:250,durationMs:120000,rulesVersion:3}};
const WINDOWS={'24h':86400000,'7d':7*86400000,'30d':30*86400000,all:null};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
function name(value){if(typeof value!=='string')return 'anonymous';const n=value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu,'').trim().replace(/\s+/g,' ');return n.slice(0,60)||'anonymous';}
function validateStats(s){
  if(!s||!integer(s.lines,0,2000)||!integer(s.pieces,0,5000)||typeof s.alive!=='boolean')fail('Invalid score.');
  if(!Array.isArray(s.clears)||s.clears.length!==4||!s.clears.every(v=>integer(v,0,5000))||s.clears.reduce((n,v,i)=>n+v*(i+1),0)!==s.lines)fail('Invalid row-clear totals.');
  if(!Array.isArray(s.board)||s.board.length!==20||s.board.some(r=>!Array.isArray(r)||r.length!==10||r.some(v=>!integer(v,0,7))))fail('Invalid final board.');
  if(s.board.flat().filter(Boolean).length!==4*s.pieces-10*s.lines)fail('Score does not match board.');
}
function makeService(db,modelHash,now=Date.now,leaderboardVersion=3){
  async function session(input){
    if(typeof input.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)||typeof input.token!=='string'||! /^[0-9a-f]{64}$/i.test(input.token))fail('Invalid match token.',403);
    const rows=await db.query('SELECT * FROM flytris_matches WHERE id=$1 AND token_hash=$2',[input.id,hash(input.token)]);
    if(!rows.length)fail('Match not found.',403);return rows[0];
  }
  return {
    async start(input){
      if(input.rulesVersion!==3)fail("The match rules have changed. Reload the game.",409);
      if(typeof input.difficulty!=='string'||!Object.hasOwn(PRESETS,input.difficulty))fail('Choose Easy, Medium or Hard.');
      if(input.modelHash!==modelHash)fail('The fly model has changed. Reload the game.',409);
      const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex'),seed=crypto.randomBytes(4).readUInt32LE(),started=now();
      await db.query('INSERT INTO flytris_matches (id,token_hash,difficulty,model_hash,seed,started_at,rules_version) VALUES ($1,$2,$3,$4,$5,$6,3)',[id,hash(token),input.difficulty,modelHash,seed,started]);
      return {id,token,seed,difficulty:input.difficulty,settings:PRESETS[input.difficulty],startedAt:new Date(started).toISOString()};
    },
    async finish(input){
      const s=await session(input);if(s.completed_at!==null)return {saved:true,id:s.id,timestamp:new Date(Number(s.completed_at)).toISOString(),name:s.player_name};
      if(Number(s.rules_version)!==3)fail('This match uses retired rules. Start a new match.',409);
      const t=now(),r=input.result,p=PRESETS[s.difficulty];
      if(t-Number(s.started_at)>7200000)fail('This match has expired.');
      if(!r||!['time','human-topout','fly-topout'].includes(r.reason))fail('Only completed matches can be saved.');
      if(!r.settings||r.settings.seed!==Number(s.seed)||r.settings.gravityMs!==p.gravityMs||r.settings.flyMs!==p.flyMs||r.settings.durationMs!==p.durationMs||r.settings.rulesVersion!==3||r.model?.model_sha256!==s.model_hash)fail('Match settings changed.');
      if(typeof r.elapsedSeconds!=='number'||!Number.isFinite(r.elapsedSeconds))fail('Invalid match duration.');
      const ms=Math.round(r.elapsedSeconds*1000);
      if(!integer(ms,1,p.durationMs)||ms>t-Number(s.started_at)+1500||(r.reason==='time'&&ms!==p.durationMs))fail('Invalid match duration.');
      validateStats(r.human);validateStats(r.fly);
      if(r.fly.pieces>Math.floor(ms/50)||r.human.pieces>Math.ceil(ms/40))fail('Score exceeds the match pace.');
      if((r.reason==='human-topout'&&r.human.alive)||(r.reason==='fly-topout'&&r.fly.alive)||(r.reason==='time'&&(!r.human.alive||!r.fly.alive)))fail('Invalid match ending.');
      const winner=r.reason==='human-topout'?'fly':r.reason==='fly-topout'?'human':r.human.lines!==r.fly.lines?(r.human.lines>r.fly.lines?'human':'fly'):r.human.pieces!==r.fly.pieces?(r.human.pieces>r.fly.pieces?'human':'fly'):'draw';
      await db.query('UPDATE flytris_matches SET completed_at=$1,elapsed_ms=$2,human_lines=$3,human_pieces=$4,fly_lines=$5,fly_pieces=$6,winner=$7,reason=$8 WHERE id=$9 AND completed_at IS NULL',[t,ms,r.human.lines,r.human.pieces,r.fly.lines,r.fly.pieces,winner,r.reason,s.id]);
      const [saved]=await db.query('SELECT completed_at FROM flytris_matches WHERE id=$1',[s.id]);
      return {saved:true,id:s.id,timestamp:new Date(Number(saved.completed_at)).toISOString(),name:'anonymous'};
    },
    async rename(input){
      const s=await session(input);if(s.completed_at===null)fail('Finish the match first.');
      if(now()-Number(s.completed_at)>3600000)fail('The name-editing period has ended.');
      const player=name(input.name);await db.query('UPDATE flytris_matches SET player_name=$1 WHERE id=$2',[player,s.id]);return {saved:true,name:player};
    },
    async leaderboard(window='24h',difficulty='all'){
      if(!Object.hasOwn(WINDOWS,window)||!['all',...Object.keys(PRESETS)].includes(difficulty))fail('Invalid leaderboard filter.');
      const cutoff=WINDOWS[window]===null?0:now()-WINDOWS[window],params=[cutoff];
      let where=`rules_version=${leaderboardVersion} AND completed_at IS NOT NULL AND completed_at >= $1`;if(difficulty!=='all'){where+=' AND difficulty=$2';params.push(difficulty);}
      const summaryRows=await db.query(`SELECT COUNT(*) AS matches, COALESCE(SUM(human_lines),0) AS human_lines, COALESCE(SUM(fly_lines),0) AS fly_lines, COALESCE(SUM(CASE WHEN winner='human' THEN 1 ELSE 0 END),0) AS human_wins, COALESCE(SUM(CASE WHEN winner='fly' THEN 1 ELSE 0 END),0) AS fly_wins, COALESCE(SUM(CASE WHEN winner='draw' THEN 1 ELSE 0 END),0) AS draws FROM flytris_matches WHERE ${where}`,params);
      const lists={};
      for(const level of Object.keys(PRESETS)){
        const rows=await db.query(`SELECT id,player_name,human_lines,human_pieces,fly_lines,fly_pieces,winner,completed_at FROM flytris_matches WHERE rules_version=${leaderboardVersion} AND difficulty=$1 AND completed_at >= $2 ORDER BY human_lines DESC,human_pieces DESC,completed_at ASC,id ASC LIMIT 10`,[level,cutoff]);
        lists[level]=rows.map(r=>({...r,timestamp:new Date(Number(r.completed_at)).toISOString()}));
      }
      return {window,difficulty,storage:db.kind,generatedAt:new Date(now()).toISOString(),summary:Object.fromEntries(Object.entries(summaryRows[0]).map(([k,v])=>[k,Number(v)])),lists};
    }
  };
}
module.exports={makeService,PRESETS,WINDOWS,name};
