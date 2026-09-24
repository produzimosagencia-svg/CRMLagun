import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileDown,
  History,
  Loader2,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarraIndicadores, CORES } from '@/components/interno/BarraIndicadores';
import { useRelatoriosMeta, type RelatoriosMeta } from '@/components/relatorios/useRelatoriosMeta';
import { Kpi, SeletorEvento, SeletorPeriodo } from '@/components/relatorios/ui';
import {
  flyerDoEvento,
  formatarDataEvento,
  formatCurrency,
  formatCurrencyShort,
  formatNumber,
  formatRoas,
  getObjectiveMeta,
  OURO,
  presetValido,
  rotuloPreset,
  rotuloStatus,
  somarTotais,
  type EventoLanding,
} from '@/lib/relatoriosMeta';

/**
 * Performance → Campanhas.
 *
 * Grade de cards, um por evento (ativos ou passados), com a prévia das
 * campanhas vinculadas e o PDF do evento. Abaixo, as campanhas do período que
 * ainda não têm evento, para vincular. O detalhe de cada evento fica em
 * /interno/ads/campanhas/evento/:eventId.
 */
export default function InternoRelatorios() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const datePreset = presetValido(params.get('periodo'));
  const verPassados = params.get('ver') === 'passados';
  const dados = useRelatoriosMeta(datePreset);
  const noMarketing = location.pathname.startsWith('/interno/marketing');

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfSel, setPdfSel] = useState<Set<string>>(new Set());

  const mudarParam = (chave: string, valor: string | null) => {
    setParams((atual) => {
      const n = new URLSearchParams(atual);
      if (valor) n.set(chave, valor); else n.delete(chave);
      return n;
    }, { replace: true });
  };

  const eventosDoModo = verPassados ? dados.eventosPassados : dados.eventosAtivos;
  const carregandoMetricas = dados.carregandoConta || dados.carregandoInsights;
  const campanhasDisponiveis = useMemo(
    () => [...dados.resumoPorCampanha.values()].sort((a, b) => b.spend - a.spend),
    [dados.resumoPorCampanha],
  );
  const totais = dados.totaisConta;

  const abrirEvento = (eventId: string) => {
    navigate(`/interno/ads/campanhas/evento/${eventId}?periodo=${datePreset}`, {
      state: { voltar: `${location.pathname}${location.search}` },
    });
  };

  const abrirSeletorPdf = () => {
    setPdfSel(new Set(campanhasDisponiveis.map((c) => c.id)));
    setPdfOpen(true);
  };

  const gerarPdfPersonalizado = async () => {
    const escolhidas = campanhasDisponiveis.filter((c) => pdfSel.has(c.id));
    if (!escolhidas.length) return;
    const ok = await dados.gerarPdf('__personalizado__', escolhidas, 'Lagun', 'relatorio-campanhas-lagun');
    if (ok) setPdfOpen(false);
  };
  const gerandoPersonalizado = dados.gerandoPdf.has('__personalizado__');

  if (dados.semConta) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <TrendingUp size={32} className="text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground/80">Conta de anúncios ainda não configurada</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Assim que a conta do Meta Ads da Lagun for definida, os relatórios de campanhas aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-md:space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {noMarketing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/interno/marketing')}
              className="-ml-2 mb-1 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={14} className="mr-1" /> Marketing
            </Button>
          )}
          <h1 className="font-display text-xl font-semibold text-foreground max-md:text-lg">Campanhas por evento</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Meta Ads · {rotuloPreset(datePreset)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-md:w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={verPassados}
            onClick={() => mudarParam('ver', verPassados ? null : 'passados')}
            className="h-9 gap-1.5 text-xs"
            style={verPassados ? { borderColor: OURO, color: OURO, background: `${OURO}14` } : undefined}
          >
            <History size={14} /> Eventos passados
          </Button>
          <SeletorPeriodo value={datePreset} onChange={(v) => mudarParam('periodo', v)} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={dados.recarregar}
            disabled={carregandoMetricas}
            title="Atualizar dados"
            className="h-9 w-9"
          >
            <RotateCcw size={14} className={carregandoMetricas ? 'animate-spin' : ''} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={carregandoMetricas || !campanhasDisponiveis.length || gerandoPersonalizado}
            onClick={abrirSeletorPdf}
            title="Escolher campanhas de qualquer evento para um PDF só"
            className="h-9 gap-1.5 text-xs max-md:ml-auto"
          >
            {gerandoPersonalizado ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            PDF personalizado
          </Button>
        </div>
      </div>

      {dados.erro && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-400">{dados.erro}</div>
      )}

      <BarraIndicadores
        titulo="Meta Ads · conta toda"
        subtitulo={`${dados.eventosAtivos.length} ${dados.eventosAtivos.length === 1 ? 'evento ativo' : 'eventos ativos'} · ${campanhasDisponiveis.length} ${campanhasDisponiveis.length === 1 ? 'campanha' : 'campanhas'} no período`}
        carregando={carregandoMetricas}
        itens={[
          { label: 'Gasto total', valor: formatCurrency(totais.spend), valorCurto: formatCurrencyShort(totais.spend), sub: 'no período', cor: CORES.ambar, barra: 100 },
          { label: 'Retorno', valor: formatCurrency(totais.revenue), valorCurto: formatCurrencyShort(totais.revenue), sub: totais.purchases > 0 ? `${totais.purchases} compras` : 'sem compras', cor: CORES.verde, barra: totais.spend ? Math.min(100, (totais.revenue / totais.spend) * 25) : 0 },
          { label: 'ROAS', valor: totais.roas > 0 ? `${totais.roas.toFixed(2)}x` : '—', sub: totais.roas > 0 ? `R$ ${totais.roas.toFixed(2).replace('.', ',')} por real` : undefined, cor: CORES.ouro, barra: Math.min(100, totais.roas * 20) },
          { label: 'Impressões', valor: formatNumber(totais.impressions), sub: `alcance ${formatNumber(totais.reach)}`, cor: CORES.azul, barra: 72, soWeb: true },
          { label: 'Cliques', valor: formatNumber(totais.clicks), sub: totais.impressions ? `CTR ${((totais.clicks / totais.impressions) * 100).toFixed(1).replace('.', ',')}%` : undefined, cor: CORES.branco, barra: totais.impressions ? Math.min(100, (totais.clicks / totais.impressions) * 100 * 20) : 0, soWeb: true },
        ]}
      />

      {/* Grade de eventos */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-foreground">
            {verPassados ? 'Eventos passados' : 'Eventos ativos'}
            {!dados.carregandoEventos && <span className="ml-2 text-xs font-normal text-muted-foreground">{eventosDoModo.length}</span>}
          </h2>
          {verPassados && (
            <button type="button" onClick={() => mudarParam('ver', null)} className="text-xs text-muted-foreground hover:text-foreground">
              Voltar para os ativos
            </button>
          )}
        </div>

        {dados.carregandoEventos ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-[260px] animate-pulse rounded-xl border border-border bg-card" />)}
          </div>
        ) : eventosDoModo.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
            <CalendarDays size={24} className="text-muted-foreground/60" />
            <p className="text-sm text-foreground/80">{verPassados ? 'Nenhum evento passado.' : 'Nenhum evento ativo na landing.'}</p>
            {!verPassados && <p className="text-xs text-muted-foreground">Eventos aparecem aqui quando estão na landing e a data ainda não passou.</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {eventosDoModo.map((evento) => (
              <CardEvento
                key={evento.id}
                evento={evento}
                dados={dados}
                carregandoMetricas={carregandoMetricas}
                onAbrir={() => abrirEvento(evento.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Campanhas sem evento */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">
              Campanhas aguardando atribuição
              {!carregandoMetricas && !dados.carregandoEventos && dados.campanhasSemEvento.length > 0 && (
                <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: OURO, background: `${OURO}1F` }}>
                  {dados.campanhasSemEvento.length}
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Campanhas com entrega em {rotuloPreset(datePreset).toLowerCase()} sem evento. Escolha o evento e ela vai para o card dele.
            </p>
          </div>
        </div>

        {carregandoMetricas || dados.carregandoEventos ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
        ) : dados.campanhasSemEvento.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <CheckCircle2 size={15} className="text-emerald-400" />
            {campanhasDisponiveis.length ? 'Todas as campanhas do período estão vinculadas a um evento.' : 'Nenhuma campanha com entrega no período.'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dados.campanhasSemEvento.map((c) => {
              const obj = getObjectiveMeta(c.objective);
              const status = rotuloStatus(dados.statusPorCampanha.get(c.campaign_id));
              return (
                <div key={c.id} className="flex items-center gap-4 px-4 py-2.5 max-md:flex-wrap max-md:gap-2">
                  <div className="min-w-0 flex-1 max-md:basis-full">
                    <p className="truncate text-xs font-medium text-foreground" title={c.name}>{c.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span>{obj.icon} {obj.label}</span>
                      {status && <StatusPill ativa={status.ativa} texto={status.texto} />}
                    </p>
                  </div>
                  <div className="w-28 text-right max-md:w-auto max-md:text-left">
                    <p className="text-xs font-semibold text-foreground">{formatCurrency(c.spend)}</p>
                    <p className="text-[10px] text-muted-foreground">investido</p>
                  </div>
                  <div className="shrink-0 max-md:ml-auto">
                    <SeletorEvento campaignId={c.campaign_id} campaignName={c.name} dados={dados} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Seletor de campanhas do PDF personalizado */}
      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Campanhas no relatório</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">
            {rotuloPreset(datePreset)} · escolha o que entra no PDF.
          </p>

          <div className="flex items-center justify-between border-b border-border pb-2 text-xs">
            <span className="text-muted-foreground">{pdfSel.size} de {campanhasDisponiveis.length} selecionadas</span>
            <div className="flex gap-1">
              <button onClick={() => setPdfSel(new Set(campanhasDisponiveis.map((c) => c.id)))} className="rounded-md px-2 py-1 font-medium hover:bg-muted">Todas</button>
              <button onClick={() => setPdfSel(new Set())} className="rounded-md px-2 py-1 font-medium hover:bg-muted">Nenhuma</button>
            </div>
          </div>

          <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
            {campanhasDisponiveis.map((c) => {
              const marcada = pdfSel.has(c.id);
              const ativa = dados.campanhaAtiva(c.campaign_id);
              const evento = c.campaign_id ? dados.eventoDaCampanha(c.campaign_id) : undefined;
              return (
                <button
                  key={c.id}
                  onClick={() => setPdfSel((prev) => {
                    const n = new Set(prev);
                    if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                    return n;
                  })}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${marcada ? '' : 'border-border hover:bg-muted/50'}`}
                  style={marcada ? { borderColor: `${OURO}99`, background: `${OURO}14` } : undefined}
                >
                  <span
                    className="grid h-4 w-4 shrink-0 place-items-center rounded border border-muted-foreground/40 text-black"
                    style={marcada ? { borderColor: OURO, background: OURO } : undefined}
                  >
                    {marcada && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{c.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {formatCurrency(c.spend)} · {formatNumber(c.impressions)} impressões{evento ? ` · ${evento.nome}` : ''}
                    </span>
                  </span>
                  <StatusPill ativa={ativa} texto={ativa ? 'Ativa' : 'Pausada'} />
                </button>
              );
            })}
            {!campanhasDisponiveis.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha com entrega no período.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPdfOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!pdfSel.size || gerandoPersonalizado}
              onClick={() => void gerarPdfPersonalizado()}
              className="gap-1.5 font-semibold text-black hover:brightness-110"
              style={{ background: OURO }}
            >
              {gerandoPersonalizado ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              {gerandoPersonalizado ? 'Gerando…' : `Gerar PDF (${pdfSel.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ ativa, texto }: { ativa: boolean; texto: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ativa ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.06] text-muted-foreground'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ativa ? 'bg-emerald-400' : 'bg-muted-foreground/60'}`} />
      {texto}
    </span>
  );
}

/** Card de prévia de um evento. Clicar abre a página do evento. */
function CardEvento({ evento, dados, carregandoMetricas, onAbrir }: {
  evento: EventoLanding;
  dados: RelatoriosMeta;
  carregandoMetricas: boolean;
  onAbrir: () => void;
}) {
  const campanhas = dados.campanhasDoEvento(evento.id);
  const t = somarTotais(campanhas);
  const flyer = flyerDoEvento(evento);
  const gerando = dados.gerandoPdf.has(evento.id);
  const statusCarregado = dados.statusPorCampanha.size > 0;
  const algumaAtiva = campanhas.some((c) => dados.statusPorCampanha.get(c.campaign_id) === 'ACTIVE');

  const parar = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };
  const teclado = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={teclado}
      className="group flex cursor-pointer flex-col rounded-xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-[#FFE14D]/50 hover:shadow-[0_12px_32px_rgba(0,0,0,.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE14D]/60"
    >
      {/* Topo: flyer, nome e data */}
      <div className="flex items-start gap-3">
        <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-white/[0.04]">
          {flyer
            ? <img src={flyer} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center text-muted-foreground/60"><CalendarDays size={16} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-tight text-foreground" title={evento.nome}>{evento.nome}</h3>
          <p className="mt-1 text-xs capitalize text-muted-foreground">{formatarDataEvento(evento)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {campanhas.length === 0
              ? <StatusPill ativa={false} texto="Sem campanhas" />
              : (
                <>
                  <span>{campanhas.length} {campanhas.length === 1 ? 'campanha' : 'campanhas'}</span>
                  {statusCarregado && <StatusPill ativa={algumaAtiva} texto={algumaAtiva ? 'Ativa' : 'Pausada'} />}
                </>
              )}
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-[#FFE14D]" />
      </div>

      {/* Prévia de KPIs */}
      <div className="mt-4 flex-1">
        {campanhas.length === 0 ? (
          <div className="flex h-full min-h-[118px] items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
            Nenhuma campanha vinculada ainda
          </div>
        ) : carregandoMetricas ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[54px] animate-pulse rounded-lg bg-white/[0.04]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Kpi rotulo="Investido" valor={formatCurrency(t.spend)} destaque />
            {t.reach > 0
              ? <Kpi rotulo="Alcance" valor={formatNumber(t.reach)} />
              : <Kpi rotulo="Impressões" valor={formatNumber(t.impressions)} />}
            <Kpi rotulo="Cliques" valor={formatNumber(t.clicks)} />
            <Kpi rotulo="Compras" valor={t.purchases ? formatNumber(t.purchases) : '—'} sub={t.revenue > 0 ? `ROAS ${formatRoas(t.roas)}` : undefined} />
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={gerando || carregandoMetricas || campanhas.length === 0}
          onClick={parar(() => void dados.baixarRelatorioEvento(evento.id))}
          className="h-8 flex-1 gap-1.5 text-xs font-semibold text-black hover:brightness-110"
          style={{ background: OURO }}
        >
          {gerando ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
          {gerando ? 'Gerando…' : 'Baixar relatório'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={parar(() => void dados.copiarLinkRelatorio(evento.id))}
          title="Copiar link do relatório (abre o PDF deste evento)"
          aria-label="Copiar link do relatório"
          className="h-8 w-8 shrink-0"
        >
          <Copy size={13} />
        </Button>
      </div>
    </div>
  );
}
