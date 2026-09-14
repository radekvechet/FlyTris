const {getDatabase}=require('./db.cjs'),{makeService,WINDOWS,PRESETS}=require('./scores.cjs');
const {originGate,clientKey,memoryLimiter,durableLimit}=require('./security.cjs');
function createHandler({database=getDatabase,now=Date.now}={}){
// Cache/coalesce only the 16 validated leaderboard combinations, never arbitrary URLs.
const cache=new Map(),limit=memoryLimiter(now);let lastCleanup=0;
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  try{
    if(!['GET','POST','OPTIONS'].includes(req.method)){res.setHeader('Allow','GET, POST, OPTIONS');throw Object.assign(Error('Method not allowed.'),{status:405,expose:true});}
    originGate(req,res);const key=clientKey(req);limit(key);
    if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
    const model=require('../site-data/versus-model.json');
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost'),window=url.searchParams.get('window')||'24h',difficulty=url.searchParams.get('difficulty')||'all';
      if(!Object.hasOwn(WINDOWS,window)||!['all',...Object.keys(PRESETS)].includes(difficulty)||[...url.searchParams.keys()].some(k=>!['window','difficulty'].includes(k)))throw Object.assign(Error('Invalid leaderboard filter.'),{status:400,expose:true});
      const cacheKey=window+':'+difficulty;let entry=cache.get(cacheKey);
      if(!entry||entry.expires<now()){
        entry={expires:Infinity,promise:database().then(db=>makeService(db,model.metadata.model_sha256).leaderboard(window,difficulty))};cache.set(cacheKey,entry);
        entry.promise.then(()=>{entry.expires=now()+15000;},()=>{if(cache.get(cacheKey)===entry)cache.delete(cacheKey);});
      }
      res.end(JSON.stringify(await entry.promise));return;
    }
    if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'])))throw Object.assign(Error('Use JSON.'),{status:415,expose:true});
    if(req.headers['content-encoding']&&!['identity'].includes(req.headers['content-encoding']))throw Object.assign(Error('Compressed request bodies are not supported.'),{status:415,expose:true});
    const length=req.headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>20000))throw Object.assign(Error('Submission too large.'),{status:413,expose:true});
    let body=req.body;
    if(body===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>20000)throw Object.assign(Error('Submission too large.'),{status:413,expose:true});chunks.push(Buffer.from(chunk));}body=JSON.parse(Buffer.concat(chunks).toString());}
    else if(typeof body==='string'){if(Buffer.byteLength(body)>20000)throw Object.assign(Error('Submission too large.'),{status:413,expose:true});body=JSON.parse(body);}
    if(Buffer.byteLength(JSON.stringify(body)??'')>20000)throw Object.assign(Error('Submission too large.'),{status:413,expose:true});
    if(!body||Array.isArray(body)||!['start','finish','rename'].includes(body.action))throw Object.assign(Error('Invalid action.'),{status:400,expose:true});
    const db=await database();await durableLimit(db,key,body.action,now());
    if(now()-lastCleanup>3600000){lastCleanup=now();await db.query('DELETE FROM flytris_request_limits WHERE expires_at < $1',[lastCleanup]);}
    res.end(JSON.stringify(await makeService(db,model.metadata.model_sha256)[body.action](body)));
  }catch(error){
    const status=error.expose?error.status:(error instanceof SyntaxError?400:503);res.statusCode=status;if(status===429)res.setHeader('Retry-After','60');
    const message=status===503?'Score database is unavailable. Your game can still be played.':error instanceof SyntaxError?'Invalid JSON body.':error.message;
    res.end(JSON.stringify({error:message}));
  }
}
return handler;
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
