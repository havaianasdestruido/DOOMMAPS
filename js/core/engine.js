// ============================================================
// DOOMMAPS — Engine: WebGL renderer, classic/software post pass,
// animated hellish sky, camera shake, resize handling
// ============================================================
import * as THREE from "three";
import { clamp } from "../config.js";

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w; // depth = far
  }
`;

const SKY_FRAG = /* glsl */`
  precision mediump float;
  varying vec3 vDir;
  uniform float uTime;
  uniform float uMode; // 0 fire, 1 void/night, 2 bloodmoon

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float t = uTime * 0.02;
    vec2 uv = vec2(atan(d.z, d.x) * 1.6, d.y * 3.0);
    float h = clamp(d.y, -0.1, 1.0);

    vec3 col;
    if (uMode < 0.5) {
      // inferno sky
      float n = fbm(uv * 2.0 + vec2(t * 2.0, -t * 3.0));
      float n2 = fbm(uv * 4.5 - vec2(t, t * 2.0));
      vec3 deep = vec3(0.10, 0.01, 0.02);
      vec3 mid  = vec3(0.45, 0.05, 0.03);
      vec3 hot  = vec3(0.95, 0.35, 0.05);
      col = mix(deep, mid, smoothstep(0.15, 0.75, n + h * 0.4));
      col = mix(col, hot, smoothstep(0.55, 1.0, n2 * (1.2 - h)));
      col += vec3(0.5, 0.12, 0.0) * pow(1.0 - h, 3.0) * (0.6 + 0.4 * n);
    } else if (uMode < 1.5) {
      // void night
      float n = fbm(uv * 3.0 + t);
      col = mix(vec3(0.02, 0.0, 0.05), vec3(0.16, 0.02, 0.25), n * (1.0 - h * 0.5));
      float star = step(0.9975, hash(floor(uv * 140.0)));
      col += star * (0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(uv * 140.0)) * 40.0)) * vec3(0.8, 0.6, 1.0);
    } else {
      // blood moon
      float n = fbm(uv * 2.5 + vec2(t, -t));
      col = mix(vec3(0.05, 0.01, 0.03), vec3(0.35, 0.06, 0.08), n);
      vec3 moonDir = normalize(vec3(0.4, 0.35, -0.6));
      float md = dot(d, moonDir);
      col += vec3(0.9, 0.15, 0.1) * smoothstep(0.995, 0.9995, md) * 2.0;
      col += vec3(0.5, 0.05, 0.05) * pow(max(md, 0.0), 40.0) * 0.6;
    }
    // horizon burn
    col += vec3(0.9, 0.2, 0.02) * pow(1.0 - abs(d.y + 0.02), 14.0) * (0.4 + 0.2 * sin(uTime * 0.7));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Classic post-process: palette crush + ordered dither + scanlines
