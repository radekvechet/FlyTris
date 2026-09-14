const {spawnSync}=require('node:child_process');
(async()=>{
  require('./prepare-next.cjs');
  if(process.env.DATABASE_URL){const {getDatabase,migrate}=require('../server/db.cjs');await migrate(await getDatabase());console.log('Postgres score schema ready.');}
  else console.log('DATABASE_URL not set: shared scores require a database connection.');
  const result=spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),'build'],{stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
  if(result.error)throw result.error;
  if(result.status!==0){process.exitCode=result.status||1;return;}
  require('./check-public.cjs');
})().catch(()=>{console.error('Build failed. Check build output and server database configuration.');process.exitCode=1;});
