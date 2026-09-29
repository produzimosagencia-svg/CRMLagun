import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Prévia de link por página (WhatsApp, Instagram, iMessage).
 *
 * Quem gera a prévia não roda o JavaScript do site: lê só as etiquetas do
 * HTML. Por isso, no build, cada página daqui ganha uma cópia do index.html
 * em dist/<caminho>/index.html com título, descrição e imagem próprios. A
 * Vercel entrega o arquivo antes da regra que manda tudo para o index.html, e
 * o React abre a página normalmente.
 */
const SITE = "https://www.lagunvitoria.com.br";
const PREVIAS: { caminho: string; titulo: string; descricao: string; imagem: string; largura: number; altura: number }[] = [
  {
    caminho: "saudade-convite",
    titulo: "Saudade · Você recebeu um convite",
    descricao: "03 de outubro, 23h · Lagun Vitória. Abra o convite.",
    imagem: "/og/saudade-convite.jpg",
    largura: 864,
    altura: 1080,
  },
];

function previasDeLink(): Plugin {
  return {
    name: "previas-de-link",
    apply: "build",
    closeBundle() {
      const base = path.resolve(__dirname, "dist/index.html");
      if (!fs.existsSync(base)) return;
      const html = fs.readFileSync(base, "utf8");
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      for (const p of PREVIAS) {
        const img = `${SITE}${p.imagem}`;
        const url = `${SITE}/${p.caminho}`;
        const metas = [
          `<meta property="og:url" content="${url}" />`,
          `<meta property="og:image:width" content="${p.largura}" />`,
          `<meta property="og:image:height" content="${p.altura}" />`,
          `<meta property="og:image:type" content="image/jpeg" />`,
        ].join("\n    ");
        const pagina = html
          .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(p.titulo)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(p.descricao)}$2`)
          .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(p.titulo)}$2`)
          .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(p.titulo)}$2`)
          .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(p.descricao)}$2`)
          .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(p.descricao)}$2`)
          .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${img}$2`)
          .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${img}$2`)
          .replace("</head>", `    ${metas}\n  </head>`);
        const destino = path.resolve(__dirname, "dist", p.caminho);
        fs.mkdirSync(destino, { recursive: true });
        fs.writeFileSync(path.join(destino, "index.html"), pagina);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    previasDeLink(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "og-image.png"],
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      // O manifesto é escolhido pelo endereço no index.html: o site público usa
      // public/manifest.webmanifest (abre em "/") e o painel usa
      // public/manifest-interno.webmanifest (abre em /interno/login).
      manifest: false,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
