/**
 * Relatórios de Meta Ads por evento — tipos, formatação e agregação.
 *
 * Compartilhado pela lista de eventos (/interno/ads/campanhas) e pela página
 * de cada evento (/interno/ads/campanhas/evento/:eventId). Só funções puras:
 * a busca dos dados fica no hook useRelatoriosMeta.
 */

export const ADS_ACCOUNT_ID = (import.meta.env.VITE_META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
export const APP_URL = (import.meta.env.VITE_APP_URL || 'https://lagunvitoria.com.br').replace(/\/$/, '');
export const OURO = '#D9B14E';

export interface CampaignInsight {
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

export interface AdCreativeInsight extends CampaignInsight {
  ad_name: string;
  ad_id: string;
  thumbnail_url: string | null;
  image_url: string | null;
  creative_type?: 'video' | 'static';
  video_url?: string | null;
  video_embed_url?: string | null;
}

export interface CampaignBudget {
  campaign_id: string;
  campaign_name: string;
  objective: string;
  daily_budget: number;
}

// Evento da landing (lagun_events).
export interface EventoLanding {
  id: string;
  nome: string;
  data: string | null;
  dia_semana: string | null;
  show_on_landing: boolean;
  relatorio_token: string | null;
  flyer_mobile_url: string | null;
  flyer_desktop_url: string | null;
  display_order: number | null;
}

// Vínculo salvo campanha → evento (lagun_event_campaigns).
export interface Vinculo {
  campaign_id: string;
  event_id: string;
  campaign_name: string | null;
}

/** Uma campanha somada no período (uma linha por campaign_id). */
export interface CampanhaResumo {
  id: string;
  campaign_id: string;
  name: string;
  objective: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  revenue: number;
  /** Ação principal do objetivo (compra, lead, conversa, clique). */
  results: number;
}

export interface Totais {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  revenue: number;
  results: number;
  roas: number;
}

export type TipoObjetivo = 'sales' | 'engagement' | 'traffic' | 'other';

export interface LinhaObjetivo {
  objLabel: string;
  objIcon: string;
  objType: TipoObjetivo;
  campanhas: number;
  spend: number;
  impressions: number;
  clicks: number;
  returnValue: number;
  dailyBudget: number;
}

export const DATE_PRESETS = [
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
export const PRESET_PADRAO = 'last_30d';
export const presetValido = (p: string | null) => (p && DATE_PRESETS.some((x) => x.value === p) ? p : PRESET_PADRAO);
export const rotuloPreset = (p: string) => DATE_PRESETS.find((x) => x.value === p)?.label || p;
export const diasDoPreset = (p: string) =>
  ({ today: 1, yesterday: 1, last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 } as Record<string, number>)[p] ?? 30;

const OBJECTIVE_LABELS: Record<string, { label: string; icon: string; type: TipoObjetivo }> = {
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
const OBJECTIVE_ORDER: Record<TipoObjetivo, number> = { sales: 0, engagement: 1, traffic: 2, other: 3 };

export function getObjectiveMeta(objective: string | undefined) {
  if (!objective) return { label: '—', icon: '📊', type: 'other' as const };
  return OBJECTIVE_LABELS[objective] || { label: objective, icon: '📊', type: 'other' as const };
}

// ── Formatação ─────────────────────────────────────────────────────────────
export function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Celular: R$ 10,8K no lugar de R$ 10.852,09.
export function formatCurrencyShort(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace('.', ',')}K`;
  return formatCurrency(value);
}

export function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('pt-BR');
}

export const formatPct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(2).replace('.', ',')}%` : '—');
export const formatRoas = (roas: number) => (roas > 0 ? `${roas.toFixed(2).replace('.', ',')}x` : '—');

// ── Datas ──────────────────────────────────────────────────────────────────
/** Hoje em America/Sao_Paulo, no formato YYYY-MM-DD. */
export function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Ativo = aparece na landing e ainda não passou (sem data conta como ativo). */
export function eventoEstaAtivo(e: EventoLanding, hoje = hojeSaoPaulo()) {
  if (!e.show_on_landing) return false;
  return !e.data || e.data.slice(0, 10) >= hoje;
}

/** "sex · 26/09" a partir da data do evento. */
export function formatarDataEvento(e: Pick<EventoLanding, 'data' | 'dia_semana'>) {
  if (!e.data) return e.dia_semana || 'Sem data';
  const iso = e.data.slice(0, 10);
  const [, m, d] = iso.split('-');
  const semana = e.dia_semana?.trim()
    || new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${d}/${m} · ${semana}`;
}

export const flyerDoEvento = (e: EventoLanding) => e.flyer_mobile_url || e.flyer_desktop_url || null;

// ── Métricas ───────────────────────────────────────────────────────────────
const ehCompra = (a: { action_type: string }) => a.action_type === 'purchase' || a.action_type === 'omni_purchase';

export function getPurchaseValue(row: CampaignInsight) {
  const v = row.action_values?.find(ehCompra);
  return v ? parseFloat(v.value) : 0;
}

export function getPurchaseCount(row: CampaignInsight) {
  const v = row.actions?.find(ehCompra);
  return v ? parseInt(v.value, 10) : 0;
}

/** Soma as linhas de insights por campanha. */
export function resumirCampanhas(insights: CampaignInsight[]) {
  const porId = new Map<string, CampanhaResumo>();
  for (const row of insights) {
    const id = row.campaign_id || row.campaign_name;
    const atual = porId.get(id) ?? {
      id,
      campaign_id: row.campaign_id,
      name: row.campaign_name || 'Campanha sem nome',
      objective: row.objective,
      spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, revenue: 0, results: 0,
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
    porId.set(id, atual);
  }
  return porId;
}

export function somarTotais(campanhas: Iterable<CampanhaResumo>): Totais {
  const t = { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, revenue: 0, results: 0, roas: 0 };
  for (const c of campanhas) {
    t.spend += c.spend; t.impressions += c.impressions; t.reach += c.reach; t.clicks += c.clicks;
    t.purchases += c.purchases; t.revenue += c.revenue; t.results += c.results;
  }
  t.roas = t.spend > 0 ? t.revenue / t.spend : 0;
  return t;
}

/** Quebra por objetivo (Vendas, Engajamento, Tráfego...). */
export function quebrarPorObjetivo(campanhas: CampanhaResumo[], orcamentoDiario: Map<string, number>): LinhaObjetivo[] {
  const linhas = new Map<string, LinhaObjetivo>();
  for (const c of campanhas) {
    const meta = getObjectiveMeta(c.objective);
    const chave = `${meta.type}:${meta.label}`;
    const linha = linhas.get(chave) ?? {
      objLabel: meta.label, objIcon: meta.icon, objType: meta.type,
      campanhas: 0, spend: 0, impressions: 0, clicks: 0, returnValue: 0, dailyBudget: 0,
    };
    linha.campanhas += 1;
    linha.spend += c.spend;
    linha.impressions += c.impressions;
    linha.clicks += c.clicks;
    linha.returnValue += c.revenue;
    linha.dailyBudget += orcamentoDiario.get(c.campaign_id) || 0;
    linhas.set(chave, linha);
  }
  return [...linhas.values()].sort((a, b) => OBJECTIVE_ORDER[a.objType] - OBJECTIVE_ORDER[b.objType]);
}

// ── Sugestão de evento pelo nome ───────────────────────────────────────────
// Comparação sem acento e sem caixa.
export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O nome da campanha contém o nome de um evento ativo. O mais longo vence ("Isso É Trap 2" antes de "Isso É Trap"). */
export function sugerirEvento(campaignName: string, eventosAtivos: EventoLanding[]): EventoLanding | null {
  const alvo = semAcento(campaignName || '');
  return [...eventosAtivos]
    .filter((e) => semAcento(e.nome).length >= 3 && alvo.includes(semAcento(e.nome)))
    .sort((a, b) => b.nome.length - a.nome.length)[0] || null;
}

export const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Status da campanha (effective_status do Meta) ──────────────────────────
export function rotuloStatus(status: string | undefined) {
  if (!status) return null;
  if (status === 'ACTIVE') return { texto: 'Ativa', ativa: true };
  if (status === 'ARCHIVED') return { texto: 'Arquivada', ativa: false };
  return { texto: 'Pausada', ativa: false };
}
