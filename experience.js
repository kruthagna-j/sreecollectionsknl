import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import Lenis from 'https://cdn.jsdelivr.net/npm/lenis@1.3.11/dist/lenis.mjs';

const canvas=document.querySelector('#experience');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.75;
const scene=new THREE.Scene();scene.background=new THREE.Color('#e8d5b8');scene.fog=new THREE.FogExp2('#d8c09b',.009);
const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.1,120);camera.position.set(0,2.5,13);
scene.add(new THREE.HemisphereLight('#fff4dc','#6f4b37',3.1));scene.add(new THREE.AmbientLight('#fff0d4',1.65));
function light(c,power,pos,dist=32){const l=new THREE.PointLight(c,power,dist,2);l.position.set(...pos);scene.add(l)}
light('#ffe5b1',260,[0,5,5],40);light('#efb96d',185,[-6,3,-7],35);light('#fff0ce',230,[5,4,-17],38);light('#fff0d0',190,[0,5,-22],32);
const mat=(color,metalness=.05,roughness=.45)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const gold=mat('#c6a15e',.78,.25),cream=mat('#e6d7c2',.08,.45),burgundy=mat('#702b42',.15,.4),dark=mat('#29151d',.1,.7),green=mat('#3c5844',.05,.7),pink=mat('#d98f9c',.05,.55),red=mat('#a83243',.05,.5),ribbon=mat('#e2c17e',.42,.28);
function box(parent,w,h,d,m,x,y,z,cast=true){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=cast;o.receiveShadow=true;parent.add(o);return o}
function sphere(parent,r,m,x,y,z,sx=1,sy=1,sz=1){const o=new THREE.Mesh(new THREE.SphereGeometry(r,20,14),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;parent.add(o);return o}
function gift(parent,x,y,z,s,c){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);box(g,s,s*.72,s,mat(c,.08,.32),0,0,0);box(g,s*1.04,s*.1,s*1.04,ribbon,0,s*.2,0);box(g,s*.13,s*.75,s*1.05,ribbon,0,0,0);sphere(g,s*.13,ribbon,-s*.15,s*.48,0,1,.5,.6);sphere(g,s*.13,ribbon,s*.15,s*.48,0,1,.5,.6);return g}
function bouquet(parent,x,y,z,s=1){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const stem=new THREE.Mesh(new THREE.CylinderGeometry(.012,.018,.65*s,7),green);stem.position.set(Math.cos(a)*.13*s,.5*s,Math.sin(a)*.13*s);stem.rotation.z=-Math.cos(a)*.25;g.add(stem);sphere(g,.11*s,i%2?pink:red,Math.cos(a)*.18*s,.86*s,Math.sin(a)*.18*s,1,.7,1)}sphere(g,.12*s,cream,0,.94*s,0,1,.7,1);box(g,.35*s,.36*s,.35*s,burgundy,0,.18*s,0)}
const world=new THREE.Group();scene.add(world);
box(world,30,.25,60,mat('#c3a184',.18,.36),0,-.16,-12,false);box(world,30,10,.35,mat('#cbb69b',.08,.68),0,5,-27,false);box(world,.25,10,60,mat('#d9c5a8',.12,.55),-8,5,-12,false);box(world,.25,10,60,mat('#d9c5a8',.12,.55),8,5,-12,false);
for(let z=7;z>-29;z-=4){box(world,16,.12,.18,gold,0,7.3,z,false);for(const x of [-7.6,7.6])box(world,.12,7,.12,gold,x,3.6,z,false)}
for(const x of [-4.2,4.2])box(world,.17,6,.18,gold,x,2.9,8,false);box(world,8.55,.18,.2,gold,0,5.9,8,false);
// No end-wall brand billboard; the cinematic reveal transitions to the collection cards.
// Grand hinged entrance doors: the first scroll beat opens the boutique.
const entrance=new THREE.Group();world.add(entrance);entrance.position.set(0,0,8.1);
box(entrance,8.8,.22,.55,gold,0,6.3,0,false);
box(entrance,.22,6.3,.55,gold,-4.3,3.15,0,false);
box(entrance,.22,6.3,.55,gold,4.3,3.15,0,false);
const doorMat=mat('#542331',.18,.32), insetMat=mat('#713247',.22,.35);
const leftHinge=new THREE.Group();leftHinge.position.set(-4.08,0,0);entrance.add(leftHinge);
const rightHinge=new THREE.Group();rightHinge.position.set(4.08,0,0);entrance.add(rightHinge);
function makeDoor(parent,dir){box(parent,4.02,6.05,.28,doorMat,dir*2.01,3.02,0);box(parent,3.42,5.35,.08,insetMat,dir*2.01,3.04,.18);box(parent,3.12,.08,.07,gold,dir*2.01,5.25,.24);box(parent,3.12,.08,.07,gold,dir*2.01,.82,.24);box(parent,.07,4.38,.07,gold,dir*2.01,3.03,.24);const handle=new THREE.Mesh(new THREE.SphereGeometry(.085,12,10),gold);handle.position.set(dir>0?-0.36:0.36,3,.34);parent.add(handle)}
makeDoor(leftHinge,1);makeDoor(rightHinge,-1);
for(const x of [-3.65,3.65]){const lamp=new THREE.Mesh(new THREE.SphereGeometry(.13,12,10),new THREE.MeshStandardMaterial({color:'#ffe0a1',emissive:'#ffb84c',emissiveIntensity:1.8}));lamp.position.set(x,5.65,.4);entrance.add(lamp)}
// Plush bears and toys are accents within the gift displays, not the entire story.
function teddy(parent,x,y,z,s=1,fur='#b88b69'){
 const fm=mat(fur,.02,.82),ear=mat('#d8b6a0',0,.9);
 const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);parent.add(g);
 sphere(g,.29,fm,0,.48,0,1,.95,.78);sphere(g,.21,fm,0,.83,.02,1,.95,.9);
 sphere(g,.095,fm,-.19,.99,0,1,1,1);sphere(g,.095,fm,.19,.99,0,1,1,1);
 sphere(g,.05,ear,-.19,1,.075,1,1,1);sphere(g,.05,ear,.19,1,.075,1,1,1);
 sphere(g,.035,dark,-.075,.86,.205,1,1,1);sphere(g,.035,dark,.075,.86,.205,1,1,1);
 sphere(g,.045,mat('#34232a'),0,.79,.23,1,.8,.7);
 sphere(g,.11,fm,-.29,.43,.02,.8,1.25,.8);sphere(g,.11,fm,.29,.43,.02,.8,1.25,.8);
 sphere(g,.12,fm,-.14,.18,.02,1,.8,1);sphere(g,.12,fm,.14,.18,.02,1,.8,1);
 return g;
}
function toy(parent,x,y,z,s=1,color='#d58b62'){
 const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);const body=mat(color,.08,.36);
 sphere(g,.19,body,0,.22,0,1,.8,1);sphere(g,.14,cream,0,.48,0,1,1,1);
 sphere(g,.045,dark,-.05,.49,.12);sphere(g,.045,dark,.05,.49,.12);
 box(g,.24,.06,.12,gold,0,.05,0);g.scale.setScalar(s);return g;
}
for(const [x,z] of [[-5.9,4.7],[6.1,0.1],[-5.8,-5.2],[6.05,-9.8],[-5.9,-14.7],[6.1,-19.4]]) {
 teddy(world,x,1.55,z,.72, z%2?'#c6a27f':'#9b7962');
 if(z<0) toy(world,x+(x<0?.75:-.75),1.55,z-.3,.85,z%3?'#c56d7a':'#8b9a6b');
}
// Real human characters are loaded as rigged 3D GLB models (not photos or primitive toys).
// Put licensed, textured human GLB assets in ./assets/people/ and set the matching URLs below.
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
const staff=[];
const staffMixers=[];
const characterClock=new THREE.Clock();
const personLoader=new GLTFLoader();
const realPeople=[
 {url:'./assets/people/shop-assistant.glb',x:-2.2,z:-2.4,scale:1},
 {url:'./assets/people/customer.glb',x:2.25,z:-10.5,scale:1},
 {url:'./assets/people/shop-assistant-2.glb',x:-2.1,z:-18.2,scale:1}
];
for(const person of realPeople){
 personLoader.load(person.url,gltf=>{
   const model=gltf.scene;
   const bounds=new THREE.Box3().setFromObject(model);
   const height=bounds.max.y-bounds.min.y;
   if(height>0)model.scale.setScalar(1.78/height);
   model.position.set(person.x,-.02,person.z);
   model.rotation.y=person.x<0?-.18:Math.PI+.18;
   model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
   world.add(model);
   if(gltf.animations?.length){const mixer=new THREE.AnimationMixer(model);mixer.clipAction(gltf.animations[0]).play();staffMixers.push(mixer)}
   staff.push({model,baseX:person.x,baseZ:person.z,phase:Math.random()*Math.PI*2});
 },undefined,error=>console.warn('3D human model not loaded:',person.url,error));
}

