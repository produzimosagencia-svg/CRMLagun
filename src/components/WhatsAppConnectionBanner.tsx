import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WifiOff, RefreshCw, Loader2, X, Smartphone, QrCode, Webhook } from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = 'https://xwxiijbovreucnrbyput.supabase.co';
export type ConnStatus = 'checking' | 'open' | 'connecting' | 'close';

async function callProxy(action: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/evolution-proxy?action=${action}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Hook compartilhado ─────────────────────────────────────────────────────
export function useWhatsAppConnection() {
  const [status, setStatus]   = useState<ConnStatus>('checking');
  const [qr, setQr]           = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [webhookOk, setWebhookOk] = useState(false);

  const webhookConfigured = useRef(false);

  const configureWebhook = useCallback(async (silent = true) => {
    try {
      const data = await callProxy('set_webhook');
      const ok = data?.webhook?.enabled === true || data?.enabled === true || !!data?.url;
      setWebhookOk(ok);
      if (!silent) toast.success('Webhook configurado com sucesso!');
      return ok;
    } catch {
      if (!silent) toast.error('Erro ao configurar webhook');
      return false;
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const data = await callProxy('status');
      const state: string = data?.instance?.state ?? data?.state ?? '';
      if (state === 'open') {
        setStatus('open');
        setQr(null);
        // Configure webhook once when connected
        if (!webhookConfigured.current) {
          webhookConfigured.current = true;
          configureWebhook(true).then(ok => {
            if (!ok) webhookConfigured.current = false;
          });
        }
      } else if (state === 'connecting') setStatus('connecting');
      else { setStatus('close'); webhookConfigured.current = false; setWebhookOk(false); }
    } catch { setStatus('close'); }
  }, [configureWebhook]);

  useEffect(() => {
    checkStatus();
    const id = setInterval(checkStatus, 5000);
    return () => clearInterval(id);
  }, [checkStatus]);

  async function connect() {
    setLoadingQr(true);
    try {
      let data = await callProxy('qr');
      let base64 = data?.base64 ?? data?.qrcode?.base64 ?? data?.qr?.base64 ?? null;
      if (!base64) {
        await callProxy('create');
        await new Promise(r => setTimeout(r, 2000));
        data = await callProxy('qr');
        base64 = data?.base64 ?? data?.qrcode?.base64 ?? data?.qr?.base64 ?? null;
      }
      if (base64) { setQr(base64); setStatus('connecting'); }
    } finally { setLoadingQr(false); }
  }

  async function disconnect() {
    await callProxy('logout');
    setStatus('close');
    setQr(null);
    setWebhookOk(false);
    webhookConfigured.current = false;
  }

  return { status, qr, loadingQr, webhookOk, connect, disconnect, refresh: checkStatus, configureWebhook };
}

// ── Painel direito (quando não conectado) ──────────────────────────────────
export function WhatsAppConnectPanel({
  status, qr, loadingQr, connect,
}: ReturnType<typeof useWhatsAppConnection>) {

  if (status === 'open') return null; // Conectado → não mostra painel

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-gray-50/50">

      {/* QR code */}
      {qr ? (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
            <img src={qr} alt="QR Code WhatsApp" className="w-56 h-56" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800 mb-1">Escaneie com o celular</p>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              WhatsApp → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>
            </p>
          </div>
          {status === 'connecting' && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin" /> Aguardando escaneio…
            </div>
          )}
          <button onClick={connect} disabled={loadingQr}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <RefreshCw size={12} className={loadingQr ? 'animate-spin' : ''} /> Gerar novo QR
          </button>
        </div>
      ) : (
        /* Desconectado — tela inicial */
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
            <Smartphone size={32} className="text-gray-300" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700 mb-1">WhatsApp não conectado</p>
            <p className="text-sm text-gray-400 max-w-xs">
              Conecte seu WhatsApp para ver e responder mensagens aqui
            </p>
          </div>
          <button
            onClick={connect}
            disabled={loadingQr || status === 'checking'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-semibold shadow-sm hover:bg-[#1ebe5d] disabled:opacity-50 transition-colors"
          >
            {loadingQr || status === 'checking'
              ? <Loader2 size={16} className="animate-spin" />
              : <QrCode size={16} />
            }
            {status === 'checking' ? 'Verificando…' : 'Conectar WhatsApp'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Status pill (aba esquerda) ─────────────────────────────────────────────
export function WhatsAppStatusPill({
  status, disconnect, webhookOk, configureWebhook,
}: Pick<ReturnType<typeof useWhatsAppConnection>, 'status' | 'disconnect' | 'webhookOk' | 'configureWebhook'>) {
  const [configuring, setConfiguring] = useState(false);

  if (status === 'checking') return null;

  if (status === 'open') return (
    <div className="flex items-center gap-1 flex-wrap justify-center">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-50 border border-green-200 text-[10px] font-semibold text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Conectado
        <button onClick={disconnect} className="ml-0.5 text-green-400 hover:text-red-400" title="Desconectar">
          <X size={10} />
        </button>
      </div>
      {/* Webhook indicator */}
      <button
        title={webhookOk ? 'Webhook ativo' : 'Webhook não configurado — clique para configurar'}
        disabled={configuring}
        onClick={async () => {
          setConfiguring(true);
          await configureWebhook(false);
          setConfiguring(false);
        }}
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
          webhookOk
            ? 'bg-blue-50 border border-blue-200 text-blue-600'
            : 'bg-orange-50 border border-orange-300 text-orange-600 animate-pulse'
        }`}
      >
        {configuring ? <Loader2 size={9} className="animate-spin" /> : <Webhook size={9} />}
        {webhookOk ? 'WH' : 'WH!'}
      </button>
    </div>
  );

  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-[10px] text-gray-400">
      <WifiOff size={10} /> Desconectado
    </div>
  );
}
