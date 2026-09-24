import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  DollarSign,
  Eye,
  FileDown,
  ImageOff,
  Loader2,
  MousePointerClick,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Video,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { BarraIndicadores, CORES } from '@/components/interno/BarraIndicadores';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { baixarRelatorioPdf } from '@/lib/relatorioPdf';
import { RelatorioCampanhas, type LinhaCampanha } from '@/components/interno/RelatorioCampanhas';
import { toast } from 'sonner';

const ADS_ACCOUNT_ID = (import.meta.env.VITE_META_AD_ACCOUNT_ID || '').replace(/^act_/, '');

interface CampaignInsight {
  campaign_name: string;
  campaign_id: string;
  objective: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  cpc: string;
  cpm: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
}

interface AdCreativeInsight extends CampaignInsight {
  ad_name: string;
  ad_id: string;
  thumbnail_url: string | null;
  image_url: string | null;
  creative_type?: 'video' | 'static';
  video_url?: string | null;
  video_embed_url?: string | null;
}

interface CampaignBudget {
  campaign_id: string;
  campaign_name: string;
  objective: string;
  daily_budget: number;
}

interface AccountSummary {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  roas: number;
  purchases: number;
  purchaseValue: number;
}

interface ObjectiveSummaryRow {
  objective: string;
  objLabel: string;
  objIcon: string;
  objType: 'sales' | 'engagement' | 'traffic' | 'other';
  spend: number;
  impressions: number;
  clicks: number;
  returnValue: number;
  dailyBudget: number;
}

interface CampanhaDoGrupo {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  returnValue: number;
}

interface EventGroup {
  // Chave do grupo: `ev:<id>` quando vinculado ao evento, `nome:<palpite>` quando não.
  key: string;
  eventId: string | null;
  vinculado: boolean;
  eventName: string;
  campanhas: CampanhaDoGrupo[];
  totalSpend: number;
  totalImpressions: number;
  totalReach: number;
  totalClicks: number;
  totalPurchases: number;
  totalPurchaseValue: number;
  roas: number;
  rows: ObjectiveSummaryRow[];
}

const KNOWN_EVENTS = [
  'Isso É Trap',
  'Maestria',
  'Lagun',
  'Fantástico Mundo Lukão',
  'Pagodear',
  'Aperta O Play',
];

// Eventos da landing (lagun_events) para o vínculo explícito campanha → evento.
interface EventoLanding {
  id: string;
  nome: string;
  show_on_landing: boolean;
  relatorio_token: string | null;
}

const SEM_EVENTO = '__sem_evento__';
const APP_URL = (import.meta.env.VITE_APP_URL || 'https://lagunvitoria.com.br').replace(/\/$/, '');

// Comparação sem acento e sem caixa, para sugerir o evento pelo nome da campanha.
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const CAMPAIGN_RENAME_MAP: Record<string, string> = {
  'fantástico mundo do lukao': 'Fantástico Mundo do Lukão',
  'fantastico mundo do lukao': 'Fantástico Mundo do Lukão',
  'fantástico mundo lukão': 'Fantástico Mundo do Lukão',
  'fantastico mundo lukao': 'Fantástico Mundo do Lukão',
  'fantástico mundo de lukão': 'Fantástico Mundo do Lukão',
  'fantastico mundo de lukao': 'Fantástico Mundo do Lukão',
  'de vendas issoétrap': 'Isso É Trap',
  'de vendas issoetrap': 'Isso É Trap',
  issoétrap: 'Isso É Trap',
  issoetrap: 'Isso É Trap',
};

const OBJECTIVE_LABELS: Record<
  string,
  { label: string; icon: string; type: 'sales' | 'engagement' | 'traffic' | 'other' }
> = {
  OUTCOME_SALES: { label: 'Vendas', icon: '🛒', type: 'sales' },
  OUTCOME_ENGAGEMENT: { label: 'Engajamento', icon: '❤️', type: 'engagement' },
  OUTCOME_TRAFFIC: { label: 'Tráfego', icon: '🔗', type: 'traffic' },
  OUTCOME_AWARENESS: { label: 'Alcance', icon: '📢', type: 'other' },
  OUTCOME_LEADS: { label: 'Leads', icon: '📋', type: 'other' },
  CONVERSIONS: { label: 'Vendas', icon: '🛒', type: 'sales' },
  POST_ENGAGEMENT: { label: 'Engajamento', icon: '❤️', type: 'engagement' },
  LINK_CLICKS: { label: 'Tráfego', icon: '🔗', type: 'traffic' },
  REACH: { label: 'Alcance', icon: '📢', type: 'other' },
  BRAND_AWARENESS: { label: 'Alcance', icon: '📢', type: 'other' },
};