const displays=[];
for(const side of [-1,1])for(let row=0;row<6;row++){const z=5-row*4.8,x=side*6.1;box(world,3.2,.18,3.4,dark,x,1.15,z);for(const y of [2.65,4.1,5.55])box(world,3.2,.15,3.4,gold,x,y,z);box(world,.12,5.4,.12,gold,x-1.55,3.2,z-1.55);box(world,.12,5.4,.12,gold,x+1.55,3.2,z-1.55);const d=new THREE.Group();d.position.set(x,0,z);world.add(d);displays.push(d);
for(const sy of [2.82,4.27,5.72]){
 const pick=(row+Math.round(sy*10)+side+10)%4;
 if(pick===0){gift(d,-.92,sy,0,.58,'#8d344d');gift(d,.02,sy,-.05,.48,'#d8c4a3');bouquet(d,.98,sy-.05,.05,.48)}
 else if(pick===1){gift(d,-.72,sy,0,.56,'#52644c');bouquet(d,.35,sy-.05,.05,.56);gift(d,1.02,sy,-.1,.4,'#b34a55')}
 else if(pick===2){bouquet(d,-.88,sy-.05,0,.53);gift(d,.05,sy,-.05,.62,'#8e2f4a');gift(d,.92,sy,-.1,.42,'#d8c4a3')}
 else {gift(d,-.95,sy,0,.45,'#d8c4a3');gift(d,-.12,sy,-.08,.58,'#8d344d');gift(d,.82,sy,-.08,.48,'#52644c')}
}
if((row+side)%3===0){gift(d,-.55,1.5,0,.75,row%2?'#8e2f4a':'#d8c4a3');gift(d,.45,1.5,-.1,.55,'#52644c')}else if((row+side)%3===1){gift(d,-.8,1.5,0,.9,'#8d344d');gift(d,.15,1.5,-.1,.7,'#e4d3b5');bouquet(d,.9,1.45,.1,.75)}else{bouquet(d,-.85,1.4,0,.8);gift(d,.1,1.5,.1,.8,'#52644c');gift(d,.85,1.5,-.1,.62,'#b34a55')}const spot=new THREE.PointLight('#ffcc82',22,8,1.6);spot.position.set(x,6.5,z);world.add(spot);const shelfGlow=new THREE.Mesh(new THREE.BoxGeometry(3,.025,.035),new THREE.MeshBasicMaterial({color:'#ffda91'}));shelfGlow.position.set(x,2.73,z+1.55);world.add(shelfGlow)}
for(let i=0;i<5;i++){const z=3-i*6.2;box(world,2.4,.25,1.8,gold,0,.35,z);box(world,2.15,.7,1.55,burgundy,0,.8,z);gift(world,-.55,1.35,z,.65,'#d8c5aa');gift(world,.25,1.35,z-.1,.75,'#9c304a');if(i%2===0)bouquet(world,.8,1.2,z+.1,.6);else gift(world,.8,1.3,z+.1,.52,'#52644c')}
for(let z=5;z>-25;z-=7){const cord=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,1.5,8),dark);cord.position.set(0,6.4,z);world.add(cord);const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,14,10),new THREE.MeshStandardMaterial({color:'#ffe1a4',emissive:'#ffb84c',emissiveIntensity:2.2}));bulb.position.set(0,5.65,z);world.add(bulb);const l=new THREE.PointLight('#ffc976',14,8,2);l.position.set(0,5.5,z);world.add(l)}

