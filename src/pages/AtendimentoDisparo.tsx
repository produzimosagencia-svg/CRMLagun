import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, MessageCircle, RefreshCw, Send, Sparkles } from 'lucide-react';

/**
 * Atendimento de um disparo sem login: /atendimento/<token>. Mostra quem
 * recebeu o disparo e respondeu, com a conversa e o tempo da janela de 24h, e
 * deixa responder com texto livre enquanto a janela estiver aberta. Tudo passa
 * pela edge function atendimento-disparo, que confere o token.
 */

type Mensagem = { de: 'cliente' | 'lagun'; tipo: string; texto: string | null; quando: string };
type Conversa = {
  telefone: string; nome: string | null; ultima_resposta: string; fecha_em: string;
  aberta: boolean; respondido: boolean; mensagens: Mensagem[];
};
type Dados = { titulo: string; expira_em: string; resposta_sugerida: string | null; conversas: Conversa[] };

const ERROS: Record<string, string> = {
  link_invalido: 'Este link de atendimento não existe.',
  link_expirado: 'Este link de atendimento expirou.',
  janela_fechada: 'A janela de 24h desta pessoa fechou. Agora só dá para falar com ela por template.',
  contato_fora_do_disparo: 'Este contato não faz parte deste disparo.',
  texto_invalido: 'Escreva a mensagem antes de enviar.',
};

const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const telefoneBR = (t: string) => {
  const d = t.replace(/\D/g, '').replace(/^55/, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t;
};
function restante(fim: string, agora: number) {
  const ms = new Date(fim).getTime() - agora;
  if (ms <= 0) return { ms: 0, rotulo: 'Fechada' };
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return { ms, rotulo: h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min` };
}

async function chamar(token: string, init?: RequestInit) {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `${base}/functions/v1/atendimento-disparo${init ? '' : `?token=${encodeURIComponent(token)}`}`;
  const resp = await fetch(url, { ...init, headers: { apikey: chave, 'Content-Type': 'application/json' } });
  return resp.json().catch(() => ({ error: 'erro_interno' }));
}

function Cartao({ c, token, sugerida, agora, onEnviado }: { c: Conversa; token: string; sugerida: string | null; agora: number; onEnviado: () => void }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const r = restante(c.fecha_em, agora);
  const pct = Math.max(0, Math.min(100, (r.ms / (24 * 3_600_000)) * 100));

  async function enviar() {
    setEnviando(true); setErro(null);
    const d = await chamar(token, { method: 'POST', body: JSON.stringify({ token, telefone: c.telefone, texto }) });
    setEnviando(false);
    if (d?.error) { setErro(ERROS[d.error] ?? 'Não deu para enviar. Tente de novo.'); return; }
    setTexto('');
    onEnviado();
  }

  return (
    <article className={`rounded-2xl border bg-[#1A1916] p-4 ${c.aberta && !c.respondido ? 'border-[#FFE14D]/40' : 'border-[#2A2822]'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{c.nome || telefoneBR(c.telefone)}</p>
          <p className="text-xs text-[#8F8A7C]">{telefoneBR(c.telefone)} · respondeu {hora(c.ultima_resposta)}</p>
        </div>
        <div className="flex items-center gap-2">
          {c.respondido
            ? <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">Respondido</span>
            : c.aberta && <span className="rounded-full bg-[#FFE14D]/15 px-2.5 py-1 text-[11px] font-semibold text-[#FFE14D]">Aguardando resposta</span>}
        </div>
      </header>

      <div className="mt-3">
        <div className="flex justify-between text-[11px]"><span className="flex items-center gap-1 text-[#8F8A7C]"><Clock size={11} /> Janela fecha em</span><span className="font-semibold text-white">{r.rotulo}</span></div>
        <div className="mt-1 h-1.5 rounded-full bg-white/5"><div className={`h-full rounded-full ${r.ms < 2 * 3_600_000 ? 'bg-[#FB923C]' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl bg-black/20 p-3">
        {c.mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.de === 'cliente' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs ${m.de === 'cliente' ? 'bg-white/[0.06] text-white' : 'bg-[#FFE14D]/10 text-[#F2EBD8]'}`}>
              {m.tipo === 'template' && <p className="mb-1 text-[10px] font-semibold uppercase text-[#8F8A7C]">Disparo</p>}
              {m.texto || '[mídia]'}
              <p className="mt-1 text-right text-[10px] text-[#8F8A7C]">{hora(m.quando)}</p>
            </div>
          </div>
        ))}
      </div>

      {c.aberta ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={texto} onChange={(e) => setTexto(e.target.value)} rows={texto ? 5 : 2} placeholder="Escreva a resposta…"
            className="w-full resize-y rounded-xl border border-[#2A2822] bg-[#12110E] px-3 py-2 text-sm text-white outline-none placeholder:text-[#8F8A7C] focus:border-[#FFE14D]/60"
          />
          {erro && <p className="text-xs text-[#FB923C]">{erro}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {sugerida && (
              <button type="button" onClick={() => setTexto(sugerida)} className="flex items-center gap-1.5 rounded-lg border border-[#2A2822] px-3 py-2 text-xs font-semibold text-[#D8D2C7] hover:border-[#3A372F]">
                <Sparkles size={13} className="text-[#FFE14D]" /> Usar mensagem pronta
              </button>
            )}
            <button type="button" disabled={!texto.trim() || enviando} onClick={() => void enviar()}
              className="flex items-center gap-1.5 rounded-lg bg-[#FFE14D] px-4 py-2 text-xs font-bold text-[#17160f] disabled:opacity-40">
              <Send size={13} /> {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      ) : <p className="mt-3 text-xs text-[#8F8A7C]">Janela fechada: só dá para falar com esta pessoa por template.</p>}
    </article>
  );
}

