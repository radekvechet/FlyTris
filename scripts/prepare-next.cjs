// Preserve the standalone research report while preparing an SSR shell and cached assets.
require('./build.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),publicDir=path.join(root,'public');
const html=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const sources=Object.fromEntries(scripts.flatMap(([,attrs,code])=>{const id=attrs.match(/id="([^"]+)"/);return id?[[id[1],code]]:[];}));
const js='if(!window.FLYTRIS_INITIALIZED){window.FLYTRIS_INITIALIZED=true;\nwindow.FLYTRIS_SOURCES='+JSON.stringify(sources)+';\n'+scripts.map(([,attrs,code])=>code).join('\n;\n')+'\n}';
const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(([,code])=>code).join('\n');
function asset(content,extension){const name='flytris-'+crypto.createHash('sha256').update(content).digest('hex').slice(0,16)+'.'+extension;fs.writeFileSync(path.join(publicDir,name),content);return '/'+name;}
const shell={markup:html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[^>]*>[\s\S]*?<\/script>/g,''),script:asset(js,'js'),style:asset(css,'css')};
fs.mkdirSync(path.join(root,'.generated'),{recursive:true});fs.writeFileSync(path.join(root,'.generated/site.json'),JSON.stringify(shell));
// These exact build outputs would otherwise conflict with the Next.js routes.
for(const name of ['index.html','report.html'])fs.unlinkSync(path.join(publicDir,name));
console.log('Next.js SSR shell and game assets ready.');
