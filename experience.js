import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas=document.querySelector('#experience');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
const scene=new THREE.Scene();scene.background=new THREE.Color('#170f12');scene.fog=new THREE.FogExp2('#170f12',.032);
const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.1,120);camera.position.set(0,2.5,13);
scene.add(new THREE.HemisphereLight('#ffe8ca','#24121a',1.55));scene.add(new THREE.AmbientLight('#c7a4a0',.4));
function light(c,power,pos,dist=32){const l=new THREE.PointLight(c,power,dist,2);l.position.set(...pos);scene.add(l)}
light('#ffd99a',115,[0,5,5]);light('#bf7b3c',80,[-6,3,-7]);light('#ffdfaa',85,[5,4,-17]);
const mat=(color,metalness=.05,roughness=.45)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const gold=mat('#c6a15e',.78,.25),cream=mat('#e6d7c2',.08,.45),burgundy=mat('#702b42',.15,.4),dark=mat('#29151d',.1,.7),green=mat('#3c5844',.05,.7),pink=mat('#d98f9c',.05,.55),red=mat('#a83243',.05,.5),ribbon=mat('#e2c17e',.42,.28);
function box(parent,w,h,d,m,x,y,z,cast=true){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=cast;o.receiveShadow=true;parent.add(o);return o}
function sphere(parent,r,m,x,y,z,sx=1,sy=1,sz=1){const o=new THREE.Mesh(new THREE.SphereGeometry(r,20,14),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;parent.add(o);return o}
function gift(parent,x,y,z,s,c){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);box(g,s,s*.72,s,mat(c,.08,.32),0,0,0);box(g,s*1.04,s*.1,s*1.04,ribbon,0,s*.2,0);box(g,s*.13,s*.75,s*1.05,ribbon,0,0,0);sphere(g,s*.13,ribbon,-s*.15,s*.48,0,1,.5,.6);sphere(g,s*.13,ribbon,s*.15,s*.48,0,1,.5,.6);return g}
function bouquet(parent,x,y,z,s=1){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const stem=new THREE.Mesh(new THREE.CylinderGeometry(.012,.018,.65*s,7),green);stem.position.set(Math.cos(a)*.13*s,.5*s,Math.sin(a)*.13*s);stem.rotation.z=-Math.cos(a)*.25;g.add(stem);sphere(g,.11*s,i%2?pink:red,Math.cos(a)*.18*s,.86*s,Math.sin(a)*.18*s,1,.7,1)}sphere(g,.12*s,cream,0,.94*s,0,1,.7,1);box(g,.35*s,.36*s,.35*s,burgundy,0,.18*s,0)}
const world=new THREE.Group();scene.add(world);
box(world,30,.25,60,mat('#6c4a43',.25,.3),0,-.16,-12,false);box(world,30,10,.35,dark,0,5,-27,false);box(world,.25,10,60,dark,-8,5,-12,false);box(world,.25,10,60,dark,8,5,-12,false);
for(let z=7;z>-29;z-=4){box(world,16,.12,.18,gold,0,7.3,z,false);for(const x of [-7.6,7.6])box(world,.12,7,.12,gold,x,3.6,z,false)}
for(const x of [-4.2,4.2])box(world,.17,6,.18,gold,x,2.9,8,false);box(world,8.55,.18,.2,gold,0,5.9,8,false);
// A real textured sign sits on the rear wall and comes into view as the camera travels.
const signCanvas=document.createElement('canvas');signCanvas.width=1200;signCanvas.height=300;const ctx=signCanvas.getContext('2d');ctx.fillStyle='#24151b';ctx.fillRect(0,0,1200,300);ctx.strokeStyle='#d8b77b';ctx.lineWidth=4;ctx.strokeRect(16,16,1168,268);ctx.textAlign='center';ctx.fillStyle='#e4c58b';ctx.font='58px Georgia';ctx.fillText('SREE COLLECTIONS',600,135);ctx.font='28px Arial';ctx.fillText('SINCE 1998',600,205);const tex=new THREE.CanvasTexture(signCanvas);tex.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.PlaneGeometry(5.4,1.35),new THREE.MeshBasicMaterial({map:tex}));sign.position.set(0,5,-26.75);world.add(sign);

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
// Simple articulated shop staff with gentle walk cycles; kept at a believable scale.
const staff=[];
function makeStaff(x,z,shirt='#eee1d0',trouser='#39232c',facing=0){
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=facing;world.add(g);
 const skin=mat('#b77d5d',0,.75),top=mat(shirt,.04,.7),pants=mat(trouser,.08,.62),shoe=mat('#211a1c',.12,.5);
 box(g,.48,.72,.28,top,0,1.28,0);sphere(g,.19,skin,0,1.86,0,1,1.12,.95);
 // hair and a restrained collar detail
 sphere(g,.195,mat('#2c2020',0,.9),0,1.98,-.025,1, .55,1);
 box(g,.17,.07,.035,gold,0,1.62,.15,false);
 const arms=[];
 for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.31,1.52,0);g.add(arm);const limb=new THREE.Mesh(new THREE.CapsuleGeometry(.075,.42,3,7),top);limb.position.y=-.22;arm.add(limb);const hand=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),skin);hand.position.y=-.48;arm.add(hand);arms.push(arm)}
 const legs=[];
 for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.14,.93,0);g.add(leg);const limb=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.48,3,7),pants);limb.position.y=-.28;leg.add(limb);const foot=box(leg,.15,.1,.28,shoe,0,-.55,.07,false);legs.push(leg)}
 staff.push({g,arms,legs,phase:Math.random()*6.28,baseX:x,baseZ:z});return g;
}
makeStaff(-1.05,-2.4,'#d8b77b','#3d2931',.15);
makeStaff(1.25,-10.5,'#e8dfd0','#59404a',Math.PI);
makeStaff(-1.15,-18.2,'#a9b6a0','#33242a',-.12);

