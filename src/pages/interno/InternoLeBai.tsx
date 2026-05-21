import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EventDashboard } from './InternoBluetick';
import { Loader2, Zap, ChevronDown, Check } from 'lucide-react';
import { toast } from 'sonner';

const LE_BAI_NAMES = ['le bai', 'lebai', 'le-bai', "le'bai", 'le’bai'];
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface AutoDispatchConfig {
  event_id: string;
  event_name: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  enabled: boolean;
}

interface Template { name: string; language: string; status: string; }
interface Phone { id: string; display_phone_number: string; verified_name: string; }

export default function InternoLeBai() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);

  // Auto-disparo
  const [config, setConfig] = useState<AutoDispatchConfig | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPhones, setShowPhones] = useState(false);

  useEffect(() => {
    async function init() {
      // Descobre event_id nos logs
      let foundId = '40935'; // fallback fixo
      const allData: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('webhook_logs')
          .select('payload')
          .eq('source', 'blueticket')
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        allData.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      for (const log of allData) {
        const name: string = (log.payload?.payload?.event?.name ?? '').toLowerCase();
        const id = log.payload?.payload?.event?.id?.toString();
        if (id && LE_BAI_NAMES.some(n => name.includes(n))) { foundId = id; break; }
      }
      setEventId(foundId);
      setLoadingEvent(false);

      // Carrega config do auto-disparo
      const { data: cfg } = await supabase
        .from('bt_auto_dispatch')
        .select('*')
        .eq('event_id', foundId)
        .maybeSingle();
      if (cfg) setConfig(cfg as AutoDispatchConfig);
      else setConfig({ event_id: foundId, event_name: "Le'Bai", phone_number_id: '', template_name: '', template_language: 'pt_BR', enabled: false });

      // Carrega templates e telefones do WhatsApp
      try {
        const [tRes, pRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/functions/v1/whatsapp-api?action=templates`),
          fetch(`${SUPABASE_URL}/functions/v1/whatsapp-api?action=phone_numbers`),
        ]);
        const tData = await tRes.json();
        const pData = await pRes.json();
        if (tData?.data) setTemplates(tData.data.filter((t: any) => t.status === 'APPROVED'));
        if (pData?.data) setPhones(pData.data);
      } catch (e) { console.error('Erro carregando WhatsApp config:', e); }
    }
    init();
  }, []);

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from('bt_auto_dispatch')
      .upsert({ ...config, updated_at: new Date().toISOString() }, { onConflict: 'event_id' });
    setSaving(false);
    if (error) toast.error('Erro ao salvar configuração');
    else toast.success('Configuração salva!');
  }

  async function toggleEnabled() {
    if (!config) return;
    if (config.enabled && (!config.phone_number_id || !config.template_name)) {
      toast.error('Selecione o template e o número antes de ativar');
      return;
    }
    const updated = { ...config, enabled: !config.enabled };
    setConfig(updated);
    const { error } = await supabase
      .from('bt_auto_dispatch')
      .upsert({ ...updated, updated_at: new Date().toISOString() }, { onConflict: 'event_id' });
    if (error) toast.error('Erro ao salvar');
    else toast.success(updated.enabled ? '⚡ Auto-disparo ativado!' : 'Auto-disparo desativado');
  }

  if (loadingEvent) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-gray-400 dark:text-gray-500" size={24} />
      </div>
    );
  }

  const selectedPhone = phones.find(p => p.id === config?.phone_number_id);

  return (
    <div className="space-y-4">
      {/* Auto-disparo config */}
      {config && (
        <div className={`rounded-xl border p-4 transition-all ${
          config.enabled
            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
        }`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                config.enabled ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
              }`}>
                <Zap size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Auto-disparo WhatsApp</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {config.enabled
                    ? `Ativo — enviando "${config.template_name}" automaticamente`
                    : 'Carrinho abandonado → disparo automático de WhatsApp'}
                </p>
              </div>
            </div>

            {/* Toggle */}
            <button
              onClick={toggleEnabled}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                config.enabled ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                config.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Configurações expandidas */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Template */}
            <div className="relative">
              <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Template de mensagem
              </label>
              <button
                onClick={() => { setShowTemplates(!showTemplates); setShowPhones(false); }}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className={config.template_name ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}>
                  {config.template_name || 'Selecione um template...'}
                </span>
                <ChevronDown size={14} className="text-gray-400 shrink-0" />
              </button>
              {showTemplates && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-48 overflow-y-auto">
                  {templates.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum template aprovado encontrado</p>
                  ) : templates.map(t => (
                    <button
                      key={t.name}
                      onClick={() => {
                        setConfig(c => c ? { ...c, template_name: t.name, template_language: t.language || 'pt_BR' } : c);
                        setShowTemplates(false);
                        saveConfig();
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      {config.template_name === t.name && <Check size={12} className="text-emerald-500 shrink-0" />}
                      <span className={`text-gray-900 dark:text-gray-100 ${config.template_name === t.name ? 'font-semibold' : ''}`}>{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Número WhatsApp */}
            <div className="relative">
              <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Número de envio
              </label>
              <button
                onClick={() => { setShowPhones(!showPhones); setShowTemplates(false); }}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className={selectedPhone ? 'text-gray-900 dark:text-gray-100 font-mono' : 'text-gray-400'}>
                  {selectedPhone ? selectedPhone.display_phone_number : 'Selecione um número...'}
                </span>
                <ChevronDown size={14} className="text-gray-400 shrink-0" />
              </button>
              {showPhones && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                  {phones.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum número encontrado</p>
                  ) : phones.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setConfig(c => c ? { ...c, phone_number_id: p.id } : c);
                        setShowPhones(false);
                        saveConfig();
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      {config.phone_number_id === p.id && <Check size={12} className="text-emerald-500 shrink-0" />}
                      <div>
                        <p className="font-mono text-gray-900 dark:text-gray-100">{p.display_phone_number}</p>
                        {p.verified_name && <p className="text-[10px] text-gray-400">{p.verified_name}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {(config.template_name || config.phone_number_id) && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Salvar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dashboard */}
      <EventDashboard eventId={eventId!} />
    </div>
  );
}
