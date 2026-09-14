const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {getDatabase,migrate}=require('../server/db.cjs'),api=require('../server/http.cjs');
const root=path.resolve(__dirname,'../public');
(async()=>{const db=await getDatabase();await migrate(db);
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/scores'){await api(req,res);return;}
  const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.json')?'application/json':'text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');fs.createReadStream(filename).pipe(res);
}).listen(Number(process.env.PORT||8765),'127.0.0.1',()=>console.log('FlyTris + persistent '+db.kind+' scores at http://127.0.0.1:'+(process.env.PORT||8765)));})().catch(e=>{console.error(e.message);process.exitCode=1;});
