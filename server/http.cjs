const {getDatabase}=require('./db.cjs');const {makeService}=require('./scores.cjs');
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const db=await getDatabase();const model=require('../site-data/versus-model.json');const service=makeService(db,model.metadata.model_sha256);
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');res.end(JSON.stringify(await service.leaderboard(url.searchParams.get('window')||'24h',url.searchParams.get('difficulty')||'all')));return;
    }
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw Object.assign(new Error('Method not allowed.'),{status:405});}
    if(req.headers['sec-fetch-site']==='cross-site')throw Object.assign(new Error('Cross-site submissions are not allowed.'),{status:403});
    if(!String(req.headers['content-type']).startsWith('application/json'))throw Object.assign(new Error('Use JSON.'),{status:415});
    let body=req.body;
    if(body===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000)throw Object.assign(new Error('Submission too large.'),{status:413});chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString());}
    else if(typeof body==='string')body=JSON.parse(body);
    if(JSON.stringify(body).length>20000)throw Object.assign(new Error('Submission too large.'),{status:413});
    if(!body||!['start','finish','rename'].includes(body.action))throw Object.assign(new Error('Invalid action.'),{status:400});
    res.end(JSON.stringify(await service[body.action](body)));
  }catch(error){const status=error.status||(error instanceof SyntaxError?400:503);res.statusCode=status;res.end(JSON.stringify({error:status===503?'Score database is unavailable. Your game can still be played.':error.message}));}
}
module.exports=handler;
