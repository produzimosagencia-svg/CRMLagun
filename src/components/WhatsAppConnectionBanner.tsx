import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Wifi, WifiOff, RefreshCw, Loader2, X, Smartphone } from 'lucide-react';

const SUPABASE_URL = 'https://xwxiijbovreucnrbyput.supabase.co';

type ConnStatus = 'checking' | 'open' | 'connecting' | 'close';

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

export function WhatsAppConnectionBanner() {
  const [status, setStatus]   = useState<ConnStatus>('checking');
  const [qr, setQr]           = useState<string | null>(null);
  const [showQr, setShowQr]   = useState(false);
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const data = await callProxy('status');
      const state: string = data?.instance?.state ?? data?.state ?? '';
      if (state === 'open') { setStatus('open'); setQr(null); setShowQr(false); }
      else if (state === 'connecting') setStatus('connecting');
      else setStatus('close');
    } catch { setStatus('close'); }
  }, []);

  // Poll status every 5s
  useEffect(() => {
    checkStatus();
    const id = setInterval(checkStatus, 5000);
    return () => clearInterval(id);
  }, [checkStatus]);

  // While QR is visible, poll faster to detect connection
  useEffect(() => {
    if (!showQr) return;
    const id = setInterval(checkStatus, 3000);
    return () => clearInterval(id);
  }, [showQr, checkStatus]);

  async function handleConnect() {
    setLoading(true);
    try {
      const data = await callProxy('qr');
      const base64 = data?.base64 ?? data?.qrcode?.base64 ?? data?.qr?.base64 ?? null;
      if (base64) { setQr(base64); setShowQr(true); setStatus('connecting'); }
      else {
        // instância pode não existir ainda
        await callProxy('create');
        await new Promise(r => setTimeout(r, 2000));
        const data2 = await callProxy('qr');
        const b2 = data2?.base64 ?? data2?.qrcode?.base64 ?? data2?.qr?.base64 ?? null;
        if (b2) { setQr(b2); setShowQr(true); setStatus('connecting'); }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleDisconnect() {
    await callProxy('logout');
    setStatus('close');
    setQr(null);
    setShowQr(false);
  }

  // ── Connected ──────────────────────────────────────────────────────────
  if (status === 'open') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700 mb-3">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <Wifi size={13} />
        <span className="font-medium">WhatsApp conectado</span>
        <button onClick={handleDisconnect}
          className="ml-auto text-green-500 hover:text-red-500 transition-colors" title="Desconectar">
          <X size={14} />
        </button>
      </div>
    );
  }

  // ── Checking ───────────────────────────────────────────────────────────
  if (status === 'checking') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-400 mb-3">
        <Loader2 size={13} className="animate-spin" />
        Verificando conexão…
      </div>
    );
  }

  // ── QR code modal ──────────────────────────────────────────────────────
  if (showQr && qr) {
    return (
      <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Smartphone size={15} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-800">Escaneie o QR code</span>
          </div>
          <div className="flex items-center gap-2">
            {status === 'connecting' && (
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> aguardando…
              </span>
            )}
            <button onClick={() => setShowQr(false)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <img src={qr} alt="QR Code WhatsApp" className="w-52 h-52 rounded-lg border border-gray-100" />
          <p className="text-xs text-gray-400 text-center max-w-xs">
            Abra o WhatsApp no celular → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong> → escaneie
          </p>
          <button onClick={handleConnect} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Novo QR
          </button>
        </div>
      </div>
    );
  }

  // ── Disconnected ───────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-xs mb-3">
      <WifiOff size={13} className="text-orange-400" />
      <span className="text-orange-700 font-medium">WhatsApp desconectado</span>
      <button onClick={handleConnect} disabled={loading}
        className="ml-auto flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-800 disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin" /> : null}
        Conectar
      </button>
    </div>
  );
}
