import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  ChevronDown,
  DollarSign,
  Eye,
  FileDown,
  Loader2,
  MousePointerClick,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateAdsReport } from '@/lib/generateAdsReport';
import { toast } from 'sonner';

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
  'BoomRAP',
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
  { value: 'last_360d', label: 'Últimos 360 dias' },
  { value: 'last_1000d', label: 'Últimos 1000 dias' },
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
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [collapsedEvents, setCollapsedEvents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const projectId = 'xwxiijbovreucnrbyput';
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/meta-ads-api?action=accounts`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const result = await resp.json();

        if (result.error) {
          setError(result.error?.message || result.error);
        } else if (result.data) {
          const triade = result.data.find(
            (acc: any) =>
              acc.name?.toLowerCase().includes('tríade') || acc.name?.toLowerCase().includes('triade')
          );

          if (triade) setSelectedAccount(triade.account_id);
          else if (result.data.length > 0) setSelectedAccount(result.data[0].account_id);
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
        const projectId = 'xwxiijbovreucnrbyput';
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
  }, [insights]);

  const pdfGroups = useMemo(() => {
    const grouped: Record<
      string,
      {
        label: string;
        icon: string;
        type: 'sales' | 'engagement' | 'traffic' | 'other';
        totalSpend: number;
        campaigns: Array<{
          name: string;
          objective: string;
          spend: number;
          impressions: number;
          clicks: number;
          returnValue: number;
        }>;
      }
    > = {};

    for (const event of groupedByEvent) {
      for (const row of event.rows) {
        const key = row.objective;
        if (!grouped[key]) {
          grouped[key] = {
            label: row.objLabel,
            icon: row.objIcon,
            type: row.objType,
            totalSpend: 0,
            campaigns: [],
          };
        }

        grouped[key].totalSpend += row.spend;
        grouped[key].campaigns.push({
          name: event.eventName,
          objective: row.objective,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          returnValue: row.returnValue,
        });
      }
    }

    return Object.values(grouped);
  }, [groupedByEvent]);

  const toggleEventCollapse = (eventName: string) => {
    setCollapsedEvents((current) => ({
      ...current,
      [eventName]: !current[eventName],
    }));
  };

  const handleDownloadPDF = async () => {
    const filename = `relatorio-ads-${datePreset}.pdf`;
    const isEmbeddedPreview = window.self !== window.top;
    const fallbackWindow = isEmbeddedPreview ? window.open('', '_blank', 'noopener,noreferrer') : null;

    if (fallbackWindow) {
      fallbackWindow.document.write(`
        <html>
          <head><title>Gerando PDF...</title></head>
          <body style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
            <h2 style="margin: 0 0 8px;">Gerando PDF...</h2>
            <p style="margin: 0; color: #6b7280;">Se o download não iniciar automaticamente, o arquivo será aberto nesta aba.</p>
          </body>
        </html>
      `);
      fallbackWindow.document.close();
    }

    setGeneratingPDF(true);
    try {
      const dateLabel = DATE_PRESETS.find((preset) => preset.value === datePreset)?.label || datePreset;
      const doc = generateAdsReport({
        summary,
        groups: pdfGroups,
        dateLabel: `Período: ${dateLabel}`,
      });

      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (fallbackWindow && !fallbackWindow.closed) {
        fallbackWindow.location.href = blobUrl;
      }

      toast.success(
        isEmbeddedPreview
          ? 'PDF pronto. Se não baixar automaticamente, ele foi aberto em uma nova aba.'
          : 'PDF gerado com sucesso!'
      );

      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (e: any) {
      if (fallbackWindow && !fallbackWindow.closed) {
        fallbackWindow.close();
      }
      console.error('PDF generation error:', e);
      toast.error(`Erro ao gerar PDF: ${e?.message || 'Erro desconhecido'}`);
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

  const statCards = [
    {
      icon: DollarSign,
      label: 'Gasto total',
      value: formatCurrency(summary.spend),
      color: 'text-red-500 bg-red-50 dark:bg-red-900/20',
    },
    {
      icon: RotateCcw,
      label: 'Retorno',
      value: formatCurrency(summary.purchaseValue),
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
      large: true,
    },
    {
      icon: TrendingUp,
      label: 'ROAS',
      value: summary.roas > 0 ? `${summary.roas.toFixed(2)}x` : '—',
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
      large: true,
    },
    {
      icon: Eye,
      label: 'Impressões',
      value: formatNumber(summary.impressions),
      subtitle: `Alcance: ${formatNumber(summary.reach)}`,
      color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
    },
    {
      icon: MousePointerClick,
      label: 'Cliques',
      value: formatNumber(summary.clicks),
      subtitle: summary.purchases > 0 ? `${summary.purchases} compras` : undefined,
      color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-9 text-xs gap-1.5 bg-pink-500 hover:bg-pink-600 text-white"
            disabled={loadingInsights || insights.length === 0 || generatingPDF}
            onClick={handleDownloadPDF}
          >
            {generatingPDF ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {generatingPDF ? 'Gerando...' : 'Gerar PDF'}
          </Button>

          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="w-[180px] h-9 text-xs rounded-lg border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 transition-colors hover:border-gray-300 dark:hover:border-gray-700"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon size={16} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className={`font-bold text-gray-900 dark:text-gray-100 mt-0.5 ${card.large ? 'text-2xl' : 'text-lg'}`}>
              {card.value}
            </p>
            {card.subtitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{card.subtitle}</p>
            )}
          </div>
        ))}
      </div>

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

                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Impressões</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatNumber(eventGroup.totalImpressions)}
                      </p>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
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
    </div>
  );
}
