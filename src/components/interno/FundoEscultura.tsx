import { useEffect, useRef } from 'react';

/**
 * Fundo do login: escultura dourada de fitas finas que se entrelaçam num laço
 * em volta do cartão e se desmancham em areia e contas nas pontas, sobre preto.
 * O mouse deforma e espalha os grãos por onde passa; parado, tudo volta ao lugar.
 *
 * Tudo é uma nuvem de pontos (three.js) calculada uma vez; o movimento é feito
 * no shader. O three é carregado só aqui, para não pesar o resto do sistema.
 */

const TIPO_FIO = 0;
const TIPO_AREIA = 1;
const TIPO_CONTA = 2;

const VERTICE = /* glsl */ `
  uniform float uTempo;
  uniform vec2 uMouse;
  uniform float uForca;
  uniform float uPixel;
  attribute float aSemente;
  attribute float aTipo;
  attribute float aLuz;
  attribute float aCauda;
  varying float vLuz;
  varying float vTipo;
  varying float vAlfa;

  void main() {
    vec3 p = position;
    float t = uTempo;

    // Respiração: a escultura ondula devagar ao longo do comprimento.
    p.y += sin(p.x * 1.4 + t * 0.55 + aSemente * 0.6) * 0.035;
    p.z += cos(p.x * 1.1 + t * 0.45) * 0.05;

    // Nas pontas a areia flutua solta.
    float solto = aCauda * (aTipo > 0.5 ? 1.0 : 0.35);
    p += vec3(
      sin(t * 0.31 + aSemente * 6.283),
      cos(t * 0.27 + aSemente * 12.1),
      sin(t * 0.22 + aSemente * 3.7)
    ) * 0.09 * solto;

    vec4 mundo = modelMatrix * vec4(p, 1.0);

    // Mouse: empurra para fora e torce em profundidade, mais forte perto dele.
    vec2 dir = mundo.xy - uMouse;
    float d = length(dir);
    float f = uForca * exp(-d * d / 0.42);
    vec2 n = dir / max(d, 0.0001);
    vec2 giro = vec2(-n.y, n.x);
    mundo.xy += (n * 0.42 + giro * 0.22 * (aSemente - 0.5)) * f * (0.55 + aSemente);
    mundo.z += f * 0.9 * (aSemente - 0.5);

    vec4 mv = viewMatrix * mundo;
    gl_Position = projectionMatrix * mv;

    float tamanho = aTipo > 1.5 ? 4.0 + aSemente * 6.0 : (aTipo > 0.5 ? 1.0 + aSemente * 2.0 : 1.8);
    gl_PointSize = tamanho * uPixel * (6.5 / -mv.z);

    vLuz = aLuz;
    vTipo = aTipo;
    vAlfa = (1.0 - smoothstep(0.82, 1.0, aCauda)) * (0.75 + 0.25 * sin(t * 0.8 + aSemente * 20.0));
  }
`;

const FRAGMENTO = /* glsl */ `
  varying float vLuz;
  varying float vTipo;
  varying float vAlfa;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;

    vec3 sombra = vec3(0.32, 0.21, 0.07);
    vec3 ouro = vec3(0.93, 0.71, 0.30);
    vec3 luz = vec3(1.0, 0.94, 0.74);
    vec3 cor = mix(sombra, ouro, smoothstep(0.0, 0.55, vLuz));
    cor = mix(cor, luz, smoothstep(0.62, 1.0, vLuz));

    float a;
    if (vTipo > 1.5) {
      // Conta: esfera com brilho no alto à esquerda.
      float brilho = smoothstep(0.32, 0.0, length(c - vec2(-0.14, 0.14)));
      float borda = smoothstep(0.5, 0.36, r);
      cor = mix(ouro * 0.45, luz, brilho * 0.9 + 0.1);
      a = borda * 0.95;
    } else if (vTipo > 0.5) {
      a = smoothstep(0.5, 0.1, r) * 0.7;
    } else {
      a = smoothstep(0.5, 0.0, r) * 0.5;
    }
    a *= vAlfa;
    gl_FragColor = vec4(cor * a, a);
  }
`;