// Crystal chandeliers: layered brass rings, crystal drops and warm candle bulbs.
const crystal=new THREE.MeshPhysicalMaterial({color:'#f8e7c5',metalness:.08,roughness:.08,transmission:.35,thickness:.4,clearcoat:1,clearcoatRoughness:.06});
const brass=mat('#d8b56d',.86,.19);
function chandelier(z,scale=1){
 const rig=new THREE.Group();rig.position.set(0,6.55,z);rig.scale.setScalar(scale);world.add(rig);
 const cord=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.8,10),brass);cord.position.y=.4;rig.add(cord);
 for(const [r,y,tube] of [[.72,0,.045],[.48,-.23,.035],[.25,-.43,.025]]){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(r,tube,10,64),brass);ring.rotation.x=Math.PI/2;ring.position.y=y;rig.add(ring);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const drop=new THREE.Mesh(new THREE.OctahedronGeometry(.09,0),crystal);drop.position.set(Math.cos(a)*r,y-.17,Math.sin(a)*r);drop.scale.set(.55,1.7,.55);rig.add(drop)}
 }
 for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.cos(a)*.66,zz=Math.sin(a)*.66;const flame=new THREE.Mesh(new THREE.SphereGeometry(.085,12,10),new THREE.MeshStandardMaterial({color:'#fff0bf',emissive:'#ffc65c',emissiveIntensity:3.4}));flame.position.set(x,-.13,zz);rig.add(flame)}
 const glow=new THREE.PointLight('#ffd18a',scale*28,12,2);glow.position.y=-.55;rig.add(glow);return rig;
}
const chandeliers=[chandelier(4,1.12),chandelier(-5.5,.96),chandelier(-14.5,.96),chandelier(-23,.9)];

