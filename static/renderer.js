/* Procedural neon point field. All particle animation runs on the GPU. */
(() => {
  'use strict';
  const VS = `
  precision highp float;
  attribute vec3 aPosition;
  attribute vec4 aData;
  uniform vec2 uResolution;
  uniform float uTime, uYaw, uPitch, uLight, uPulse, uScatter, uEnergy, uPass, uDpr, uBodyScale;
  uniform float uThink;   // 1 = düşünür: sinədən başa doğru impulslar qaçır
  uniform vec3 uBlue, uGold;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHalo;

  float terrain(float x, float b) {
    float ax = abs(x);
    // Smooth valley descent towards center (no harsh cliffs)
    float ridgeProfile = smoothstep(0.24, 0.88, ax);
    // Crystalline mountain peaks
    float peak1 = max(0.0, 1.0 - abs(ax - 0.70) / 0.25) * 0.75;
    float peak2 = max(0.0, 1.0 - abs(ax - 1.15) / 0.38) * 1.05;
    float peak3 = max(0.0, 1.0 - abs(ax - 1.75) / 0.50) * 0.82;
    float peaks = max(peak1, max(peak2, peak3));
    // Faceted fracture harmonics
    float jagged = abs(fract(ax * 3.6 + 0.15) - 0.5) * 0.14 + abs(fract(ax * 7.2) - 0.5) * 0.07;
    
    float crest = 0.650 - ridgeProfile * (peaks * 0.34 + jagged * 0.26);
    float flowing = sin(x * 5.5 + b * 4.2 + uTime * 0.16) * 0.009;
    return crest + b * 0.48 + sin(x * 11.0 + b * 8.0) * 0.025 * b + flowing;
  }

  void main() {
    float kind = aData.x, seed = aData.y, brightness = aData.z, size = aData.w;
    vec3 p = aPosition;
    vColor = uBlue;
    vAlpha = brightness;
    vHalo = 0.45;

    if (kind < 0.5) {
      // Mountain terrain particles & mesh nodes
      float band = p.y;
      p.y = terrain(p.x, band) + p.z;
      p.z = 0.0;
      float sparkle = 0.75 + 0.25 * sin(seed * 47.0 + uTime * (1.0 + fract(seed) * 2.0));
      vAlpha *= sparkle;
      
      // Smooth fade into center valley
      float valleyFade = smoothstep(0.22, 0.48, abs(p.x));
      vAlpha *= valleyFade;

      // Radiant golden fracture veins running through mountain faults
      float v1 = step(0.975, sin(band * 26.0 + sin(p.x * 7.0 + uTime * 0.12) * 2.2));
      float v2 = step(0.97, sin(p.x * 9.5 + band * 15.0)) * step(0.08, band) * step(band, 0.86);
      float v3 = step(0.98, sin(p.x * 14.0 - band * 9.5)) * step(0.14, band) * step(band, 0.90);
      float gold = max(v1, max(v2, v3));
      vec3 veinGold = mix(uGold, vec3(1.0, 0.74, 0.30), 0.22);
      vColor = mix(uBlue, veinGold, gold * 0.98);
      vAlpha *= (1.10 + gold * 1.15);
      vAlpha *= 1.0 - sin(uScatter * 3.14159265) * 0.96;
      size *= 1.0 + gold * 0.30;
    } else if (kind > 6.5 && kind < 7.5) {
      // 5 Concentric Aura Rings (Halo) behind head
      float headY0 = 0.385;
      float dy = headY0 - 0.47;
      float headYawX = sin(uYaw) * 0.045;
      float headPitchY = 0.47 + dy * cos(uPitch);
      float headTransY = headPitchY < 0.55 ? 0.165 + (headPitchY - 0.165) * 1.21 : 0.63085 + (headPitchY - 0.55) * 0.8445;
      vec2 headCenter = vec2(headYawX * uBodyScale, 0.5 + (headTransY - 0.5) * uBodyScale);

      p.x = headCenter.x + aPosition.x * uBodyScale;
      p.y = headCenter.y + aPosition.y * uBodyScale;
      p.z = 0.0;

      float ringPulse = sin(seed * 18.0 + uTime * 2.0);
      vColor = mix(uBlue, vec3(0.55, 0.94, 1.0), 0.55);
      vAlpha = brightness * (0.80 + 0.20 * ringPulse);
      size = size * (1.0 + 0.15 * ringPulse);
      vHalo = 0.90;
    } else if (kind > 7.5 && kind < 8.5) {
      // Crown Particle Fountain / Plume (erupting upwards from top of head)
      float crownY0 = 0.165;
      float dy = crownY0 - 0.47;
      float crownX = sin(uYaw) * 0.045;
      float crownY = 0.47 + dy * cos(uPitch);
      crownY = crownY < 0.55 ? 0.165 + (crownY - 0.165) * 1.21 : 0.63085 + (crownY - 0.55) * 0.8445;
      vec2 crownPos = vec2(crownX * uBodyScale, 0.5 + (crownY - 0.5) * uBodyScale);

      float lift = fract(seed * 19.0 + uTime * 0.18);
      float spreadAngle = (fract(seed * 71.0) - 0.5) * 1.6;
      float speed = 0.10 + fract(seed * 37.0) * 0.16;
      float driftX = sin(spreadAngle) * lift * speed + (fract(seed * 93.0) - 0.5) * 0.035;
      float driftY = -cos(spreadAngle * 0.6) * lift * speed * 1.35;
      driftX += sin(lift * 8.0 + uTime * 2.0 + seed * 8.0) * 0.008;

      p.x = crownPos.x + (aPosition.x + driftX) * uBodyScale;
      p.y = crownPos.y + driftY * uBodyScale;
      p.z = 0.0;

      vAlpha = brightness * (1.0 - lift * 0.90) * (0.55 + 0.40 * sin(seed * 37.0 + uTime * 4.0));
      vColor = mix(uBlue, vec3(0.12, 0.72, 1.0), 0.30 + 0.20 * sin(seed * 13.0));
      size = size * (1.2 + (1.0 - lift) * 0.5);
      vHalo = 0.85;
    } else if (kind > 9.5) {
      // Üzün mərkəzindəki yumşaq narıncı-qızılı enerji parıltısı.
      // Konturların ARXASINDA duran geniş, yumşaq bulud: referansda parıltı
      // ayrı-ayrı xətlərdən deyil, üzün içindən gələn işıqdan doğur.
      float dy = p.y - 0.47;
      p.x = p.x * cos(uYaw) + sin(uYaw) * 0.045;
      p.y = 0.47 + dy * cos(uPitch);
      p.y = p.y < 0.55 ? 0.165 + (p.y - 0.165) * 1.21 : 0.63085 + (p.y - 0.55) * 0.8445;
      p.x *= uBodyScale;
      p.y = 0.5 + (p.y - 0.5) * uBodyScale;
      float shimmer = 0.80 + 0.20 * sin(seed * 23.0 + uTime * 1.7);
      vColor = mix(vec3(1.0, 0.38, 0.02), vec3(1.0, 0.88, 0.42), brightness * uLight);
      vAlpha = brightness * shimmer * uLight * (0.46 + uEnergy * 0.24);
      vAlpha *= 1.0 - sin(uScatter * 3.14159265);
      size = size * (1.0 + uLight * (2.6 + uEnergy * 0.6));
      vHalo = 1.0;
    } else if (kind > 8.5) {
      // Sternum Nexus / Brilliant Cyan Starburst Jewel Core
      float dy = p.y - 0.47;
      float cy = cos(uYaw), sy = sin(uYaw);
      p.x = p.x * cy + p.z * sy + sin(uYaw) * 0.015;
      p.y = 0.47 + dy * cos(uPitch);
      p.y += sin(uTime * 1.25) * 0.0015;
      float flare = sin(seed * 40.0 + uTime * 5.0) * 0.20;
      vColor = mix(vec3(0.20, 0.95, 1.0), vec3(0.95, 1.0, 1.0), 0.75 + flare);
      vAlpha = brightness * (0.45 + uLight * 0.85 + flare + uEnergy * 0.35);
      size = size * (1.05 + uLight * 0.45 + uEnergy * 0.30);
      vHalo = 1.0;
      p.y = p.y < 0.55 ? 0.165 + (p.y - 0.165) * 1.21 : 0.63085 + (p.y - 0.55) * 0.8445;
      p.x *= uBodyScale;
      p.y = 0.5 + (p.y - 0.5) * uBodyScale;
    } else if (kind < 3.5 || kind > 4.5) {
      // Body elements (head scanlines, neck, shoulders, golden tree)
      float dy = p.y - 0.47;
      float cy = cos(uYaw), sy = sin(uYaw);
      float xx = p.x * cy + p.z * sy;
      float zz = p.z * cy - p.x * sy;
      p.x = xx;
      p.y = 0.47 + dy * cos(uPitch) - zz * sin(uPitch);
      p.z = zz;

      float headWeight = 1.0 - smoothstep(0.55, 0.87, p.y);
      p.x += sin(uYaw) * 0.045 * headWeight;
      p.y += sin(uTime * 1.25) * 0.0015;

      float erupt = sin(uScatter * 3.14159265);
      float orbit = seed * 153.0 + uTime * 3.0;
      float radius = 0.025 + fract(seed * 61.0) * 0.21;
      p.x = mix(p.x, sin(orbit) * radius, erupt);
      p.y = mix(p.y, 0.85 + cos(orbit) * radius * 0.42, erupt);
      p.x *= 1.0 + sin(uTime * 1.4) * 0.0015 + uEnergy * 0.005;
      vAlpha *= 0.88 + 0.12 * sin(seed * 41.0 + uTime * 1.9);

      if (kind > 1.5 && kind < 2.5) {
        // Crisp silhouette rim outline
        vAlpha *= 1.95;
        vHalo = 0.95;
      }
      if (kind > 2.5 && kind < 3.5) {
        // Subtle outer rim glow dust
        p.x += sin(seed * 13.0 + uTime * 0.56) * 0.003;
        p.y -= fract(seed * 41.0 + uTime * 0.022) * 0.015;
        vAlpha *= 0.50 + 0.35 * sin(seed * 17.0 + uTime * 1.5);
        vHalo = 0.60;
      }
      if (kind > 4.5 && kind < 5.5) {
        // Branching Golden Neural Tree in throat
        float pulse = sin(p.y * 28.0 - uTime * 6.0 + seed * 4.0);
        vec3 hotGold = mix(uGold, vec3(1.0, 0.96, 0.70), 0.55 + 0.35 * pulse);
        vColor = hotGold;
        vAlpha = brightness * (0.95 + 0.25 * pulse) * (0.25 + uLight * 1.15);
        size = size * (1.15 + 0.20 * pulse);
        vHalo = 0.90;

        // Düşünərkən sinədən başa doğru qaçan parlaq sinir impulsları.
        // aPosition.y istifadə edirik (0.54 boğaz üstü ... 0.885 sinə), çünki
        // p.y artıq fırlanma və əyilmə ilə dəyişib - impuls titrəyərdi.
        if (uThink > 0.001) {
          float along = (0.885 - aPosition.y) / 0.345;          // 0 = sinə, 1 = baş
          float wave = fract(along * 1.4 - uTime * 0.85);
          float spark = pow(wave, 14.0) * uThink;
          vColor = mix(vColor, vec3(1.0, 1.0, 0.88), spark * 0.85);
          vAlpha *= 1.0 + spark * 3.2;
          size *= 1.0 + spark * 1.1;
        }
      }

      // Apply vertical body spline scaling
      p.y = p.y < 0.55 ? 0.165 + (p.y - 0.165) * 1.21 : 0.63085 + (p.y - 0.55) * 0.8445;

      if (kind < 1.5) {
        // Horizontal facial contour scanlines:
        // Fiery amber and molten gold glow across the mouth, nose, and lower cheeks!
        float faceDistX = abs(p.x) / 0.145;
        float faceDistY = (p.y - 0.449) / 0.118;
        float warm = exp(-faceDistX * faceDistX - faceDistY * faceDistY) * smoothstep(0.01, 0.10, aPosition.z);
        warm = clamp(warm, 0.0, 1.0);

        vec3 hotAmber = vec3(1.0, 0.36, 0.01);
        vec3 hotGold = vec3(1.0, 0.53, 0.04);
        vec3 faceColor = mix(uBlue, hotAmber, smoothstep(0.04, 0.44, warm));
        faceColor = mix(faceColor, hotGold, smoothstep(0.52, 0.95, warm));

        // Forehead and skull glow with brilliant electric cyan!
        float forehead = (1.0 - smoothstep(0.28, 0.48, p.y)) * step(0.16, p.y);
        vec3 neonBlue = mix(uBlue, vec3(0.35, 0.92, 1.0), forehead * 0.65);

        // İşıq sönəndə isti rəng də getsin - yoxsa narıncı iz qalır.
        vColor = mix(neonBlue, faceColor, smoothstep(0.10, 0.65, warm) * (0.04 + uLight * 0.96));
        // İnteryer solğun qalır ki, ayrı-ayrı üz konturları seçilsin; parlaqlıq
        // siluet konturunda (kind 2) və narıncı nüvədə toplanır.
        vAlpha = brightness * (0.80 + warm * (0.05 + uLight * 2.45) + forehead * 0.14);
        size = size * (0.98 + warm * (0.20 + uLight * 0.80) + forehead * 0.10);
      }

      p.x *= uBodyScale;
      p.y = 0.5 + (p.y - 0.5) * uBodyScale;
      vAlpha *= 1.0 - smoothstep(0.94, 1.075, p.y);
    } else {
      // Cosmic ambient stars (kind == 4)
      p.x += sin(seed * 6.0 + uTime * 0.12) * 0.012;
      p.y -= fract(seed + uTime * 0.004) * 0.04;
      vAlpha *= 0.50 + 0.50 * sin(seed * 71.0 + uTime * 0.5);
    }

    vAlpha += uPulse * brightness * 0.25;
    float aspect = uResolution.x / uResolution.y;
    gl_Position = vec4(p.x * 2.0 / aspect, 1.0 - p.y * 2.0, 0.0, 1.0);
    gl_PointSize = max(1.0, size * uDpr * (uResolution.y / 800.0) * (uPass > 0.5 ? 2.9 : 1.35));
    if (uPass > 0.5) vAlpha *= 0.22;
  }
  `;

  const FS = `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHalo;
  uniform float uPass, uLine;
  void main() {
    if (uLine > 0.5) {
      gl_FragColor = vec4(vColor, vAlpha * 0.50);
      return;
    }
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float a = uPass > 0.5 ? exp(-d * d * 4.0) * (1.0 - smoothstep(0.7, 1.0, d)) : 1.0 - smoothstep(0.2, 1.0, d);
    gl_FragColor = vec4(vColor, vAlpha * a);
  }
  `;

  const maskVS = `attribute vec2 aPosition;uniform float uAspect,uYaw,uBodyScale;void main(){float x=aPosition.x+sin(uYaw)*.045*(1.-smoothstep(.55,.87,aPosition.y));float y=aPosition.y<.55?.165+(aPosition.y-.165)*1.21:.63085+(aPosition.y-.55)*.8445;x*=uBodyScale;y=.5+(y-.5)*uBodyScale;gl_Position=vec4(x*2./uAspect,1.-y*2.,0.,1.);}`;
  const maskFS = `precision mediump float;void main(){gl_FragColor=vec4(.001,.003,.010,1.);}`;
  const SCREEN_VS = `attribute vec2 aQuad;varying vec2 vUv;void main(){vUv=aQuad*.5+.5;gl_Position=vec4(aQuad,0.,1.);}`;
  const BLUR_FS = `precision mediump float;varying vec2 vUv;uniform sampler2D uImage;uniform vec2 uStep;
    void main(){vec3 c=texture2D(uImage,vUv).rgb*.227027;
    c+=(texture2D(uImage,vUv+uStep*1.384615).rgb+texture2D(uImage,vUv-uStep*1.384615).rgb)*.316216;
    c+=(texture2D(uImage,vUv+uStep*3.230769).rgb+texture2D(uImage,vUv-uStep*3.230769).rgb)*.070270;
    gl_FragColor=vec4(c,1.);}`;
  const COMPOSITE_FS = `precision mediump float;varying vec2 vUv;uniform sampler2D uImage,uBloom;
    void main(){
      vec3 c = texture2D(uImage, vUv).rgb;
      vec3 bloom = texture2D(uBloom, vUv).rgb;
      c += bloom * 0.65;
      c += mix(vec3(0.001, 0.003, 0.010), vec3(0.022, 0.022, 0.050), smoothstep(0.25, 1.0, vUv.y));
      gl_FragColor = vec4(c, 1.0);
    }`;

  const PROFILE = [
    [.165, 0, .0], [.17, .044, .035], [.18, .083, .067], [.20, .126, .105], [.23, .154, .129],
    [.27, .166, .145], [.32, .170, .15], [.365, .166, .15], [.41, .152, .143], [.46, .132, .126],
    [.50, .106, .105], [.535, .072, .073], [.55, .059, .066], [.583, .060, .063], [.612, .075, .066],
    [.638, .108, .077], [.665, .163, .089], [.695, .250, .112], [.735, .340, .13], [.790, .412, .148], [.86, .443, .154], [1.07, .455, .154]
  ];

  function shape(y) {
    for (let i = 1; i < PROFILE.length; i++) {
      if (y <= PROFILE[i][0]) {
        const a = PROFILE[i - 1], b = PROFILE[i], prev = PROFILE[Math.max(0, i - 2)], next = PROFILE[Math.min(PROFILE.length - 1, i + 1)];
        const h = b[0] - a[0], t = (y - a[0]) / h;
        return [1, 2].map(k => {
          const m0 = (b[k] - prev[k]) / (b[0] - prev[0]), m1 = (next[k] - a[k]) / (next[0] - a[0]);
          return Math.max(0, (2 * t * t * t - 3 * t * t + 1) * a[k] + (t * t * t - 2 * t * t + t) * h * m0 + (-2 * t * t * t + 3 * t * t) * b[k] + (t * t * t - t * t) * h * m1);
        });
      }
    }
    return PROFILE.at(-1).slice(1);
  }

  class NeonRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!gl) throw new Error('WebGL işə düşmədi. Chrome və ya Edge-də hardware acceleration aktiv olmalıdır.');
      this.gl = gl;
      this.program = this.compile(VS, FS);
      this.maskProgram = this.compile(maskVS, maskFS);
      this.blurProgram = this.compile(SCREEN_VS, BLUR_FS);
      this.compositeProgram = this.compile(SCREEN_VS, COMPOSITE_FS);
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.targets = [];
      this.bodyScale = 1.0;
      this.uniforms = {};
      for (const name of ['uResolution', 'uTime', 'uYaw', 'uPitch', 'uLight', 'uPulse', 'uScatter', 'uEnergy', 'uPass', 'uDpr', 'uBlue', 'uGold', 'uLine', 'uBodyScale', 'uThink']) {
        this.uniforms[name] = gl.getUniformLocation(this.program, name);
      }
      this.pos = gl.getAttribLocation(this.program, 'aPosition');
      this.data = gl.getAttribLocation(this.program, 'aData');
      this.maskPos = gl.getAttribLocation(this.maskProgram, 'aPosition');
      this.build();
      this.resize();
      this.lost = false;
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
      canvas.addEventListener('webglcontextrestored', () => location.reload());
    }

    compile(vs, fs) {
      const gl = this.gl, program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(program, s);
        gl.deleteShader(s);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      return program;
    }

    buffer(values) {
      const gl = this.gl, b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
      return { buffer: b, count: values.length / 7 };
    }

    build() {
      const bg = [], network = [], body = [], mask = [];
      const put = (arr, x, y, z, kind, alpha, size) => arr.push(x, y, z, kind, Math.random() * 100, alpha, size);

      // 1. Crystalline mountain terrain with triangulated plexus mesh on left and right flanks
      const buildMountainSide = (xMin, xMax, cols, rows) => {
        const grid = [];
        for (let r = 0; r < rows; r++) {
          const rowArr = [];
          const b = r / (rows - 1);
          for (let c = 0; c < cols; c++) {
            const u = c / (cols - 1);
            const x = xMin + u * (xMax - xMin);
            const jx = (Math.sin(c * 17.1 + r * 31.7) * 0.5) * ((xMax - xMin) / cols) * 0.35;
            const jb = (Math.cos(c * 23.3 + r * 19.5) * 0.5) * (1.0 / rows) * 0.28;
            rowArr.push({ x: x + jx, b: Math.max(0, Math.min(1, b + jb)), z: (Math.random() - 0.5) * 0.012 });
          }
          grid.push(rowArr);
        }

        // Triangulated plexus line segments
        for (let r = 0; r < rows - 1; r++) {
          for (let c = 0; c < cols - 1; c++) {
            const p0 = grid[r][c], p1 = grid[r][c + 1], p2 = grid[r + 1][c], p3 = grid[r + 1][c + 1];
            put(network, p0.x, p0.b, p0.z, 0, 0.20, 1);
            put(network, p1.x, p1.b, p1.z, 0, 0.20, 1);

            put(network, p0.x, p0.b, p0.z, 0, 0.20, 1);
            put(network, p2.x, p2.b, p2.z, 0, 0.20, 1);

            put(network, p1.x, p1.b, p1.z, 0, 0.20, 1);
            put(network, p2.x, p2.b, p2.z, 0, 0.20, 1);
          }
        }

        // Constellation star nodes at vertices
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const pt = grid[r][c];
            put(bg, pt.x, pt.b, pt.z, 0, 0.80 + Math.random() * 0.40, 2.0 + Math.random() * 0.8);
          }
        }
      };

      // Left mountain flank: x from -2.6 to -0.20 (smooth descent)
      buildMountainSide(-2.6, -0.20, 140, 44);
      // Right mountain flank: x from 0.20 to 2.6 (smooth descent)
      buildMountainSide(0.20, 2.6, 140, 44);

      // Fine dust follows the same animated surface as the wire mesh.
      for (let i = 0; i < 46000; i++) {
        const x = (Math.random() - 0.5) * 5.2;
        const band = Math.random();
        const drift = (Math.random() - 0.5) * 0.055;
        put(bg, x, band, drift, 0, 0.20 + Math.random() * 0.55, 0.65 + Math.random() * 1.1);
      }

      // Distant celestial background stars
      for (let i = 0; i < 500; i++) {
        put(bg, (Math.random() - 0.5) * 5.2, Math.random() * 0.60, 0, 4, 0.15 + Math.random() * 0.45, 1.25);
      }

      // 2. 5 Concentric Aura Rings (Halo) behind the head
      const auraRadii = [0.235, 0.290, 0.345, 0.400, 0.455];
      for (let k = 0; k < auraRadii.length; k++) {
        const rad = auraRadii[k];
        const segs = 520;
        for (let s = 0; s < segs; s++) {
          const a1 = (s / segs) * Math.PI * 2;
          const a2 = ((s + 1) / segs) * Math.PI * 2;
          const x1 = Math.cos(a1) * rad, y1 = Math.sin(a1) * rad;
          const x2 = Math.cos(a2) * rad, y2 = Math.sin(a2) * rad;
          put(network, x1, y1, 0, 7, 0.55 - k * 0.055, 1);
          put(network, x2, y2, 0, 7, 0.55 - k * 0.055, 1);
        }
        const nodeCount = 90 + k * 20;
        for (let n = 0; n < nodeCount; n++) {
          const a = (n / nodeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.03;
          const rJitter = rad + (Math.random() - 0.5) * 0.005;
          const x = Math.cos(a) * rJitter, y = Math.sin(a) * rJitter;
          put(bg, x, y, 0, 7, 0.70 + Math.random() * 0.35, 0.65 + Math.random() * 0.45);
        }
      }

      // 3. Face horizontal contour scanlines (parallel, curved, distinct lines with dark eye hollows)
      for (let row = 0; row < 46; row++) {
        const y = 0.175 + (row / 45) * 0.360;
        const [rx, rz] = shape(y);
        const ptCount = Math.round(300 + rx * 760);
        for (let i = 0; i < ptCount; i++) {
          const a = -Math.PI / 2 + (i / (ptCount - 1)) * Math.PI;
          const x = Math.sin(a) * rx;
          const front = Math.cos(a);
          if (front < 0.01) continue;

          // Latitude curve down in the front (wrapping around the 3D head form)
          const curvature = 0.028 * Math.sin(((y - 0.17) / 0.36) * Math.PI) * Math.pow(front, 1.25);
          let yy = y - curvature;
          yy += Math.exp(-Math.pow((y - 0.425) / 0.065, 2)) * (0.014 * Math.exp(-Math.pow(x / 0.032, 2)) - 0.005 * Math.exp(-Math.pow((Math.abs(x) - 0.052) / 0.026, 2)));

          // Nose bridge protrusion
          let z = front * rz;
          const noseDistX = x / 0.024;
          const noseDistY = (y - 0.435) / 0.045;
          const noseFactor = Math.exp(-noseDistX * noseDistX - noseDistY * noseDistY);
          z += noseFactor * 0.020;

          // Elongated almond eye socket hollows
          const eyeDistX = (Math.abs(x) - 0.065) / 0.032;
          const eyeDistY = (y - 0.365) / 0.024;
          const eyeHollow = Math.exp(-eyeDistX * eyeDistX - eyeDistY * eyeDistY);

          // Cheekbone highlight
          const cheekDistX = (Math.abs(x) - 0.090) / 0.035;
          const cheekDistY = (y - 0.405) / 0.038;
          const cheek = Math.exp(-cheekDistX * cheekDistX - cheekDistY * cheekDistY);

          let alpha = (0.52 + front * 0.46) * (1.0 - eyeHollow * 0.38) + cheek * 0.26;
          alpha = Math.max(0.03, Math.min(1.0, alpha));
          const ptSize = 0.85 + (1.0 - eyeHollow * 0.5) * 0.20;

          put(body, x, yy, z, 1, alpha, ptSize);
        }
      }

      // 4. Outer head and shoulder contour rim (crisp radiant glowing silhouette edge)
      for (let side of [-1, 1]) {
        for (let i = 0; i < 1400; i++) {
          const y = 0.165 + (i / 1399) * 0.90, [rx] = shape(y);
          put(body, side * rx, y, 0.02, 2, 1.55, 4.20);
        }
        for (let i = 0; i < 500; i++) {
          const y = 0.165 + Math.random() * 0.85, [rx] = shape(y);
          const offset = Math.pow(Math.random(), 2) * 0.022;
          put(body, side * (rx + offset), y, 0, 3, 0.45 + Math.random() * 0.30, 1.5);
        }
      }

      // 5. Crown Particle Fountain / Plume (erupting upward from top of skull)
      for (let i = 0; i < 1800; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.8) * 0.070;
        const x = Math.cos(a) * r;
        const y = 0.150 + Math.random() * 0.032;
        put(body, x, y, (Math.random() - 0.5) * 0.04, 8, 0.55 + Math.random() * 0.45, 1.35 + Math.random() * 0.5);
      }

      // 6. Curved neck and clavicle lines flow into shoulders
      for (let side of [-1, 1]) for (let line = 0; line < 18; line++) {
        const f = line / 17;
        for (let i = 0; i < 220; i++) {
          const t = i / 219;
          const y = 0.535 + t * 0.34;
          const x = shape(y)[0] * (1 - f * 0.48);
          put(body, side * x, y + f * 0.085 * Math.pow(t, 2), 0.075 + Math.sin(t * Math.PI) * 0.035, 1, 0.45 + Math.random() * 0.20, 1.45);
        }
      }

      // 7. Chest arcs rise toward shoulder and wrap around pectorals
      for (let side of [-1, 1]) for (let line = 0; line < 8; line++) {
        const rx = 0.198 - line * 0.0180, ry = 0.210 - line * 0.0170;
        for (let i = 0; i < 150; i++) {
          const a = Math.PI + i / 149 * Math.PI;
          // Radiusu bir az dalgalandiririq: ic-ice mukemmel yarimdaireler
          // sunileşdirirdi, referansda sine seyrek toxumadir.
          const wob = 1 + Math.sin(a * 5.0 + line * 2.1) * 0.055;
          put(body, side * (0.238 + Math.cos(a) * rx * wob), 1.025 + Math.sin(a) * ry * wob, 0.1, 1, 0.24 + Math.random() * 0.20, 1.30);
        }
      }

      // 8. Branching Golden Lightning / Neural Tree down throat to sternum
      const goldenPaths = [
        t => ({ x: Math.sin(t * 32) * 0.005 * (1 - t * 0.3), y: 0.540 + t * 0.345, z: 0.125 }),
        t => ({ x: -0.008 - t * 0.032 + Math.sin(t * 22) * 0.005, y: 0.555 + t * 0.330, z: 0.120 }),
        t => ({ x: 0.008 + t * 0.032 - Math.sin(t * 22) * 0.005, y: 0.555 + t * 0.330, z: 0.120 }),
        t => ({ x: -0.022 + Math.sin(t * 28) * 0.006 * (1 - t), y: 0.640 + t * 0.245, z: 0.118 }),
        t => ({ x: 0.022 - Math.sin(t * 28) * 0.006 * (1 - t), y: 0.640 + t * 0.245, z: 0.118 }),
        t => ({ x: -0.004 + Math.sin(t * 40) * 0.008 * t, y: 0.610 + t * 0.275, z: 0.122 }),
        t => ({ x: 0.004 - Math.sin(t * 40) * 0.008 * t, y: 0.610 + t * 0.275, z: 0.122 })
      ];
      for (const pathFn of goldenPaths) {
        for (let i = 0; i < 110; i++) {
          const t = i / 109;
          const pt = pathFn(t);
          put(body, pt.x, pt.y, pt.z, 5, 0.80 + Math.random() * 0.25, 1.55 + Math.random() * 0.4);
        }
      }

      // 8b. Üz nüvəsinin narıncı parıltı buludu (konturlardan əvvəl çəkilir)
      for (let i = 0; i < 560; i++) {
        const a = Math.random() * Math.PI * 2;
        // Bərabər disk sıxlığı; parlaqlıq radiusla düşür, ona görə mərkəz isti,
        // kənarlar yumşaq sönür - kəskin ləkə yox, enerji buludu alınır.
        const r = Math.sqrt(Math.random());
        const x = Math.cos(a) * r * 0.125;
        const y = 0.400 + Math.sin(a) * r * 0.074;
        put(body, x, y, 0.0, 10, Math.pow(1 - r, 0.9), 3.4 + (1 - r) * 3.6);
      }

      // 9. Radiant Sternum Nexus (Brilliant Cyan Starburst Jewel Core)
      const nexusY = 0.885;
      for (let i = 0; i < 35; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 1.6) * 0.014;
        put(body, Math.cos(a) * r, nexusY + Math.sin(a) * r, 0.135, 9, 0.95 + Math.random() * 0.05, 1.65);
      }
      for (let ray = 0; ray < 12; ray++) {
        const angle = ray * (Math.PI / 6);
        const rayLen = ray % 3 === 0 ? 0.040 : ray % 2 === 0 ? 0.028 : 0.018;
        for (let i = 1; i <= 12; i++) {
          const t = i / 12;
          const r = t * rayLen;
          put(body, Math.cos(angle) * r, nexusY + Math.sin(angle) * r, 0.135, 9, (1.0 - t * 0.50) * 0.95, 1.40);
        }
      }

      // 10. Head and torso occlusion mask
      for (let i = 0; i < 190; i++) {
        const y = 0.166 + i / 189 * 0.904, [rx] = shape(y);
        mask.push(-rx, y, rx, y);
      }

      this.background = this.buffer(bg);
      this.network = this.buffer(network);
      this.body = this.buffer(body);
      this.maskBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.maskBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(mask), this.gl.STATIC_DRAW);
      this.maskCount = mask.length / 2;
      this.count = this.background.count + this.body.count;
    }

    setQuality(scale) {
      this.qualityScale = scale;
      this.resize();
    }

    resize() {
      this.width = Math.max(1, innerWidth);
      this.height = Math.max(1, innerHeight);
      this.bodyScale = Math.min(1.0, this.width / this.height / 1.02);
      this.dpr = Math.min(devicePixelRatio || 1, 1.5) * (this.qualityScale || 1);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      for (const target of this.targets) {
        this.gl.deleteTexture(target.texture);
        this.gl.deleteFramebuffer(target.framebuffer);
      }
      this.targets = [
        this.target(this.canvas.width, this.canvas.height),
        this.target(Math.ceil(this.canvas.width / 3), Math.ceil(this.canvas.height / 3)),
        this.target(Math.ceil(this.canvas.width / 3), Math.ceil(this.canvas.height / 3))
      ];
    }

    target(width, height) {
      const gl = this.gl, texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Qrafik yaddaşı çatmır. Brauzeri yenidən başlat.');
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { texture, framebuffer, width, height };
    }

    fullscreenPass(program, target, input, setup) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer || null);
      gl.viewport(0, 0, target?.width || this.canvas.width, target?.height || this.canvas.height);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      const location = gl.getAttribLocation(program, 'aQuad');
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
      setup();
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(location);
    }

    drawGroup(group, lines = false) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
      gl.enableVertexAttribArray(this.pos);
      gl.enableVertexAttribArray(this.data);
      gl.vertexAttribPointer(this.pos, 3, gl.FLOAT, false, 28, 0);
      gl.vertexAttribPointer(this.data, 4, gl.FLOAT, false, 28, 12);
      gl.uniform1f(this.uniforms.uLine, lines ? 1 : 0);
      if (lines) {
        gl.uniform1f(this.uniforms.uPass, 0);
        gl.drawArrays(gl.LINES, 0, group.count);
        return;
      }
      gl.uniform1f(this.uniforms.uPass, 1);
      gl.drawArrays(gl.POINTS, 0, group.count);
      gl.uniform1f(this.uniforms.uPass, 0);
      gl.drawArrays(gl.POINTS, 0, group.count);
    }

    render(state) {
      if (this.lost) return;
      const gl = this.gl, u = this.uniforms;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[0].framebuffer);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.001, 0.003, 0.010, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(this.program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform2f(u.uResolution, this.width, this.height);
      gl.uniform1f(u.uDpr, this.dpr);
      for (const [key, val] of Object.entries({
        uTime: state.time,
        uYaw: state.yaw,
        uPitch: state.pitch,
        uLight: state.light,
        uPulse: state.pulse,
        uScatter: state.scatter,
        uEnergy: state.energy,
        uThink: state.think || 0
      })) {
        gl.uniform1f(u[key], val);
      }
      gl.uniform1f(u.uBodyScale, this.bodyScale);
      gl.uniform3fv(u.uBlue, state.blue);
      gl.uniform3fv(u.uGold, state.gold);

      // 1. Draw background and wireframe networks (terrain + aura rings)
      this.drawGroup(this.background);
      this.drawGroup(this.network, true);

      // 2. Occlude behind the humanoid silhouette
      gl.disable(gl.BLEND);
      gl.useProgram(this.maskProgram);
      gl.disableVertexAttribArray(this.pos);
      gl.disableVertexAttribArray(this.data);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.maskBuffer);
      gl.enableVertexAttribArray(this.maskPos);
      gl.vertexAttribPointer(this.maskPos, 2, gl.FLOAT, false, 8, 0);
      gl.uniform1f(gl.getUniformLocation(this.maskProgram, 'uAspect'), this.width / this.height);
      gl.uniform1f(gl.getUniformLocation(this.maskProgram, 'uYaw'), state.yaw);
      gl.uniform1f(gl.getUniformLocation(this.maskProgram, 'uBodyScale'), this.bodyScale);
      if (Math.sin(state.scatter * Math.PI) < 0.2) {
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.maskCount);
      }
      gl.disableVertexAttribArray(this.maskPos);

      // 3. Draw body on top
      gl.useProgram(this.program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      this.drawGroup(this.body);
      gl.disableVertexAttribArray(this.pos);
      gl.disableVertexAttribArray(this.data);
      gl.disable(gl.BLEND);

      // 4. Bloom passes
      this.fullscreenPass(this.blurProgram, this.targets[1], this.targets[0].texture, () => {
        gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'uStep'), 2.2 / this.targets[1].width, 0);
      });
      this.fullscreenPass(this.blurProgram, this.targets[2], this.targets[1].texture, () => {
        gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'uStep'), 0, 2.2 / this.targets[2].height);
      });

      // 5. Composite pass
      this.fullscreenPass(this.compositeProgram, null, this.targets[0].texture, () => {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.targets[2].texture);
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBloom'), 1);
      });
    }
  }

  window.NeonRenderer = NeonRenderer;
})();