// Semente fixa: a escultura sai sempre igual.
function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function FundoEscultura({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caixa = ref.current;
    if (!caixa) return;
    let desmontado = false;
    let limpar = () => {};

    import('three').then((THREE) => {
      if (desmontado) return;
      const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
      } catch {
        return; // sem WebGL: fica só o fundo preto
      }
      const pixel = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(pixel);
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      caixa.appendChild(renderer.domElement);

      const cena = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      camera.position.set(0, 0, 6.5);

      // ── Caminho: cauda esquerda → laço de 1,5 volta em volta do cartão → cauda direita ──
      const R = 1.15;
      const controle: InstanceType<typeof THREE.Vector3>[] = [
        new THREE.Vector3(-4.4, 0.18, -0.3),
        new THREE.Vector3(-3.4, -0.05, 0.15),
        new THREE.Vector3(-2.4, 0.12, -0.1),
        new THREE.Vector3(-2.0, -0.02, 0.2),
      ];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        const ang = Math.PI * 0.95 + u * Math.PI * 3;
        controle.push(new THREE.Vector3(
          R * Math.cos(ang) * 1.5,
          R * Math.sin(ang) * 1.3,
          0.55 * Math.sin(u * Math.PI * 2) + 0.15 * Math.sin(u * Math.PI * 5),
        ));
      }
      controle.push(
        new THREE.Vector3(2.1, 0.05, -0.15),
        new THREE.Vector3(2.5, -0.12, 0.1),
        new THREE.Vector3(3.5, 0.06, -0.12),
        new THREE.Vector3(4.5, -0.1, 0.25),
      );
      const curva = new THREE.CatmullRomCurve3(controle, false, 'centripetal');
      const AMOSTRAS = 900;
      const quadros = curva.computeFrenetFrames(AMOSTRAS, false);
      const pontosCurva = curva.getSpacedPoints(AMOSTRAS);

      const rnd = aleatorio(20261016);
      const pos: number[] = [];
      const semente: number[] = [];
      const tipo: number[] = [];
      const luz: number[] = [];
      const cauda: number[] = [];

      // Quanto o ponto t está para a ponta (0 no laço, 1 no fim da cauda).
      const pontaDe = (t: number) => Math.min(1, Math.max(0, (Math.abs(t - 0.5) * 2 - 0.42) / 0.58));

      const adicionar = (t: number, lado: number, prof: number, tp: number, l: number) => {
        const k = Math.min(AMOSTRAS, Math.max(0, Math.round(t * AMOSTRAS)));
        const c = pontosCurva[k], N = quadros.normals[k], B = quadros.binormals[k];
        pos.push(c.x + N.x * lado + B.x * prof, c.y + N.y * lado + B.y * prof, c.z + N.z * lado + B.z * prof);
        semente.push(rnd());
        tipo.push(tp);
        luz.push(l);
        cauda.push(pontaDe(t));
      };

      // Fitas: faixas de grãos finos que torcem ao longo do caminho.
      const FITAS = [
        { largura: 0.42, fase: 0.0, torcao: 6.0, fios: 90 },
        { largura: 0.30, fase: 2.1, torcao: -5.0, fios: 70 },
        { largura: 0.50, fase: 4.0, torcao: 4.0, fios: 90 },
        { largura: 0.20, fase: 1.2, torcao: 9.0, fios: 45 },
      ];
      for (const fita of FITAS) {
        for (let f = 0; f < fita.fios; f++) {
          const a = (f / (fita.fios - 1)) * 2 - 1;      // posição do fio na largura
          const desvio = (rnd() - 0.5) * 0.02;
          const inicio = 0.18 + rnd() * 0.06;
          const fim = 0.82 - rnd() * 0.06;
          const passos = 700;
          for (let s = 0; s <= passos; s++) {
            const t = inicio + (fim - inicio) * (s / passos);
            const ponta = pontaDe(t);
            // A fita afina e se abre em fiapos perto das pontas.
            const larg = fita.largura * (1 - 0.55 * ponta) * (0.85 + 0.15 * Math.sin(t * 40 + fita.fase));
            const giro = fita.fase + t * fita.torcao;
            const lado = a * larg * Math.cos(giro) + desvio + (rnd() - 0.5) * 0.25 * ponta * ponta;
            const prof = a * larg * Math.sin(giro) * 0.35 + (rnd() - 0.5) * 0.25 * ponta * ponta;
            // Brilho de cetim: depende do ângulo da fita e de onde o fio está nela.
            const l = 0.5 + 0.5 * Math.cos(giro * 1.0 + a * 1.4);
            if (ponta > 0.7 && rnd() < ponta * 0.7) continue; // fio se desfaz
            adicionar(t, lado, prof, TIPO_FIO, l);
          }
        }
      }

      // Areia: concentrada nas transições e espalhada nas caudas.
      for (let i = 0; i < 24000; i++) {
        let t = rnd();
        if (rnd() < 0.55) t = rnd() < 0.5 ? rnd() * 0.36 : 0.64 + rnd() * 0.36;
        const ponta = pontaDe(t);
        const espalha = 0.12 + 0.6 * ponta ** 1.4;
        const g = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
        adicionar(t, g() * espalha, g() * espalha * 0.8, TIPO_AREIA, 0.25 + rnd() * 0.75);
      }

      // Contas: esferas soltas que acompanham a escultura.
      for (let i = 0; i < 150; i++) {
        const t = 0.12 + rnd() * 0.76;
        const espalha = 0.18 + 0.4 * pontaDe(t);
        adicionar(t, (rnd() - 0.5) * 2 * espalha, (rnd() - 0.5) * 2 * espalha, TIPO_CONTA, 0.6 + rnd() * 0.4);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aSemente', new THREE.Float32BufferAttribute(semente, 1));
      geo.setAttribute('aTipo', new THREE.Float32BufferAttribute(tipo, 1));
      geo.setAttribute('aLuz', new THREE.Float32BufferAttribute(luz, 1));
      geo.setAttribute('aCauda', new THREE.Float32BufferAttribute(cauda, 1));

      const uniforms = {
        uTempo: { value: 0 },
        uMouse: { value: new THREE.Vector2(99, 99) },
        uForca: { value: 0 },
        uPixel: { value: pixel },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTICE,
        fragmentShader: FRAGMENTO,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const escultura = new THREE.Points(geo, material);
      const grupo = new THREE.Group();
      grupo.add(escultura);
      grupo.rotation.z = -0.07;
      cena.add(grupo);

      // ── Tamanho: a escultura ocupa a largura da tela ──
      const ajustar = () => {
        const w = caixa.clientWidth || 1, h = caixa.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const alturaVisivel = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
        const larguraVisivel = alturaVisivel * camera.aspect;
        grupo.scale.setScalar(Math.min(1.1, larguraVisivel / 8.2));
      };
      ajustar();
      const observador = new ResizeObserver(ajustar);
      observador.observe(caixa);

      // ── Mouse: posição no plano da escultura e força pela velocidade ──
      const raio = new THREE.Raycaster();
      const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const alvo = new THREE.Vector3(99, 99, 0);
      const ndc = new THREE.Vector2();
      let energia = 0;
      let ultimo: { x: number; y: number } | null = null;

      const mover = (e: PointerEvent) => {
        const r = caixa.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        raio.setFromCamera(ndc, camera);
        raio.ray.intersectPlane(plano, alvo);
        if (ultimo) energia = Math.min(1.6, energia + Math.hypot(e.clientX - ultimo.x, e.clientY - ultimo.y) * 0.012);
        ultimo = { x: e.clientX, y: e.clientY };
      };

      const relogio = new THREE.Clock();
      let quadro = 0;
      const animar = () => {
        const dt = Math.min(relogio.getDelta(), 0.05);
        uniforms.uTempo.value += dt;
        const t = uniforms.uTempo.value;
        // A força sobe com o movimento e se desfaz devagar (efeito de mola).
        energia *= Math.pow(0.12, dt);
        uniforms.uForca.value += (Math.min(1, energia) - uniforms.uForca.value) * Math.min(1, dt * 7);
        uniforms.uMouse.value.x += (alvo.x - uniforms.uMouse.value.x) * Math.min(1, dt * 9);
        uniforms.uMouse.value.y += (alvo.y - uniforms.uMouse.value.y) * Math.min(1, dt * 9);
        grupo.rotation.y = Math.sin(t * 0.16) * 0.32;
        grupo.rotation.x = Math.sin(t * 0.11 + 1) * 0.12;
        renderer.render(cena, camera);
        quadro = requestAnimationFrame(animar);
      };

      const visibilidade = () => {
        cancelAnimationFrame(quadro);
        if (!document.hidden && !parado) { relogio.getDelta(); quadro = requestAnimationFrame(animar); }
      };

      if (parado) {
        renderer.render(cena, camera);
      } else {
        window.addEventListener('pointermove', mover, { passive: true });
        document.addEventListener('visibilitychange', visibilidade);
        quadro = requestAnimationFrame(animar);
      }

      limpar = () => {
        cancelAnimationFrame(quadro);
        observador.disconnect();
        window.removeEventListener('pointermove', mover);
        document.removeEventListener('visibilitychange', visibilidade);
        geo.dispose();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => { desmontado = true; limpar(); };
  }, []);

  return <div ref={ref} aria-hidden className={`pointer-events-none ${className}`} />;
}
