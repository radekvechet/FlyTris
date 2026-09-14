/* Procedural Three.js scene. This is an illustration of saved placement actions. */
(function(root){
  'use strict';
  const T=root.THREE;
  function makeFlyScene(host,lcdCanvas) {
    const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFShadowMap;
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
    renderer.domElement.setAttribute('aria-label','3D fly connected by six cables to a folding Tetris handheld');
    host.appendChild(renderer.domElement);
    const scene=new T.Scene();
    const camera=new T.PerspectiveCamera(35,1,0.1,80);
    let yaw=0.28,pitch=0.45,renderDirty=true;
    const target=new T.Vector3(0,1.2,0);
    function cameraPose(){
      const radius=11.8*Math.max(1,1/camera.aspect);
      camera.position.set(target.x+radius*Math.sin(yaw)*Math.cos(pitch),target.y+radius*Math.sin(pitch),target.z+radius*Math.cos(yaw)*Math.cos(pitch));
      camera.lookAt(target);
      renderDirty=true;
    }
    cameraPose();
    scene.add(new T.HemisphereLight(0xcdeaf5,0x273039,2.0));
    function light(color,intensity,x,y,z){const l=new T.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l);return l;}
    const key=light(0xffe4ad,3.5,-3,7,5);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-6;key.shadow.camera.right=6;
    key.shadow.camera.top=6;key.shadow.camera.bottom=-6;key.shadow.normalBias=0.035;
    light(0x6ee9d5,2.0,4,4,-4);light(0x8db4ff,1.3,-6,2,-1);
    const mat=(color,roughness=.5,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
    const plastic=mat(0x1c252b,.36,.2),edge=mat(0x080e13,.7),rubber=mat(0x13191b,.85);
    const gold=mat(0xf1c746,.38,.12),metal=mat(0x647379,.25,.75);
    const bronze=mat(0x6b5140,.42,.3),dark=mat(0x302b26,.53,.15);
    const eye=new T.MeshPhysicalMaterial({color:0xb43828,roughness:.23,metalness:.1,clearcoat:.9});
    const vec=(x,y,z)=>new T.Vector3(x,y,z);
    function mesh(geometry,material,parent=scene){const m=new T.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
    function ellipsoid(parent,material,position,scale){const m=mesh(new T.SphereGeometry(1,24,16),material,parent);m.position.set(...position);m.scale.set(...scale);return m;}
    function rounded(w,h,d,r=.12){
      const s=new T.Shape(),x=-w/2,y=-h/2;
      s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
      s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
      const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,steps:1,curveSegments:8});
      g.translate(0,0,-d/2);return g;
    }
    function tube(parent,points,radius,material){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,radius,5,false),material,parent);}
    function label(parent,text,w,h,position,color='#d6dcca',size=40){
      const c=document.createElement('canvas');c.width=512;c.height=128;
      const ctx=c.getContext('2d');ctx.font=`600 ${size}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,256,64);
      const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
      const m=mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}),parent);
      m.position.set(...position);m.castShadow=false;return m;
    }
    // Clamshell console: a hinged upright screen and a flat yellow-button keypad.
    const device=new T.Group();device.position.set(1.25,0,0);scene.add(device);
    const base=mesh(rounded(2.75,2.65,.30,.2),plastic,device);base.rotation.x=-Math.PI/2;base.position.set(0,.18,.36);
    const inset=mesh(rounded(2.47,2.35,.018,.16),edge,device);inset.rotation.x=-Math.PI/2;inset.position.set(0,.351,.36);
    const hinge=mesh(new T.CylinderGeometry(.22,.22,2.69,32),rubber,device);hinge.rotation.z=Math.PI/2;hinge.position.set(0,.30,-.90);
    for(const x of [-1.18,1.18]){const m=mesh(new T.CylinderGeometry(.235,.235,.13,24),metal,device);m.rotation.z=Math.PI/2;m.position.set(x,.30,-.90);}
    const lid=new T.Group();lid.position.set(0,.34,-.96);lid.rotation.x=-.19;device.add(lid);
    const shell=mesh(rounded(2.75,3.98,.27,.2),plastic,lid);shell.position.y=1.94;
    const bezel=mesh(rounded(2.37,3.48,.075,.1),edge,lid);bezel.position.set(0,1.96,.175);
    const screenFrame=mesh(rounded(1.78,3.0,.026,.04),metal,lid);screenFrame.position.set(0,1.96,.225);
    const screenTexture=new T.CanvasTexture(lcdCanvas);screenTexture.colorSpace=T.SRGBColorSpace;
    screenTexture.magFilter=T.NearestFilter;screenTexture.minFilter=T.LinearFilter;
    const lcd=mesh(new T.PlaneGeometry(1.59,2.82),new T.MeshBasicMaterial({map:screenTexture,toneMapped:false}),lid);lcd.position.set(0,1.96,.275);lcd.castShadow=false;
    label(lid,'FLYTRIS',1.2,.25,[0,3.74,.23],'#dbe1d0',52);
    label(lid,'CONNECTOME EDITION',1.55,.18,[0,.22,.25],'#95a4a0',31);
    // Printed side decoration echoes the brick-game handheld in the reference.
    for(const side of [-1,1])for(let j=0;j<5;j++){
      const m=mesh(new T.BoxGeometry(.10,.10,.012),mat(0x667475,.7),lid);m.position.set(side*1.025,.8+j*.49,.25);
    }
    const buttons=[],buttonPositions=[[-.85,.62],[-.19,.62],[.70,.55],[-.52,1.02],[-.68,-.25],[.68,-.25]];
    const names=['LEFT','RIGHT','ROTATE','DROP','START','SOUND'];
    const movementButtons=new Set([0,1,3]);
    buttonPositions.forEach(([x,z],i)=>{
      const b=mesh(new T.CylinderGeometry(i===2?.26:.15,i===2?.27:.165,.13,32),gold.clone(),device);
      b.position.set(x,.43,z);buttons.push(b);
      if(movementButtons.has(i)){
        // Solid arrow markings stay crisp at any zoom and move with the keycap.
        const arrow=new T.Shape();
        arrow.moveTo(-.105,-.028);arrow.lineTo(.012,-.028);arrow.lineTo(.012,-.085);
        arrow.lineTo(.115,0);arrow.lineTo(.012,.085);arrow.lineTo(.012,.028);arrow.lineTo(-.105,.028);arrow.closePath();
        const geometry=new T.ShapeGeometry(arrow);
        geometry.rotateZ(i===0?Math.PI:i===3?-Math.PI/2:0);geometry.rotateX(-Math.PI/2);
        const mark=mesh(geometry,new T.MeshBasicMaterial({color:0x101719}),b);mark.position.y=.068;mark.castShadow=false;
      }
      const text=label(device,names[i],i===2?.64:.51,.17,[x,.39,z+.27],'#a7b1ac',38);text.rotation.x=-Math.PI/2;
    });
    const brand=label(device,'BRICK GAME',1.27,.3,[.12,.39,1.38],'#adb8ad',51);brand.rotation.x=-Math.PI/2;
    // Tiny metallic sockets make every cable attachment visible.
    const endpoints=buttons.map((b,i)=>device.localToWorld(b.position.clone().add(movementButtons.has(i)?vec(0,.055,-.145):vec(0,.09,0))));
    endpoints.forEach((p,i)=>{if(movementButtons.has(i))return;const plug=mesh(new T.SphereGeometry(.048,12,8),metal);plug.position.copy(p);});

    // Anatomical silhouette: segmented abdomen, thorax, eyes, antennae, wings, six legs.
    const fly=new T.Group();fly.position.set(-2.05,.02,.35);fly.rotation.y=-Math.PI/2;scene.add(fly);
    ellipsoid(fly,bronze,[0,.91,.03],[.32,.33,.43]);
    ellipsoid(fly,dark,[0,.84,.64],[.34,.30,.62]);
    for(let i=0;i<5;i++){
      const band=mesh(new T.TorusGeometry(.27-i*.022,.024,6,32),bronze,fly);
      band.position.set(0,.84,.37+i*.18);band.scale.x=1.03;band.scale.y=.89;
    }
    const head=new T.Group();head.position.set(0,1.0,-.49);fly.add(head);
    ellipsoid(head,dark,[0,0,0],[.34,.28,.25]);
    for(const side of [-1,1]){
      const e=ellipsoid(head,eye,[side*.245,.035,-.075],[.175,.225,.165]);e.rotation.z=side*-.22;
      // Glancing highlights and a few compound-eye facets.
      for(let i=0;i<8;i++)ellipsoid(head,mat(0xc7553b,.35),[side*(.31+.024*Math.sin(i*2)),.13*Math.cos(i),-.18+.035*Math.sin(i)],[.014,.018,.01]);
      tube(head,[vec(side*.09,.14,-.17),vec(side*.13,.25,-.29),vec(side*.20,.32,-.41)],.016,dark);
      ellipsoid(head,dark,[side*.20,.32,-.41],[.035,.045,.025]);
    }
    tube(head,[vec(0,-.13,-.20),vec(0,-.23,-.30),vec(0,-.30,-.29)],.034,bronze);
    // Bristles are fixed geometry; the animated model needs no external assets.
    for(let i=0;i<28;i++){
      const a=i*2.399,y=.88+.18*Math.sin(i*1.8),z=.16+.46*Math.cos(i*.7);
      const p=vec(.28*Math.cos(a),y+.18*Math.abs(Math.sin(a)),z);
      tube(fly,[p,p.clone().add(vec(.085*Math.cos(a),.10,.025))],.006,dark);
    }
    const wings=[];
    for(const side of [-1,1]){
      const wing=new T.Group();wing.position.set(side*.12,1.15,.05);wing.rotation.y=side*.24;wing.scale.x=side;fly.add(wing);wings.push(wing);
      const shape=new T.Shape();shape.moveTo(0,0);shape.bezierCurveTo(.65,-.10,1.07,.60,.75,1.24);shape.bezierCurveTo(.53,1.60,.05,.88,0,0);
      const g=new T.ShapeGeometry(shape,24);g.rotateX(Math.PI/2);
      const wm=new T.MeshPhysicalMaterial({color:0xc6e2e3,transparent:true,opacity:.47,roughness:.20,metalness:.15,side:T.DoubleSide,depthWrite:false});
      const wingMesh=mesh(g,wm,wing);wingMesh.castShadow=false;
      for(let branch=0;branch<4;branch++){
        tube(wing,[vec(0,.003,0),vec(.20+branch*.1,.003,.37),vec(.24+branch*.14,.003,.82+branch*.08)],.007,mat(0x799590,.6));
      }
    }
    const legs=[];
    const boneGeometry=new T.CylinderGeometry(1,1,1,8);
    const up=vec(0,1,0);
    function positionBone(b,a,c,r){b.position.copy(a).add(c).multiplyScalar(.5);b.scale.set(r,a.distanceTo(c),r);b.quaternion.setFromUnitVectors(up,c.clone().sub(a).normalize());}
    for(const side of [-1,1])for(let j=0;j<3;j++){
      const hip=vec(side*.24,.80,-.24+j*.29),knee=vec(side*(.55+j*.07),.42,-.57+j*.57),foot=vec(side*(.80+j*.025),.065,-.83+j*.84);
      const bones=[mesh(boneGeometry,dark,fly),mesh(boneGeometry,bronze,fly)];
      const joint=ellipsoid(fly,dark,knee.toArray(),[.045,.045,.045]);
      const cuff=ellipsoid(fly,metal,foot.toArray(),[.075,.04,.075]);
      const index=legs.length;
      legs.push({hip,knee,foot,bones,joint,cuff,index,side,j});
      positionBone(bones[0],hip,knee,.035);positionBone(bones[1],knee,foot,.023);
    }
    // The control wires use exact moving foot positions, including during leg taps.
    const cableColors=[0xd4ad42,0x64b7b5,0xdb9160,0x84b59c,0x697f97,0x94899e];
    const wires=[],signals=[];
    for(let i=0;i<6;i++){
      const wm=mat(cableColors[i],.48,.32);
      wires.push(mesh(new T.BufferGeometry(),wm));
      const signal=ellipsoid(scene,new T.MeshBasicMaterial({color:cableColors[i]}),[0,0,0],[.055,.055,.055]);signals.push(signal);
    }
    const ground=mesh(new T.PlaneGeometry(200,200),mat(0x18252a,.98));ground.rotation.x=-Math.PI/2;ground.position.y=-.055;ground.castShadow=false;
    const grid=new T.GridHelper(24,48,0x33454a,0x27363c);grid.position.y=-.05;grid.material.transparent=true;grid.material.opacity=.32;scene.add(grid);
    scene.fog=new T.Fog(0x101c25,15,35);

    let lastSample={controls:[0,0,0,0,0,0],shake:0},time=0,lastTime=0,wireDirty=true;
    function updateWires(sample){
      fly.updateMatrixWorld(true);
      for(let i=0;i<legs.length;i++){
        const leg=legs[i],pulse=sample.controls[i]||0;
        const foot=leg.foot.clone();foot.y+=pulse*.10;foot.z-=pulse*.05;
        const knee=leg.knee.clone();knee.y+=pulse*.075;
        positionBone(leg.bones[0],leg.hip,knee,.035);positionBone(leg.bones[1],knee,foot,.023);
        leg.joint.position.copy(knee);leg.cuff.position.copy(foot);
        const start=fly.localToWorld(foot.clone()),end=endpoints[i];
        const curve=new T.CatmullRomCurve3([start,start.clone().add(vec(.16,.06,0)),
          vec(-.5+i*.11,.055,.4+(i-2.5)*.28),vec(end.x-.25,.12,end.z+.20),end]);
        const old=wires[i].geometry;wires[i].geometry=new T.TubeGeometry(curve,30,.018,5,false);old.dispose();
        wires[i].material.emissive.setHex(cableColors[i]);wires[i].material.emissiveIntensity=pulse*.55;
        signals[i].visible=pulse>.05;
        signals[i].position.copy(curve.getPoint((time*2.8+i*.12)%1));
        buttons[i].position.y=.43-pulse*.048;buttons[i].material.emissive.setHex(0xe6ab2d);buttons[i].material.emissiveIntensity=pulse*.3;
      }
    }
    function resize(){const rect=host.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();cameraPose();}
    const observer=new ResizeObserver(resize);observer.observe(host);resize();
    let drag=null;
    renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};renderer.domElement.setPointerCapture(e.pointerId);});
    renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;yaw=Math.max(-.5,Math.min(.9,drag.yaw-(e.clientX-drag.x)*.003));pitch=Math.max(.25,Math.min(.85,drag.pitch+(e.clientY-drag.y)*.003));cameraPose();});
    for(const event of ['pointerup','pointercancel'])renderer.domElement.addEventListener(event,()=>drag=null);
    updateWires(lastSample);
    return {
      update(sample,dt,playing,reducedMotion){
        lastSample=sample;if(playing)time+=dt/1000;
        head.rotation.y=reducedMotion?0:sample.shake;head.rotation.x=reducedMotion?0:Math.abs(sample.shake)*.45;
        wings.forEach((w,i)=>w.rotation.z=reducedMotion?0:(i?1:-1)*Math.sin(time*17)*.018*(playing?1:0));
        if(playing || wireDirty || sample.controls.some(Boolean)){updateWires(sample);wireDirty=false;}
        else if(lastTime!==time){updateWires(sample);}
        lastTime=time;screenTexture.needsUpdate=true;renderer.render(scene,camera);renderDirty=false;
      },
      renderIfNeeded(){if(renderDirty){renderer.render(scene,camera);renderDirty=false;}},
      reset(){yaw=.28;pitch=.45;cameraPose();wireDirty=true;},
      invalidate(){wireDirty=true;},
      dispose(){observer.disconnect();renderer.dispose();},
    };
  }
  root.makeFlyScene=makeFlyScene;
})(window);
