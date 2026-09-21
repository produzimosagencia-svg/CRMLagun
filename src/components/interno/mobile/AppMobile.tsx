import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, LogOut, Trophy, type LucideIcon } from 'lucide-react';
import flamingoLagun from '@/assets/flamingo-solo.png';
import { useSemZoom } from '@/hooks/useSemZoom';

/**
 * Casca de aplicativo do painel interno no celular (abaixo de 768px).
 * Só entra no lugar do trilho + gaveta da versão web; as páginas continuam
 * as mesmas. Uma pílula flutuante embaixo com tudo: Home no meio, Sair na
 * ponta.
 */

export interface SecaoApp {
  key: string;
  label: string;
  icon?: LucideIcon;
  to: string;
  isActive: (path: string) => boolean;
  children?: { label: string; to: string; end?: boolean; icon?: LucideIcon }[];
}

// Barra de baixo, da esquerda pra direita. Home fica no meio (índice 3 de 7
// colunas, contando o Sair que é fixo na ponta e não entra nessa lista).
const RODAPE = ['calendario', 'tarefas', 'chat', 'dashboard', 'landing', 'ads'] as const;
const POSICAO_HOME = 3;

// Nunca aparece na versão mobile (fica só na web).
const OCULTOS_MOBILE = new Set(['admin']);

// Nome curto na aba (não aparece mais na barra, mas serve de aria-label).
const ROTULO_ABA: Record<string, string> = {
  dashboard: 'Início',
};

// Performance ganha Social Media como aba, só no celular — não mexe no
// menu da web (que fica em InternoLayout.tsx, sem essa aba).
const SUBITENS_ADS_MOBILE = [
  { label: 'Campanhas', to: '/interno/ads/campanhas', icon: BarChart3 },
  { label: 'Social Media', to: '/interno/marketing/social-media', icon: BarChart3 },
  { label: 'Criativos Campeões', to: '/interno/ads/criativos', icon: Trophy },
];
const GRUPO_ADS = (p: string) =>
  p.startsWith('/interno/ads') || p.startsWith('/interno/trafego-gpt') || p.startsWith('/interno/marketing/social-media');

const ALTURA_ABAS = 66;
// Espaço extra da pílula flutuar (respiro acima + abaixo, fora da altura dela).
const FOLGA_ABAS = 20;