const moteCount=260,positions=new Float32Array(moteCount*3);for(let i=0;i<moteCount;i++){positions[i*3]=(Math.random()-.5)*16;positions[i*3+1]=Math.random()*7;positions[i*3+2]=-Math.random()*38+8}const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#e6c17a',size:.03,transparent:true,opacity:.62}));scene.add(dust);
let target=0,current=0;
const clamp01=v=>Math.max(0,Math.min(1,v));
const curtainLayer=document.querySelector('#velvet-curtains');
const lenis=new Lenis({lerp:.085,wheelMultiplier:.92,smoothWheel:true,syncTouch:false,anchors:true});
function readScroll(value){const scroll=typeof value==='number'?value:(window.scrollY||lenis.scroll||0);const story=document.querySelector('#story');const max=Math.max((story?.offsetHeight||document.documentElement.scrollHeight)-innerHeight,1);target=clamp01(scroll/max);curtainLayer?.classList.toggle('opened',scroll>40)}
lenis.on('scroll',({scroll})=>readScroll(scroll));
addEventListener('scroll',()=>readScroll(window.scrollY),{passive:true});
addEventListener('wheel',event=>{if(Math.abs(event.deltaY)>0){requestAnimationFrame(()=>readScroll(window.scrollY))}},{passive:true});
readScroll(window.scrollY);
const clock=new THREE.Clock(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function animate(time){requestAnimationFrame(animate);lenis.raf(time);const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;current=reduced?target:current+(target-current)*Math.min(1,dt*14);const opening=THREE.MathUtils.smoothstep(current,.008,.13);leftHinge.rotation.y=-opening*1.12;rightHinge.rotation.y=opening*1.12;const travel=current*29.5;camera.position.x=Math.sin(current*Math.PI*2)*.34;camera.position.y=2.65;camera.position.z=13-travel;const finalBlend=THREE.MathUtils.smoothstep(current,.78,.96);const lookY=THREE.MathUtils.lerp(2.35,3.25,finalBlend);const lookZ=THREE.MathUtils.lerp(-7-travel*.38,-20.5,finalBlend);camera.lookAt(Math.sin(current*5)*.1*(1-finalBlend),lookY,lookZ);displays.forEach((d,i)=>{d.rotation.y=Math.sin(t*.38+i*.8)*.018});staffMixers.forEach(mixer=>mixer.update(Math.min(characterClock.getDelta(),.05)));staff.forEach((p)=>{const stride=t*.24+p.phase;p.model.position.x=p.baseX+Math.sin(stride)*.42;p.model.position.z=p.baseZ+Math.cos(stride*.7)*.65;p.model.rotation.y=Math.sin(stride)*.28+(p.baseX<0?-.18:Math.PI+.18)});dust.rotation.y=Math.sin(t*.07)*.02;dust.position.y=Math.sin(t*.22)*.05;renderer.render(scene,camera)}
requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<700?53:43;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6))});
