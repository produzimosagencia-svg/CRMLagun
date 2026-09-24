import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { baixarRelatorioPdf } from '@/lib/relatorioPdf';
import { RelatorioCampanhas, type CriativoRel, type LinhaCampanha } from '@/components/interno/RelatorioCampanhas';
import {
  ADS_ACCOUNT_ID,
  APP_URL,
  diasDoPreset,
  eventoEstaAtivo,
  hojeSaoPaulo,
  resumirCampanhas,
  rotuloPreset,
  slug,
  somarTotais,
  type AdCreativeInsight,
  type CampaignBudget,
  type CampaignInsight,
  type CampanhaResumo,
  type EventoLanding,
  type Vinculo,
} from '@/lib/relatoriosMeta';

/**
 * Dados de Meta Ads + eventos da landing para as telas de relatório.
 *
 * Busca a conta, os insights por campanha, orçamentos, status e criativos na
 * edge function meta-ads-api, e os eventos/vínculos no Supabase. Tudo que a
 * lista de eventos e a página do evento precisam sai daqui, para as duas telas
 * não repetirem a busca.
 */

async function chamarMetaAds<T = any>(params: Record<string, string>): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID
    || (import.meta.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1];
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/meta-ads-api?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.json();
}

const erroTexto = (e: unknown) => {
  if (!e) return 'Erro desconhecido';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  return m || JSON.stringify(e);
};

