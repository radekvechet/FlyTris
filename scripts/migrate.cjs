const {getDatabase,migrate}=require('../server/db.cjs');
(async()=>{const db=await getDatabase();await migrate(db);console.log('Score schema ready ('+db.kind+').');db.close?.();})().catch(e=>{console.error(e.message);process.exitCode=1;});
