import type { ReactNode } from 'react';

/**
 * Barra de indicadores do painel — o mesmo formato usado em todas as telas
 * com números de topo (Redes Sociais, Social Media, Automações, Campanhas,
 * CRM). Faixa escura com brilho dourado no canto, um bloco de contexto à
 * esquerda e as métricas em colunas separadas por linha fina.
 *
 * Cada métrica pode ter uma barrinha de proporção (0–100). Use para dar
 * noção de peso relativo, não como precisão — quando não fizer sentido,
 * simplesmente não passe `barra`.
 */

export const CORES = {
  ouro: '#FFE14D',
  ouroSuave: '#FFEC8A',
  ambar: '#FFB84D',
  branco: '#FFFFFF',
  verde: '#34D399',
  azul: '#8FB4FF',
  rosa: '#F9A8D4',
} as const;

export interface Indicador {
  label: string;
  valor: string;
  sub?: ReactNode;
  cor?: string;
  /** Proporção da barrinha, 0–100. Omita para não mostrar barra. */
  barra?: number;
  /** Aparece só na web; some no celular. */
  soWeb?: boolean;
}

function Metrica({ label, valor, sub, cor = CORES.ouro, barra }: Indicador) {
  // O número encolhe conforme cresce para nunca quebrar a coluna.
  const tamanho = valor.length > 10 ? 19 : valor.length > 7 ? 22 : 26;
  return (
    <div className="min-w-0 border-white/10 pl-0 sm:border-l sm:pl-4">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor }} />
        {label}
      </span>
      <strong
        className="mt-2 block whitespace-nowrap font-display leading-none"
        style={{ color: cor, fontSize: tamanho }}
        title={valor}
      >
        {valor}
      </strong>
      {sub && <span className="mt-1 block truncate text-[11px] text-white/60">{sub}</span>}
      {barra !== undefined && (
        <div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, barra))}%`, background: cor }} />
        </div>
      )}
    </div>
  );
}

export function BarraIndicadores({ titulo, subtitulo, itens, carregando = false, avatar }: {
  titulo: string;
  subtitulo?: ReactNode;
  itens: Indicador[];
  carregando?: boolean;
  /** Foto opcional à esquerda do bloco de contexto (ex.: perfil conectado). */
  avatar?: ReactNode;
}) {
  const itensMobile = itens.filter((it) => !it.soWeb);
  const n = itensMobile.length;
  const valorLongo = itensMobile.some((it) => it.valor.length > 8);
  const colunasMobile = valorLongo ? Math.min(2, Math.max(n, 1)) : n > 3 ? Math.ceil(n / 2) : Math.max(n, 1);
  return (
    <div>
      {/* Web: faixa dourada original, sem nenhuma mudança. */}
      <section
        className={`max-md:hidden grid items-center gap-4 rounded-[22px] p-5 text-white shadow-[0_16px_40px_rgba(0,0,0,.35)] sm:p-6 md:grid-cols-2 ${
          { 2: 'xl:grid-cols-[minmax(190px,1.05fr)_repeat(2,minmax(0,1fr))]',
            3: 'xl:grid-cols-[minmax(190px,1.05fr)_repeat(3,minmax(0,1fr))]',
            4: 'xl:grid-cols-[minmax(190px,1.05fr)_repeat(4,minmax(0,1fr))]',
            5: 'xl:grid-cols-[minmax(190px,1.05fr)_repeat(5,minmax(0,1fr))]',
          }[Math.min(Math.max(itens.length, 2), 5)] ?? 'xl:grid-cols-[minmax(190px,1.05fr)_repeat(4,minmax(0,1fr))]'
        }`}
        // Degradê do marrom (esquerda) ao ouro (direita), puxado para o marrom:
        // ele domina até 65% e o ouro entra contido no fim.
        style={{ background: 'linear-gradient(90deg, #1C1206 0%, #4A360C 65%, #A8811A 100%)' }}
      >
        <div className="flex min-w-0 items-center gap-3 pr-2">
          {avatar}
          <div className="min-w-0 flex-1">
            <strong className="block truncate font-display text-sm font-semibold">{titulo}</strong>
            {subtitulo && <span className="mt-1 block truncate text-xs text-white/60">{subtitulo}</span>}
          </div>
        </div>
        {carregando
          ? Array.from({ length: Math.max(itens.length, 3) }).map((_, i) => (
              <div key={i} className="min-w-0 border-white/10 pl-0 sm:border-l sm:pl-4">
                <div className="h-2 w-16 rounded bg-white/10" />
                <div className="mt-3 h-6 w-20 rounded bg-white/10" />
              </div>
            ))
          : itens.map((it) => <Metrica key={it.label} {...it} />)}
      </section>

      {/* Celular: sem o retângulo dourado e sem o cabeçalho (Guilherme pediu
          pra tirar os dois) — só as métricas, cada uma na cor própria. */}
      <section className="hidden max-md:block">
        {/* Até 3, uma linha só. Com mais de 3, duas linhas em vez de rolar.
            Se algum valor for longo (dinheiro), no máximo 2 por linha, pra
            o número aparecer inteiro. */}
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${colunasMobile}, minmax(0, 1fr))` }}>
          {carregando
            ? Array.from({ length: itensMobile.length || 3 }).map((_, i) => (
                <div key={i} className="h-[94px] w-full animate-pulse rounded-2xl bg-white/[0.04]" />
              ))
            : itensMobile.map((it) => <MetricaMobile key={it.label} {...it} />)}
        </div>
      </section>
    </div>
  );
}

function MetricaMobile({ label, valor, sub, cor = CORES.ouro, barra }: Indicador) {
  const tamanho = valor.length > 10 ? 16 : valor.length > 7 ? 18 : 20;
  return (
    <div
      className="w-full min-w-0 rounded-2xl border border-white/[0.07] p-3"
      style={{ background: `linear-gradient(155deg, ${cor}26 0%, rgba(255,255,255,.02) 70%)` }}
    >
      <span className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-white/55">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor }} />
        {label}
      </span>
      <strong className="mt-1.5 block truncate font-display leading-none" style={{ color: cor, fontSize: tamanho }} title={valor}>
        {valor}
      </strong>
      {sub && <span className="mt-1 block truncate text-[10px] text-white/50">{sub}</span>}
      {barra !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, barra))}%`, background: cor }} />
        </div>
      )}
    </div>
  );
}
