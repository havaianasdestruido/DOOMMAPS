// Minimal THREE stub for headless logic tests
export class Vector2 { constructor(x=0,y=0){this.x=x;this.y=y;} set(x,y){this.x=x;this.y=y;return this;} }
export class Vector3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  normalize(){const l=Math.hypot(this.x,this.y,this.z)||1;return this.multiplyScalar(1/l);}
  length(){return Math.hypot(this.x,this.y,this.z);}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
}
class Obj3D {
  constructor(){this.position=new Vector3();this.rotation={x:0,y:0,z:0,order:"YXZ",set(x,y,z){this.x=x;this.y=y;this.z=z;}};this.scale=new Vector3(1,1,1);this.children=[];this.userData={};}
  add(...cs){for(const c of cs){this.children.push(c);if(c)c.parent=this;}return this;}
  remove(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);return this;}
  traverse(fn){fn(this);for(const c of [...this.children])c.traverse?c.traverse(fn):fn(c);}
  updateMatrix(){}
}
export class Group extends Obj3D {}
export class Scene extends Obj3D { constructor(){super();this.fog=null;} }
export class Mesh extends Obj3D { constructor(g,m){super();this.geometry=g;this.material=m;} }
export class Sprite extends Obj3D { constructor(m){super();this.material=m;} }
export class PerspectiveCamera extends Obj3D { constructor(){super();this.aspect=1;} updateProjectionMatrix(){} }
export class OrthographicCamera extends Obj3D { constructor(){super();} }
class Geo { setAttribute(){return this;} setIndex(){return this;} dispose(){} }
export class BoxGeometry extends Geo { constructor(w,h,d){super();this.params={w,h,d};} }
export class PlaneGeometry extends Geo { constructor(w,h){super();this.params={w,h};} }
export class CylinderGeometry extends Geo {}
export class TorusGeometry extends Geo {}
export class CircleGeometry extends Geo {}
export class SphereGeometry extends Geo {}
export class BufferGeometry extends Geo {}
export class Float32BufferAttribute { constructor(arr,size){this.array=arr;this.itemSize=size;} }
class Mat { constructor(p={}){Object.assign(this,p);this.color={setHex(){return this;},multiplyScalar(){return this;},setHSL(){return this;},setScalar(){return this;}};} dispose(){} clone(){return new Mat({...this});} }
export class MeshLambertMaterial extends Mat {}
export class MeshBasicMaterial extends Mat {}
export class MeshStandardMaterial extends Mat {}
export class SpriteMaterial extends Mat {}
export class ShaderMaterial extends Mat {}
export class Texture { constructor(){this.image=null;} clone(){return new Texture();} dispose(){} }
export class CanvasTexture extends Texture { constructor(cv){super();this.image=cv;this.needsUpdate=false;} }
export class PointLight extends Obj3D { constructor(){super();this.intensity=0;this.color={setHex(){}};} }
export class HemisphereLight extends Obj3D {}
export class DirectionalLight extends Obj3D {}
export class FogExp2 { constructor(c,d){this.color=c;this.density=d;} }
export class WebGLRenderTarget { constructor(w,h){this.width=w;this.height=h;this.texture=new Texture();} dispose(){} }
export class Raycaster { set(){} }
export const NearestFilter = 1003;
export const LinearFilter = 1006;
export const RepeatWrapping = 1000;
export const SRGBColorSpace = "srgb";
export const BackSide = 1;
export const FrontSide = 0;
export const DoubleSide = 2;
export const AdditiveBlending = 2;
export const NormalBlending = 1;
