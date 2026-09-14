const crypto=require('node:crypto'),{makeService,PRESETS}=require('./scores.cjs'),verify=require('./verify.cjs');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status,expose:true});};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const safeKeys=(value,keys)=>{if(!value||Object.keys(value).some(k=>!keys.includes(k)))fail('Unexpected request fields.');};
function makeRankedService(db,modelHash,now=Date.now,pool=require('../site-data/ranked-pool.json')){
  const base=makeService(db,modelHash,now,4);
  async function session(input){
    if(typeof input.id!=='string'||!/^[0-9a-f-]{36}$/i.test(input.id)||typeof input.token!=='string'||!/^[0-9a-f]{64}$/i.test(input.token))fail('Invalid match token.',403);
    const [s]=await db.query(`SELECT m.*,c.run_id,c.pool_id,c.sequence,c.state_json,c.last_batch_hash,c.accepted_at,c.elapsed_ms AS verified_ms
      FROM flytris_matches m JOIN flytris_checkpoints c ON c.match_id=m.id WHERE m.id=$1 AND m.token_hash=$2`,[input.id,hash(input.token)]);
    if(!s)fail('Match not found.',403);
    if(Number(s.rules_version)!==4||(s.completed_at===null&&(s.pool_id!==pool.poolId||s.model_hash!==modelHash)))fail('Match rules or model changed. Start a new match.',409);
    if(now()-Number(s.started_at)>7200000)fail('This match has expired.');
    return s;
  }
  const receipt=(s,state)=>({sequence:Number(s.sequence),elapsedMs:state.elapsedMs,reason:state.reason,human:verify.stats(state.human.state),fly:verify.stats(state.fly.state)});
  return {
    leaderboard:base.leaderboard,
    async start(input){
      safeKeys(input,['action','difficulty','modelHash','rulesVersion']);
      if(input.rulesVersion!==4||input.modelHash!==modelHash)fail('Match rules or model changed. Reload the game.',409);
      if(typeof input.difficulty!=='string'||!Object.hasOwn(PRESETS,input.difficulty))fail('Choose Easy, Medium or Hard.');
      if(pool.modelId!==modelHash)fail('Ranked fly pool is unavailable.',503);
      const choices=pool.runs.filter(r=>r.difficulty===input.difficulty),run=choices[crypto.randomInt(choices.length)];
      const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex'),started=now();
      await db.query('INSERT INTO flytris_matches (id,token_hash,difficulty,model_hash,seed,started_at,rules_version) VALUES ($1,$2,$3,$4,$5,$6,4)',[id,hash(token),input.difficulty,modelHash,run.seed,started]);
      await db.query('INSERT INTO flytris_checkpoints (match_id,run_id,pool_id,state_json,accepted_at) VALUES ($1,$2,$3,$4,$5)',[id,run.id,pool.poolId,JSON.stringify(verify.initial(run)),started]);
      return {id,token,seed:run.seed,difficulty:input.difficulty,settings:{...PRESETS[input.difficulty],rulesVersion:4},startedAt:new Date(started).toISOString(),checkpointMs:10000,flyRun:{id:run.id,actions:run.actions}};
    },
    async checkpoint(input){
      safeKeys(input,['action','id','token','sequence','commands']);
      if(!Number.isInteger(input.sequence)||input.sequence<1||typeof input.commands!=='string'||input.commands.length>2200)fail('Invalid checkpoint.');
      const s=await session(input),batchHash=hash(input.commands);
      if(input.sequence===Number(s.sequence)&&batchHash===s.last_batch_hash)return receipt(s,JSON.parse(s.state_json));
      if(s.completed_at!==null||input.sequence!==Number(s.sequence)+1)fail('Checkpoint is out of order.',409);
      const run=pool.runs.find(r=>r.id===s.run_id),state=verify.advance(JSON.parse(s.state_json),input.commands,run),t=now();
      if(state.elapsedMs>t-Number(s.started_at)+1000||state.elapsedMs-Number(s.verified_ms)>t-Number(s.accepted_at)+250)fail('Checkpoint runs ahead of the server clock.');
      const rows=await db.query(`UPDATE flytris_checkpoints SET sequence=$1,state_json=$2,last_batch_hash=$3,accepted_at=$4,elapsed_ms=$5 WHERE match_id=$6 AND sequence=$7 RETURNING sequence`,[input.sequence,JSON.stringify(state),batchHash,t,state.elapsedMs,s.id,s.sequence]);
      if(!rows.length)fail('Checkpoint changed. Retry the same batch.',409);
      return receipt({sequence:input.sequence},state);
    },
    async finish(input){
      safeKeys(input,['action','id','token','result']);
      const s=await session(input),state=JSON.parse(s.state_json);
      if(!state.reason||state.elapsedMs<1)fail('The server has not verified a completed match.');
      const human=verify.stats(state.human.state),fly=verify.stats(state.fly.state),r=input.result;
      if(r){
        if(r.reason!==state.reason||r.elapsedSeconds!==state.elapsedMs/1000||r.settings?.seed!==Number(s.seed)||r.settings?.durationMs!==120000||r.settings?.rulesVersion!==4||r.settings?.gravityMs!==PRESETS[s.difficulty].gravityMs||r.settings?.flyMs!==PRESETS[s.difficulty].flyMs||r.model?.model_sha256!==s.model_hash)fail('Result does not match the verified game.');
        for(const side of ['human','fly'])for(const key of ['lines','pieces','clears','alive','board'])if(JSON.stringify(r[side]?.[key])!==JSON.stringify((side==='human'?human:fly)[key]))fail('Scores do not match the verified moves.');
      }
      const winner=state.reason==='human-topout'?'fly':state.reason==='fly-topout'?'human':human.lines!==fly.lines?(human.lines>fly.lines?'human':'fly'):human.pieces!==fly.pieces?(human.pieces>fly.pieces?'human':'fly'):'draw';
      await db.query('UPDATE flytris_matches SET completed_at=$1,elapsed_ms=$2,human_lines=$3,human_pieces=$4,fly_lines=$5,fly_pieces=$6,winner=$7,reason=$8 WHERE id=$9 AND completed_at IS NULL',[now(),state.elapsedMs,human.lines,human.pieces,fly.lines,fly.pieces,winner,state.reason,s.id]);
      const [saved]=await db.query('SELECT completed_at,player_name FROM flytris_matches WHERE id=$1',[s.id]);return {saved:true,id:s.id,timestamp:new Date(Number(saved.completed_at)).toISOString(),name:saved.player_name};
    },
    async rename(input){safeKeys(input,['action','id','token','name']);if(input.name!==undefined&&typeof input.name!=='string')fail('Invalid player name.');await session(input);return base.rename(input);}
  };
}
module.exports={makeRankedService};
