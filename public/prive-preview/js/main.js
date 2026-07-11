/* ============================================================
   MAIN — relógio, reveals on scroll e contadores animados.
   ============================================================ */

/* ---------- Contagem regressiva (header) + relógio (footer) ---------- */
(function () {
  const countdown = document.getElementById("countdown");
  const footerClock = document.getElementById("footerClock");
  const EVENT = new Date(2026, 7, 14, 0, 0, 0); // 14 de agosto de 2026

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function updateCountdown() {
    if (!countdown) return;
    const diff = EVENT - new Date();
    if (diff <= 0) {
      countdown.textContent = "É HOJE";
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    countdown.textContent = `${d}D ${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function update() {
    updateCountdown();
    if (footerClock) {
      const now = new Date();
      footerClock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
  }
  update();
  setInterval(update, 1000);
})();

/* ---------- Contadores animados ---------- */
function animateCount(el) {
  const target = parseFloat(el.dataset.count);
  const decimals = parseInt(el.dataset.decimals || "0", 10);
  const duration = 1400;
  const start = performance.now();

  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const value = target * eased;
    el.textContent = value.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------- Reveal on scroll ---------- */
(function () {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        entry.target.querySelectorAll(".count[data-count]").forEach((el) => {
          if (!el.dataset.done) {
            el.dataset.done = "1";
            animateCount(el);
          }
        });
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
})();

/* ---------- Splash screen (6s) ---------- */
(function () {
  const splash = document.getElementById("splash");
  if (!splash) return;

  document.documentElement.classList.add("splash-lock");

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HOLD = reduce ? 800 : 3000;

  setTimeout(() => {
    splash.classList.add("splash--exit");
    document.documentElement.classList.remove("splash-lock");
    /* remove do DOM após a transição (libera o WebGL da splash) */
    setTimeout(() => splash.remove(), 1300);
  }, HOLD);
})();
