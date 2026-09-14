const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');fs.mkdirSync(path.join(root,'site-data'),{recursive:true});
for(const file of ['results.json','replay.json','versus-model.json','REPORT.md','MEASUREMENTS.md'])fs.copyFileSync(path.join(root,'runs/local',file),path.join(root,'site-data',file));
const html=fs.readFileSync(path.join(root,'runs/local/report.html'),'utf8');
fs.writeFileSync(path.join(root,'site-data/report-table.html'),html.match(/<div class="results-layout">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1]);
fs.writeFileSync(path.join(root,'site-data/shapes.json'),html.match(/window\.FLYTRIS_SHAPES=(.*?);<\/script>/s)[1]);
console.log('Deployment snapshot updated from the measured local model.');
