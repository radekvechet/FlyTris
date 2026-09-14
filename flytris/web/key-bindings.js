(function(root){
  'use strict';
  const actions={left:'Move left',right:'Move right',soft:'Soft drop',rotate:'Clockwise rotation',reverse:'Counterclockwise rotation',hard:'Hard drop',pause:'Pause / resume'};
  const supported=code=>typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Enter|Escape|Shift(Left|Right)|Tab|Backspace|Delete|Insert|Home|End|Page(Up|Down)|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|Numpad([0-9]|Enter|Add|Subtract|Multiply|Divide|Decimal))$/.test(code);
  function normalize(value){
    const result={},seen=new Set();
    for(const action of Object.keys(actions)){
      if(!Array.isArray(value?.[action])||value[action].length>10)throw Error('Invalid keyboard preferences.');
      result[action]=value[action].filter(code=>{if(!supported(code)||seen.has(code))throw Error('Invalid keyboard preferences.');seen.add(code);return true;});
    }
    return result;
  }
  const missing=bindings=>Object.keys(actions).filter(action=>!bindings[action]?.length);
  function assign(bindings,action,code){
    if(!Object.hasOwn(actions,action)||!supported(code))throw Error('Use a letter, number, arrow, punctuation, Shift or another standard keyboard key.');
    if(bindings[action].includes(code))return normalize(bindings);
    if(bindings[action].length>=10)throw Error('Use at most 10 keys per function. Remove a key first.');
    const result=normalize(bindings);
    for(const key of Object.keys(actions))result[key]=result[key].filter(item=>item!==code);
    result[action].push(code);return result;
  }
  const api={actions,supported,normalize,missing,assign};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FlyKeyBindings=api;
})(typeof window!=='undefined'?window:globalThis);
