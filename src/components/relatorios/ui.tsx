import type { ReactNode } from 'react';
import { ImageOff, Loader2, Sparkles, Video } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DATE_PRESETS,
  formatCurrency,
  formatNumber,
  OURO,
  sugerirEvento,
  type AdCreativeInsight,
  type EventoLanding,
} from '@/lib/relatoriosMeta';
import type { RelatoriosMeta } from './useRelatoriosMeta';

/** Seletor de período (presets do Meta). */
export function SeletorPeriodo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[170px] rounded-lg border-border bg-card text-xs max-md:w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DATE_PRESETS.map((p) => (
          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SEM_EVENTO = '__sem_evento__';

/**
 * Select "Evento" de uma campanha + chip de sugestão pelo nome.
 * A lista mostra só eventos ativos; o evento atual entra mesmo se já passou.
 */
export function SeletorEvento({ campaignId, campaignName, dados, mostrarSugestao = true, permitirSemEvento = true }: {
  campaignId: string;
  campaignName: string;
  dados: Pick<RelatoriosMeta, 'eventosAtivos' | 'eventoDaCampanha' | 'salvandoVinculo' | 'vincularCampanha'>;
  mostrarSugestao?: boolean;
  permitirSemEvento?: boolean;
}) {
  const eventoAtual = campaignId ? dados.eventoDaCampanha(campaignId) : undefined;
  const salvando = dados.salvandoVinculo.has(campaignId);
  const sugestao: EventoLanding | null = mostrarSugestao && !eventoAtual ? sugerirEvento(campaignName, dados.eventosAtivos) : null;
  const opcoes = eventoAtual && !dados.eventosAtivos.some((e) => e.id === eventoAtual.id)
    ? [...dados.eventosAtivos, eventoAtual]
    : dados.eventosAtivos;
  const bloqueado = salvando || !campaignId;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 max-md:justify-start">
      {sugestao && (
        <button
          type="button"
          disabled={bloqueado}
          onClick={() => void dados.vincularCampanha(campaignId, campaignName, sugestao.id)}
          title={`Sugestão pelo nome da campanha. Clique para vincular a ${sugestao.nome}.`}
          className="flex h-8 max-w-[180px] items-center gap-1 rounded-md border border-dashed px-2 text-[11px] font-medium transition-colors disabled:opacity-50"
          style={{ borderColor: `${OURO}99`, color: OURO, background: `${OURO}14` }}
        >
          <Sparkles size={12} className="shrink-0" />
          <span className="truncate">{sugestao.nome}</span>
        </button>
      )}
      <Select
        value={eventoAtual ? eventoAtual.id : SEM_EVENTO}
        disabled={bloqueado}
        onValueChange={(valor) => void dados.vincularCampanha(campaignId, campaignName, valor === SEM_EVENTO ? null : valor)}
      >
        <SelectTrigger
          className="h-8 w-[160px] rounded-md bg-card text-[11px]"
          style={eventoAtual ? { borderColor: `${OURO}99` } : undefined}
          title={!campaignId ? 'Campanha sem ID no Meta: não dá para vincular.' : undefined}
        >
          {salvando
            ? <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Salvando…</span>
            : <SelectValue placeholder="Escolher evento" />}
        </SelectTrigger>
        <SelectContent>
          {permitirSemEvento || !eventoAtual
            ? <SelectItem value={SEM_EVENTO} className="text-xs">{eventoAtual ? 'Desvincular' : 'Escolher evento'}</SelectItem>
            : null}
          {opcoes.map((ev) => (
            <SelectItem key={ev.id} value={ev.id} className="text-xs">{ev.nome}</SelectItem>
          ))}
          {!opcoes.length && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum evento ativo na landing.</div>}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Mini métrica dos cards e da faixa de KPIs. */
export function Kpi({ rotulo, valor, sub, destaque = false, grande = false }: {
  rotulo: string; valor: string; sub?: ReactNode; destaque?: boolean; grande?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-white/[0.02] px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p
        className={`mt-1 truncate font-display font-semibold leading-none ${grande ? 'text-xl' : 'text-[15px]'}`}
        style={destaque ? { color: OURO } : undefined}
        title={valor}
      >
        {valor}
      </p>
      {sub && <p className="mt-1 truncate text-[10.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Grade de criativos (anúncios) com prévia, gasto, impressões e cliques. */
export function GradeCriativos({ criativos, carregando }: { criativos: AdCreativeInsight[]; carregando: boolean }) {
  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-xs text-muted-foreground">
        <Loader2 size={15} className="animate-spin" /> Carregando criativos...
      </div>
    );
  }
  if (!criativos.length) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-xs text-muted-foreground">
        <ImageOff size={15} /> Nenhum criativo com entrega neste período.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {criativos.map((creative) => {
        const preview = creative.image_url || creative.thumbnail_url;
        const isVideo = creative.creative_type === 'video';
        return (
          <a
            key={creative.ad_id}
            href={creative.video_url || creative.image_url || creative.thumbnail_url || undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => { if (!preview && !creative.video_url) event.preventDefault(); }}
            className="group overflow-hidden rounded-xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-[#FFE14D]/50 hover:shadow-lg"
          >
            <div className="relative aspect-video overflow-hidden bg-black/30">
              {isVideo && creative.video_url
                ? <video src={creative.video_url} poster={preview || undefined} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                : preview
                  ? <img src={preview} alt={creative.ad_name || 'Criativo da campanha'} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                  : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff size={22} /></div>}
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur">
                {isVideo ? <Video size={11} /> : null}{isVideo ? 'Vídeo' : 'Imagem'}
              </span>
            </div>
            <div className="space-y-2 p-3">
              <div>
                <p className="truncate text-xs font-bold text-foreground" title={creative.ad_name}>{creative.ad_name || 'Anúncio sem nome'}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={creative.campaign_name}>{creative.campaign_name}</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                {[
                  ['Gasto', formatCurrency(Number(creative.spend || 0))],
                  ['Impressões', formatNumber(Number(creative.impressions || 0))],
                  ['Cliques', formatNumber(Number(creative.clicks || 0))],
                ].map(([r, v]) => (
                  <div key={r} className="rounded-md bg-white/[0.04] px-1 py-1.5">
                    <p className="text-[8px] uppercase text-muted-foreground">{r}</p>
                    <p className="text-[10px] font-semibold text-foreground/85">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