export function useRelatoriosMeta(datePreset: string) {
  const [versao, setVersao] = useState(0);
  const [contaId, setContaId] = useState<string | null>(null);
  const [carregandoConta, setCarregandoConta] = useState(!!ADS_ACCOUNT_ID);
  const [erro, setErro] = useState<string | null>(null);

  const [eventos, setEventos] = useState<EventoLanding[]>([]);
  const [vinculos, setVinculos] = useState<Map<string, Vinculo>>(new Map());
  const [carregandoEventos, setCarregandoEventos] = useState(true);
  const [salvandoVinculo, setSalvandoVinculo] = useState<Set<string>>(new Set());

  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [carregandoInsights, setCarregandoInsights] = useState(false);
  const [criativos, setCriativos] = useState<AdCreativeInsight[]>([]);
  const [carregandoCriativos, setCarregandoCriativos] = useState(false);
  const [orcamentos, setOrcamentos] = useState<CampaignBudget[]>([]);
  const [statusPorCampanha, setStatusPorCampanha] = useState<Map<string, string>>(new Map());
  const [gerandoPdf, setGerandoPdf] = useState<Set<string>>(new Set());

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  // Eventos da landing e vínculos salvos campanha → evento.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregandoEventos(true);
      const [ev, vc] = await Promise.all([
        (supabase as any)
          .from('lagun_events')
          .select('id, nome, data, dia_semana, show_on_landing, relatorio_token, flyer_mobile_url, flyer_desktop_url, display_order')
          .order('display_order', { ascending: true }),
        (supabase as any).from('lagun_event_campaigns').select('campaign_id, event_id, campaign_name'),
      ]);
      if (cancelado) return;
      if (ev.error) console.error('[Relatórios] Falha ao carregar eventos', ev.error);
      else setEventos((ev.data || []) as EventoLanding[]);
      if (vc.error) console.error('[Relatórios] Falha ao carregar vínculos', vc.error);
      else setVinculos(new Map(((vc.data || []) as Vinculo[]).map((v) => [v.campaign_id, v])));
      setCarregandoEventos(false);
    })();
    return () => { cancelado = true; };
  }, [versao]);

  // Conta de anúncios.
  useEffect(() => {
    if (!ADS_ACCOUNT_ID) return;
    (async () => {
      try {
        const result = await chamarMetaAds({ action: 'accounts' });
        if (result.error) {
          setErro(erroTexto(result.error));
        } else if (result.data) {
          const account = result.data.find((acc: any) => acc.account_id === ADS_ACCOUNT_ID);
          setContaId(account ? account.account_id : ADS_ACCOUNT_ID);
        }
      } catch (err) {
        setErro(erroTexto(err));
      } finally {
        setCarregandoConta(false);
      }
    })();
  }, []);

  // Insights por campanha no período.
  useEffect(() => {
    if (!contaId) return;
    let cancelado = false;
    (async () => {
      setCarregandoInsights(true);
      try {
        const result = await chamarMetaAds({ action: 'insights', account_id: contaId, date_preset: datePreset });
        if (cancelado) return;
        if (result.error) {
          setErro(erroTexto(result.error));
          setInsights([]);
        } else {
          setInsights(result.data || []);
          setErro(null);
        }
      } catch (err) {
        if (!cancelado) setErro(erroTexto(err));
      } finally {
        if (!cancelado) setCarregandoInsights(false);
      }
    })();
    return () => { cancelado = true; };
  }, [contaId, datePreset, versao]);

  // Criativos (anúncios) no período.
  useEffect(() => {
    if (!contaId) return;
    let cancelado = false;
    (async () => {
      setCarregandoCriativos(true);
      try {
        const result = await chamarMetaAds({ action: 'ad_creatives', account_id: contaId, date_preset: datePreset });
        if (cancelado) return;
        if (result.error) {
          console.error('[Relatórios] Falha ao carregar criativos', result.error);
          setCriativos([]);
        } else {
          setCriativos(((result.data || []) as AdCreativeInsight[]).sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)));
        }
      } catch (e) {
        console.error('[Relatórios] Falha ao carregar criativos', e);
        if (!cancelado) setCriativos([]);
      } finally {
        if (!cancelado) setCarregandoCriativos(false);
      }
    })();
    return () => { cancelado = true; };
  }, [contaId, datePreset, versao]);

  // Orçamento diário e status (ativa/pausada) de cada campanha.
  useEffect(() => {
    if (!contaId) return;
    let cancelado = false;
    (async () => {
      const [orc, camp] = await Promise.allSettled([
        chamarMetaAds({ action: 'campaign_budgets', account_id: contaId }),
        chamarMetaAds({ action: 'campaigns', account_id: contaId }),
      ]);
      if (cancelado) return;
      if (orc.status === 'fulfilled' && !orc.value.error) setOrcamentos(orc.value.data || []);
      else { console.error('[Relatórios] Falha ao carregar orçamentos', orc); setOrcamentos([]); }
      if (camp.status === 'fulfilled' && !camp.value.error) {
        setStatusPorCampanha(new Map((camp.value.data || []).map((c: { id: string; effective_status?: string }) => [c.id, c.effective_status || ''])));
      }
      // Sem status: todas contam como ativas (mesmo comportamento de antes).
    })();
    return () => { cancelado = true; };
  }, [contaId, versao]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const eventosPorId = useMemo(() => new Map(eventos.map((e) => [e.id, e])), [eventos]);

  const { eventosAtivos, eventosPassados } = useMemo(() => {
    const hoje = hojeSaoPaulo();
    const ativos: EventoLanding[] = [];
    const passados: EventoLanding[] = [];
    for (const e of eventos) (eventoEstaAtivo(e, hoje) ? ativos : passados).push(e);
    // Ativos: o mais próximo primeiro (sem data no fim). Passados: o mais recente primeiro.
    ativos.sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || (a.display_order ?? 0) - (b.display_order ?? 0));
    passados.sort((a, b) => (b.data || '0000').localeCompare(a.data || '0000'));
    return { eventosAtivos: ativos, eventosPassados: passados };
  }, [eventos]);

  const orcamentoDiario = useMemo(() => new Map(
    orcamentos.map((c) => [c.campaign_id, Number(c.daily_budget || 0) / 100]),
  ), [orcamentos]);

  const resumoPorCampanha = useMemo(() => resumirCampanhas(insights), [insights]);
  const totaisConta = useMemo(() => somarTotais(resumoPorCampanha.values()), [resumoPorCampanha]);

  /** Evento vinculado à campanha (só conta se o evento ainda existe). */
  const eventoDaCampanha = useCallback((campaignId: string) => {
    const v = vinculos.get(campaignId);
    return v ? eventosPorId.get(v.event_id) : undefined;
  }, [vinculos, eventosPorId]);

  /** Campanhas vinculadas ao evento. As sem entrega no período entram zeradas. */
  const campanhasPorEvento = useMemo(() => {
    const mapa = new Map<string, CampanhaResumo[]>();
    for (const v of vinculos.values()) {
      if (!eventosPorId.has(v.event_id)) continue;
      const c = resumoPorCampanha.get(v.campaign_id) ?? {
        id: v.campaign_id, campaign_id: v.campaign_id, name: v.campaign_name || 'Campanha sem nome', objective: '',
        spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, revenue: 0, results: 0,
      };
      mapa.set(v.event_id, [...(mapa.get(v.event_id) || []), c]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => b.spend - a.spend);
    return mapa;
  }, [vinculos, eventosPorId, resumoPorCampanha]);

  const campanhasDoEvento = useCallback((eventId: string) => campanhasPorEvento.get(eventId) || [], [campanhasPorEvento]);

  /** Campanhas com entrega no período e sem vínculo salvo. */
  const campanhasSemEvento = useMemo(
    () => [...resumoPorCampanha.values()]
      .filter((c) => !c.campaign_id || !eventoDaCampanha(c.campaign_id))
      .sort((a, b) => b.spend - a.spend),
    [resumoPorCampanha, eventoDaCampanha],
  );

  const criativosDoEvento = useCallback((eventId: string) => {
    const ids = new Set(campanhasDoEvento(eventId).map((c) => c.campaign_id));
    return criativos.filter((x) => ids.has(x.campaign_id));
  }, [campanhasDoEvento, criativos]);

  const campanhaAtiva = useCallback((campaignId: string) => {
    const s = statusPorCampanha.get(campaignId);
    return s === undefined ? true : s === 'ACTIVE';
  }, [statusPorCampanha]);

  // ── Ações ────────────────────────────────────────────────────────────────
  const vincularCampanha = useCallback(async (campaignId: string, campaignName: string, eventId: string | null) => {
    const anterior = vinculos.get(campaignId) ?? null;
    if ((anterior?.event_id ?? null) === eventId) return;
    setSalvandoVinculo((s) => new Set(s).add(campaignId));
    setVinculos((m) => {
      const n = new Map(m);
      if (eventId) n.set(campaignId, { campaign_id: campaignId, event_id: eventId, campaign_name: campaignName });
      else n.delete(campaignId);
      return n;
    });
    const { error: erroVinculo } = eventId
      ? await (supabase as any).from('lagun_event_campaigns').upsert({
          campaign_id: campaignId,
          event_id: eventId,
          campaign_name: campaignName,
          account_id: contaId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'campaign_id' })
      : await (supabase as any).from('lagun_event_campaigns').delete().eq('campaign_id', campaignId);
    setSalvandoVinculo((s) => { const n = new Set(s); n.delete(campaignId); return n; });
    if (erroVinculo) {
      console.error('[Relatórios] Falha ao salvar vínculo', erroVinculo);
      setVinculos((m) => {
        const n = new Map(m);
        if (anterior) n.set(campaignId, anterior); else n.delete(campaignId);
        return n;
      });
      toast.error('Não foi possível salvar o vínculo da campanha.');
      return;
    }
    toast.success(eventId ? `Campanha vinculada a ${eventosPorId.get(eventId)?.nome || 'evento'}.` : 'Campanha desvinculada.');
  }, [vinculos, contaId, eventosPorId]);

  const copiarLinkRelatorio = useCallback(async (eventId: string) => {
    const token = eventosPorId.get(eventId)?.relatorio_token;
    if (!token) {
      toast.error('Este evento ainda não tem link de relatório.');
      return;
    }
    const link = `${APP_URL}/relatorio/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link do relatório copiado.');
    } catch {
      window.prompt('Copie o link do relatório:', link);
    }
  }, [eventosPorId]);

  const paraLinhaPdf = useCallback((c: CampanhaResumo): LinhaCampanha => ({
    id: c.id, name: c.name, objective: c.objective, active: campanhaAtiva(c.campaign_id),
    spend: c.spend, impressions: c.impressions, reach: c.reach, clicks: c.clicks,
    results: c.results, revenue: c.revenue, purchases: c.purchases,
  }), [campanhaAtiva]);

  /**
   * PDF no mesmo modelo de sempre (RelatorioCampanhas), com as campanhas
   * escolhidas e só os criativos delas. `chave` marca o botão como "gerando".
   */
  const gerarPdf = useCallback(async (chave: string, campanhas: CampanhaResumo[], cliente: string, arquivo: string) => {
    const comEntrega = campanhas.filter((c) => c.spend > 0 || c.impressions > 0);
    if (!comEntrega.length) {
      toast.error('Nenhuma campanha com entrega no período selecionado.');
      return false;
    }
    setGerandoPdf((s) => new Set(s).add(chave));
    try {
      const ids = new Set(comEntrega.map((c) => c.campaign_id));
      const nomes = new Set(comEntrega.map((c) => c.name));
      const criativosRel: CriativoRel[] = criativos
        .filter((x) => (x.campaign_id ? ids.has(x.campaign_id) : nomes.has(x.campaign_name)))
        .map((x) => ({
          ad_id: x.ad_id, ad_name: x.ad_name, campaign_name: x.campaign_name,
          spend: x.spend, impressions: x.impressions, clicks: x.clicks, ctr: x.ctr,
          thumbnail: x.thumbnail_url || x.image_url || null,
        }));
      await baixarRelatorioPdf(
        <RelatorioCampanhas
          cliente={cliente}
          periodo={rotuloPreset(datePreset)}
          dias={diasDoPreset(datePreset)}
          campanhas={comEntrega.map(paraLinhaPdf)}
          criativos={criativosRel}
        />,
        arquivo,
      );
      return true;
    } catch (e) {
      console.error('[Relatórios] Falha ao gerar PDF', e);
      toast.error('Não foi possível gerar o PDF.');
      return false;
    } finally {
      setGerandoPdf((s) => { const n = new Set(s); n.delete(chave); return n; });
    }
  }, [criativos, datePreset, paraLinhaPdf]);

  const baixarRelatorioEvento = useCallback((eventId: string) => {
    const evento = eventosPorId.get(eventId);
    if (!evento) return Promise.resolve(false);
    return gerarPdf(eventId, campanhasDoEvento(eventId), `Lagun · ${evento.nome}`, `relatorio-${slug(evento.nome) || 'evento'}`);
  }, [eventosPorId, gerarPdf, campanhasDoEvento]);

  return {
    semConta: !ADS_ACCOUNT_ID,
    contaId,
    carregandoConta,
    erro,
    recarregar,
    // eventos e vínculos
    eventos,
    eventosPorId,
    eventosAtivos,
    eventosPassados,
    carregandoEventos,
    vinculos,
    salvandoVinculo,
    eventoDaCampanha,
    vincularCampanha,
    copiarLinkRelatorio,
    // métricas
    insights,
    carregandoInsights,
    criativos,
    carregandoCriativos,
    resumoPorCampanha,
    totaisConta,
    orcamentoDiario,
    statusPorCampanha,
    campanhaAtiva,
    campanhasDoEvento,
    campanhasSemEvento,
    criativosDoEvento,
    // PDF
    gerandoPdf,
    gerarPdf,
    baixarRelatorioEvento,
  };
}

export type RelatoriosMeta = ReturnType<typeof useRelatoriosMeta>;