const POST_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const POST_FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uHurt;   // red tint
  uniform float uFlash;  // white flash
  uniform float uInvuln; // inverted colors

  float bayer2(vec2 a){ a = floor(a); return fract(a.x/2.0 + a.y*a.y*0.75); }
  float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
  float bayer8(vec2 a){ return bayer4(0.5*a)*0.25 + bayer2(a); }

  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    // palette crush with ordered dither (256-color feel)
    float d = bayer8(gl_FragCoord.xy) - 0.5;
    float levels = 14.0;
    c = floor(c * levels + 0.5 + d * 0.85) / levels;
    // scanlines
    float sl = sin(gl_FragCoord.y * 3.14159 * 0.5);
    c *= 0.92 + 0.08 * sl;
    // vignette
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.55;
    // hurt / flash / invuln
    c = mix(c, vec3(1.0, 0.05, 0.02), uHurt * 0.45);
    c = mix(c, vec3(1.0), uFlash);
    if (uInvuln > 0.01) c = mix(c, 1.0 - c, uInvuln);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const POST_FRAG_MODERN = /* glsl */`
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uHurt;
  uniform float uFlash;
  uniform float uInvuln;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.35;
    c = mix(c, vec3(1.0, 0.05, 0.02), uHurt * 0.40);
    c = mix(c, vec3(1.0), uFlash);
    if (uInvuln > 0.01) c = mix(c, 1.0 - c, uInvuln);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class Engine {
  constructor(canvas, settings) {
    this.settings = settings;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x140505, 0.016);

    this.camera = new THREE.PerspectiveCamera(74, 1, 0.08, 900);
    this.camera.rotation.order = "YXZ";

    // lights
    this.hemi = new THREE.HemisphereLight(0xff9955, 0x201008, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xff7733, 0.55);
    this.sun.position.set(0.4, 1, -0.6);
    this.scene.add(this.sun);

    // sky dome
    this.skyUniforms = { uTime: { value: 0 }, uMode: { value: 0 } };
    const skyGeo = new THREE.SphereGeometry(800, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    // post pipeline
    this.rt = null;
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postUniforms = {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uHurt: { value: 0 },
      uFlash: { value: 0 },
      uInvuln: { value: 0 },
    };
    this.postMatClassic = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: this.postUniforms, depthTest: false, depthWrite: false });
    this.postMatModern = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG_MODERN, uniforms: this.postUniforms, depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMatClassic);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    // camera shake
    this.shake = 0;
    this.shakeVec = new THREE.Vector3();

    // dynamic light for muzzle/explosions (one shared)
    this.flashLight = new THREE.PointLight(0xffaa33, 0, 26, 1.8);
    this.scene.add(this.flashLight);

    this.mode = settings.renderMode;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setMode(mode) {
    this.mode = mode;
    this.canvas.classList.toggle("classic-render", mode === "classic");
    this.resize();
  }

  setSkyMode(m) { this.skyUniforms.uMode.value = m; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.mode === "classic") {
      // low internal resolution, integer-ish upscale, pixelated
      const ih = 280;
      const iw = Math.round(ih * (w / h));
      this.renderer.setSize(iw, ih, false);
      this.renderer.setPixelRatio(1);
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(iw, ih, {
        magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true,
      });
      this.postUniforms.tDiffuse.value = this.rt.texture;
      this.postUniforms.uRes.value.set(iw, ih);
    } else {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, {
        magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: true,
      });
      this.postUniforms.tDiffuse.value = this.rt.texture;
      this.postUniforms.uRes.value.set(w * dpr, h * dpr);
    }
  }

  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }

  /** muzzle / explosion flash light */
  flash(pos, intensity = 2.4, color = 0xffaa33) {
    this.flashLight.position.copy(pos).y += 0.3;
    this.flashLight.color.setHex(color);
    this.flashLight.intensity = intensity;
  }

  update(dt, t, playerPos) {
    this.skyUniforms.uTime.value = t;
    this.sky.position.copy(playerPos);
    // decay shake
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const s = this.shake * 0.035;
    this.shakeVec.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    // decay flash light
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 14);
    // decay overlay uniforms
    const u = this.postUniforms;
    u.uTime.value = t;
    u.uHurt.value = Math.max(0, u.uHurt.value - dt * 2.6);
    u.uFlash.value = Math.max(0, u.uFlash.value - dt * 6);
    u.uInvuln.value = Math.max(0, u.uInvuln.value - dt * 1.2);
  }

  hurt(amount) { if (this.settings.screenFlash) this.postUniforms.uHurt.value = clamp(this.postUniforms.uHurt.value + amount, 0, 1); }
  flashScreen(a = 0.8) { this.postUniforms.uFlash.value = a; }
  setInvuln(a) { this.postUniforms.uInvuln.value = a; }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    const quad = this.postScene.children[0];
    quad.material = this.mode === "classic" ? this.postMatClassic : this.postMatModern;
    r.render(this.postScene, this.postCam);
  }
}
