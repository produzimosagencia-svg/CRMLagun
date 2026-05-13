import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, Loader2,
  Target, Users, DollarSign, Eye, Rocket,
} from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Conta', icon: Rocket },
  { id: 2, label: 'Campanha', icon: Target },
  { id: 3, label: 'Público', icon: Users },
  { id: 4, label: 'Orçamento', icon: DollarSign },
  { id: 5, label: 'Revisar', icon: Eye },
];

const OBJECTIVES = [
  { value: 'OUTCOME_TRAFFIC', label: 'Tráfego', description: 'Levar pessoas ao seu site ou app', emoji: '🚦' },
  { value: 'OUTCOME_AWARENESS', label: 'Reconhecimento', description: 'Aumentar o alcance da marca', emoji: '📣' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engajamento', description: 'Mais curtidas, comentários e compartilhamentos', emoji: '❤️' },
  { value: 'OUTCOME_LEADS', label: 'Geração de Leads', description: 'Capturar contatos interessados', emoji: '📋' },
  { value: 'OUTCOME_SALES', label: 'Vendas', description: 'Converter visitantes em compradores', emoji: '🛒' },
];

const OPTIMIZATION_MAP: Record<string, { billing_event: string; optimization_goal: string }> = {
  OUTCOME_TRAFFIC: { billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS' },
  OUTCOME_AWARENESS: { billing_event: 'IMPRESSIONS', optimization_goal: 'REACH' },
  OUTCOME_ENGAGEMENT: { billing_event: 'IMPRESSIONS', optimization_goal: 'POST_ENGAGEMENT' },
  OUTCOME_LEADS: { billing_event: 'IMPRESSIONS', optimization_goal: 'LEAD_GENERATION' },
  OUTCOME_SALES: { billing_event: 'IMPRESSIONS', optimization_goal: 'OFFSITE_CONVERSIONS' },
};

interface AdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string;
}

interface WizardData {
  account: AdAccount | null;
  campaignName: string;
  objective: string;
  ageMin: string;
  ageMax: string;
  gender: 'all' | 'male' | 'female';
  cities: string;
  budgetType: 'daily' | 'lifetime';
  budget: string;
  startDate: string;
  endDate: string;
}

const EMPTY: WizardData = {
  account: null,
  campaignName: '',
  objective: '',
  ageMin: '18',
  ageMax: '65',
  gender: 'all',
  cities: '',
  budgetType: 'daily',
  budget: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
};

async function callMetaApi(params: Record<string, string>, method: 'GET' | 'POST' = 'GET', body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const qs = new URLSearchParams(params).toString();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ads-api?${qs}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function InternoAdsCriarCampanha() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(EMPTY);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    callMetaApi({ action: 'accounts' }).then((res) => {
      if (res.data) setAccounts(res.data);
      setLoadingAccounts(false);
    });
  }, []);

  const set = (patch: Partial<WizardData>) => setData((prev) => ({ ...prev, ...patch }));

  const canNext = () => {
    if (step === 1) return !!data.account;
    if (step === 2) return !!data.campaignName.trim() && !!data.objective;
    if (step === 3) return !!data.ageMin && !!data.ageMax;
    if (step === 4) return !!data.budget && Number(data.budget) > 0 && !!data.startDate;
    return true;
  };

  async function handleCreate() {
    if (!data.account) return;
    setCreating(true);
    try {
      const opt = OPTIMIZATION_MAP[data.objective];
      const genders = data.gender === 'all' ? [1, 2] : data.gender === 'male' ? [1] : [2];
      const cities = data.cities.trim()
        ? data.cities.split(',').map((c) => ({ key: c.trim() }))
        : [];

      const targeting = {
        age_min: Number(data.ageMin),
        age_max: Number(data.ageMax),
        genders,
        geo_locations: cities.length
          ? { countries: ['BR'], cities }
          : { countries: ['BR'] },
      };

      const budgetCents = Math.round(Number(data.budget) * 100);

      const res = await callMetaApi({}, 'POST', {
        action: 'create_campaign_full',
        account_id: data.account.account_id,
        campaign_name: data.campaignName,
        objective: data.objective,
        adset_name: `${data.campaignName} — Conjunto`,
        billing_event: opt.billing_event,
        optimization_goal: opt.optimization_goal,
        budget_type: data.budgetType,
        budget_cents: budgetCents,
        start_time: new Date(data.startDate).toISOString(),
        end_time: data.endDate ? new Date(data.endDate).toISOString() : undefined,
        targeting,
      });

      if (res.error) throw new Error(res.error);
      toast.success('Campanha e conjunto de anúncios criados com sucesso!');
      navigate('/interno/ads/campanhas');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  const obj = OBJECTIVES.find((o) => o.value === data.objective);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/interno/ads/campanhas')}>
          <ArrowLeft size={16} />
        </Button>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nova Campanha</h2>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const done = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 transition-all ${
                  done ? 'bg-blue-600 text-white' : active ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                }`}
              >
                {done ? <Check size={14} /> : <s.icon size={14} />}
              </div>
              <span className={`ml-1 text-xs hidden sm:block ${active ? 'text-blue-700 dark:text-blue-400 font-medium' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${done ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="p-6 space-y-5">

          {/* STEP 1: Conta */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Selecione a conta de anúncios</h3>
              {loadingAccounts ? (
                <div className="flex items-center gap-2 text-gray-400"><Loader2 size={16} className="animate-spin" /> Carregando contas...</div>
              ) : accounts.length === 0 ? (
                <p className="text-sm text-red-500">Nenhuma conta encontrada. Verifique o token do Meta.</p>
              ) : (
                <div className="space-y-2">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => set({ account: acc })}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        data.account?.id === acc.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                      }`}
                    >
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{acc.name}</p>
                      <p className="text-xs text-gray-500">ID: {acc.account_id} · {acc.currency}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Campanha */}
          {step === 2 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Configure a campanha</h3>
              <div className="space-y-2">
                <Label>Nome da campanha</Label>
                <Input
                  placeholder="Ex: BoomRAP 2026 — Tráfego"
                  value={data.campaignName}
                  onChange={(e) => set({ campaignName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Objetivo</Label>
                <div className="grid grid-cols-1 gap-2">
                  {OBJECTIVES.map((obj) => (
                    <button
                      key={obj.value}
                      onClick={() => set({ objective: obj.value })}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        data.objective === obj.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                      }`}
                    >
                      <span className="text-lg mr-2">{obj.emoji}</span>
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{obj.label}</span>
                      <span className="text-xs text-gray-500 ml-2">{obj.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Público */}
          {step === 3 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Defina o público</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Idade mínima</Label>
                  <Input type="number" min={18} max={65} value={data.ageMin} onChange={(e) => set({ ageMin: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Idade máxima</Label>
                  <Input type="number" min={18} max={65} value={data.ageMax} onChange={(e) => set({ ageMax: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Gênero</Label>
                <div className="flex gap-2">
                  {(['all', 'male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => set({ gender: g })}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        data.gender === g ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {g === 'all' ? 'Todos' : g === 'male' ? 'Masculino' : 'Feminino'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cidades (opcional)</Label>
                <Input
                  placeholder="Ex: Vitória, Vila Velha, Serra"
                  value={data.cities}
                  onChange={(e) => set({ cities: e.target.value })}
                />
                <p className="text-xs text-gray-400">Separe por vírgula. Deixe vazio para segmentar o Brasil inteiro.</p>
              </div>
            </div>
          )}

          {/* STEP 4: Orçamento */}
          {step === 4 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Defina o orçamento</h3>
              <div className="space-y-2">
                <Label>Tipo de orçamento</Label>
                <div className="flex gap-2">
                  {(['daily', 'lifetime'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => set({ budgetType: t })}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        data.budgetType === t ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {t === 'daily' ? 'Diário' : 'Total (vitalício)'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  min={1}
                  step={0.01}
                  placeholder="Ex: 50.00"
                  value={data.budget}
                  onChange={(e) => set({ budget: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de início</Label>
                  <Input type="date" value={data.startDate} onChange={(e) => set({ startDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data de fim {data.budgetType === 'daily' && <span className="text-gray-400">(opcional)</span>}</Label>
                  <Input type="date" value={data.endDate} onChange={(e) => set({ endDate: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Revisar */}
          {step === 5 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Revise antes de criar</h3>
              <div className="space-y-3">
                <ReviewRow label="Conta" value={data.account?.name ?? '—'} />
                <ReviewRow label="Nome" value={data.campaignName} />
                <ReviewRow label="Objetivo" value={obj ? `${obj.emoji} ${obj.label}` : '—'} />
                <ReviewRow label="Público" value={`${data.ageMin}–${data.ageMax} anos · ${data.gender === 'all' ? 'Todos' : data.gender === 'male' ? 'Masculino' : 'Feminino'}`} />
                {data.cities && <ReviewRow label="Cidades" value={data.cities} />}
                <ReviewRow
                  label="Orçamento"
                  value={`R$ ${Number(data.budget).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${data.budgetType === 'daily' ? '/ dia' : 'total'}`}
                />
                <ReviewRow label="Início" value={new Date(data.startDate).toLocaleDateString('pt-BR')} />
                {data.endDate && <ReviewRow label="Fim" value={new Date(data.endDate).toLocaleDateString('pt-BR')} />}
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                A campanha e o conjunto de anúncios serão criados no Meta Ads. Você ainda precisará adicionar os criativos (anúncios) diretamente no Gerenciador de Anúncios.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => (step === 1 ? navigate('/interno/ads/campanhas') : setStep(step - 1))}
        >
          <ArrowLeft size={16} className="mr-1" />
          {step === 1 ? 'Cancelar' : 'Voltar'}
        </Button>
        {step < 5 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
            Próximo <ArrowRight size={16} className="ml-1" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={creating} className="bg-blue-600 hover:bg-blue-500 text-white">
            {creating ? <><Loader2 size={16} className="mr-2 animate-spin" /> Criando...</> : <><Rocket size={16} className="mr-2" /> Criar Campanha</>}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 text-right max-w-[60%]">{value}</span>
    </div>
  );
}