export default function AtendimentoDisparo() {
  const { token = '' } = useParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(Date.now());

  const carregar = useCallback(async () => {
    const d = await chamar(token.toLowerCase());
    if (d?.error) setErro(ERROS[d.error] ?? 'Não deu para carregar o atendimento.');
    else { setDados(d as Dados); setErro(null); }
    setAgora(Date.now());
    setCarregando(false);
  }, [token]);

  // Atualiza sozinho a cada 20 s (novas respostas chegam pelo webhook).
  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 20_000);
    const relogio = setInterval(() => setAgora(Date.now()), 30_000);
    return () => { clearInterval(t); clearInterval(relogio); };
  }, [carregar]);

  const abertas = dados?.conversas.filter((c) => c.aberta) ?? [];
  const aguardando = abertas.filter((c) => !c.respondido);

  return (
    <div className="min-h-screen bg-[#0F0E0B] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFE14D]">Lagun · Atendimento</p>
            <h1 className="mt-1 text-xl font-bold">{dados?.titulo ?? 'Atendimento do disparo'}</h1>
            <p className="mt-1 text-sm text-[#8F8A7C]">Quem recebeu o disparo e respondeu. Com a janela de 24h aberta, dá para responder com texto livre.</p>
          </div>
          <button onClick={() => void carregar()} className="flex items-center gap-1.5 rounded-lg border border-[#2A2822] px-3 py-2 text-xs font-semibold text-[#D8D2C7]"><RefreshCw size={14} /> Atualizar</button>
        </header>

        {erro ? <p className="rounded-2xl border border-[#2A2822] bg-[#1A1916] p-6 text-center text-sm text-[#D8D2C7]">{erro}</p> : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {([['Responderam', dados?.conversas.length ?? 0, 'text-white'], ['Janela aberta', abertas.length, 'text-emerald-400'], ['Aguardando', aguardando.length, 'text-[#FFE14D]']] as const).map(([rotulo, n, cls]) => (
                <div key={rotulo} className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-3">
                  <p className={`text-2xl font-bold tabular-nums ${cls}`}>{n.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-[#8F8A7C]">{rotulo}</p>
                </div>
              ))}
            </div>
            {carregando && !dados ? <p className="py-10 text-center text-sm text-[#8F8A7C]">Carregando…</p>
              : !dados?.conversas.length ? (
                <div className="rounded-2xl border border-[#2A2822] bg-[#1A1916] p-8 text-center">
                  <MessageCircle className="mx-auto text-[#8F8A7C]" size={22} />
                  <p className="mt-2 text-sm text-[#D8D2C7]">Ninguém respondeu ainda.</p>
                  <p className="text-xs text-[#8F8A7C]">A página se atualiza sozinha a cada 20 segundos.</p>
                </div>
              ) : dados.conversas.map((c) => (
                <Cartao key={c.telefone} c={c} token={token.toLowerCase()} sugerida={dados.resposta_sugerida} agora={agora} onEnviado={() => void carregar()} />
              ))}
            {dados && <p className="text-center text-[11px] text-[#8F8A7C]">Link válido até {hora(dados.expira_em)}. Não compartilhe fora da equipe.</p>}
          </>
        )}
      </div>
    </div>
  );
}