export function AppMobile({
  path, secoes, conta, onSair, sobreposicao, children,
}: {
  path: string;
  secoes: SecaoApp[];
  conta: SecaoApp[];
  nomeUsuario: string;
  onSair: () => void;
  sobreposicao?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  useSemZoom();

  // Deixa o app ocupar a tela inteira do iPhone (atrás da ilha e da barra de
  // gestos) e usar as margens seguras. Só enquanto o app está montado: o site
  // público e a versão web não mudam.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.content;
    if (!original.includes('viewport-fit')) meta.content = `${original}, viewport-fit=cover`;
    return () => { meta.content = original; };
  }, []);

  // `secoes` já vem com a conta embutida (ver InternoLayout), então dedup por
  // chave e filtra o conjunto todo, não só a `conta`.
  const todas = [...new Map([...secoes, ...conta].map((s) => [s.key, s])).values()]
    .filter((s) => !OCULTOS_MOBILE.has(s.key));
  const buscar = (k: string) => todas.find((s) => s.key === k);

  const rodape = RODAPE.map(buscar).filter(Boolean) as SecaoApp[];

  // Performance "engole" Social Media no celular: enquanto a rota for uma
  // das três (Campanhas, Social Media, Criativos), a aba Performance da
  // barra de baixo fica acesa e as pílulas de cima mostram as três opções.
  const noGrupoAds = GRUPO_ADS(path);
  const ativa = noGrupoAds ? buscar('ads') : todas.find((s) => s.isActive(path));
  const subItens = noGrupoAds ? SUBITENS_ADS_MOBILE : (ativa?.children ?? []);

  const ir = (to: string) => navigate(to);

  // Altura livre acima da pílula. Telas de altura cheia (Chat, Calendário)
  // usam essa variável no celular.
  const alturaSub = subItens.length > 0 ? 44 : 0;
  const varsCorpo = {
    '--app-body': `calc(100dvh - ${ALTURA_ABAS + FOLGA_ABAS + alturaSub + 8}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`,
    // Espaço que a pílula flutuante reserva no fim do conteúdo. Telas que
    // precisam encostar no fim (o Chat) descontam isto com margem negativa.
    '--app-tabs': `calc(${ALTURA_ABAS + FOLGA_ABAS}px + env(safe-area-inset-bottom) + 16px)`,
  } as CSSProperties;

  return (
    <div
      className="interno-noturno relative flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
    >
      {sobreposicao}

      {subItens.length > 0 && (
        <nav className="shrink-0 flex gap-2 overflow-x-auto border-b border-white/[0.06] bg-[#0A0A0F]/95 px-4 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ height: alturaSub }}>
          {subItens.map((item) => {
            const ativo = item.end ? path === item.to : path.startsWith(item.to);
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => ir(item.to)}
                className={`my-auto h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                  ativo ? 'bg-[#FFE14D] text-black' : 'bg-white/[0.06] text-[#B5B4C2] active:bg-white/10'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}

      {/* ── Conteúdo: o único trecho que rola ── */}
      {/* A pílula de baixo é overlay (position: absolute), não empurra o
          conteúdo. Por isso o padding extra aqui: dá pro último card rolar
          livre dela, mas o resto passa por trás — é o que deixa o vidro
          realmente translúcido (tem o que borrar por trás), igual ao feed
          do Instagram por trás da barra de abas. */}
      <main
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-background p-4"
        style={{ ...varsCorpo, paddingBottom: `calc(${ALTURA_ABAS + FOLGA_ABAS}px + env(safe-area-inset-bottom) + 16px)` }}
      >
        {children}
      </main>

      {/* ── Barra de baixo: pílula flutuante, tipo Instagram/Apple ── */}
      {/* pointer-events-none no envelope: só a pílula em si captura toque,
          as margens transparentes ao redor deixam passar pro conteúdo. */}
      {/* app-abas: a conversa aberta do Chat esconde a pílula para ocupar a
          tela inteira, como em qualquer aplicativo de mensagem (regra em
          index.css, ligada pela classe app-chat-cheio no body). */}
      <nav
        className="app-abas pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', paddingTop: 4 }}
        aria-label="Ferramentas"
      >
        <div
          className="pointer-events-auto relative flex items-center overflow-visible rounded-full border border-white/[0.10] bg-white/[0.04] backdrop-blur-xl backdrop-saturate-150"
          style={{ height: ALTURA_ABAS, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 14px 34px -10px rgba(0,0,0,.55)' }}
        >
          <div className="grid w-full px-2" style={{ gridTemplateColumns: `repeat(${rodape.length + 1}, minmax(0, 1fr))` }}>
            {rodape.map((s, i) =>
              i === POSICAO_HOME ? (
                <BotaoHome
                  key={s.key}
                  rotulo={ROTULO_ABA[s.key] ?? s.label}
                  ativo={ativa?.key === s.key}
                  onClick={() => ir(s.to)}
                />
              ) : (
                <BotaoAba
                  key={s.key}
                  icon={s.icon}
                  rotulo={ROTULO_ABA[s.key] ?? s.label}
                  ativo={ativa?.key === s.key}
                  onClick={() => ir(s.to)}
                  mostrarRotulo={false}
                />
              )
            )}
            <BotaoAba icon={LogOut} rotulo="Sair" ativo={false} onClick={onSair} mostrarRotulo={false} />
          </div>
        </div>
      </nav>
    </div>
  );
}

function BotaoAba({ icon: Icon, rotulo, ativo, onClick, mostrarRotulo = true }: {
  icon?: LucideIcon; rotulo: string; ativo: boolean; onClick: () => void; mostrarRotulo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      aria-current={ativo ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-1 transition-colors active:scale-95 ${
        ativo ? 'text-[#FFE14D] drop-shadow-[0_0_7px_rgba(255,225,77,.6)]' : 'text-[#8B8A9B]'
      }`}
    >
      <span className={`flex items-center justify-center ${mostrarRotulo ? 'h-7 w-12' : 'h-9 w-14'}`}>
        {Icon && <Icon size={mostrarRotulo ? 21 : 23} strokeWidth={ativo ? 2.3 : 1.8} />}
      </span>
      {mostrarRotulo && <span className={`text-[10.5px] leading-none ${ativo ? 'font-semibold' : 'font-medium'}`}>{rotulo}</span>}
    </button>
  );
}

// Botão do meio da barra de baixo: bola dourada elevada, sempre em destaque
// (mesmo inativo), pro Início ficar sempre fácil de achar. Sem nome embaixo,
// igual ao resto da barra.
function BotaoHome({ rotulo, ativo, onClick }: { rotulo: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      aria-current={ativo ? 'page' : undefined}
      className="flex items-center justify-center transition-transform active:scale-95"
    >
      <span
        className={`-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-[#FFEC8A] to-[#E8B830] ring-[5px] ring-[#0A0A0F] transition-shadow ${
          ativo ? 'shadow-[0_6px_22px_rgba(255,225,77,.6)]' : 'shadow-[0_4px_14px_rgba(255,225,77,.35)]'
        }`}
      >
        {/* brightness(0): o flamingo do kit é dourado — em silhueta preta
            aparece de verdade em cima do círculo, que também é dourado. */}
        <img src={flamingoLagun} alt="" className="h-8 w-auto" style={{ filter: 'brightness(0)' }} />
      </span>
    </button>
  );
}
