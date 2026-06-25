import { useEffect, useRef } from 'react';

/* ---------------------------------------------------------------
 * Shader de background para /jogar
 * Baseado no padrão "Phosphor" de Xor (documentado em gmshaders.com/p/phosphor)
 * — glow volumétrico em WebGL2.
 * CSS filter: hue-rotate(180deg) adapta a paleta quente original
 * (laranja/amarelo) para o azul/dourado RTM.
 * --------------------------------------------------------------- */

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec3 uRes;
uniform float uTime;
out vec4 outColor;

void main() {
  vec3 col = vec3(0.0);
  float z = 0.0, d = 0.0;
  float t = uTime * 0.20;

  for(float i = 0.0; i < 80.0; i++) {
    vec3 p = z * normalize(gl_FragCoord.xyz * 2.0 - vec3(uRes.xy, uRes.y));
    vec3 a = normalize(cos(vec3(4.0, 2.0, 0.0) + t - d * 8.0));
    p.z += 5.0;
    a = a * dot(a, p) - cross(a, p);
    for(float j = 2.0; j <= 9.0; j += 1.0)
      a += sin(a * j + t).yzx / j;
    d = 0.05 * abs(length(p) - 3.0) + 0.04 * abs(a.y);
    z += d;

    // Razão RGB fixa → matiz SEMPRE azul (#61a8dd), só brilho varia.
    // cos() foi removido pois ciclava por roxo/rosa/verde.
    float glow = z / max(d, 0.001);
    col += vec3(0.08, 0.42, 1.75) * glow;

    // Acento dourado apenas no núcleo geométrico (d < 0.05)
    float core = exp(-d * 10.0) * z;
    col.r += core * 1.10;
    col.g += core * 0.55;
  }

  outColor = vec4(tanh(col / 1e4), 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[Shader]', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function buildProgram(gl: WebGL2RenderingContext) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[Shader]', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

export function PlayShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return; // graceful: cai no fallback CSS

    const prog = buildProgram(gl);
    if (!prog) return;

    // fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');

    let w = 0, h = 0, raf = 0;
    const t0 = performance.now();
    let visible = !document.hidden;

    const resize = () => {
      // renderiza em metade da resolução pra poupar GPU (ainda fica bonito)
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.floor(window.innerWidth * dpr * 0.6);
      h = Math.floor(window.innerHeight * dpr * 0.6);
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      gl.useProgram(prog);
      gl.uniform3f(uRes, w, h, 1);
      gl.uniform1f(uTime, (now - t0) * 0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const onVis = () => { visible = !document.hidden; };
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [reducedMotion]);

  return (
    <div className="play-bg" aria-hidden>
      {/* canvas WebGL2 — filtro CSS adapta paleta quente→RTM azul */}
      {!reducedMotion && <canvas ref={canvasRef} className="play-bg-canvas" />}
      {/* fallback CSS orbs para quando WebGL não estiver disponível */}
      <div className="play-bg-orb play-bg-orb--a" />
      <div className="play-bg-orb play-bg-orb--b" />
      <div className="play-bg-orb play-bg-orb--c" />
      <div className="play-bg-vignette" />
    </div>
  );
}
