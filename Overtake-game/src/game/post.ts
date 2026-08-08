import * as THREE from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float threshold;
uniform float softness;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(threshold, threshold + softness, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 sum = vec3(0.0);
  sum += texture2D(tDiffuse, vUv - dir * 4.0).rgb * 0.051;
  sum += texture2D(tDiffuse, vUv - dir * 3.0).rgb * 0.0918;
  sum += texture2D(tDiffuse, vUv - dir * 2.0).rgb * 0.1231;
  sum += texture2D(tDiffuse, vUv - dir * 1.0).rgb * 0.1552;
  sum += texture2D(tDiffuse, vUv).rgb * 0.1658;
  sum += texture2D(tDiffuse, vUv + dir * 1.0).rgb * 0.1552;
  sum += texture2D(tDiffuse, vUv + dir * 2.0).rgb * 0.1231;
  sum += texture2D(tDiffuse, vUv + dir * 3.0).rgb * 0.0918;
  sum += texture2D(tDiffuse, vUv + dir * 4.0).rgb * 0.051;
  gl_FragColor = vec4(sum, 1.0);
}`;

const RAYS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 sunPos;
uniform float density;
uniform float weight;
uniform float decay;
uniform float exposure;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  vec2 delta = (uv - sunPos) * (density / float(SAMPLES));
  float illum = 1.0;
  vec3 col = texture2D(tDiffuse, uv).rgb * 0.35;
  for (int i = 0; i < SAMPLES; i++) {
    uv -= delta;
    col += texture2D(tDiffuse, uv).rgb * illum * weight;
    illum *= decay;
  }
  gl_FragColor = vec4(col * exposure, 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float bloomStrength;
uniform float rayStrength;
uniform vec3 rayColor;
uniform float exposure;
uniform float speed;
uniform float chroma;
uniform float vignette;
uniform float time;
uniform float flash;
varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 dir = uv - 0.5;
  float edge = smoothstep(0.03, 0.55, dot(dir, dir));
  vec3 col;
  float amt = speed * 0.09 * edge;
  if (amt > 0.0008) {
    float wsum = 0.0;
    col = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float t = float(i) / 5.0;
      float w = 1.0 - t * 0.65;
      col += texture2D(tScene, uv - dir * t * amt).rgb * w;
      wsum += w;
    }
    col /= wsum;
  } else {
    col = texture2D(tScene, uv).rgb;
  }
  if (chroma > 0.0) {
    float ca = chroma * dot(dir, dir) * (1.0 + speed * 1.5);
    vec2 blurOff = -dir * amt * 0.5;
    col.r = mix(col.r, texture2D(tScene, uv + blurOff + dir * ca).r, 0.55);
    col.b = mix(col.b, texture2D(tScene, uv + blurOff - dir * ca).b, 0.55);
  }

  col += texture2D(tBloom, uv).rgb * bloomStrength;
  if (rayStrength > 0.0) col += texture2D(tRays, uv).rgb * rayColor * rayStrength;
  col *= exposure;
  col += flash;
  col = aces(col);
  float v = smoothstep(1.05, 0.28, length(dir));
  col *= mix(1.0, v, vignette);
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

/** Standard FXAA 3.11 (console/quality hybrid), operating on the tonemapped image. */
const FXAA = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 texel;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * texel).rgb;
  vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * texel).rgb;
  vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * texel).rgb;
  vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * texel).rgb;
  vec3 rgbM  = texture2D(tDiffuse, vUv).rgb;

  float lNW = luma(rgbNW), lNE = luma(rgbNE);
  float lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));

  if (lMax - lMin < max(0.0312, lMax * 0.125)) {
    gl_FragColor = vec4(rgbM, 1.0);
    return;
  }

  vec2 d;
  d.x = -((lNW + lNE) - (lSW + lSE));
  d.y =  ((lNW + lSW) - (lNE + lSE));
  float scale = 1.0 / (min(abs(d.x), abs(d.y)) + max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125));
  d = clamp(d * scale, -8.0, 8.0) * texel;

  vec3 rgbA = 0.5 * (texture2D(tDiffuse, vUv + d * (1.0 / 3.0 - 0.5)).rgb +
                     texture2D(tDiffuse, vUv + d * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - d * 0.5).rgb +
                                   texture2D(tDiffuse, vUv + d * 0.5).rgb);
  float lB = luma(rgbB);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}`;

export interface PostParams {
  bloom: number;
  rays: number;
  rayColor: THREE.Color;
  exposure: number;
  speed: number;
  flash: number;
  chroma: number;
  vignette: number;
}

export interface PostQuality {
  /** MSAA sample count on the scene target (0 disables) */
  samples: number;
  /** god-ray march steps (0 disables the whole pass) */
  raySamples: number;
  fxaa: boolean;
  bloomEnabled: boolean;
}

