const fs=require('node:fs'),path=require('node:path');
for(const dir of ['public','.generated','.next/static']){
  if(!fs.existsSync(dir))continue;
  for(const entry of fs.readdirSync(dir,{recursive:true,withFileTypes:true})){
    if(!entry.isFile())continue;
    const content=fs.readFileSync(path.join(entry.parentPath,entry.name),'utf8'),secret=process.env.DATABASE_URL;
    if((secret&&(content.includes(secret)||content.includes(JSON.stringify(secret).slice(1,-1))))||/postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>]+@/i.test(content))throw Error('Refusing to publish database credentials in client assets.');
  }
}
console.log('Public assets passed the credential guard.');