const displays=[];
for(const side of [-1,1])for(let row=0;row<6;row++){const z=5-row*4.8,x=side*6.1;box(world,3.2,.18,3.4,dark,x,1.15,z);for(const y of [2.65,4.1,5.55])box(world,3.2,.15,3.4,gold,x,y,z);box(world,.12,5.4,.12,gold,x-1.55,3.2,z-1.55);box(world,.12,5.4,.12,gold,x+1.55,3.2,z-1.55);const d=new THREE.Group();d.position.set(x,0,z);world.add(d);displays.push(d);if((row+side)%3===0){gift(d,-.55,1.5,0,.75,row%2?'#8e2f4a':'#d8c4a3');gift(d,.45,1.5,-.1,.55,'#52644c')}else if((row+side)%3===1){gift(d,-.8,1.5,0,.9,'#8d344d');gift(d,.15,1.5,-.1,.7,'#e4d3b5');bouquet(d,.9,1.45,.1,.75)}else{bouquet(d,-.85,1.4,0,.8);gift(d,.1,1.5,.1,.8,'#52644c');gift(d,.85,1.5,-.1,.62,'#b34a55')}const spot=new THREE.PointLight('#ffcc82',8,5,2);spot.position.set(x,5.4,z);world.add(spot)}
for(let i=0;i<5;i++){const z=3-i*6.2;box(world,2.4,.25,1.8,gold,0,.35,z);box(world,2.15,.7,1.55,burgundy,0,.8,z);gift(world,-.55,1.35,z,.65,'#d8c5aa');gift(world,.25,1.35,z-.1,.75,'#9c304a');if(i%2===0)bouquet(world,.8,1.2,z+.1,.6);else gift(world,.8,1.3,z+.1,.52,'#52644c')}
for(let z=5;z>-25;z-=7){const cord=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,1.5,8),dark);cord.position.set(0,6.4,z);world.add(cord);const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,14,10),new THREE.MeshStandardMaterial({color:'#ffe1a4',emissive:'#ffb84c',emissiveIntensity:2.2}));bulb.position.set(0,5.65,z);world.add(bulb);const l=new THREE.PointLight('#ffc976',14,8,2);l.position.set(0,5.5,z);world.add(l)}
const moteCount=260,positions=new Float32Array(moteCount*3);for(let i=0;i<moteCount;i++){positions[i*3]=(Math.random()-.5)*16;positions[i*3+1]=Math.random()*7;positions[i*3+2]=-Math.random()*38+8}const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#e6c17a',size:.03,transparent:true,opacity:.62}));scene.add(dust);
let target=0,current=0;function readScroll(){const max=document.documentElement.scrollHeight-innerHeight;target=max>0?scrollY/max:0}addEventListener('scroll',readScroll,{passive:true});readScroll();
const clock=new THREE.Clock(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01=v=>Math.max(0,Math.min(1,v));
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;current=THREE.MathUtils.damp(current,target,reduced?20:2.7,dt);const opening=THREE.MathUtils.smoothstep(current,.015,.16);leftHinge.rotation.y=-opening*1.08;rightHinge.rotation.y=opening*1.08;const travel=current*35;camera.position.x=THREE.MathUtils.damp(camera.position.x,Math.sin(current*Math.PI*2)*.72,2,dt);camera.position.y=THREE.MathUtils.damp(camera.position.y,2.5+Math.sin(current*Math.PI*3)*.2,2,dt);camera.position.z=THREE.MathUtils.damp(camera.position.z,13-travel,2.8,dt);camera.lookAt(Math.sin(current*5)*.22,2.2,-7-travel*.38);displays.forEach((d,i)=>{d.rotation.y=Math.sin(t*.38+i*.8)*.018});staff.forEach((p,i)=>{const walk=t*1.7+p.phase;p.g.position.x=p.baseX+Math.sin(t*.22+p.phase)*.16;p.g.position.z=p.baseZ+Math.sin(t*.31+p.phase)*.22;p.legs.forEach((l,j)=>{l.rotation.x=Math.sin(walk+j*Math.PI)*.34});p.arms.forEach((a,j)=>{a.rotation.x=Math.sin(walk+j*Math.PI+Math.PI)*.22});p.g.position.y=Math.abs(Math.sin(walk*2))*.018});dust.rotation.y=Math.sin(t*.07)*.02;dust.position.y=Math.sin(t*.22)*.05;renderer.render(scene,camera)}
animate();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<700?53:43;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6))});
