/* ============================================================
   MERCURY 3D — metal líquido realista com Three.js (vendor local).

   Como funciona:
   - Esfera de alta resolução deformada a cada frame por ruído
     simplex 3D (várias oitavas) → superfície ondulando sem parar.
   - MeshPhysicalMaterial com metalness 1 + roughness baixa,
     refletindo um ambiente de "estúdio" gerado proceduralmente
     (faixas de luz brancas/azuladas sobre preto, via PMREM) —
     é isso que dá o aspecto de cromo/mercúrio do pôster.
   - Arrasto gira a gota (hero atualiza o dial de graus).

   Instâncias: #orbCanvas (hero), .mercury-blob, #finaleMercury.
   ============================================================ */
(function () {
  if (!window.THREE) return;

  /* ---------- Ruído simplex 3D (Stefan Gustavson, domínio público) ---------- */
  var SimplexNoise = (function () {
    var grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],
      [1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
    ];
    var p = [];
    for (var i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
    var perm = [];
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];

    function dot(g, x, y, z) { return g[0] * x + g[1] * y + g[2] * z; }

    return function (xin, yin, zin) {
      var F3 = 1 / 3, G3 = 1 / 6;
      var n0, n1, n2, n3;
      var s = (xin + yin + zin) * F3;
      var i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      var t = (i + j + k) * G3;
      var x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      var i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0)      { i1=1;j1=0;k1=0; i2=1;j2=1;k2=0; }
        else if (x0 >= z0) { i1=1;j1=0;k1=0; i2=1;j2=0;k2=1; }
        else               { i1=0;j1=0;k1=1; i2=1;j2=0;k2=1; }
      } else {
        if (y0 < z0)       { i1=0;j1=0;k1=1; i2=0;j2=1;k2=1; }
        else if (x0 < z0)  { i1=0;j1=1;k1=0; i2=0;j2=1;k2=1; }
        else               { i1=0;j1=1;k1=0; i2=1;j2=1;k2=0; }
      }
      var x1 = x0-i1+G3,   y1 = y0-j1+G3,   z1 = z0-k1+G3;
      var x2 = x0-i2+2*G3, y2 = y0-j2+2*G3, z2 = z0-k2+2*G3;
      var x3 = x0-1+3*G3,  y3 = y0-1+3*G3,  z3 = z0-1+3*G3;
      var ii = i & 255, jj = j & 255, kk = k & 255;
      var gi0 = perm[ii+perm[jj+perm[kk]]] % 12;
      var gi1 = perm[ii+i1+perm[jj+j1+perm[kk+k1]]] % 12;
      var gi2 = perm[ii+i2+perm[jj+j2+perm[kk+k2]]] % 12;
      var gi3 = perm[ii+1+perm[jj+1+perm[kk+1]]] % 12;
      var t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
      n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot(grad3[gi0], x0, y0, z0));
      var t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
      n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot(grad3[gi1], x1, y1, z1));
      var t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
      n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot(grad3[gi2], x2, y2, z2));
      var t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
      n3 = t3 < 0 ? 0 : (t3 *= t3, t3 * t3 * dot(grad3[gi3], x3, y3, z3));
      return 32 * (n0 + n1 + n2 + n3);
    };
  })();

  /* ---------- Ambiente de estúdio (equiretangular procedural) ----------
     Faixas de luz suaves sobre preto azulado: é o que a superfície
     cromada reflete. Compartilhado entre todas as instâncias. */
  function buildEnvCanvas() {
    var c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    var g = c.getContext("2d");

    g.fillStyle = "#05070c";
    g.fillRect(0, 0, 1024, 512);

    /* Luz ambiente azulada vinda de baixo (fumaça) */
    var floor = g.createLinearGradient(0, 300, 0, 512);
    floor.addColorStop(0, "rgba(20,32,48,0)");
    floor.addColorStop(1, "rgba(38,56,80,0.9)");
    g.fillStyle = floor;
    g.fillRect(0, 300, 1024, 212);

    /* Faixas horizontais de "softbox" */
    function band(y, h, color, alpha, x0, x1) {
      var grad = g.createLinearGradient(0, y - h, 0, y + h);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, color.replace("A", alpha.toFixed(2)));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x0 === undefined ? 0 : x0, y - h, (x1 === undefined ? 1024 : x1) - (x0 || 0), h * 2);
    }
    band(70, 46, "rgba(248,251,255,A)", 0.95);            // key superior
    band(150, 24, "rgba(185,206,222,A)", 0.5);
    band(238, 56, "rgba(244,248,252,A)", 0.85);           // reflexo do equador
    band(238, 56, "rgba(244,248,252,A)", 0.9, 120, 560);  // reforço parcial
    band(330, 28, "rgba(124,147,173,A)", 0.45);
    band(420, 40, "rgba(221,231,240,A)", 0.5, 300, 900);

    /* Pontos de brilho */
    function glow(x, y, r, alpha) {
      var grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(255,255,255," + alpha + ")");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    glow(210, 170, 130, 0.75);
    glow(840, 290, 170, 0.5);
    glow(520, 60, 200, 0.6);

    return c;
  }

  /* Textura equiretangular compartilhada — cada renderer converte
     para o formato interno (PMREM) no próprio contexto WebGL. */
  var sharedEnv = null;
  function getEnvironment() {
    if (sharedEnv) return sharedEnv;
    sharedEnv = new THREE.CanvasTexture(buildEnvCanvas());
    sharedEnv.mapping = THREE.EquirectangularReflectionMapping;
    sharedEnv.encoding = THREE.sRGBEncoding;
    return sharedEnv;
  }

  /* ---------- Gota de mercúrio ---------- */
  function liquidMetal(canvas, opts) {
    var o = Object.assign(
      {
        detail: [96, 64], amp: 0.3, speed: 1, fit: 0.86,
        octaves: 3, onFrame: null,
        wander: false, wanderAmp: [0.3, 0.16],
        follow: false, followSpan: [3.2, 2.0],
        /* Tentáculo estilo Venom: o corpo fica no lugar e um
           pedaço da superfície se estica em direção ao ponteiro */
        tentacle: false, tentacleReach: 0.75,
      },
      opts
    );

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    } catch (e) {
      return; // sem WebGL: mantém o canvas vazio sobre o fundo esfumaçado
    }
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    var scene = new THREE.Scene();
    scene.environment = getEnvironment();

    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);

    var geo = new THREE.SphereGeometry(1, o.detail[0], o.detail[1]);
    var pos = geo.attributes.position;
    var count = pos.count;

    /* Direções base (esfera unitária) */
    var dirs = new Float32Array(pos.array);

    /* Grupos de vértices duplicados (costura/polos) para suavizar normais */
    var groups = {};
    for (var i = 0; i < count; i++) {
      var key =
        Math.round(dirs[i * 3] * 1e4) + "_" +
        Math.round(dirs[i * 3 + 1] * 1e4) + "_" +
        Math.round(dirs[i * 3 + 2] * 1e4);
      (groups[key] = groups[key] || []).push(i);
    }
    var seams = Object.keys(groups)
      .map(function (k) { return groups[k]; })
      .filter(function (a) { return a.length > 1; });

    var mat = new THREE.MeshPhysicalMaterial({
      color: 0xe8edf3,
      metalness: 1,
      roughness: 0.08,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.5,
    });

    var mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    /* Luz fria de apoio para o clearcoat */
    var rim = new THREE.DirectionalLight(0xbcd4ea, 0.6);
    rim.position.set(-2, 3, 2);
    scene.add(rim);

    var t = Math.random() * 100;
    var rotation = 71, velocity = 0.0018, dragging = false, lastX = 0;
    var visible = true;
    var followX = 0, followY = 0, targetFX = 0, targetFY = 0;

    /* Estado do tentáculo (direção em tela + intensidade, com easing) */
    var tenVX = 0, tenVY = 0, tenStr = 0;
    var targetTVX = 0, targetTVY = 0, targetTStr = 0;
    var tenX = 0, tenY = 0, tenZ = 0, tenReach = 0; // usados no displace()
    var _v = new THREE.Vector3();
    var _q = new THREE.Quaternion();

    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      /* Distância para caber raio máximo (1 + amp) com folga */
      var maxR = (1 + o.amp) / o.fit;
      camera.position.z = maxR / Math.tan((camera.fov * Math.PI) / 360);
      camera.updateProjectionMatrix();
    }

    function displace() {
      var arr = pos.array;
      var amp = o.amp;
      for (var i = 0; i < count; i++) {
        var x = dirs[i * 3], y = dirs[i * 3 + 1], z = dirs[i * 3 + 2];
        /* Dobras grandes e macias; alta frequência bem sutil */
        var d =
          amp * SimplexNoise(x * 0.9 + t * 0.5, y * 0.9 + t * 0.35, z * 0.9) +
          amp * 0.25 * SimplexNoise(x * 1.9 - t * 0.4, y * 1.9, z * 1.9 + t * 0.55);
        if (o.octaves > 2)
          d += amp * 0.06 * SimplexNoise(x * 3.8, y * 3.8 + t * 0.9, z * 3.8);
        /* Tentáculo: vértices alinhados com a direção do ponteiro
           se esticam para fora (alinhamento^8 = ponta focada) */
        if (tenReach > 0.003) {
          var al = x * tenX + y * tenY + z * tenZ;
          if (al > 0) {
            var a2 = al * al;
            var a4 = a2 * a2;
            d += tenReach * a4 * a4;
          }
        }
        var s = 1 + d;
        arr[i * 3] = x * s;
        arr[i * 3 + 1] = y * s;
        arr[i * 3 + 2] = z * s;
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();

      /* Média das normais nos vértices duplicados (sem emenda visível) */
      var nrm = geo.attributes.normal.array;
      for (var s2 = 0; s2 < seams.length; s2++) {
        var idx = seams[s2];
        var nx = 0, ny = 0, nz = 0, j;
        for (j = 0; j < idx.length; j++) {
          nx += nrm[idx[j] * 3]; ny += nrm[idx[j] * 3 + 1]; nz += nrm[idx[j] * 3 + 2];
        }
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;
        for (j = 0; j < idx.length; j++) {
          nrm[idx[j] * 3] = nx; nrm[idx[j] * 3 + 1] = ny; nrm[idx[j] * 3 + 2] = nz;
        }
      }
      geo.attributes.normal.needsUpdate = true;
    }

    function tick() {
      if (visible) {
        if (!dragging) rotation += velocity * 60 * o.speed * 0.06;
        t += 0.0035 * o.speed;
        mesh.rotation.y = (rotation * Math.PI) / 180;

        /* Modo "wander": a gota vaga pela tela e balança nos eixos */
        var wx = 0, wy = 0;
        if (o.wander) {
          wx = Math.sin(t * 0.6) * o.wanderAmp[0];
          wy = Math.cos(t * 0.42) * o.wanderAmp[1];
          mesh.rotation.x = Math.sin(t * 0.35) * 0.3;
          mesh.rotation.z = Math.sin(t * 0.22) * 0.12;
        }

        /* Modo "follow": desliza atrás do mouse/toque, com inércia */
        followX += (targetFX - followX) * 0.045;
        followY += (targetFY - followY) * 0.045;

        mesh.position.x = wx + followX;
        mesh.position.y = wy + followY;

        /* Tentáculo: persegue o ponteiro com inércia e "pulsa" */
        if (o.tentacle) {
          tenVX += (targetTVX - tenVX) * 0.1;
          tenVY += (targetTVY - tenVY) * 0.1;
          tenStr += (targetTStr - tenStr) * 0.075;
          /* direção da tela → espaço do objeto (desfaz a rotação);
             pouco viés em Z para o braço não encurtar em perspectiva */
          _q.copy(mesh.quaternion).invert();
          _v.set(tenVX, tenVY, 0.12).normalize().applyQuaternion(_q);
          tenX = _v.x; tenY = _v.y; tenZ = _v.z;
          tenReach =
            tenStr * o.tentacleReach * (0.86 + 0.14 * Math.sin(t * 6));
        }
        displace();
        renderer.render(scene, camera);
        if (o.onFrame) o.onFrame(((rotation % 360) + 360) % 360);
      }
      requestAnimationFrame(tick);
    }

    /* Arrasto */
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      rotation += (e.clientX - lastX) * 0.5;
      lastX = e.clientX;
    });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });

    /* Follow / Tentáculo: ouve o ponteiro no container inteiro
       (pega o mouse sobre os labels/botões em volta) */
    if (o.follow || o.tentacle) {
      var host = canvas.parentElement || canvas;
      var setTarget = function (e) {
        var r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var nx = (e.clientX - r.left) / r.width - 0.5;
        var ny = (e.clientY - r.top) / r.height - 0.5;
        if (o.follow) {
          targetFX = nx * o.followSpan[0];
          targetFY = -ny * o.followSpan[1];
        }
        if (o.tentacle) {
          targetTVX = nx * 2;
          targetTVY = -ny * 2;
          /* quanto mais longe do centro, mais o braço estica */
          var dist = Math.sqrt(nx * nx + ny * ny) * 2;
          targetTStr = Math.min(0.45 + dist * 0.8, 1);
        }
      };
      host.addEventListener("pointermove", setTarget);
      host.addEventListener("mousemove", setTarget); /* fallback */
      host.addEventListener("pointerdown", setTarget); /* toque no celular */
      host.addEventListener("pointerleave", function () {
        targetFX = 0;
        targetFY = 0;   /* follow volta ao centro */
        targetTStr = 0; /* tentáculo recolhe */
      });
    }

    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { threshold: 0.02 }).observe(canvas);

    window.addEventListener("resize", resize);
    resize();
    tick();
  }

  /* ---------- Instâncias ---------- */
  var splash = document.getElementById("splashMercury");
  if (splash) {
    /* Atrás do borrão o movimento fica sutil — mais tamanho e
       velocidade para o fundo "respirar" visivelmente */
    liquidMetal(splash, { detail: [112, 80], amp: 0.32, speed: 1.5, fit: 0.72 });
  }

  var hero = document.getElementById("orbCanvas");
  if (hero) {
    liquidMetal(hero, {
      detail: [128, 88],
      amp: 0.32,
      speed: 1.2,
      fit: 0.5, // gota ocupa ~metade da altura do hero
      wander: true,
      wanderAmp: [0.05, 0.04], // corpo fixo no centro (só um respiro)
      tentacle: true,          // um braço estica atrás do mouse/toque
    });
    hero.style.cursor = "grab";
  }

  var blobs = document.querySelectorAll(".mercury-blob");
  for (var i = 0; i < blobs.length; i++) {
    liquidMetal(blobs[i], {
      detail: [80, 56],
      amp: 0.3,
      speed: 0.85 + i * 0.25,
      octaves: 2,
    });
  }

  var finale = document.getElementById("finaleMercury");
  if (finale) {
    liquidMetal(finale, { detail: [80, 56], amp: 0.3, speed: 0.7, octaves: 2 });
  }
})();
