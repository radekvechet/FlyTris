const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),web=path.join(root,'flytris/web'),data=path.join(root,'site-data');
const read=f=>fs.readFileSync(path.join(data,f),'utf8'),d=JSON.parse(read('results.json')),model=JSON.parse(read('versus-model.json')),falling=model.task==='falling-v1';
const mean=games=>games.reduce((n,g)=>n+g.lines,0)/games.length;
const flyIcon=fs.readFileSync(path.join(root,'public/fly-head.svg'),'utf8').replace('<svg ','<svg class="play-fly-icon" aria-hidden="true" focusable="false" ').replaceAll('fill="#000000"','fill="currentColor"');
const values={FLY_HEAD_ICON:flyIcon,GAME_CONFIG:fs.readFileSync(path.join(root,'game-config.json'),'utf8'),TABLE:read('report-table.html'),RAW:mean(d.raw_control).toFixed(2),RANDOM:mean(d.random_control).toFixed(2),DATA:read(falling?'falling-replay.json':'replay.json'),SHAPES:read('shapes.json'),VERSUS_MODEL:read('versus-model.json'),NEURONS:d.model.neurons,EDGES:d.model.edges,STATUS:d.replicates.every(r=>r.summary.learning_evidence)?'Learning observed in every replicate':'Learning evidence needs review'};
for(const [key,file] of Object.entries({KEY_BINDINGS:'key-bindings.js',STYLE:'style.css',TIMELINE:'replay.js',SCENE:'scene.js',BOOT:'boot.js',THREE_LIB:'third_party/three.cjs',THREE_LICENSE:'third_party/THREE-LICENSE.txt',VERSUS_STYLE:'versus.css',VERSUS_HTML:'versus.html',VERSUS_CORE:'versus-core.js',VERSUS_UI:'versus.js',SCORES_HTML:'scores.html',SCORES_STYLE:'scores.css',SCORES_UI:'scores.js',FALLING_POLICY:'falling-policy.cjs',FALLING_LIVE:'falling-live.js'}))values[key]=fs.readFileSync(path.join(web,file),'utf8');
values.FALLING_SUMMARY=falling?read('falling-summary.html'):'';
if(falling)values.STATUS='Falling-rules checkpoint · evaluated';
let page=fs.readFileSync(path.join(web,'report.html'),'utf8').replace(/__([A-Z_]+)__/g,(marker,key)=>{if(!(key in values))throw Error('Missing template value: '+key);return String(values[key]).replace(/<\/script/gi,'<\\/script');});
// HTML parsers normalize newlines before CSP hashes are checked.
page=page.replace(/\r\n?/g,'\n');
const hashes=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(([,code])=>"'sha256-"+crypto.createHash('sha256').update(code).digest('base64')+"'");
const csp="default-src 'none'; script-src "+hashes.join(' ')+"; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";
page=page.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">');
fs.mkdirSync(path.join(root,'public'),{recursive:true});for(const name of ['index.html','report.html'])fs.writeFileSync(path.join(root,'public',name),page);
for(const name of ['REPORT.md','MEASUREMENTS.md','results.json'])fs.copyFileSync(path.join(data,name),path.join(root,'public',name));
if(falling)for(const name of ['falling-results.json','FALLING_RESULTS.md','falling-replay.json'])fs.copyFileSync(path.join(data,name),path.join(root,'public',name));
for(const name of ['LICENSE','NOTICE.md'])fs.copyFileSync(path.join(root,name),path.join(root,'public',name));
fs.copyFileSync(path.join(data,'DATA_NOTICE.md'),path.join(root,'public','DATA_NOTICE.md'));
for(const item of fs.readdirSync(path.join(root,'public'),{recursive:true,withFileTypes:true})){
  if(!item.isFile())continue;
  const content=fs.readFileSync(path.join(item.parentPath,item.name),'utf8'),secret=process.env.DATABASE_URL;
  if((secret&&(content.includes(secret)||content.includes(JSON.stringify(secret).slice(1,-1))))||/postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>]+@/i.test(content))throw Error('Refusing to publish database credentials in static assets.');
}
console.log('Vercel static build ready; API functions remain server-side.');
