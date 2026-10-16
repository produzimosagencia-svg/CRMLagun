import { useEffect, useRef } from 'react';

/**
 * Fundo do login: malha de linhas douradas que se deforma em volta do cursor,
 * como uma lente, e volta ao lugar com mola. Sem mouse (celular, ou parado),
 * o ponto de distorção passeia sozinho devagar. Com "reduzir movimento" a
 * malha fica parada.
 */
const ESPACO = 28;          // distância entre as linhas, em px
const RAIO = 220;           // alcance da distorção
const FORCA = 0.2;          // deslocamento máximo das linhas (fração do raio)
const MOLA = 0.075;
const ATRITO = 0.8;
const OURO = '255, 214, 80';

interface Ponto { x: number; y: number; dx: number; dy: number; vx: number; vy: number }

export function FundoDistorcao({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let largura = 0, altura = 0, colunas = 0, linhas = 0;
    let pontos: Ponto[] = [];
    let quadro = 0;
    let ultimoMovimento = -Infinity;
    const alvo = { x: -9999, y: -9999 };
    const foco = { x: -9999, y: -9999 };

    const montar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      largura = canvas.clientWidth;
      altura = canvas.clientHeight;
      canvas.width = Math.round(largura * dpr);
      canvas.height = Math.round(altura * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colunas = Math.ceil(largura / ESPACO) + 2;
      linhas = Math.ceil(altura / ESPACO) + 2;
      const sobraX = (colunas - 1) * ESPACO - largura;
      const sobraY = (linhas - 1) * ESPACO - altura;
      pontos = [];
      for (let j = 0; j < linhas; j++) {
        for (let i = 0; i < colunas; i++) {
          pontos.push({ x: i * ESPACO - sobraX / 2, y: j * ESPACO - sobraY / 2, dx: 0, dy: 0, vx: 0, vy: 0 });
        }
      }
    };

    const tracarMalha = () => {
      ctx.beginPath();
      for (let j = 0; j < linhas; j++) {
        for (let i = 0; i < colunas; i++) {
          const p = pontos[j * colunas + i];
          if (i === 0) ctx.moveTo(p.x + p.dx, p.y + p.dy);
          else ctx.lineTo(p.x + p.dx, p.y + p.dy);
        }
      }
      for (let i = 0; i < colunas; i++) {
        for (let j = 0; j < linhas; j++) {
          const p = pontos[j * colunas + i];
          if (j === 0) ctx.moveTo(p.x + p.dx, p.y + p.dy);
          else ctx.lineTo(p.x + p.dx, p.y + p.dy);
        }
      }
    };

    const desenhar = () => {
      ctx.clearRect(0, 0, largura, altura);
      ctx.lineJoin = 'round';

      // Malha de base, bem apagada.
      tracarMalha();
      ctx.strokeStyle = `rgba(${OURO}, 0.075)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (foco.x < -999) return;
      // Onde o cursor passa, as linhas acendem: mesmo traço com gradiente radial.
      const brilho = ctx.createRadialGradient(foco.x, foco.y, 0, foco.x, foco.y, RAIO * 1.5);
      brilho.addColorStop(0, `rgba(${OURO}, 0.95)`);
      brilho.addColorStop(0.35, `rgba(${OURO}, 0.45)`);
      brilho.addColorStop(1, `rgba(${OURO}, 0)`);
      ctx.strokeStyle = brilho;
      ctx.lineWidth = 1.15;
      ctx.stroke();

      const halo = ctx.createRadialGradient(foco.x, foco.y, 0, foco.x, foco.y, RAIO);
      halo.addColorStop(0, `rgba(${OURO}, 0.22)`);
      halo.addColorStop(1, `rgba(${OURO}, 0)`);
      ctx.strokeStyle = halo;
      ctx.lineWidth = 4;
      ctx.stroke();
    };

    const passo = (t: number) => {
      // Sem mouse há 2,5 s: o foco passeia numa curva lenta pelo meio da tela.
      if (t - ultimoMovimento > 2500) {
        const s = t / 1000;
        alvo.x = largura * (0.5 + 0.32 * Math.sin(s * 0.23));
        alvo.y = altura * (0.5 + 0.28 * Math.sin(s * 0.31 + 1.2));
      }
      if (foco.x < -999) { foco.x = alvo.x; foco.y = alvo.y; }
      foco.x += (alvo.x - foco.x) * 0.16;
      foco.y += (alvo.y - foco.y) * 0.16;

      for (const p of pontos) {
        const ox = p.x - foco.x;
        const oy = p.y - foco.y;
        const d = Math.hypot(ox, oy);
        let tx = 0, ty = 0;
        if (d < RAIO && d > 0.001) {
          // Lente: zero no centro e na borda, máximo a 1/3 do raio. A malha
          // estufa como sob uma lupa, sem abrir buraco no meio.
          const r = d / RAIO;
          const empurra = 6.75 * r * (1 - r) ** 2 * RAIO * FORCA;
          tx = (ox / d) * empurra;
          ty = (oy / d) * empurra;
        }
        p.vx = (p.vx + (tx - p.dx) * MOLA) * ATRITO;
        p.vy = (p.vy + (ty - p.dy) * MOLA) * ATRITO;
        p.dx += p.vx;
        p.dy += p.vy;
      }
      desenhar();
      quadro = requestAnimationFrame(passo);
    };

    const mover = (e: PointerEvent) => {
      const caixa = canvas.getBoundingClientRect();
      alvo.x = e.clientX - caixa.left;
      alvo.y = e.clientY - caixa.top;
      ultimoMovimento = performance.now();
    };

    const visibilidade = () => {
      cancelAnimationFrame(quadro);
      if (!document.hidden && !parado) quadro = requestAnimationFrame(passo);
    };

    montar();
    const observador = new ResizeObserver(() => { montar(); if (parado) desenhar(); });
    observador.observe(canvas);

    if (parado) {
      desenhar();
    } else {
      window.addEventListener('pointermove', mover, { passive: true });
      document.addEventListener('visibilitychange', visibilidade);
      quadro = requestAnimationFrame(passo);
    }

    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
      window.removeEventListener('pointermove', mover);
      document.removeEventListener('visibilitychange', visibilidade);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none block h-full w-full ${className}`} />;
}
