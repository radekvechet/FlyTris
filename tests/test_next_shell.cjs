const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
test('Next.js shell renders public content and keeps game code in separate assets',()=>{
  require('../scripts/prepare-next.cjs');const shell=require('../.generated/site.json');
  assert(shell.markup.includes('Play against the fly'));assert(shell.markup.includes('Made by Radek Věchet'));
  assert(!shell.markup.includes('<script'));assert(!shell.markup.includes('window.FLYTRIS_MODEL'));
  assert(!fs.existsSync('public/index.html'));assert(!fs.existsSync('public/report.html'));
  assert.doesNotThrow(()=>new vm.Script(fs.readFileSync('public'+shell.script,'utf8')));
  assert.equal((shell.markup.match(/id="versus-open"/g)||[]).length,1);
});
