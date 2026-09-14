require('./build.cjs');
if(process.env.DATABASE_URL){const {getDatabase,migrate}=require('../server/db.cjs');(async()=>{await migrate(await getDatabase());console.log('Postgres score schema ready.');})().catch(()=>{console.error('Database migration failed. Check the server DATABASE_URL.');process.exitCode=1;});}
else console.log('DATABASE_URL not set: the site builds, but shared scores require a database connection.');