const OBJECTIVE_ORDER: Record<ObjectiveSummaryRow['objType'], number> = {
  sales: 0,
  engagement: 1,
  traffic: 2,
  other: 3,
};

const DATE_PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'last_14d', label: 'Últimos 14 dias' },
  { value: 'last_30d', label: 'Últimos 30 dias' },
  { value: 'last_90d', label: 'Últimos 90 dias' },
  { value: 'this_year', label: 'Este ano' },
  { value: 'last_year', label: 'Ano passado' },
  { value: 'maximum', label: 'Todo o período' },
];

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Celular: R$ 10,8K no lugar de R$ 10.852,09.
function formatCurrencyShort(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace('.', ',')}K`;
  return formatCurrency(value);
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('pt-BR');
}

function extractEventName(campaignName: string): string {
  const lower = campaignName.toLowerCase();

  for (const [key, renamed] of Object.entries(CAMPAIGN_RENAME_MAP)) {
    if (lower.includes(key)) return renamed;
  }

  const bracketMatch = campaignName.match(/[\[\(]([^\]\)]+)[\]\)]/);
  if (bracketMatch) {
    const inner = bracketMatch[1].trim();
    const innerLower = inner.toLowerCase();

    for (const [key, renamed] of Object.entries(CAMPAIGN_RENAME_MAP)) {
      if (innerLower.includes(key)) return renamed;
    }

    for (const event of KNOWN_EVENTS) {
      if (innerLower.includes(event.toLowerCase())) return event;
    }

    const parts = inner.split(/\s+/);
    if (parts.length > 1) return parts.slice(1).join(' ');
    return inner;
  }

  for (const event of KNOWN_EVENTS) {
    if (lower.includes(event.toLowerCase())) return event;
  }

  return campaignName;
}

function getObjectiveMeta(objective: string) {
  return OBJECTIVE_LABELS[objective] || { label: objective, icon: '📊', type: 'other' as const };
}

function getPurchaseValue(row: CampaignInsight) {
  const purchaseVal = row.action_values?.find(
    (action) => action.action_type === 'purchase' || action.action_type === 'omni_purchase'
  );
  return purchaseVal ? parseFloat(purchaseVal.value) : 0;
}

function getPurchaseCount(row: CampaignInsight) {
  const purchaseAction = row.actions?.find(
    (action) => action.action_type === 'purchase' || action.action_type === 'omni_purchase'
  );
  return purchaseAction ? parseInt(purchaseAction.value, 10) : 0;
}

export default function InternoRelatorios() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState('last_30d');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfSel, setPdfSel] = useState<Set<string>>(new Set());
  const [statusPorCampanha, setStatusPorCampanha] = useState<Map<string, boolean>>(new Map());
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [collapsedEvents, setCollapsedEvents] = useState<Record<string, boolean>>({});
  const [creatives, setCreatives] = useState<AdCreativeInsight[]>([]);
  const [loadingCreatives, setLoadingCreatives] = useState(false);
  const [campaignBudgets, setCampaignBudgets] = useState<CampaignBudget[]>([]);
  const [eventos, setEventos] = useState<EventoLanding[]>([]);
  const [vinculos, setVinculos] = useState<Map<string, string>>(new Map());
  const [salvandoVinculo, setSalvandoVinculo] = useState<Set<string>>(new Set());

  // Eventos da landing e vínculos salvos campanha → evento.
  useEffect(() => {
    (async () => {
      const [ev, vc] = await Promise.all([
        (supabase as any)
          .from('lagun_events')
          .select('id, nome, show_on_landing, relatorio_token')
          .order('display_order', { ascending: true }),
        (supabase as any).from('lagun_event_campaigns').select('campaign_id, event_id'),
      ]);
      if (ev.error) console.error('[Relatórios] Falha ao carregar eventos', ev.error);
      else setEventos((ev.data || []) as EventoLanding[]);
      if (vc.error) console.error('[Relatórios] Falha ao carregar vínculos', vc.error);
      else setVinculos(new Map((vc.data || []).map((v: { campaign_id: string; event_id: string }) => [v.campaign_id, v.event_id])));
    })();
  }, []);

  const eventosPorId = useMemo(() => new Map(eventos.map((e) => [e.id, e])), [eventos]);
  const eventosAtivos = useMemo(() => eventos.filter((e) => e.show_on_landing), [eventos]);

  // Agrupa pelo vínculo salvo; sem vínculo, cai no palpite antigo pelo nome.
  const grupoDaCampanha = useCallback((campaignId: string, campaignName: string) => {
    const eventId = vinculos.get(campaignId);
    const evento = eventId ? eventosPorId.get(eventId) : undefined;
    if (eventId && evento) {
      return { key: `ev:${eventId}`, eventId, vinculado: true, eventName: evento.nome };
    }
    const palpite = extractEventName(campaignName || '');
    return { key: `nome:${palpite}`, eventId: null, vinculado: false, eventName: palpite };
  }, [vinculos, eventosPorId]);

  // Sugestão pelo nome: o nome da campanha contém o nome de um evento ativo.
  // O nome mais longo vence ("Isso É Trap 2" antes de "Isso É Trap").
  const sugerirEvento = (campaignName: string): EventoLanding | null => {
    const alvo = semAcento(campaignName || '');
    return [...eventosAtivos]
      .filter((e) => semAcento(e.nome).length >= 3 && alvo.includes(semAcento(e.nome)))
      .sort((a, b) => b.nome.length - a.nome.length)[0] || null;
  };

  const vincularCampanha = async (campaignId: string, campaignName: string, eventId: string | null) => {
    const anterior = vinculos.get(campaignId) ?? null;
    if (anterior === eventId) return;
    setSalvandoVinculo((s) => new Set(s).add(campaignId));
    setVinculos((m) => {
      const n = new Map(m);
      if (eventId) n.set(campaignId, eventId); else n.delete(campaignId);
      return n;
    });
    const { error: erroVinculo } = eventId
      ? await (supabase as any).from('lagun_event_campaigns').upsert({
          campaign_id: campaignId,
          event_id: eventId,
          campaign_name: campaignName,
          account_id: selectedAccount,
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
    toast.success(eventId ? `Campanha vinculada a ${eventosPorId.get(eventId)?.nome || 'evento'}.` : 'Vínculo removido.');
  };

  const copiarLinkRelatorio = async (eventId: string) => {
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
  };

  useEffect(() => {
    if (!ADS_ACCOUNT_ID) { setLoading(false); return; }
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID
          || (import.meta.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1];
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/meta-ads-api?action=accounts`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const result = await resp.json();

        if (result.error) {
          setError(result.error?.message || result.error);
        } else if (result.data) {
          const account = result.data.find(
            (acc: any) => acc.account_id === ADS_ACCOUNT_ID
          );
          if (account) setSelectedAccount(account.account_id);
          else setSelectedAccount(ADS_ACCOUNT_ID);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;

    (async () => {
      setLoadingInsights(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID
          || (import.meta.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1];
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/meta-ads-api?action=insights&account_id=${selectedAccount}&date_preset=${datePreset}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const result = await resp.json();

        if (result.error) {
          setError(result.error?.message || JSON.stringify(result.error));
          setInsights([]);
          return;
        }

        setInsights(result.data || []);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoadingInsights(false);
      }
    })();
  }, [selectedAccount, datePreset]);

  useEffect(() => {
    if (!selectedAccount) return;
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID
          || (import.meta.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1];
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/meta-ads-api?action=campaign_budgets&account_id=${selectedAccount}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const payload = await response.json();
        setCampaignBudgets(payload.error ? [] : (payload.data || []));
      } catch (budgetError) {
        console.error('[Relatórios] Falha ao carregar orçamentos', budgetError);
        setCampaignBudgets([]);
      }
    })();
  }, [selectedAccount]);

  const dailyBudgetByCampaign = useMemo(() => new Map(
    campaignBudgets.map((campaign) => [campaign.campaign_id, Number(campaign.daily_budget || 0) / 100])
  ), [campaignBudgets]);

  useEffect(() => {
    if (!selectedAccount) return;
    (async () => {
      setLoadingCreatives(true);
      try {
        const response = await supabase.functions.invoke(
          `meta-ads-api?action=ad_creatives&account_id=${selectedAccount}&date_preset=${datePreset}`,
          { method: 'GET' }
        );
        if (response.error || response.data?.error) {
          console.error('[Relatórios] Falha ao carregar criativos', response.error || response.data?.error);
          setCreatives([]);
        } else {
          setCreatives((response.data?.data || []) as AdCreativeInsight[]);
        }
      } catch (creativeError) {
        console.error('[Relatórios] Falha ao carregar criativos', creativeError);
        setCreatives([]);
      } finally {
        setLoadingCreatives(false);
      }
    })();
  }, [selectedAccount, datePreset]);

  const creativesByEvent = useMemo(() => {
    const grouped = new Map<string, AdCreativeInsight[]>();
    for (const creative of creatives) {
      const { key } = grupoDaCampanha(creative.campaign_id, creative.campaign_name);
      grouped.set(key, [...(grouped.get(key) || []), creative]);
    }
    for (const [eventName, items] of grouped) {
      grouped.set(eventName, items.sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)));
    }
    return grouped;
  }, [creatives, grupoDaCampanha]);

  const summary: AccountSummary = useMemo(() => {
    const totals = {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      roas: 0,
      purchases: 0,
      purchaseValue: 0,
    };

    for (const row of insights) {
      totals.spend += parseFloat(row.spend || '0');
      totals.impressions += parseInt(row.impressions || '0', 10);
      totals.reach += parseInt(row.reach || '0', 10);
      totals.clicks += parseInt(row.clicks || '0', 10);
      totals.purchases += getPurchaseCount(row);
      totals.purchaseValue += getPurchaseValue(row);
    }

    totals.roas = totals.spend > 0 ? totals.purchaseValue / totals.spend : 0;
    return totals;
  }, [insights]);

  const groupedByEvent = useMemo<EventGroup[]>(() => {
    const events = new Map<
      string,
      EventGroup & {
        rowsMap: Map<string, ObjectiveSummaryRow>;
        campanhasMap: Map<string, CampanhaDoGrupo>;
      }
    >();

    for (const row of insights) {
      const grupo = grupoDaCampanha(row.campaign_id, row.campaign_name);
      const objectiveMeta = getObjectiveMeta(row.objective);
      const event = events.get(grupo.key) || {
        ...grupo,
        campanhas: [],
        campanhasMap: new Map<string, CampanhaDoGrupo>(),
        totalSpend: 0,
        totalImpressions: 0,
        totalReach: 0,
        totalClicks: 0,
        totalPurchases: 0,
        totalPurchaseValue: 0,
        roas: 0,
        rows: [],
        rowsMap: new Map<string, ObjectiveSummaryRow>(),
      };

      const rowKey = `${objectiveMeta.type}:${objectiveMeta.label}`;
      const objectiveRow = event.rowsMap.get(rowKey) || {
        objective: row.objective,
        objLabel: objectiveMeta.label,
        objIcon: objectiveMeta.icon,
        objType: objectiveMeta.type,
        spend: 0,
        impressions: 0,
        clicks: 0,
        returnValue: 0,
        dailyBudget: 0,
      };

      const spend = parseFloat(row.spend || '0');
      const impressions = parseInt(row.impressions || '0', 10);
      const reach = parseInt(row.reach || '0', 10);
      const clicks = parseInt(row.clicks || '0', 10);
      const purchaseValue = getPurchaseValue(row);
      const purchaseCount = getPurchaseCount(row);

      event.totalSpend += spend;
      event.totalImpressions += impressions;
      event.totalReach += reach;
      event.totalClicks += clicks;
      event.totalPurchases += purchaseCount;
      event.totalPurchaseValue += purchaseValue;

      objectiveRow.spend += spend;
      objectiveRow.impressions += impressions;
      objectiveRow.clicks += clicks;
      objectiveRow.returnValue += purchaseValue;
      objectiveRow.dailyBudget += dailyBudgetByCampaign.get(row.campaign_id) || 0;

      const campaignKey = row.campaign_id || row.campaign_name;
      const campanha = event.campanhasMap.get(campaignKey) || {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name || 'Campanha sem nome',
        spend: 0,
        impressions: 0,
        clicks: 0,
        returnValue: 0,
      };
      campanha.spend += spend;
      campanha.impressions += impressions;
      campanha.clicks += clicks;
      campanha.returnValue += purchaseValue;
      event.campanhasMap.set(campaignKey, campanha);

      event.rowsMap.set(rowKey, objectiveRow);
      events.set(grupo.key, event);
    }

    return Array.from(events.values())
      .map((event) => ({
        key: event.key,
        eventId: event.eventId,
        vinculado: event.vinculado,
        eventName: event.eventName,
        campanhas: Array.from(event.campanhasMap.values()).sort((a, b) => b.spend - a.spend),
        totalSpend: event.totalSpend,
        totalImpressions: event.totalImpressions,
        totalReach: event.totalReach,
        totalClicks: event.totalClicks,
        totalPurchases: event.totalPurchases,
        totalPurchaseValue: event.totalPurchaseValue,
        roas: event.totalSpend > 0 ? event.totalPurchaseValue / event.totalSpend : 0,
        rows: Array.from(event.rowsMap.values()).sort(
          (a, b) => OBJECTIVE_ORDER[a.objType] - OBJECTIVE_ORDER[b.objType]
        ),
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }, [insights, dailyBudgetByCampaign, grupoDaCampanha]);


  const toggleEventCollapse = (eventName: string) => {
    setCollapsedEvents((current) => ({
      ...current,
      [eventName]: !current[eventName],
    }));
  };

  // ── Relatório em PDF ──────────────────────────────────────────────────────
  // Abre o seletor de campanhas; o PDF sai no mesmo template usado na
  // Produzimos (A4, destaque de investimento, faixa de métricas, tabela e
  // grade de criativos), com a identidade do Lagun.
  const campanhasDisponiveis = useMemo(() => {
    const porId = new Map<string, LinhaCampanha>();
    for (const row of insights) {
      const id = row.campaign_id || row.campaign_name;
      const atual = porId.get(id) ?? {
        id, name: row.campaign_name || 'Campanha sem nome', objective: row.objective,
        active: statusPorCampanha.get(id) !== false,
        spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, revenue: 0, purchases: 0,
      };
      atual.spend += parseFloat(row.spend || '0');
      atual.impressions += parseInt(row.impressions || '0', 10);
      atual.reach += parseInt(row.reach || '0', 10);
      atual.clicks += parseInt(row.clicks || '0', 10);
      atual.revenue += getPurchaseValue(row);
      atual.purchases += getPurchaseCount(row);
      // "Resultados" segue o objetivo: compras em vendas, e a ação principal nos demais.
      const principal = row.actions?.find((a) => ['purchase', 'omni_purchase', 'lead', 'onsite_conversion.messaging_first_reply', 'link_click'].includes(a.action_type));
      atual.results += principal ? parseInt(principal.value, 10) : 0;
      atual.active = statusPorCampanha.get(id) !== false;
      porId.set(id, atual);
    }
    return [...porId.values()].sort((a, b) => b.spend - a.spend);
  }, [insights, statusPorCampanha]);

  const abrirSeletorPdf = async () => {
    // Seleciona todas por padrão e busca o status real (ativa/pausada).
    setPdfSel(new Set(campanhasDisponiveis.map((c) => c.id)));
    setPdfOpen(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID
        || (import.meta.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1];
      const r = await fetch(`https://${projectId}.supabase.co/functions/v1/meta-ads-api?action=campaigns&account_id=${selectedAccount}`,
        { headers: { Authorization: `Bearer ${session?.session?.access_token}` } });
      const j = await r.json();
      if (!j.error) {
        setStatusPorCampanha(new Map((j.data || []).map((c: { id: string; effective_status?: string }) => [c.id, c.effective_status === 'ACTIVE'])));
      }
    } catch { /* sem status: todas entram como ativas */ }
  };

  const gerarPdf = async () => {
    const escolhidas = campanhasDisponiveis.filter((c) => pdfSel.has(c.id));
    if (!escolhidas.length) return;
    setGeneratingPDF(true);
    try {
      const nomes = new Set(escolhidas.map((c) => c.name));
      const criativosDasEscolhidas = creatives
        .filter((x) => nomes.has(x.campaign_name))
        .map((x) => ({
          ad_id: x.ad_id, ad_name: x.ad_name, campaign_name: x.campaign_name,
          spend: x.spend, impressions: x.impressions, clicks: x.clicks, ctr: x.ctr,
          thumbnail: x.thumbnail_url || x.image_url || null,
        }));
      const dateLabel = DATE_PRESETS.find((preset) => preset.value === datePreset)?.label || datePreset;
      const dias = { today: 1, yesterday: 1, last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 }[datePreset] ?? 30;
      await baixarRelatorioPdf(
        <RelatorioCampanhas cliente="Lagun" periodo={dateLabel} dias={dias} campanhas={escolhidas} criativos={criativosDasEscolhidas} />,
        'relatorio-campanhas-lagun',
      );
      setPdfOpen(false);
    } catch (e) {
      console.error('[Relatórios] Falha ao gerar PDF', e);
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gray-400 dark:text-gray-500" size={28} />
      </div>
    );
  }

  if (!ADS_ACCOUNT_ID) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/interno/marketing')}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft size={16} className="mr-1" /> Marketing
          </Button>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Relatórios · Lagun
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <TrendingUp size={32} className="text-gray-300 dark:text-gray-700" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Conta de anúncios ainda não configurada</p>
          <p className="text-xs text-gray-400 max-w-sm">
            Assim que a conta do Meta Ads da Lagun for definida, os relatórios de campanhas aparecem aqui.
          </p>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-6 max-md:space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 max-md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/interno/marketing')}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft size={16} className="mr-1" /> Marketing
          </Button>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Relatórios · Lagun
          </h2>
        </div>

        <div className="flex items-center gap-2 max-md:w-full">
          <Button
            size="sm"
            className="h-9 gap-1.5 text-xs font-semibold text-black bg-[#FFE14D] hover:bg-[#FFEC8A] shadow-[0_0_20px_rgba(255,225,77,.45)]"
            disabled={loadingInsights || insights.length === 0 || generatingPDF}
            onClick={() => void abrirSeletorPdf()}
          >
            {generatingPDF ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {generatingPDF ? 'Gerando...' : 'Gerar PDF'}
          </Button>

          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[180px] max-md:ml-auto max-md:h-8 max-md:w-[140px] max-md:text-[11px] h-9 text-xs rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <BarraIndicadores
        titulo="Meta Ads conectado"
        subtitulo={`${groupedByEvent.length} ${groupedByEvent.length === 1 ? 'evento' : 'eventos'} no período`}
        carregando={loading}
        itens={[
          { label: 'Gasto total', valor: formatCurrency(summary.spend), valorCurto: formatCurrencyShort(summary.spend), sub: 'no período', cor: CORES.ambar, barra: 100 },
          { label: 'Retorno', valor: formatCurrency(summary.purchaseValue), valorCurto: formatCurrencyShort(summary.purchaseValue), sub: summary.purchases > 0 ? `${summary.purchases} compras` : 'sem compras', cor: CORES.verde, barra: summary.spend ? Math.min(100, (summary.purchaseValue / summary.spend) * 25) : 0 },
          { label: 'ROAS', valor: summary.roas > 0 ? `${summary.roas.toFixed(2)}x` : '—', sub: summary.roas > 0 ? `R$ ${summary.roas.toFixed(2).replace('.', ',')} por real` : undefined, cor: CORES.ouro, barra: Math.min(100, summary.roas * 20) },
          { label: 'Impressões', valor: formatNumber(summary.impressions), sub: `alcance ${formatNumber(summary.reach)}`, cor: CORES.azul, barra: 72, soWeb: true },
          { label: 'Cliques', valor: formatNumber(summary.clicks), sub: summary.impressions ? `CTR ${((summary.clicks / summary.impressions) * 100).toFixed(1).replace('.', ',')}%` : undefined, cor: CORES.branco, barra: summary.impressions ? Math.min(100, (summary.clicks / summary.impressions) * 100 * 20) : 0, soWeb: true },
        ]}
      />

      {loadingInsights && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-gray-400 dark:text-gray-500" size={24} />
        </div>
      )}

      {!loadingInsights && groupedByEvent.length > 0 && (
        <div className="space-y-4">
          {groupedByEvent.map((eventGroup) => {
            const isCollapsed = collapsedEvents[eventGroup.key] ?? false;
            const criativosDoGrupo = creativesByEvent.get(eventGroup.key) || [];

            return (
              <div
                key={eventGroup.key}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
              >
                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-900 dark:text-gray-100">
                        <span>🎤 {eventGroup.eventName}</span>
                        {!eventGroup.vinculado && (
                          <span
                            title="Agrupado pelo nome da campanha. Vincule cada campanha a um evento na lista abaixo."
                            className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
                          >
                            não vinculado · pelo nome
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {eventGroup.campanhas.length} campanha{eventGroup.campanhas.length === 1 ? '' : 's'} · {eventGroup.rows.length} tipo{eventGroup.rows.length > 1 ? 's' : ''} de campanha
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 max-md:flex-col max-md:items-end">
                    {eventGroup.vinculado && eventGroup.eventId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void copiarLinkRelatorio(eventGroup.eventId!)}
                        title="Link secreto que abre o PDF das campanhas deste evento"
                        className="h-8 gap-1.5 px-2.5 text-xs border-[#FFE14D]/50 text-gray-700 hover:bg-[#FFE14D]/10 dark:text-gray-200"
                      >
                        <Copy size={13} /> Copiar link do relatório
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleEventCollapse(eventGroup.key)}
                      className="h-8 px-2 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    >
                      {isCollapsed ? 'Mostrar campanhas' : 'Ocultar campanhas'}
                      <ChevronDown
                        size={14}
                        className={`ml-1 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                      />
                    </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Gasto</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(eventGroup.totalSpend)}
                      </p>
                    </div>

                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Retorno</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {eventGroup.totalPurchaseValue > 0 ? formatCurrency(eventGroup.totalPurchaseValue) : '—'}
                      </p>
                    </div>

                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">ROAS</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {eventGroup.roas > 0 ? `${eventGroup.roas.toFixed(2)}x` : '—'}
                      </p>
                    </div>

                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Impressões</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatNumber(eventGroup.totalImpressions)}
                      </p>
                    </div>

                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Alcance</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatNumber(eventGroup.totalReach)}
                      </p>
                    </div>

                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cliques</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatNumber(eventGroup.totalClicks)}
                      </p>
                    </div>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-4 px-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                      <span className="flex-1">Tipo</span>
                      <span className="w-28 text-right">Orçamento diário</span>
                      <span className="w-28 text-right">Gasto</span>
                      <span className="w-20 text-right">Impressões</span>
                      <span className="w-16 text-right">Cliques</span>
                      <span className="w-28 text-right">Retorno</span>
                    </div>

                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {eventGroup.rows.map((row) => (
                        <div key={`${eventGroup.key}-${row.objLabel}`} className="py-2 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <span className="text-sm">{row.objIcon}</span>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                              {row.objLabel}
                            </p>
                          </div>
                          <p className="w-28 text-right text-sm font-semibold text-amber-600 dark:text-amber-400">
                            {row.dailyBudget > 0 ? formatCurrency(row.dailyBudget) : '—'}
                          </p>
                          <p className="w-28 text-right text-sm text-gray-500 dark:text-gray-400">
                            {formatCurrency(row.spend)}
                          </p>
                          <p className="w-20 text-right text-sm text-gray-500 dark:text-gray-400">
                            {formatNumber(row.impressions)}
                          </p>
                          <p className="w-16 text-right text-sm text-gray-500 dark:text-gray-400">
                            {formatNumber(row.clicks)}
                          </p>
                          <p className="w-28 text-right text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {row.returnValue > 0 ? formatCurrency(row.returnValue) : '—'}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div><h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">Campanhas</h4><p className="mt-0.5 text-[10px] text-gray-400">Vincule cada campanha ao evento da landing. O link do relatório do evento usa só as vinculadas.</p></div>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {eventGroup.campanhas.map((campanha) => {
                          const vinculadoA = vinculos.get(campanha.campaign_id);
                          const eventoAtual = vinculadoA ? eventosPorId.get(vinculadoA) : undefined;
                          const sugestao = !eventoAtual ? sugerirEvento(campanha.campaign_name) : null;
                          const salvando = salvandoVinculo.has(campanha.campaign_id);
                          // Evento vinculado que saiu da landing continua aparecendo na lista.
                          const opcoes = eventoAtual && !eventoAtual.show_on_landing ? [...eventosAtivos, eventoAtual] : eventosAtivos;
                          return (
                            <div key={campanha.campaign_id || campanha.campaign_name} className="flex items-center gap-4 py-2 max-md:flex-wrap max-md:gap-2">
                              <p className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-300 max-md:basis-full" title={campanha.campaign_name}>
                                {campanha.campaign_name}
                              </p>
                              <p className="w-24 text-right text-xs text-gray-500 dark:text-gray-400 max-md:hidden">{formatCurrency(campanha.spend)}</p>
                              <p className="w-16 text-right text-xs text-gray-500 dark:text-gray-400 max-md:hidden">{formatNumber(campanha.impressions)}</p>
                              <p className="w-24 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400 max-md:hidden">{campanha.returnValue > 0 ? formatCurrency(campanha.returnValue) : '—'}</p>
                              <div className="flex w-[260px] shrink-0 items-center justify-end gap-1.5 max-md:w-full max-md:justify-start">
                                {sugestao && (
                                  <button
                                    type="button"
                                    disabled={salvando || !campanha.campaign_id}
                                    onClick={() => void vincularCampanha(campanha.campaign_id, campanha.campaign_name, sugestao.id)}
                                    title={`Sugestão pelo nome da campanha. Clique para vincular a ${sugestao.nome}.`}
                                    className="flex h-7 max-w-[120px] items-center gap-1 rounded-md border border-dashed border-amber-400/70 bg-amber-50 px-2 text-[10px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                                  >
                                    <Sparkles size={11} className="shrink-0" />
                                    <span className="truncate">sugestão: {sugestao.nome}</span>
                                  </button>
                                )}
                                <Select
                                  value={eventoAtual ? eventoAtual.id : SEM_EVENTO}
                                  disabled={salvando || !campanha.campaign_id}
                                  onValueChange={(valor) => void vincularCampanha(campanha.campaign_id, campanha.campaign_name, valor === SEM_EVENTO ? null : valor)}
                                >
                                  <SelectTrigger className={`h-7 w-[130px] text-[11px] rounded-md ${eventoAtual ? 'border-[#FFE14D]/60' : 'border-gray-200 text-gray-400 dark:border-gray-700'}`}>
                                    {salvando ? <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Salvando…</span> : <SelectValue placeholder="Evento" />}
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={SEM_EVENTO} className="text-xs">Sem evento</SelectItem>
                                    {opcoes.map((ev) => (
                                      <SelectItem key={ev.id} value={ev.id} className="text-xs">{ev.nome}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div><h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">Criativos das campanhas</h4><p className="mt-0.5 text-[10px] text-gray-400">Anúncios veiculados no período selecionado.</p></div>
                        <span className="rounded-full border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">{criativosDoGrupo.length} criativo{criativosDoGrupo.length === 1 ? '' : 's'}</span>
                      </div>

                      {loadingCreatives ? <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-8 text-xs text-gray-400 dark:border-gray-800"><Loader2 size={15} className="animate-spin" />Carregando criativos...</div> : criativosDoGrupo.length === 0 ? <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-8 text-xs text-gray-400 dark:border-gray-800"><ImageOff size={15} />Nenhum criativo com entrega neste período.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 max-md:flex max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:pb-1">{criativosDoGrupo.map(creative => {
                        const preview = creative.image_url || creative.thumbnail_url;
                        const isVideo = creative.creative_type === 'video';
                        return <a key={creative.ad_id} href={creative.video_url || creative.image_url || creative.thumbnail_url || undefined} target="_blank" rel="noreferrer" onClick={event => { if (!preview && !creative.video_url) event.preventDefault(); }} className="group overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-lg dark:border-gray-800 dark:bg-[#160F20] dark:hover:border-purple-500/40 max-md:w-[78vw] max-md:max-w-[280px] max-md:shrink-0 max-md:snap-start">
                          <div className="relative aspect-video overflow-hidden bg-black/20">{isVideo && creative.video_url ? <video src={creative.video_url} poster={preview || undefined} preload="metadata" muted playsInline className="h-full w-full object-cover" /> : preview ? <img src={preview} alt={creative.ad_name || 'Criativo da campanha'} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-gray-500"><ImageOff size={22} /></div>}<span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur">{isVideo ? <Video size={11} /> : null}{isVideo ? 'Vídeo' : 'Imagem'}</span></div>
                          <div className="space-y-2 p-3"><div><p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100" title={creative.ad_name}>{creative.ad_name || 'Anúncio sem nome'}</p><p className="mt-0.5 truncate text-[10px] text-gray-400" title={creative.campaign_name}>{creative.campaign_name}</p></div><div className="grid grid-cols-3 gap-1.5 text-center"><div className="rounded-md bg-white px-1 py-1.5 dark:bg-white/[0.04]"><p className="text-[8px] uppercase text-gray-400">Gasto</p><p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(Number(creative.spend || 0))}</p></div><div className="rounded-md bg-white px-1 py-1.5 dark:bg-white/[0.04]"><p className="text-[8px] uppercase text-gray-400">Impressões</p><p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{formatNumber(Number(creative.impressions || 0))}</p></div><div className="rounded-md bg-white px-1 py-1.5 dark:bg-white/[0.04]"><p className="text-[8px] uppercase text-gray-400">Cliques</p><p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{formatNumber(Number(creative.clicks || 0))}</p></div></div></div>
                        </a>;
                      })}</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loadingInsights && insights.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">
          Nenhuma campanha encontrada para o período selecionado.
        </div>
      )}

      {/* Seletor de campanhas do relatório */}
      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Campanhas no relatório</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">
            {DATE_PRESETS.find((x) => x.value === datePreset)?.label} · escolha o que entra no PDF.
          </p>

          <div className="flex items-center justify-between border-b border-border pb-2 text-xs">
            <span className="text-muted-foreground">
              {pdfSel.size} de {campanhasDisponiveis.length} selecionadas
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPdfSel(new Set(campanhasDisponiveis.map((c) => c.id)))} className="rounded-md px-2 py-1 font-medium hover:bg-muted">Todas</button>
              <button onClick={() => setPdfSel(new Set())} className="rounded-md px-2 py-1 font-medium hover:bg-muted">Nenhuma</button>
            </div>
          </div>

          <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
            {campanhasDisponiveis.map((c) => {
              const marcada = pdfSel.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setPdfSel((prev) => {
                    const n = new Set(prev);
                    if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                    return n;
                  })}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    marcada ? 'border-[#FFE14D]/60 bg-[#FFE14D]/[0.08]' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${marcada ? 'border-[#FFE14D] bg-[#FFE14D] text-black' : 'border-muted-foreground/40'}`}>
                    {marcada && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{c.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatCurrency(c.spend)} · {formatNumber(c.impressions)} impressões
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.active ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                    {c.active ? 'Ativa' : 'Pausada'}
                  </span>
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
              disabled={!pdfSel.size || generatingPDF}
              onClick={() => void gerarPdf()}
              className="gap-1.5 font-semibold text-black bg-[#FFE14D] hover:bg-[#FFEC8A]"
            >
              {generatingPDF ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              {generatingPDF ? 'Gerando…' : `Gerar PDF (${pdfSel.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
