import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  DollarSign,
  Eye,
  FileDown,
  ImageOff,
  Loader2,
  MousePointerClick,
  RotateCcw,
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

interface EventGroup {
  eventName: string;
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
      const eventName = extractEventName(creative.campaign_name);
      grouped.set(eventName, [...(grouped.get(eventName) || []), creative]);
    }
    for (const [eventName, items] of grouped) {
      grouped.set(eventName, items.sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)));
    }
    return grouped;
  }, [creatives]);

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
      }
    >();

    for (const row of insights) {
      const eventName = extractEventName(row.campaign_name);
      const objectiveMeta = getObjectiveMeta(row.objective);
      const event = events.get(eventName) || {
        eventName,
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

      event.rowsMap.set(rowKey, objectiveRow);
      events.set(eventName, event);
    }

    return Array.from(events.values())
      .map((event) => ({
        eventName: event.eventName,
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
  }, [insights, dailyBudgetByCampaign]);


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
          { label: 'Gasto total', valor: formatCurrency(summary.spend), sub: 'no período', cor: CORES.ambar, barra: 100 },
          { label: 'Retorno', valor: formatCurrency(summary.purchaseValue), sub: summary.purchases > 0 ? `${summary.purchases} compras` : 'sem compras', cor: CORES.verde, barra: summary.spend ? Math.min(100, (summary.purchaseValue / summary.spend) * 25) : 0 },
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
            const isCollapsed = collapsedEvents[eventGroup.eventName] ?? false;

            return (
              <div
                key={eventGroup.eventName}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
              >
                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        🎤 {eventGroup.eventName}
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {eventGroup.rows.length} tipo{eventGroup.rows.length > 1 ? 's' : ''} de campanha
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleEventCollapse(eventGroup.eventName)}
                      className="h-8 px-2 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    >
                      {isCollapsed ? 'Mostrar campanhas' : 'Ocultar campanhas'}
                      <ChevronDown
                        size={14}
                        className={`ml-1 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                      />
                    </Button>
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
                        <div key={`${eventGroup.eventName}-${row.objLabel}`} className="py-2 flex items-center justify-between gap-4">
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
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div><h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">Criativos das campanhas</h4><p className="mt-0.5 text-[10px] text-gray-400">Anúncios veiculados no período selecionado.</p></div>
                        <span className="rounded-full border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">{(creativesByEvent.get(eventGroup.eventName) || []).length} criativo{(creativesByEvent.get(eventGroup.eventName) || []).length === 1 ? '' : 's'}</span>
                      </div>

                      {loadingCreatives ? <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-8 text-xs text-gray-400 dark:border-gray-800"><Loader2 size={15} className="animate-spin" />Carregando criativos...</div> : (creativesByEvent.get(eventGroup.eventName) || []).length === 0 ? <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-8 text-xs text-gray-400 dark:border-gray-800"><ImageOff size={15} />Nenhum criativo com entrega neste período.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 max-md:flex max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:pb-1">{(creativesByEvent.get(eventGroup.eventName) || []).map(creative => {
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
