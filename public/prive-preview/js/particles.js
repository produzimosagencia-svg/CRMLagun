/* ============================================================
   PARTICLES — dois efeitos de partículas:
   1) .particle-blob — esfera de pontos deformada e rotativa
      (visual das seções Academy/Studio no vídeo)
   2) #starfield — campo de pontos à deriva (interlúdio)
   ============================================================ */

/* ---------- 1. Esferas de pontos ---------- */
(function () {
  const canvases = document.querySelectorAll(".particle-blob");

  canvases.forEach((canvas) => {
    const ctx = canvas.getContext("2d");
    const color = canvas.dataset.color === "light" ? "223,231,240" : "20,20,20";
    const N = 700;
    const points = [];

    // Distribuição uniforme na esfera (espiral de Fibonacci) + ruído
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const noise =
        1 +
        0.16 * Math.sin(phi * 4 + theta) +
        0.1 * Math.sin(theta * 2.7);
      points.push({
        x: noise * Math.sin(phi) * Math.cos(theta),
        y: noise * Math.sin(phi) * Math.sin(theta),
        z: noise * Math.cos(phi),
      });
    }

    let w = 0, h = 0, angle = 0, visible = false;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const r = Math.min(w, h) * 0.34;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      for (const p of points) {
        // rotação em Y
        const x = p.x * cos - p.z * sin;
        const z = p.x * sin + p.z * cos;
        const scale = 1 / (1.8 - z * 0.5); // perspectiva leve
        const px = w / 2 + x * r * scale;
        const py = h / 2 + p.y * r * scale;
        const alpha = 0.25 + (z + 1) * 0.3;
        const size = 0.8 + (z + 1) * 0.7;

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${alpha})`;
        ctx.fill();
      }
      angle += 0.004;
    }

    function tick() {
      if (visible) draw();
      requestAnimationFrame(tick);
    }

    // Só anima quando está na tela
    new IntersectionObserver(
      (entries) => (visible = entries[0].isIntersecting),
      { threshold: 0.05 }
    ).observe(canvas);

    window.addEventListener("resize", resize);
    resize();
    tick();
  });
})();

/* ---------- 2. Starfield do interlúdio ---------- */
(function () {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const N = 220;
  const stars = Array.from({ length: N }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.4 + 0.3,
    s: Math.random() * 0.0005 + 0.0001, // velocidade de deriva
    tw: Math.random() * Math.PI * 2,    // fase do brilho
  }));

  let w = 0, h = 0, visible = false, t = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    t += 0.02;
    for (const st of stars) {
      st.y -= st.s;
      if (st.y < 0) st.y = 1;
      const alpha = 0.25 + 0.45 * Math.abs(Math.sin(t + st.tw));
      ctx.beginPath();
      ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(223,231,240,${alpha})`;
      ctx.fill();
    }
  }

  function tick() {
    if (visible) draw();
    requestAnimationFrame(tick);
  }

  new IntersectionObserver(
    (entries) => (visible = entries[0].isIntersecting),
    { threshold: 0.05 }
  ).observe(canvas);

  window.addEventListener("resize", resize);
  resize();
  tick();
})();
