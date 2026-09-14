const fs=require('node:fs');
const sleeper=new Int32Array(new SharedArrayBuffer(4));
// Windows antivirus/indexing readers can briefly deny rename over an open file.
// Retry without deleting the last good checkpoint or falling back to truncation.
function write(file,value,io=fs,wait=ms=>Atomics.wait(sleeper,0,0,ms)){
  const temp=`${file}.${process.pid}.tmp`;
  try{
    io.writeFileSync(temp,typeof value==='string'?value:JSON.stringify(value,null,2));
    for(let attempt=0;;attempt++){
      try{io.renameSync(temp,file);return;}
      catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt===19)throw error;wait(100);}
    }
  }finally{if(io.existsSync(temp))io.unlinkSync(temp);}
}
module.exports=write;
