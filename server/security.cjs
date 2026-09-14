const {isIP}=require('node:net'),crypto=require('node:crypto');
const deny=(message,status=403)=>{throw Object.assign(Error(message),{status,expose:true});};
const productionHost=h=>/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*flytris\.net$/.test(h);
const loopback=h=>['localhost','127.0.0.1','[::1]'].includes(h);
function allowedOrigin(raw){
  if(typeof raw!=='string')return false;
  try{const u=new URL(raw);return u.origin===raw&&((u.protocol==='https:'&&!u.port&&productionHost(u.hostname))||(['http:','https:'].includes(u.protocol)&&loopback(u.hostname)));}catch{return false;}
}
function originGate(req,res){
  const host=req.headers.host;
  if(typeof host!=='string')deny('Invalid host.');
  let target;try{target=new URL('https://'+host);}catch{deny('Invalid host.');}
  if(target.host!==host.toLowerCase()||target.pathname!=='/'||target.username||target.password||(!productionHost(target.hostname)&&!loopback(target.hostname))||(productionHost(target.hostname)&&target.port))deny('Host is not allowed.');
  let origin=req.headers.origin;
  if(origin===undefined&&req.method==='GET'){
    try{origin=new URL(req.headers.referer).origin;}catch{deny('An allowed Origin or Referer is required.');}
  }
  if(!allowedOrigin(origin))deny('Origin is not allowed.');
  res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Origin',origin);
  // Tokens are explicit request-body capabilities; cross-origin cookies are unnecessary.
  if(req.method==='OPTIONS'){
    if(!['GET','POST'].includes(req.headers['access-control-request-method']))deny('Method is not allowed.',405);
    const headers=String(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    if(headers.some(h=>h!=='content-type'))deny('Header is not allowed.');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Max-Age','600');
  }
}
function clientKey(req,env=process.env){
  // Only trust the forwarding header on Vercel, which overwrites it at ingress.
  const ip=env.VERCEL==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():req.socket?.remoteAddress;
  if(!isIP(ip||''))deny('Client address unavailable.',400);
  return crypto.createHmac('sha256',env.DATABASE_URL||'flytris-local-limit').update(ip).digest('hex');
}
function memoryLimiter(now=Date.now){
  const entries=new Map();let globalStart=now(),globalCount=0;
  return key=>{
    const t=now();if(t-globalStart>=60000){globalStart=t;globalCount=0;}
    if(++globalCount>600)deny('Server busy. Try again shortly.',429);
    for(const [k,v] of entries)if(t-v.start>=60000)entries.delete(k);
    let entry=entries.get(key);if(!entry){if(entries.size>=2048)deny('Server busy. Try again shortly.',429);entry={start:t,count:0};entries.set(key,entry);}
    if(++entry.count>60)deny('Too many requests. Try again shortly.',429);
  };
}
async function durableLimit(db,key,action,now=Date.now()){
  const limit=action==='start'?6:20,bucket=Math.floor(now/60000)*60000;
  const rows=await db.query(`INSERT INTO flytris_request_limits (client_key,window_start,request_count,expires_at) VALUES ($1,$2,1,$3)
    ON CONFLICT (client_key) DO UPDATE SET window_start=$2,
    request_count=CASE WHEN flytris_request_limits.window_start=$2 THEN flytris_request_limits.request_count+1 ELSE 1 END,expires_at=$3
    WHERE flytris_request_limits.window_start<>$2 OR flytris_request_limits.request_count<$4 RETURNING request_count`,[key+':'+(action==='start'?'start':'write'),bucket,now+86400000,limit]);
  if(!rows.length)deny('Too many score requests. Try again in a minute.',429);
}
module.exports={allowedOrigin,originGate,clientKey,memoryLimiter,durableLimit};
