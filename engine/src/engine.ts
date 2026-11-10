// The renderer: one three.js scene posed per frame by the story, then the post chain
//   RenderPass (MSAA 4) -> InkPass (world ink lines) -> lens blur pre + main (thin-lens DOF) ->
//   [bloom (emissive only) + NEUTRAL tone map + colour grade + white flash] -> canvas.
// Every pixel-sized post parameter is specified at 1080x1920 and scales with the output height, so half-size
// stills and full-size frames match. Adapted from mromidev/claude-animated-shorts templates/bridge (MIT).
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, BlendFunction, Effect, FXAAEffect } from "postprocessing";
import { InkPass, NOINK, noInkFallback } from "./lib/ink";
import { LensBlur } from "./lib/lensblur";
import { GradeEffect, GRADES, gradeFor } from "./lib/grade";
import { LIGHTS, LOOK, LightName } from "./lib/lights";
import { TONE, CHAR, untone } from "./lib/shade";
import { Cards, CardPlace, FxPlace } from "./cards";
import { Cam, V3 } from "./motion";

export type FrameState = {
  cam: Cam;
  light: LightName;
  /** camera the sun is frozen against (usually the first key of the current shot). Default: the current camera. */
  sunRef?: { pos: V3; look: V3 };
  /** lens blur: cInf = blur of infinity in px at 1080 (0 = sharp), focus point (default: cam.look) */
  dof?: { cInf: number; focus?: V3 };
  cards?: CardPlace[];
  fx?: FxPlace[];
  /** 0..1 white flash over the frame */
  flash?: number;
  /** contact blob colour under characters (multiply), default from the light */
  blob?: string;
  /** cross-dissolve: `from` is the OUTGOING shot's state at this same frame (keep it moving), t 0..1 = how much of
   *  THIS (incoming) state shows. Use for time jumps ("Then, one Monday...", "Meanwhile..."): 6-10 frames. */
  dissolve?: { from: FrameState; t: number };
};
export type Story = {
  TOTAL: number;
  build: (w: Engine) => void | Promise<void>;
  frame: (f: number, w: Engine) => FrameState;
};

class FlashEffect extends Effect {
  constructor() {
    super("FlashEffect", `uniform float amount;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4(mix(inputColor.rgb, vec3(1.0), amount), inputColor.a); }`,
    { blendFunction: BlendFunction.NORMAL, uniforms: new Map([["amount", new THREE.Uniform(0)]]) });
  }
  set amount(v: number) { this.uniforms.get("amount")!.value = v; }
}

const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = (b as any).mipmapBlurPass;
  const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};

export class Engine {
  readonly THREE = THREE;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  /** add everything the story builds under root */
  root = new THREE.Group();
  cam = new THREE.PerspectiveCamera(40, 1080 / 1920, 0.1, 1500);
  composer: EffectComposer;
  private ink: InkPass;
  private lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
  private grade = new GradeEffect(GRADES.day, 1);
  private flash = new FlashEffect();
  private lensPasses: EffectPass[] = [];
  private sun = new THREE.DirectionalLight("#fff0d6", 2.6);
  private hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
  private skyMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  cards: Cards;
  /** anything the story wants to keep between build() and frame() */
  refs: Record<string, any> = {};

  constructor(canvas: HTMLCanvasElement, W: number, H: number, opt: { msaa?: number; shadow?: number; ink?: boolean; lens?: boolean; bloom?: boolean } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.cam.aspect = W / H;
    this.cam.layers.enable(NOINK);
    this.scene.add(this.root);
    // sky dome: 5 colour stops by elevation, tone-map-inverted so the screen shows the preset colours
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    this.scene.add(this.sky);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(opt.shadow ?? 2048, opt.shadow ?? 2048);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = this.fog;
    this.cards = new Cards(this.root);
    // post chain
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: opt.msaa ?? 4 });
    this.composer.setSize(W, H, false);
    this.ink = new InkPass(this.scene, this.cam);
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    if (opt.ink !== false) this.composer.addPass(this.ink);
    if (opt.lens !== false) {
      this.lensPasses = [new EffectPass(this.cam, this.lens.pre), new EffectPass(this.cam, this.lens.main)];
      for (const p of this.lensPasses) this.composer.addPass(p);
    }
    const fx: Effect[] = opt.bloom === false ? [] : [makeBloom()];
    this.composer.addPass(new EffectPass(this.cam, ...fx, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), this.grade, this.flash));
    if ((opt.msaa ?? 4) === 0) this.composer.addPass(new EffectPass(this.cam, new FXAAEffect()));
  }

  private sunDir(ref: { pos: V3; look: V3 }, light: LightName) {
    const L = LIGHTS[light], az = THREE.MathUtils.degToRad(L.az), el = THREE.MathUtils.degToRad(L.el);
    let fx = ref.look[0] - ref.pos[0], fz = ref.look[2] - ref.pos[2];
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    return new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
  }

  render(f: number, s: FrameState) {
    const cam = this.cam, c = s.cam;
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(THREE.MathUtils.degToRad(c.roll ?? 0));
    cam.fov = c.fov; cam.near = 0.1; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // light rig: camera-relative sun frozen against sunRef, two-tone uniforms, shadow box fit around the look point
    const L = LIGHTS[s.light], K = LOOK[s.light];
    const focus = new THREE.Vector3(...c.look), dist = cam.position.distanceTo(focus);
    const dir = this.sunDir(s.sunRef ?? { pos: c.pos, look: c.look }, s.light);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let R = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") R = Math.max(R, 30);
    this.sun.position.copy(focus).addScaledVector(dir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (R / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    const blob = s.blob ?? "#" + new THREE.Color(L.blob[0], L.blob[1], L.blob[2]).getHexString();
    this.cards.update(cam, s.cards ?? [], s.fx ?? [], blob);
    noInkFallback(this.root);
    // lens + grade + flash
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const fp = new THREE.Vector3(...(s.dof?.focus ?? c.look));
    this.lens.focus = Math.max(0.3, fp.sub(cam.position).dot(fwd));
    this.lens.cInf = s.dof?.cInf ?? 0;
    for (const p of this.lensPasses) p.enabled = this.lens.cInf > 0.5;   // sharp shots skip the (expensive) lens blur
    gradeFor(this.grade, s.light);
    this.flash.amount = s.flash ?? 0;
    this.composer.render();
  }
}
