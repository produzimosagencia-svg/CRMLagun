import { useMemo } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Copy, FileDown, Loader2, RotateCcw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRelatoriosMeta } from '@/components/relatorios/useRelatoriosMeta';
import { GradeCriativos, Kpi, SeletorEvento, SeletorPeriodo } from '@/components/relatorios/ui';
import {
  eventoEstaAtivo,
  flyerDoEvento,
  formatarDataEvento,
  formatCurrency,
  formatNumber,
  formatPct,
  formatRoas,
  getObjectiveMeta,
  OURO,
  presetValido,
  quebrarPorObjetivo,
  rotuloPreset,
  rotuloStatus,
  somarTotais,
} from '@/lib/relatoriosMeta';

/**
 * Página de um evento em Performance → Campanhas.
 * Faixa de KPIs, tabela das campanhas vinculadas (com troca de evento e
 * desvincular), quebra por objetivo, criativos, PDF e link do relatório.
 */
export default function InternoRelatorioEvento() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const datePreset = presetValido(params.get('periodo'));
  const dados = useRelatoriosMeta(datePreset);

  // Volta para a lista de onde veio (ativos/passados, marketing), mantendo o período.
  const voltar = useMemo(() => {
    const origem = (location.state as { voltar?: string } | null)?.voltar;
    if (origem) {
      const [caminho, busca = ''] = origem.split('?');
      const q = new URLSearchParams(busca);
      q.set('periodo', datePreset);
      return `${caminho}?${q.toString()}`;
    }
    return `/interno/ads/campanhas?periodo=${datePreset}`;
  }, [location.state, datePreset]);

  const mudarPeriodo = (v: string) => {
    setParams((atual) => {
      const n = new URLSearchParams(atual);
      n.set('periodo', v);
      return n;
    }, { replace: true });
  };

  const evento = dados.eventosPorId.get(eventId);
  const campanhas = dados.campanhasDoEvento(eventId);
  const t = useMemo(() => somarTotais(campanhas), [campanhas]);
  const porObjetivo = useMemo(() => quebrarPorObjetivo(campanhas, dados.orcamentoDiario), [campanhas, dados.orcamentoDiario]);
  const criativos = dados.criativosDoEvento(eventId);
  const carregandoMetricas = dados.carregandoConta || dados.carregandoInsights;
  const gerando = dados.gerandoPdf.has(eventId);
  const orcamentoTotal = campanhas.reduce((s, c) => s + (dados.orcamentoDiario.get(c.campaign_id) || 0), 0);

  const linkVoltar = (
    <Link to={voltar} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft size={14} /> Campanhas
    </Link>
  );

  if (dados.carregandoEventos) {
    return (
      <div className="space-y-4">
        {linkVoltar}
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" size={26} /></div>
      </div>
    );
  }

  if (!evento) {
    return (
      <div className="space-y-4">
        {linkVoltar}
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <CalendarDays size={28} className="text-muted-foreground/60" />
          <p className="text-sm text-foreground/80">Evento não encontrado.</p>
          <p className="text-xs text-muted-foreground">Ele pode ter sido removido da landing.</p>
        </div>
      </div>
    );
  }

  const flyer = flyerDoEvento(evento);
  const ativo = eventoEstaAtivo(evento);

  return (
    <div className="space-y-6 max-md:space-y-4">
      {linkVoltar}

      {/* Cabeçalho do evento */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-white/[0.04] max-md:h-20 max-md:w-14">
            {flyer
              ? <a href={flyer} target="_blank" rel="noreferrer"><img src={flyer} alt={`Flyer ${evento.nome}`} className="h-full w-full object-cover" /></a>
              : <div className="flex h-full items-center justify-center text-muted-foreground/60"><CalendarDays size={20} /></div>}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold leading-tight text-foreground max-md:text-lg">{evento.nome}</h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">{formatarDataEvento(evento)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className="rounded-full px-2 py-0.5 font-semibold"
                style={ativo ? { color: OURO, background: `${OURO}1F` } : { color: 'var(--muted-foreground)', background: 'rgba(255,255,255,.06)' }}
              >
                {ativo ? 'Evento ativo' : 'Evento passado'}
              </span>
              <span className="text-muted-foreground">
                {campanhas.length} {campanhas.length === 1 ? 'campanha vinculada' : 'campanhas vinculadas'} · {rotuloPreset(datePreset)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-md:w-full">
          <SeletorPeriodo value={datePreset} onChange={mudarPeriodo} />
          <Button type="button" variant="outline" size="icon" onClick={dados.recarregar} disabled={carregandoMetricas} title="Atualizar dados" className="h-9 w-9">
            <RotateCcw size={14} className={carregandoMetricas ? 'animate-spin' : ''} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void dados.copiarLinkRelatorio(evento.id)}
            title="Link secreto que abre o PDF das campanhas deste evento"
            className="h-9 gap-1.5 text-xs"
          >
            <Copy size={13} /> Copiar link do relatório
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={gerando || carregandoMetricas || !campanhas.length}
            onClick={() => void dados.baixarRelatorioEvento(evento.id)}
            className="h-9 gap-1.5 text-xs font-semibold text-black hover:brightness-110"
            style={{ background: OURO }}
          >
            {gerando ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {gerando ? 'Gerando…' : 'Baixar relatório'}
          </Button>
        </div>
      </div>

      {dados.erro && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-400">{dados.erro}</div>
      )}

      {/* KPIs */}
      {carregandoMetricas ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => <div key={i} className="h-[68px] animate-pulse rounded-lg border border-border bg-card" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <Kpi grande destaque rotulo="Investido" valor={formatCurrency(t.spend)} sub={orcamentoTotal > 0 ? `${formatCurrency(orcamentoTotal)}/dia em orçamento` : 'no período'} />
          <Kpi grande rotulo="Impressões" valor={formatNumber(t.impressions)} sub={t.impressions ? `CPM ${formatCurrency((t.spend / t.impressions) * 1000)}` : undefined} />
          <Kpi grande rotulo="Alcance" valor={formatNumber(t.reach)} sub={t.reach ? `frequência ${(t.impressions / t.reach).toFixed(2).replace('.', ',')}` : undefined} />
          <Kpi grande rotulo="Cliques" valor={formatNumber(t.clicks)} />
          <Kpi grande rotulo="CTR" valor={formatPct(t.clicks, t.impressions)} />
          <Kpi grande rotulo="CPC" valor={t.clicks ? formatCurrency(t.spend / t.clicks) : '—'} />
          <Kpi grande rotulo="Compras" valor={t.purchases ? formatNumber(t.purchases) : '—'} sub={t.purchases ? `${formatCurrency(t.spend / t.purchases)}/compra` : undefined} />
          <Kpi grande rotulo="Receita" valor={t.revenue ? formatCurrency(t.revenue) : '—'} sub="7d clique · 1d view" />
          <Kpi grande destaque rotulo="ROAS" valor={formatRoas(t.roas)} sub="só Meta Ads" />
          <Kpi grande rotulo="Resultados" valor={t.results ? formatNumber(t.results) : '—'} sub={t.results ? `${formatCurrency(t.spend / t.results)}/resultado` : 'ação principal do objetivo'} />
        </div>
      )}

      {/* Campanhas do evento */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-display text-sm font-semibold text-foreground">Campanhas do evento</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            O link e o PDF do relatório usam só estas campanhas. Troque o evento ou desvincule na última coluna.
          </p>
        </div>
        {campanhas.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">
            Nenhuma campanha vinculada ainda. Vincule em "Campanhas aguardando atribuição", na <Link to={voltar} className="underline underline-offset-2 hover:text-foreground">lista de eventos</Link>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Campanha</th>
                  <th className="px-2 py-2 text-left font-medium">Objetivo</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Orç. diário</th>
                  <th className="px-2 py-2 text-right font-medium">Gasto</th>
                  <th className="px-2 py-2 text-right font-medium">Impressões</th>
                  <th className="px-2 py-2 text-right font-medium">Alcance</th>
                  <th className="px-2 py-2 text-right font-medium">Cliques</th>
                  <th className="px-2 py-2 text-right font-medium">CTR</th>
                  <th className="px-2 py-2 text-right font-medium">CPC</th>
                  <th className="px-2 py-2 text-right font-medium">Compras</th>
                  <th className="px-2 py-2 text-right font-medium">Receita</th>
                  <th className="px-2 py-2 text-right font-medium">ROAS</th>
                  <th className="px-4 py-2 text-right font-medium">Evento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campanhas.map((c) => {
                  const obj = getObjectiveMeta(c.objective);
                  const status = rotuloStatus(dados.statusPorCampanha.get(c.campaign_id));
                  const orc = dados.orcamentoDiario.get(c.campaign_id) || 0;
                  const semEntrega = c.spend === 0 && c.impressions === 0;
                  const salvando = dados.salvandoVinculo.has(c.campaign_id);
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="max-w-[280px] px-4 py-2.5">
                        <p className="truncate font-medium text-foreground" title={c.name}>{c.name}</p>
                        {semEntrega && <p className="text-[10px] text-muted-foreground">sem entrega no período</p>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">{c.objective ? `${obj.icon} ${obj.label}` : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        {status
                          ? <span className={status.ativa ? 'font-semibold text-emerald-400' : 'text-muted-foreground'}>{status.texto}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right" style={orc ? { color: OURO } : undefined}>{orc ? formatCurrency(orc) : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold text-foreground">{formatCurrency(c.spend)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right text-muted-foreground">{formatNumber(c.impressions)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right text-muted-foreground">{formatNumber(c.reach)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right text-muted-foreground">{formatNumber(c.clicks)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right text-muted-foreground">{formatPct(c.clicks, c.impressions)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right text-muted-foreground">{c.clicks ? formatCurrency(c.spend / c.clicks) : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right text-foreground">{c.purchases ? formatNumber(c.purchases) : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold text-emerald-400">{c.revenue ? formatCurrency(c.revenue) : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold" style={c.revenue ? { color: OURO } : undefined}>{formatRoas(c.spend ? c.revenue / c.spend : 0)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <SeletorEvento campaignId={c.campaign_id} campaignName={c.name} dados={dados} mostrarSugestao={false} />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={salvando}
                            onClick={() => void dados.vincularCampanha(c.campaign_id, c.name, null)}
                            title="Desvincular do evento"
                            aria-label="Desvincular do evento"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400"
                          >
                            <Unlink size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quebra por objetivo */}
      {porObjetivo.length > 0 && !carregandoMetricas && (
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-foreground">Por objetivo</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Tipo</th>
                  <th className="px-2 py-2 text-right font-medium">Campanhas</th>
                  <th className="px-2 py-2 text-right font-medium">Orç. diário</th>
                  <th className="px-2 py-2 text-right font-medium">Gasto</th>
                  <th className="px-2 py-2 text-right font-medium">Impressões</th>
                  <th className="px-2 py-2 text-right font-medium">Cliques</th>
                  <th className="px-4 py-2 text-right font-medium">Retorno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porObjetivo.map((row) => (
                  <tr key={`${row.objType}:${row.objLabel}`}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.objIcon} {row.objLabel}</td>
                    <td className="px-2 py-2.5 text-right text-muted-foreground">{row.campanhas}</td>
                    <td className="px-2 py-2.5 text-right" style={row.dailyBudget ? { color: OURO } : undefined}>{row.dailyBudget ? formatCurrency(row.dailyBudget) : '—'}</td>
                    <td className="px-2 py-2.5 text-right text-foreground">{formatCurrency(row.spend)}</td>
                    <td className="px-2 py-2.5 text-right text-muted-foreground">{formatNumber(row.impressions)}</td>
                    <td className="px-2 py-2.5 text-right text-muted-foreground">{formatNumber(row.clicks)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-400">{row.returnValue ? formatCurrency(row.returnValue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Criativos */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">Criativos do evento</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Anúncios das campanhas vinculadas com entrega no período.</p>
          </div>
          {!dados.carregandoCriativos && (
            <span className="rounded-full border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              {criativos.length} {criativos.length === 1 ? 'criativo' : 'criativos'}
            </span>
          )}
        </div>
        <GradeCriativos criativos={criativos} carregando={dados.carregandoCriativos || dados.carregandoConta} />
      </section>
    </div>
  );
}
