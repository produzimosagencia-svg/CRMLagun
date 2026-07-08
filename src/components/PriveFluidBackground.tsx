import { useEffect, useRef } from 'react';

// Fundo fluido animado do Privê — "seda líquida" escura renderizada na GPU.
// Domain-warped fbm: mesma técnica dos fundos de fumaça/tecido em movimento.
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 1.6;
  float t = u_time * 0.045;

  // Deformação de domínio em duas camadas — cria as dobras de "seda"
  vec2 q = vec2(fbm(p + t * 0.7), fbm(p + vec2(5.2, 1.3) - t * 0.4));
  vec2 r = vec2(
    fbm(p + 3.5 * q + vec2(1.7, 9.2) + t),
    fbm(p + 3.5 * q + vec2(8.3, 2.8) - t * 0.6)
  );
  float f = fbm(p + 3.0 * r);

  // Paleta: preto absoluto -> azul-aço escuro -> brilho metálico frio
  vec3 deep  = vec3(0.010, 0.012, 0.020);
  vec3 mid   = vec3(0.10, 0.13, 0.19);
  vec3 sheen = vec3(0.55, 0.65, 0.80);

  vec3 col = mix(deep, mid, smoothstep(0.15, 0.85, f));
  // Realce especular estreito nas cristas das dobras
  float ridge = smoothstep(0.50, 0.68, f) * smoothstep(0.90, 0.72, f);
  col += sheen * ridge * ridge;

  // Leve ganho de gama para as dobras respirarem no preto
  col = pow(col, vec3(0.85));

  // Vinheta
  float d = distance(uv, vec2(0.5));
  col *= 1.0 - d * 0.7;

  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export default function PriveFluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');

    let raf = 0;
    const start = performance.now();

    function resize() {
      // Meia resolução: o fundo é desfocado por natureza e a GPU agradece
      const scale = Math.min(window.devicePixelRatio, 2) * 0.5;
      const w = Math.floor(canvas.clientWidth * scale);
      const h = Math.floor(canvas.clientHeight * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }

    function frame(now: number) {
      resize();
      gl!.uniform2f(uRes, canvas.width, canvas.height);
      gl!.uniform1f(uTime, (now - start) / 1000);
      gl!.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden
    />
  );
}
