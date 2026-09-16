import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CirclePause,
  CirclePlay,
  ExternalLink,
  Eye,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  MousePointerClick,
  WalletCards,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ADS_ACCOUNT_ID = (import.meta.env.VITE_META_AD_ACCOUNT_ID || '').replace(/^act_/, '');

interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface CampaignInsight {
  campaign_id: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
}

interface CampaignBudget {
  campaign_id: string;
  daily_budget?: number;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  CAMPAIGN_PAUSED: 'Pausada',
  ARCHIVED: 'Arquivada',
};

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_ENGAGEMENT: 'Engajamento',
  OUTCOME_SALES: 'Vendas',
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_AWARENESS: 'Reconhecimento',
  OUTCOME_LEADS: 'Cadastros',
  POST_ENGAGEMENT: 'Engajamento',
  LINK_CLICKS: 'Tráfego',
};

function formatBudget(cents?: string) {
  const value = Number(cents || 0) / 100;
  return value > 0
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'No conjunto';
}

function formatMetric(value: number) {
  return new Intl.NumberFormat('pt-BR', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

async function callMetaApi(params: Record<string, string>) {
  const { data: { session } } = await supabase.auth.getSession();
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ads-api?${query}`, {
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  return response.json();
}

export default function InternoAdsGerenciar() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [campaignPayload, insightPayload, budgetPayload] = await Promise.all([
        callMetaApi({ action: 'campaigns', account_id: ADS_ACCOUNT_ID }),
        callMetaApi({ action: 'insights', account_id: ADS_ACCOUNT_ID, date_preset: 'last_30d' }),
        callMetaApi({ action: 'campaign_budgets', account_id: ADS_ACCOUNT_ID }),
      ]);
      if (campaignPayload.error) throw new Error(campaignPayload.error?.message || String(campaignPayload.error));
      if (insightPayload.error) throw new Error(insightPayload.error?.message || String(insightPayload.error));

      const recentInsights = (insightPayload.data || []) as CampaignInsight[];
      const recentCampaignIds = new Set(recentInsights.map((item) => item.campaign_id));
      const budgetByCampaign = new Map<string, number>(
        ((budgetPayload.data || []) as CampaignBudget[]).map((item) => [item.campaign_id, Number(item.daily_budget || 0)])
      );
      setInsights(recentInsights);
      setCampaigns(((campaignPayload.data || []) as MetaCampaign[])
        .filter((campaign) => recentCampaignIds.has(campaign.id))
        .map((campaign) => ({
          ...campaign,
          daily_budget: String(budgetByCampaign.get(campaign.id) || campaign.daily_budget || 0),
        })));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as campanhas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const filteredCampaigns = useMemo(() => campaigns.filter((campaign) => {
    const campaignStatus = campaign.effective_status || campaign.status || '';
    const matchesStatus = status === 'all'
      || (status === 'ACTIVE' ? campaignStatus === 'ACTIVE' : campaignStatus !== 'ACTIVE');
    return matchesStatus && campaign.name.toLowerCase().includes(search.trim().toLowerCase());
  }), [campaigns, search, status]);

  const totals = useMemo(() => insights.reduce((summary, item) => ({
    spend: summary.spend + Number(item.spend || 0),
    reach: summary.reach + Number(item.reach || 0),
    impressions: summary.impressions + Number(item.impressions || 0),
    clicks: summary.clicks + Number(item.clicks || 0),
  }), { spend: 0, reach: 0, impressions: 0, clicks: 0 }), [insights]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C766]">
            <ShieldCheck size={14} /> Central oficial Meta Ads
          </div>
          <h1 className="text-2xl font-black text-white">Gerenciar campanhas</h1>
          <p className="mt-1 text-sm text-white/45">Campanhas com entrega nos últimos 30 dias.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadCampaigns} disabled={loading} className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]">
            <RefreshCw size={15} className={loading ? 'mr-2 animate-spin' : 'mr-2'} /> Atualizar
          </Button>
          <Button onClick={() => navigate('/interno/ads/criar')} className="bg-[#E8C766] font-bold text-[#191813] hover:bg-[#F0D77E]">
            <Plus size={16} className="mr-2" /> Nova campanha
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Gasto · 30 dias', value: totals.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: WalletCards, color: 'text-rose-300' },
          { label: 'Alcance · 30 dias', value: formatMetric(totals.reach), icon: Eye, color: 'text-purple-300' },
          { label: 'Impressões · 30 dias', value: formatMetric(totals.impressions), icon: BarChart3, color: 'text-blue-300' },
          { label: 'Cliques · 30 dias', value: formatMetric(totals.clicks), icon: MousePointerClick, color: 'text-[#E8C766]' },
        ].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="mb-5 flex items-center justify-between"><item.icon size={18} className={item.color} /><span className="h-2 w-2 rounded-full bg-white/10" /></div>
          <p className="text-2xl font-black text-white">{item.value}</p><p className="mt-1 text-xs text-white/40">{item.label}</p>
        </div>)}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#191813]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar campanha..." className="border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-white/25" />
          </div>
          <div className="flex rounded-lg border border-white/10 bg-black/10 p-1">
            {[['all', 'Todas'], ['ACTIVE', 'Ativas'], ['PAUSED', 'Pausadas']].map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${status === value ? 'bg-[#E8C766] text-[#191813]' : 'text-white/45 hover:text-white'}`}>{label}</button>)}
          </div>
        </div>

        {loading ? <div className="flex items-center justify-center gap-2 py-20 text-sm text-white/40"><Loader2 size={17} className="animate-spin" /> Carregando campanhas da Meta...</div>
          : error ? <div className="px-5 py-16 text-center"><p className="font-semibold text-red-300">Falha ao conectar com a Meta</p><p className="mt-1 text-xs text-white/35">{error}</p></div>
          : <div className="divide-y divide-white/[0.07]">
            {filteredCampaigns.map((campaign) => {
              const campaignStatus = campaign.effective_status || campaign.status || 'PAUSED';
              const active = campaignStatus === 'ACTIVE';
              return <div key={campaign.id} className="grid gap-4 p-4 transition hover:bg-white/[0.025] lg:grid-cols-[minmax(240px,1fr)_145px_145px_115px_230px] lg:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-white" title={campaign.name}>{campaign.name}</p><p className="mt-1 font-mono text-[10px] text-white/25">ID {campaign.id}</p></div>
                <div><p className="text-[9px] uppercase tracking-wide text-white/25">Objetivo</p><p className="mt-1 text-xs font-semibold text-white/65">{OBJECTIVE_LABELS[campaign.objective || ''] || campaign.objective || '—'}</p></div>
                <div><p className="text-[9px] uppercase tracking-wide text-white/25">Orçamento</p><p className="mt-1 text-xs font-semibold text-white/65">{formatBudget(campaign.daily_budget)}{campaign.daily_budget ? '/dia' : ''}</p></div>
                <div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${active ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-amber-300'}`} />{STATUS_LABELS[campaignStatus] || campaignStatus}</span></div>
                <div className="flex items-center justify-end gap-1">
                  <a href={`https://www.facebook.com/adsmanager/manage/ads?act=${ADS_ACCOUNT_ID}&selected_campaign_ids=${campaign.id}`} target="_blank" rel="noreferrer" title="Adicionar ou trocar criativos na Meta" className="mr-1 inline-flex items-center gap-1.5 rounded-lg border border-purple-400/20 bg-purple-400/10 px-2.5 py-2 text-[10px] font-bold text-purple-200 transition hover:bg-purple-400/20"><ImagePlus size={14} /> Criativos</a>
                  <button disabled title="Disponível após liberar ads_management" className="rounded-lg p-2 text-white/20" aria-label="Editar campanha"><Pencil size={15} /></button>
                  <button disabled title="Disponível após liberar ads_management" className="rounded-lg p-2 text-white/20" aria-label={active ? 'Pausar campanha' : 'Ativar campanha'}>{active ? <CirclePause size={15} /> : <CirclePlay size={15} />}</button>
                  <a href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${ADS_ACCOUNT_ID}&selected_campaign_ids=${campaign.id}`} target="_blank" rel="noreferrer" title="Abrir no Gerenciador da Meta" className="rounded-lg p-2 text-white/45 transition hover:bg-white/10 hover:text-white"><ExternalLink size={15} /></a>
                </div>
              </div>;
            })}
            {filteredCampaigns.length === 0 && <div className="py-16 text-center text-sm text-white/35">Nenhuma campanha encontrada.</div>}
          </div>}
      </div>

      <div className="rounded-xl border border-[#E8C766]/20 bg-[#E8C766]/[0.06] px-4 py-3 text-xs leading-relaxed text-yellow-100/65">
        <strong className="text-[#E8C766]">Modo seguro:</strong> criação gera campanha e conjunto pausados. Editar orçamento, ativar e pausar serão habilitados depois da validação do acesso avançado <code className="text-yellow-200">ads_management</code> e das regras internas de autorização.
      </div>
    </div>
  );
}
