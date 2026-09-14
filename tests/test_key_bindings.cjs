const {test}=require('node:test'),assert=require('node:assert/strict');
const K=require('../flytris/web/key-bindings.js'),V=require('../flytris/web/versus-core.js');
test('capturing an assigned key moves it without duplicate bindings',()=>{
  const original=structuredClone(V.defaultBindings),next=K.assign(original,'right','KeyA');
  assert(!next.left.includes('KeyA'));assert(next.right.includes('KeyA'));assert(original.left.includes('KeyA'));
  assert.deepEqual(K.assign(next,'right','KeyA'),next);
});
test('incomplete bindings survive saving and every function, including hard drop, is required',()=>{
  const bindings=structuredClone(V.defaultBindings);bindings.hard=[];bindings.pause=[];
  assert.deepEqual(K.missing(K.normalize(JSON.parse(JSON.stringify(bindings)))),['hard','pause']);
  const assigned=K.assign(K.assign(bindings,'hard','ShiftLeft'),'pause','Escape');assert.deepEqual(K.missing(assigned),[]);
});
test('moving the last key marks its old function missing; unsupported keys and overflow fail',()=>{
  const bindings=structuredClone(V.defaultBindings);bindings.left=['KeyA'];
  assert.deepEqual(K.missing(K.assign(bindings,'right','KeyA')),['left']);
  assert.throws(()=>K.assign(bindings,'left','MetaLeft'));
  bindings.left=Array.from({length:10},(_,i)=>'Digit'+i);assert.throws(()=>K.assign(bindings,'left','KeyB'));
});