export class PostFX {
  private renderer: THREE.WebGLRenderer;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private sceneRT!: THREE.WebGLRenderTarget;
  private occRT!: THREE.WebGLRenderTarget;
  private rayA!: THREE.WebGLRenderTarget;
  private rayB!: THREE.WebGLRenderTarget;
  private brightRT!: THREE.WebGLRenderTarget;
  private blurA!: THREE.WebGLRenderTarget;
  private blurB!: THREE.WebGLRenderTarget;
  private ldrRT!: THREE.WebGLRenderTarget;
  private mBright: THREE.ShaderMaterial;
  private mBlur: THREE.ShaderMaterial;
  private mRays: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial;
  private mFxaa: THREE.ShaderMaterial;
  private black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  private sunNdc = new THREE.Vector3();
  private width = 1;
  private height = 1;
  private quality: PostQuality = { samples: 4, raySamples: 48, fxaa: false, bloomEnabled: true };

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const geo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.mBright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: 0.75 }, softness: { value: 0.5 } },
      vertexShader: VERT,
      fragmentShader: BRIGHT,
      depthTest: false,
      depthWrite: false,
    });
    this.mBlur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: BLUR,
      depthTest: false,
      depthWrite: false,
    });
    this.mRays = this.buildRayMaterial(48);
    this.mComp = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tRays: { value: null },
        bloomStrength: { value: 1 },
        rayStrength: { value: 1 },
        rayColor: { value: new THREE.Color(0xffffff) },
        exposure: { value: 1.05 },
        speed: { value: 0 },
        chroma: { value: 0.0035 },
        vignette: { value: 0.85 },
        time: { value: 0 },
        flash: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: COMPOSITE,
      depthTest: false,
      depthWrite: false,
    });
    this.mFxaa = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: FXAA,
      depthTest: false,
      depthWrite: false,
    });
    this.setSize(1, 1);
  }

  private buildRayMaterial(samples: number) {
    return new THREE.ShaderMaterial({
      defines: { SAMPLES: Math.max(4, Math.round(samples)) },
      uniforms: {
        tDiffuse: { value: null },
        sunPos: { value: new THREE.Vector2(0.5, 0.5) },
        density: { value: 0.85 },
        weight: { value: 0.038 },
        decay: { value: 0.965 },
        exposure: { value: 1.0 },
      },
      vertexShader: VERT,
      fragmentShader: RAYS,
      depthTest: false,
      depthWrite: false,
    });
  }

  setQuality(q: PostQuality) {
    const rayChanged = q.raySamples !== this.quality.raySamples;
    const samplesChanged = q.samples !== this.quality.samples;
    this.quality = { ...q };
    if (rayChanged && q.raySamples > 0) {
      this.mRays.dispose();
      this.mRays = this.buildRayMaterial(q.raySamples);
    }
    if (samplesChanged) this.setSize(this.width, this.height);
  }

  setSize(width: number, height: number) {
    this.width = Math.max(2, Math.floor(width));
    this.height = Math.max(2, Math.floor(height));
    const w = this.width;
    const h = this.height;
    const hw = Math.max(2, Math.floor(w / 2));
    const hh = Math.max(2, Math.floor(h / 2));
    const qw = Math.max(2, Math.floor(w / 4));
    const qh = Math.max(2, Math.floor(h / 4));
    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: false,
    } as const;
    this.sceneRT?.dispose();
    this.occRT?.dispose();
    this.rayA?.dispose();
    this.rayB?.dispose();
    this.brightRT?.dispose();
    this.blurA?.dispose();
    this.blurB?.dispose();
    this.ldrRT?.dispose();
    // MSAA is capped by the driver; three.js clamps to maxSamples internally
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      ...opts,
      depthBuffer: true,
      samples: this.quality.samples,
    });
    this.occRT = new THREE.WebGLRenderTarget(hw, hh, { ...opts, depthBuffer: true });
    this.rayA = new THREE.WebGLRenderTarget(hw, hh, opts);
    this.rayB = new THREE.WebGLRenderTarget(hw, hh, opts);
    this.brightRT = new THREE.WebGLRenderTarget(qw, qh, opts);
    this.blurA = new THREE.WebGLRenderTarget(qw, qh, opts);
    this.blurB = new THREE.WebGLRenderTarget(qw, qh, opts);
    this.ldrRT = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
    });
    (this.mFxaa.uniforms.texel.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    occluderScene: THREE.Scene,
    sunWorld: THREE.Vector3,
    p: PostParams,
    time: number,
    hideInOcclusion?: THREE.Object3D,
  ) {
    const r = this.renderer;
    const prevAuto = r.autoClear;
    const q = this.quality;

    // 1. main scene
    r.autoClear = true;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    // 2. sun occlusion buffer -> radial god rays
    this.sunNdc.copy(sunWorld).project(camera);
    const sunUv = new THREE.Vector2(this.sunNdc.x * 0.5 + 0.5, this.sunNdc.y * 0.5 + 0.5);
    const behind = this.sunNdc.z > 1;
    let rayAmount = q.raySamples > 0 ? p.rays : 0;
    if (behind) rayAmount = 0;
    else {
      const dx = Math.max(0, Math.abs(sunUv.x - 0.5) - 0.5);
      const dy = Math.max(0, Math.abs(sunUv.y - 0.5) - 0.5);
      rayAmount *= Math.max(0, 1 - Math.hypot(dx, dy) * 2.2);
    }

    if (rayAmount > 0.001) {
      r.autoClear = false;
      const prevShadowAuto = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      r.setRenderTarget(this.occRT);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, false);
      r.render(occluderScene, camera);
      const prevOverride = scene.overrideMaterial;
      const wasVisible = hideInOcclusion?.visible ?? false;
      if (hideInOcclusion) hideInOcclusion.visible = false;
      scene.overrideMaterial = this.black;
      r.render(scene, camera);
      scene.overrideMaterial = prevOverride;
      if (hideInOcclusion) hideInOcclusion.visible = wasVisible;
      r.shadowMap.autoUpdate = prevShadowAuto;

      this.mRays.uniforms.tDiffuse.value = this.occRT.texture;
      (this.mRays.uniforms.sunPos.value as THREE.Vector2).copy(sunUv);
      this.mRays.uniforms.density.value = 0.9;
      this.mRays.uniforms.weight.value = 0.036 * (48 / q.raySamples);
      this.mRays.uniforms.exposure.value = 0.9;
      this.pass(this.mRays, this.rayA);
      this.mRays.uniforms.tDiffuse.value = this.rayA.texture;
      this.mRays.uniforms.density.value = 2.2;
      this.mRays.uniforms.weight.value = 0.03 * (48 / q.raySamples);
      this.mRays.uniforms.exposure.value = 0.85;
      this.pass(this.mRays, this.rayB);
    } else {
      r.setRenderTarget(this.rayB);
      r.setClearColor(0x000000, 1);
      r.clear(true, false, false);
    }

    // 3. bloom
    r.autoClear = false;
    const bloomOn = q.bloomEnabled && p.bloom > 0.001;
    if (bloomOn) {
      this.mBright.uniforms.tDiffuse.value = this.sceneRT.texture;
      this.pass(this.mBright, this.brightRT);
      let src = this.brightRT;
      for (let i = 0; i < 3; i++) {
        const scale = 1 + i * 1.4;
        this.mBlur.uniforms.tDiffuse.value = src.texture;
        (this.mBlur.uniforms.dir.value as THREE.Vector2).set((scale * 4) / this.width, 0);
        this.pass(this.mBlur, this.blurA);
        this.mBlur.uniforms.tDiffuse.value = this.blurA.texture;
        (this.mBlur.uniforms.dir.value as THREE.Vector2).set(0, (scale * 4) / this.height);
        this.pass(this.mBlur, this.blurB);
        src = this.blurB;
        if (i < 2) this.mBright.uniforms.tDiffuse.value = this.blurB.texture;
      }
    } else {
      r.setRenderTarget(this.blurB);
      r.setClearColor(0x000000, 1);
      r.clear(true, false, false);
    }

    // 4. composite (+ optional FXAA on the tonemapped result)
    const u = this.mComp.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = this.blurB.texture;
    u.tRays.value = this.rayB.texture;
    u.bloomStrength.value = bloomOn ? p.bloom : 0;
    u.rayStrength.value = rayAmount;
    (u.rayColor.value as THREE.Color).copy(p.rayColor);
    u.exposure.value = p.exposure;
    u.speed.value = p.speed;
    u.chroma.value = p.chroma;
    u.vignette.value = p.vignette;
    u.time.value = time;
    u.flash.value = p.flash;

    if (q.fxaa) {
      this.pass(this.mComp, this.ldrRT);
      this.mFxaa.uniforms.tDiffuse.value = this.ldrRT.texture;
      this.pass(this.mFxaa, null);
    } else {
      this.pass(this.mComp, null);
    }

    r.autoClear = prevAuto;
    r.setRenderTarget(null);
  }

  dispose() {
    this.sceneRT.dispose();
    this.occRT.dispose();
    this.rayA.dispose();
    this.rayB.dispose();
    this.brightRT.dispose();
    this.blurA.dispose();
    this.blurB.dispose();
    this.ldrRT.dispose();
    this.mBright.dispose();
    this.mBlur.dispose();
    this.mRays.dispose();
    this.mComp.dispose();
    this.mFxaa.dispose();
    this.black.dispose();
    (this.quad.geometry as THREE.BufferGeometry).dispose();
  }
}
