# privê — site

Réplica da estrutura visual e funcional do site mostrado no vídeo
(`WhatsApp Video 2026-07-08 at 16.09.34.mp4`), com a marca **privê**
(`logo.jpeg`) aplicada no header, no interlúdio e no footer.

Identidade visual conforme o pôster do evento (14.agosto — Vitória/ES):
preto profundo com fumaça azulada, tipografia e botões cromados, e blobs
de **mercúrio líquido 3D realista** (`js/mercury3d.js`, Three.js vendorado
em `vendor/three.min.js`) que ondulam sem parar — hero (com arrasto +
dial de graus), seções 01/04 e fundo do finale. A superfície é uma esfera
de alta resolução deformada por ruído simplex a cada frame, com material
metálico refletindo um ambiente de estúdio procedural (PMREM).

## Como rodar

É um site estático — basta abrir `index.html` no navegador, ou servir a pasta:

```
npx serve prive-site
# ou
python -m http.server 8000
```

## Estrutura

```
prive-site/
├── index.html          # marcação semântica, uma <section> por bloco do vídeo
├── assets/logo.jpeg    # logo fornecida
├── css/
│   ├── base.css        # tokens de design, reset, tipografia, botões, chips
│   ├── header.css      # header fixo com logo central e relógio
│   ├── hero.css        # hero com orbe e labels de navegação
│   ├── sections.css    # painéis 01–04, interlúdio, school, media, radar, finale
│   └── footer.css
├── vendor/
│   └── three.min.js    # Three.js r147 (local, sem CDN em runtime)
└── js/
    ├── mercury3d.js    # mercúrio líquido 3D (hero, seções e finale)
    ├── particles.js    # esferas de pontos (Academy/Studio) e starfield
    └── main.js         # relógio, reveals, contadores, gráficos, uptime
```

## Seções replicadas (na ordem do vídeo)

1. **Hero** — fundo escuro, orbe 3D central interativo (arraste para girar;
   o dial inferior mostra os graus, como no original), labels
   `01 ECOSYSTEM / 02 ACADEMY / 03 STUDIO / 04 EXPERIENCE` orbitando e
   funcionando como âncoras de navegação.
2. **01 Ecosystem** (claro) — "Where the ecosystem meets the room", blob
   iridescente, painel de estatísticas (11 / 13 / 2.383 / 8.8 / uptime ao vivo).
3. **02 Academy** (claro) — "The AI platform for creatives", esfera de
   partículas escura, estatísticas + gráfico de barras.
4. **03 Studio** (escuro) — "Cinema-grade output, terminal speed", esfera de
   partículas clara, stats 47.389 / 7 / 42s.
5. **04 Experience** (claro) — "One direction across every front", blob
   obsidiana, stats 25.033 / 48 / 9.4 / 93%.
6. **Interlúdio** (escuro) — campo de partículas + logomarca grande + ticker
   com métricas ("150+ countries", "27,000+ creatives trained"…).
7. **School** (claro) — "The largest AI school for creatives.", gráficos,
   chips de trilhas e ornamento rabiscado (presente na logo/identidade).
8. **Media strip** — faixa de 4 cartões de evento.
9. **Radar** (claro) — "The radar and the conversations behind".
10. **Finale** (escuro) — "THE FUTURE IS HERE" em serifada sobre o orbe,
    subtítulo "One direction across every front" e botão "↑ Back to 01".

## Premissas assumidas (detalhes não legíveis no vídeo)

- **Marca**: o site do vídeo usa o wordmark "HUMAN"; conforme pedido, a marca
  foi substituída pela logo **privê** no header (centralizado, como no vídeo).
  Como a logo é um JPEG preto-sobre-branco, em fundos escuros ela é invertida
  via CSS (`filter: invert(1)` + `mix-blend-mode`).
- **Textos de apoio**: parágrafos pequenos estavam ilegíveis nos frames;
  foram escritos textos coerentes com os títulos (marcados em PT/EN conforme
  o tom do original).
- **Números**: os valores das estatísticas foram lidos dos frames
  (2.383, 8.8, 47.389, 42s, 25.033, 27.000+, 150+, 97%, 8.7…); onde estavam
  borrados, usei valores plausíveis próximos.
- **Mídia**: as fotos/vídeos de evento da faixa de mídia não estão no
  repositório — usei placeholders em gradiente com legendas. Basta trocar por
  `<img>`/`<video>` reais em `.media-item`.
- **Fontes**: o original aparenta usar uma grotesca licenciada; usei
  Helvetica Neue/Arial (títulos), Times/Georgia (finale serifado) e uma pilha
  mono do sistema (labels), evitando dependências externas.
- **Orbe 3D**: o original provavelmente usa WebGL/three.js; repliquei com
  Canvas 2D (gradientes + partículas) para manter o projeto sem dependências.
