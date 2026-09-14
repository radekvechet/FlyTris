const {test}=require('node:test'),assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {allowedOrigin,originGate,clientKey,memoryLimiter,durableLimit}=require('../server/security.cjs');
const {localDatabase,migrate}=require('../server/db.cjs');
const {createHandler}=require('../server/http.cjs');
const modelHash=require('../site-data/versus-model.json').metadata.model_sha256;
function request(method='GET',body,headers={}){const req=Readable.from(body===undefined?[]:[body]);Object.assign(req,{method,url:'/api/scores',headers:{host:'localhost:8765',origin:'http://localhost:8765','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});return req;}
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(body){this.body=body?JSON.parse(body):null;}};}
async function call(handler,req){const res=response();await handler(req,res);return res;}
const start=()=>JSON.stringify({action:'start',difficulty:'medium',rulesVersion:6,modelHash});
test('exact production domain, subdomains and loopback origins only',()=>{
  for(const origin of ['https://flytris.net','https://www.flytris.net','https://a.b.flytris.net','http://localhost:8765','http://127.0.0.1:3000','http://[::1]:3000'])assert(allowedOrigin(origin),origin);
  for(const origin of [undefined,'null','https://evilflytris.net','https://flytris.net.evil.org','http://flytris.net','https://flytris.net:444','https://flytris.net/','https://flytris.net@evil.org','https://preview.vercel.app','http://localhost.evil.org'])assert(!allowedOrigin(origin),String(origin));
  for(const host of ['evil.org','flytris.net.evil.org','flytris.net/path','flytris.net?evil','user@flytris.net','flytris.net:444'])assert.throws(()=>originGate(request('GET',undefined,{host}),response()),{status:403});
});
test('preflight reflects only an allowed origin and permits JSON without cookies',()=>{
  const res=response();originGate(request('OPTIONS',undefined,{origin:'https://www.flytris.net','access-control-request-method':'POST','access-control-request-headers':'content-type'}),res);
  assert.equal(res.headers['access-control-allow-origin'],'https://www.flytris.net');assert.equal(res.headers['access-control-allow-credentials'],undefined);
  assert.throws(()=>originGate(request('OPTIONS',undefined,{'access-control-request-method':'DELETE'}),response()),{status:405});
  assert.throws(()=>originGate(request('OPTIONS',undefined,{'access-control-request-method':'POST','access-control-request-headers':'authorization'}),response()),{status:403});
});
test('local clients cannot spoof an IP; Vercel uses its trusted forwarding header',()=>{
  const req=request();req.headers['x-forwarded-for']='8.8.8.8';const local=clientKey(req,{});req.headers['x-forwarded-for']='1.1.1.1';assert.equal(clientKey(req,{}),local);
  assert.notEqual(clientKey(req,{VERCEL:'1'}),local);assert(!local.includes('127.0.0.1'));delete req.headers['x-forwarded-for'];assert.throws(()=>clientKey(req,{VERCEL:'1'}),{status:400});
});
test('in-memory IP and instance limits reset after a minute',()=>{
  let t=0;const limit=memoryLimiter(()=>t);for(let i=0;i<60;i++)limit('one');assert.throws(()=>limit('one'),{status:429});t=60000;assert.doesNotThrow(()=>limit('one'));
  const global=memoryLimiter(()=>t);for(let i=0;i<600;i++)global('client-'+i);assert.throws(()=>global('extra'),{status:429});
});
test('database limits are shared and atomic across separate callers',async()=>{
  const db=localDatabase(':memory:');try{await migrate(db);await migrate(db);
    const attempts=await Promise.allSettled(Array.from({length:12},()=>durableLimit(db,'same-ip','start',100000)));
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,6);assert(attempts.filter(r=>r.status==='rejected').every(r=>r.reason.status===429));
    for(let i=0;i<20;i++)await durableLimit(db,'same-ip',i%2?'finish':'rename',100000);
    await assert.rejects(durableLimit(db,'same-ip','rename',100000),{status:429});await durableLimit(db,'same-ip','start',160000);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM flytris_request_limits'))[0].n,2);
  }finally{db.close();}
});
test('bad hosts, origins, bodies and filters are rejected before opening a database',async()=>{
  let opened=0;const handler=createHandler({database:async()=>{opened++;throw Error('unexpected');}});
  const bad=[
    [request('GET',undefined,{origin:'https://evil.org'}),403],
    [request('POST',start(),{origin:undefined}),403],
    [request('GET',undefined,{origin:undefined}),403],
    [request('POST',start(),{'content-type':'text/plain'}),415],
    [request('POST',start(),{'content-length':'20001'}),413],
    [request('POST',JSON.stringify({action:'start',name:'💚'.repeat(6000)})),413],
    [request('POST','{"secret-marker":'),400],
    [request('POST','{"action":"delete"}'),400],
    [request('DELETE'),405]
  ];const query=request();query.url+='?window=bad';bad.push([query,400]);
  for(const [req,status] of bad){const res=await call(handler,req);assert.equal(res.statusCode,status);assert(!JSON.stringify(res.body).includes('secret-marker'));}
  assert.equal(opened,0);
});
test('allowed requests cache reads and persist write limits with retry headers',async()=>{
  const db=localDatabase(':memory:');try{await migrate(db);let reads=0;const database=async()=>{reads++;return db;};let t=100000;const handler=createHandler({database,now:()=>t});
    const req=request('GET',undefined,{origin:undefined,referer:'http://localhost:8765/report.html'});
    assert.equal((await call(handler,req)).statusCode,200);
    await Promise.all(Array.from({length:10},()=>call(handler,request())));assert.equal(reads,1);
    t+=16000;await call(handler,request());assert.equal(reads,2);
    const preflight=await call(handler,request('OPTIONS',undefined,{'access-control-request-method':'POST'}));assert.equal(preflight.statusCode,204);assert.equal(reads,2);
    for(let i=0;i<6;i++){const res=await call(handler,request('POST',start()));assert.equal(res.statusCode,200);assert.equal(res.body.settings.durationMs,120000);}
    const otherHandler=createHandler({database,now:()=>t});const denied=await call(otherHandler,request('POST',start()));assert.equal(denied.statusCode,429);assert.equal(denied.headers['retry-after'],'60');
  }finally{db.close();}
});
test('database errors never expose connection strings',async()=>{
  const handler=createHandler({database:async()=>{throw Object.assign(Error('postgres://secret:password@database'),{status:400});}});
  const res=await call(handler,request());assert.equal(res.statusCode,503);assert(!JSON.stringify(res.body).includes('password'));
});
