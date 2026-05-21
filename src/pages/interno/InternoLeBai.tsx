import { useState, useEffect, useRef } from 'react';
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
  const [config, setConfig] = useState<AutoDispatchConfig | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    async function init() {
      let foundId = '40935';
      const allData: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('webhook_logs').select('payload').eq('source', 'blueticket').range(from, from + 999);
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

      const { data: cfg } = await supabase
        .from('bt_auto_dispatch').select('*').eq('event_id', foundId).maybeSingle();
      if (cfg) setConfig(cfg as AutoDispatchConfig);
      else setConfig({ event_id: foundId, event_name: "Le'Bai", phone_number_id: '', template_name: '', template_language: 'pt_BR', enabled: false });

      try {
        const [tRes, pRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/functions/v1/whatsapp-api?action=templates`),
          fetch(`${SUPABASE_URL}/functions/v1/whatsapp-api?action=phone_numbers`),
        ]);
        const tData = await tRes.json();
        const pData = await pRes.json();
        if (tData?.data) setTemplates(tData.data.filter((t: any) => t.status === 'APPROVED'));
        if (pData?.data) {
          setPhones(pData.data);
          // Auto-select first phone if none configured
          if (pData.data.length > 0) {
            setConfig(prev => prev && !prev.phone_number_id
              ? { ...prev, phone_number_id: pData.data[0].id }
              : prev
            );
          }
        }
      } catch (e) { console.error(e); }
    }
    init();
  }, []);

  async function saveConfig(updated: AutoDispatchConfig) {
    const { error } = await supabase
      .from('bt_auto_dispatch')
      .upsert({ ...updated, updated_at: new Date().toISOString() }, { onConflict: 'event_id' });
    if (error) toast.error('Erro ao salvar');
  }

  async function toggleEnabled() {
    if (!config) return;
    if (!config.enabled && !config.template_name) {
      toast.error('Selecione um template antes de ativar');
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

  // ── Slot compacto que vai no cabeçalho de Carrinhos Abandonados ──
  const autoDispatchSlot = config ? (
    <div className="flex items-center gap-2 border-r border-gray-200 dark:border-gray-700 pr-3 mr-1">

      {/* Template dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowTemplates(v => !v)}
          className={`flex items-center gap-1.5 text-[11px] rounded-lg border px-2.5 py-1.5 transition-colors ${
            config.template_name
              ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              : 'border-dashed border-gray-300 dark:border-gray-600 bg-transparent text-gray-400 hover:border-gray-400'
          }`}
        >
          <Zap size={11} className={config.enabled ? 'text-emerald-500' : 'text-gray-400'} />
          <span className="max-w-[140px] truncate">
            {config.template_name || 'Selecionar template'}
          </span>
          <ChevronDown size={10} className="text-gray-400 shrink-0" />
        </button>

        {showTemplates && (
          <div className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-52 overflow-y-auto">
            <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Template de auto-disparo
            </p>
            {templates.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-gray-400">Nenhum template aprovado</p>
            ) : (
              templates.map(t => (
                <button
                  key={t.name}
                  onClick={() => {
                    const updated = { ...config, template_name: t.name, template_language: t.language || 'pt_BR' };
                    setConfig(updated);
                    setShowTemplates(false);
                    saveConfig(updated);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border shrink-0 ${
                    config.template_name === t.name
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {config.template_name === t.name && <Check size={8} className="text-white" />}
                  </div>
                  <span className={`truncate ${config.template_name === t.name ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                    {t.name}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Toggle */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 select-none">Auto-disparo</span>
        <button
          onClick={toggleEnabled}
          title={config.enabled ? 'Desativar' : 'Ativar auto-disparo'}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
            config.enabled ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            config.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>
    </div>
  ) : null;

  return <EventDashboard eventId={eventId!} autoDispatchSlot={autoDispatchSlot} eventDate="2026-05-29" />;
}
