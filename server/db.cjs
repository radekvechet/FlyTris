const fs=require('node:fs'),path=require('node:path');
let singleton;
function localDatabase(filename){
  const {DatabaseSync}=require('node:sqlite');
  if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  return {kind:'local',async query(sql,params=[]){const ordered=[];sql=sql.replace(/\$(\d+)/g,(_,n)=>{ordered.push(params[Number(n)-1]);return '?';});return db.prepare(sql).all(...ordered);},close(){db.close();}};
}
async function getDatabase(){
  if(singleton)return singleton;
  if(process.env.DATABASE_URL){
    const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);
    return singleton={kind:'postgres',query:(text,params=[])=>sql.query(text,params)};
  }
  if(process.env.VERCEL||process.env.NODE_ENV==='production')throw Object.assign(new Error('Score database is not connected.'),{status:503});
  return singleton=localDatabase(path.resolve('.local/leaderboard.sqlite'));
}
async function migrate(db){
  for(const name of ['001_matches.sql','002_request_limits.sql']){
    const sql=fs.readFileSync(path.join(__dirname,'../db',name),'utf8');
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.query(statement);
  }
}
module.exports={getDatabase,localDatabase,migrate};
