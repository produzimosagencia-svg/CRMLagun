import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Plus, RefreshCw, Users, Zap, Copy } from 'lucide-react';

interface AdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string;
}

interface Pixel {
  id: string;
  name: string;
  creation_time: number;
  last_fired_time?: number;
}

interface Audience {
  id: string;
  name: string;
  subtype: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  description?: string;
  time_created?: number;
}

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

const AUDIENCE_SUBTYPES = [
  { value: 'CUSTOM', label: 'Lista de clientes', description: 'Upload de emails/telefones' },
  { value: 'WEBSITE', label: 'Visitantes do site', description: 'Pessoas que visitaram seu site via Pixel' },
  { value: 'LOOKALIKE', label: 'Lookalike', description: 'Similar a um público existente' },
];

export default function InternoAdsPixel() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AdAccount | null>(null);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [showNewAudience, setShowNewAudience] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newAudience, setNewAudience] = useState({
    name: '',
    subtype: 'CUSTOM',
    description: '',
  });

  useEffect(() => {
    callMetaApi({ action: 'accounts' }).then((res) => {
      if (res.data) setAccounts(res.data);
      setLoadingAccounts(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;
    loadAccountData();
  }, [selectedAccount]);

  async function loadAccountData() {
    if (!selectedAccount) return;
    setLoadingData(true);
    const [pixelRes, audienceRes] = await Promise.all([
      callMetaApi({ action: 'pixels', account_id: selectedAccount.account_id }),
      callMetaApi({ action: 'audiences', account_id: selectedAccount.account_id }),
    ]);
    if (pixelRes.data) setPixels(pixelRes.data);
    if (audienceRes.data) setAudiences(audienceRes.data);
    setLoadingData(false);
  }

  async function handleCreateAudience() {
    if (!selectedAccount || !newAudience.name.trim()) {
      toast.error('Nome do público é obrigatório');
      return;
    }
    setCreating(true);
    try {
      const res = await callMetaApi({}, 'POST', {
        action: 'create_audience',
        account_id: selectedAccount.account_id,
        name: newAudience.name,
        subtype: newAudience.subtype,
        description: newAudience.description || undefined,
      });
      if (res.error) throw new Error(res.error);
      toast.success('Público criado com sucesso!');
      setShowNewAudience(false);
      setNewAudience({ name: '', subtype: 'CUSTOM', description: '' });
      loadAccountData();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  function formatCount(lower?: number, upper?: number) {
    if (!lower) return 'Calculando...';
    if (lower < 1000) return '< 1 mil';
    const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
    return upper ? `${fmt(lower)} – ${fmt(upper)}` : `~${fmt(lower)}`;
  }

  function formatDate(ts?: number) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString('pt-BR');
  }

  const subtypeLabel: Record<string, string> = {
    CUSTOM: 'Lista',
    WEBSITE: 'Site',
    LOOKALIKE: 'Lookalike',
    ENGAGEMENT: 'Engajamento',
    APP: 'App',
    OFFLINE_CONVERSION: 'Offline',
  };

  return (
    <div className="space-y-6">
      {/* Account selector */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardContent className="p-4">
          {loadingAccounts ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={14} className="animate-spin" /> Carregando contas...</div>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">Conta:</span>
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccount(acc)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    selectedAccount?.id === acc.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'
                  }`}
                >
                  {acc.name}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!selectedAccount && (
        <p className="text-center text-gray-400 text-sm py-8">Selecione uma conta para ver os Pixels e Públicos.</p>
      )}

      {selectedAccount && (
        <>
          {/* Pixels */}
          <Card className="border-gray-200 dark:border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Zap size={16} className="text-yellow-500" /> Pixels
              </CardTitle>
              <Button variant="outline" size="sm" onClick={loadAccountData} disabled={loadingData}>
                <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
              </Button>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={14} className="animate-spin" /> Carregando...</div>
              ) : pixels.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum pixel encontrado nesta conta.</p>
              ) : (
                <div className="space-y-2">
                  {pixels.map((px) => (
                    <div key={px.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{px.name}</p>
                        <p className="text-xs text-gray-400">ID: {px.id} · Criado em {formatDate(px.creation_time)}</p>
                        {px.last_fired_time && (
                          <p className="text-xs text-green-600 dark:text-green-400">Último disparo: {formatDate(px.last_fired_time)}</p>
                        )}
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(px.id); toast.success('ID copiado!'); }}
                        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        title="Copiar ID"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audiences */}
          <Card className="border-gray-200 dark:border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Users size={16} className="text-blue-500" /> Públicos Personalizados
              </CardTitle>
              <Button size="sm" onClick={() => setShowNewAudience(!showNewAudience)} className="bg-blue-600 hover:bg-blue-500 text-white">
                <Plus size={14} className="mr-1" /> Novo Público
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* New audience form */}
              {showNewAudience && (
                <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-4 bg-blue-50/50 dark:bg-blue-900/10">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Novo público personalizado</h4>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {AUDIENCE_SUBTYPES.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setNewAudience((p) => ({ ...p, subtype: t.value }))}
                          className={`text-left p-3 rounded-lg border-2 text-sm transition-all ${
                            newAudience.subtype === t.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                          }`}
                        >
                          <span className="font-medium text-gray-900 dark:text-gray-100">{t.label}</span>
                          <span className="text-gray-400 ml-2">{t.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do público</Label>
                    <Input
                      placeholder="Ex: Compradores BoomRAP"
                      value={newAudience.name}
                      onChange={(e) => setNewAudience((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Input
                      placeholder="Ex: Clientes que compraram ingresso no BoomRAP 2026"
                      value={newAudience.description}
                      onChange={(e) => setNewAudience((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowNewAudience(false)}>Cancelar</Button>
                    <Button size="sm" onClick={handleCreateAudience} disabled={creating} className="bg-blue-600 hover:bg-blue-500 text-white">
                      {creating ? <><Loader2 size={14} className="mr-1 animate-spin" /> Criando...</> : 'Criar público'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Audiences list */}
              {loadingData ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={14} className="animate-spin" /> Carregando...</div>
              ) : audiences.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum público personalizado encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {audiences.map((aud) => (
                    <div key={aud.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{aud.name}</p>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            {subtypeLabel[aud.subtype] ?? aud.subtype}
                          </span>
                        </div>
                        {aud.description && <p className="text-xs text-gray-400 mt-0.5">{aud.description}</p>}
                        <p className="text-xs text-gray-400">
                          {formatCount(aud.approximate_count_lower_bound, aud.approximate_count_upper_bound)} pessoas
                          {aud.time_created && ` · Criado ${formatDate(aud.time_created)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(aud.id); toast.success('ID copiado!'); }}
                        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        title="Copiar ID"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
