// Venda de lounges pelo site: lagunvitoria.com.br/lounges
// Evento → mapa (L1..L6 livres/vendidos) → dados do titular → Pix → confirmado.
// Tudo passa pela função bot-lounges (ações site_*): mesma trava, mesmo Pix e o
// mesmo aviso + tarefa "Enviar ingressos" do bot do WhatsApp.
// Com a venda fechada (site_ativo = false) só abre com ?teste=<chave>, e o Pix é de teste.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import palavraGold from '@/assets/palavra-lagun.png';

const OURO = '#F5D470';
const FUNDO = '#1A0800';
const CARTAO = '#2B0E00';
const CHAVE_LOCAL = 'lagun-lounge-reserva';

type Evento = { id: string; nome: string; data: string; dia_semana: string | null; artista: string | null; flyer: string | null; livres: number; a_partir: number | null };
type Lounge = { id: string; codigo: string; nome: string; categoria: string; capacidade: number; inclui: string[]; preco: number; situacao: 'livre' | 'reservado' | 'vendido' };
type Reserva = {
  id: string; codigo: string; status: 'aguardando' | 'confirmada' | 'cancelada' | 'expirada'; valor: number; nome: string;
  expira_em: string | null; pix: string | null; teste: boolean; event_id: string;
  evento: { nome: string; data: string; dia_semana: string | null } | null;
  lounge: { codigo: string; nome: string; capacidade: number } | null;
};

// Posição de cada lounge no mapa (porcentagem da imagem 900×1156).
const AREAS: Record<string, { left: number; top: number; w: number; h: number; oval?: boolean }> = {
  L1: { left: 20.7, top: 36.5, w: 11.3, h: 8.7 },
  L2: { left: 65.8, top: 36.5, w: 11.3, h: 8.7 },
  L3: { left: 66.7, top: 50.2, w: 10, h: 12.8, oval: true },
  L4: { left: 66.7, top: 71.1, w: 10, h: 12.8, oval: true },
  L5: { left: 13, top: 73.4, w: 9, h: 13.4 },
  L6: { left: 13, top: 50.2, w: 9, h: 13.6 },
};

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dataCurta = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
const mascaraCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const mascaraTel = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

function lerLocal(): string | null {
  try { return localStorage.getItem(CHAVE_LOCAL); } catch { return null; }
}
function gravarLocal(id: string | null) {
  try { id ? localStorage.setItem(CHAVE_LOCAL, id) : localStorage.removeItem(CHAVE_LOCAL); } catch { /* sem storage */ }
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('bot-lounges', { body });
  if (error) {
    // Erro HTTP da função: a mensagem amigável vem no corpo.
    let msg = 'Não foi possível concluir agora. Tente de novo.';
    let extra: any = {};
    try { extra = await (error as any).context?.json(); if (extra?.error) msg = extra.error; } catch { /* corpo vazio */ }
    throw Object.assign(new Error(msg), { extra });
  }
  return data as T;
}

export default function LoungesPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const chaveTeste = params.get('teste') || undefined;

  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(true);
  const [modoTeste, setModoTeste] = useState(false);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [evento, setEvento] = useState<Evento | null>(null);
  const [lounges, setLounges] = useState<Lounge[]>([]);
  const [escolhido, setEscolhido] = useState<Lounge | null>(null);
  const [etapa, setEtapa] = useState<'eventos' | 'mapa' | 'dados' | 'pix'>('eventos');
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '' });
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const topo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Lounges · Lagun';
    document.body.style.backgroundColor = FUNDO;
    return () => { document.body.style.backgroundColor = ''; };
  }, []);

  const subir = () => topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const abrirEvento = useCallback(async (ev: Evento) => {
    setErro(null);
    setEvento(ev);
    setEscolhido(null);
    setEtapa('mapa');
    try {
      const r = await chamar<{ lounges: Lounge[] }>({ action: 'site_lounges', event_id: ev.id, teste: chaveTeste });
      setLounges(r.lounges);
    } catch (e) {
      setErro((e as Error).message);
      setEtapa('eventos');
    }
  }, [chaveTeste]);

  // Início: retoma uma reserva em andamento, senão lista os eventos.
  useEffect(() => {
    (async () => {
      try {
        const r = await chamar<{ aberto: boolean; teste: boolean; eventos: Evento[] }>({ action: 'site_eventos', teste: chaveTeste });
        setAberto(r.aberto);
        setModoTeste(r.teste);
        setEventos(r.eventos);
        const salva = lerLocal();
        if (salva) {
          try {
            const s = await chamar<{ reserva: Reserva }>({ action: 'site_status', id: salva });
            if (s.reserva.status === 'aguardando' || s.reserva.status === 'confirmada') {
              setReserva(s.reserva);
              setEtapa('pix');
              return;
            }
            gravarLocal(null);
          } catch { gravarLocal(null); }
        }
        const pedido = params.get('evento');
        const ev = pedido ? r.eventos.find((e) => e.id === pedido) : null;
        if (ev) await abrirEvento(ev);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    })();
  }, [chaveTeste, params, abrirEvento]);

  // Pix aberto: relógio e consulta do pagamento a cada 5 s.
  useEffect(() => {
    if (etapa !== 'pix' || reserva?.status !== 'aguardando') return;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    const consulta = setInterval(async () => {
      try {
        const s = await chamar<{ reserva: Reserva }>({ action: 'site_status', id: reserva.id });
        setReserva(s.reserva);
        if (s.reserva.status !== 'aguardando' && s.reserva.status !== 'confirmada') gravarLocal(null);
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 5000);
    return () => { clearInterval(relogio); clearInterval(consulta); };
  }, [etapa, reserva?.id, reserva?.status]);

  async function reservar() {
    if (!evento || !escolhido) return;
    setErro(null); setErroCampo(null); setEnviando(true);
    try {
      const r = await chamar<{ reserva: Reserva }>({
        action: 'site_reservar', event_id: evento.id, lounge_id: escolhido.id,
        nome: form.nome, cpf: form.cpf, telefone: form.telefone, teste: chaveTeste,
      });
      setReserva(r.reserva);
      gravarLocal(r.reserva.id);
      setEtapa('pix');
      subir();
    } catch (e) {
      const err = e as Error & { extra?: any };
      setErro(err.message);
      setErroCampo(err.extra?.campo ?? null);
      if (err.extra?.ocupado) {
        // Alguém pegou antes: volta ao mapa atualizado.
        await abrirEvento(evento);
        setErro(err.message);
      }
    } finally {
      setEnviando(false);
    }
  }

  async function simular() {
    if (!reserva) return;
    setEnviando(true);
    try {
      const r = await chamar<{ reserva: Reserva }>({ action: 'site_simular', id: reserva.id, teste: chaveTeste });
      setReserva(r.reserva);
    } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
  }

  async function cancelar() {
    if (!reserva) return;
    if (reserva.status === 'aguardando') {
      try { await chamar({ action: 'site_cancelar', id: reserva.id }); } catch { /* vence sozinha em 30 min */ }
    }
    novaReserva();
  }

  function novaReserva() {
    gravarLocal(null);
    setReserva(null);
    setEscolhido(null);
    setEtapa('eventos');
    setCarregando(true);
    chamar<{ eventos: Evento[] }>({ action: 'site_eventos', teste: chaveTeste })
      .then((r) => setEventos(r.eventos)).catch(() => undefined).finally(() => setCarregando(false));
  }

  async function copiar() {
    if (!reserva?.pix) return;
    try { await navigator.clipboard.writeText(reserva.pix); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sem clipboard */ }
  }

  const restante = reserva?.expira_em ? Math.max(0, Date.parse(reserva.expira_em) - agora) : 0;
  const mm = String(Math.floor(restante / 60000)).padStart(2, '0');
  const ss = String(Math.floor((restante % 60000) / 1000)).padStart(2, '0');

  // ───────────────────────────────────────────────────────────── telas
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: FUNDO, fontFamily: "'DM Sans', sans-serif", minHeight: '100dvh' }}>
      <div ref={topo} />
      <header className="flex flex-col items-center pt-8 pb-4 px-4">
        <a href="/"><img src={palavraGold} alt="LAGUN" className="h-7 w-auto" /></a>
        <p className="mt-3 text-[10px] tracking-[0.4em] uppercase" style={{ color: OURO }}>Lounges</p>
      </header>

      {modoTeste && (
        <div className="mx-4 mb-4 rounded-xl px-4 py-2 text-center text-xs font-semibold max-w-xl md:mx-auto" style={{ backgroundColor: 'rgba(245,212,112,0.12)', color: OURO, border: `1px solid ${OURO}55` }}>
          🧪 Modo teste · o Pix não cobra nada
        </div>
      )}

      <main className="px-4 pb-16 max-w-xl mx-auto">
        {erro && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(220,60,40,0.15)', border: '1px solid rgba(220,60,40,0.4)', color: '#ffb4a6' }}>
            {erro}
          </div>
        )}

        {carregando ? (
          <p className="text-center text-sm py-20" style={{ color: 'rgba(255,255,255,0.5)' }}>Carregando…</p>
        ) : !aberto ? (
          <Fechado />
        ) : etapa === 'eventos' ? (
          <ListaEventos eventos={eventos} onEscolher={(ev) => { abrirEvento(ev); subir(); }} />
        ) : etapa === 'mapa' && evento ? (
          <Mapa
            evento={evento} lounges={lounges} escolhido={escolhido}
            onEscolher={(l) => { setErro(null); setEscolhido(l); }}
            onVoltar={() => { setEtapa('eventos'); setErro(null); }}
            onContinuar={() => { setEtapa('dados'); setErro(null); subir(); }}
          />
        ) : etapa === 'dados' && evento && escolhido ? (
          <Dados
            evento={evento} lounge={escolhido} form={form} setForm={setForm} erroCampo={erroCampo} enviando={enviando}
            onVoltar={() => { setEtapa('mapa'); setErro(null); }} onReservar={reservar}
          />
        ) : etapa === 'pix' && reserva ? (
          reserva.status === 'confirmada' ? (
            <Confirmado reserva={reserva} telefone={form.telefone} onNova={novaReserva} />
          ) : reserva.status === 'aguardando' ? (
            <section>
              <Resumo evento={reserva.evento} lounge={reserva.lounge?.nome ?? ''} valor={reserva.valor} />
              <div className="mt-5 rounded-2xl p-5 text-center" style={{ backgroundColor: CARTAO, border: `1px solid ${OURO}22` }}>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>Pague com Pix em até</p>
                <p className="text-4xl font-bold tabular-nums mt-1" style={{ color: OURO }}>{mm}:{ss}</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>O lounge fica guardado para você até lá.</p>
                {reserva.pix?.startsWith('000201') && (
                  <>
                    <div className="mt-5 mx-auto bg-white p-3 rounded-xl inline-block">
                      <QRCodeSVG value={reserva.pix} size={208} level="M" />
                    </div>
                    <button onClick={copiar} className="mt-4 w-full rounded-xl py-3 font-bold" style={{ backgroundColor: OURO, color: FUNDO }}>
                      {copiado ? 'Código copiado ✓' : 'Copiar código Pix'}
                    </button>
                    <p className="mt-3 text-xs break-all text-left rounded-lg p-3" style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.5)' }}>{reserva.pix}</p>
                  </>
                )}
                {reserva.teste && (
                  <div className="mt-5 rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgba(245,212,112,0.08)', color: OURO }}>
                    Pix de teste: não pague nada.
                    <button
                      onClick={simular} disabled={enviando}
                      className="mt-3 w-full rounded-xl py-3 font-bold disabled:opacity-60"
                      style={{ backgroundColor: 'transparent', color: OURO, border: `1px solid ${OURO}` }}
                    >
                      {enviando ? 'Confirmando…' : 'Simular pagamento'}
                    </button>
                  </div>
                )}
                <p className="mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Assim que o pagamento cair, esta tela confirma sozinha.</p>
              </div>
              <button onClick={cancelar} className="mt-4 w-full text-sm underline" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Cancelar e escolher outro lounge
              </button>
            </section>
          ) : (
            <section className="text-center py-10">
              <p className="text-lg font-semibold">{reserva.status === 'expirada' ? 'O prazo do Pix acabou' : 'Reserva cancelada'}</p>
              <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>O lounge foi liberado. Se ainda estiver livre, dá para reservar de novo.</p>
              <button onClick={novaReserva} className="mt-6 rounded-xl px-6 py-3 font-bold" style={{ backgroundColor: OURO, color: FUNDO }}>Escolher de novo</button>
            </section>
          )
        ) : null}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── partes
function Fechado() {
  return (
    <section className="text-center py-16">
      <p className="text-lg font-semibold">Venda de lounges pelo site em breve</p>
      <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>Enquanto isso, fale com a gente no WhatsApp.</p>
      <a href="https://wa.me/5527997789988?text=Ol%C3%A1%2C%20gostaria%20de%20garantir%20o%20meu%20lounge!" className="inline-block mt-6 rounded-xl px-6 py-3 font-bold" style={{ backgroundColor: OURO, color: FUNDO }}>
        Chamar no WhatsApp
      </a>
    </section>
  );
}

function ListaEventos({ eventos, onEscolher }: { eventos: Evento[]; onEscolher: (e: Evento) => void }) {
  if (!eventos.length) {
    return (
      <section className="text-center py-16">
        <p className="text-lg font-semibold">Nenhum evento com lounge à venda agora</p>
        <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>Volte em breve ou acompanhe a agenda em lagunvitoria.com.br.</p>
      </section>
    );
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold text-center mb-1">Escolha a noite</h1>
      <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.55)' }}>Depois você escolhe o lounge no mapa.</p>
      <div className="flex flex-col gap-3">
        {eventos.map((ev) => {
          const esgotado = ev.livres === 0;
          return (
            <button
              key={ev.id} disabled={esgotado} onClick={() => onEscolher(ev)}
              className="flex items-center gap-3 p-3 text-left transition-opacity disabled:opacity-50 active:opacity-70"
              style={{ backgroundColor: CARTAO, border: `1px solid ${OURO}1f`, borderRadius: 14 }}
            >
              <div className="shrink-0 overflow-hidden" style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: '#3a1500' }}>
                {ev.flyer && <img src={ev.flyer} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{ev.nome}</p>
                {ev.artista && <p className="text-sm font-semibold truncate" style={{ color: OURO }}>{ev.artista}</p>}
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span className="font-bold" style={{ color: 'rgba(255,255,255,0.8)' }}>{dataCurta(ev.data)}</span>
                  {ev.dia_semana ? ` · ${ev.dia_semana}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {esgotado ? (
                  <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>Esgotado</span>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>a partir de</p>
                    <p className="text-sm font-bold" style={{ color: OURO }}>{ev.a_partir != null ? reais(ev.a_partir) : ''}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{ev.livres} livre{ev.livres > 1 ? 's' : ''}</p>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Mapa({ evento, lounges, escolhido, onEscolher, onVoltar, onContinuar }: {
  evento: Evento; lounges: Lounge[]; escolhido: Lounge | null;
  onEscolher: (l: Lounge) => void; onVoltar: () => void; onContinuar: () => void;
}) {
  const porCodigo = new Map(lounges.map((l) => [l.codigo, l]));
  return (
    <section>
      <button onClick={onVoltar} className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>← Outras noites</button>
      <h1 className="text-xl font-semibold">{evento.nome}</h1>
      <p className="text-sm mb-4" style={{ color: OURO }}>{dataCurta(evento.data)}{evento.dia_semana ? ` · ${evento.dia_semana}` : ''}</p>

      <div className="relative w-full rounded-2xl overflow-hidden select-none" style={{ aspectRatio: '900 / 1156' }}>
        <img src="/lounges/mapa-lounges.jpg" alt="Mapa dos lounges da Lagun" className="absolute inset-0 w-full h-full" draggable={false} />
        {Object.entries(AREAS).map(([codigo, a]) => {
          const l = porCodigo.get(codigo);
          const livre = l?.situacao === 'livre';
          const sel = escolhido?.codigo === codigo;
          const rotulo = !l ? 'Fechado' : l.situacao === 'vendido' ? 'Vendido' : l.situacao === 'reservado' ? 'Reservado' : reais(l.preco);
          return (
            <button
              key={codigo}
              type="button"
              disabled={!livre}
              onClick={() => l && onEscolher(l)}
              aria-label={`${codigo} · ${rotulo}`}
              className={`absolute flex justify-center transition-all ${a.oval ? 'rounded-[50%]' : 'rounded-md'} ${livre && !sel ? 'animate-pulse' : ''}`}
              style={{
                left: `${a.left - 1}%`, top: `${a.top - 0.8}%`, width: `${a.w + 2}%`, height: `${a.h + 1.6}%`,
                backgroundColor: sel ? 'rgba(245,212,112,0.55)' : livre ? 'rgba(80,200,120,0.22)' : 'rgba(10,3,0,0.72)',
                border: sel ? `2px solid ${OURO}` : livre ? '2px solid rgba(80,200,120,0.85)' : '1px solid rgba(255,255,255,0.15)',
                boxShadow: sel ? `0 0 24px ${OURO}aa` : 'none',
                cursor: livre ? 'pointer' : 'not-allowed',
              }}
            >
              <span className="absolute top-full mt-1 whitespace-nowrap text-[9px] md:text-[11px] font-bold leading-none px-1.5 py-1 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: livre || sel ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                {rotulo}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center gap-4 mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
        <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ border: '2px solid rgba(80,200,120,0.85)', backgroundColor: 'rgba(80,200,120,0.22)' }} /> Livre</span>
        <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(245,212,112,0.55)', border: `2px solid ${OURO}` }} /> Escolhido</span>
        <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(10,3,0,0.72)', border: '1px solid rgba(255,255,255,0.2)' }} /> Indisponível</span>
      </div>

      {escolhido ? (
        <div className="mt-5 rounded-2xl p-5" style={{ backgroundColor: CARTAO, border: `1px solid ${OURO}44` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{escolhido.nome}</p>
              <p className="text-xs tracking-widest uppercase mt-0.5" style={{ color: OURO }}>Até {escolhido.capacidade} pessoas</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: OURO }}>{reais(escolhido.preco)}</p>
          </div>
          {escolhido.inclui.length > 0 && (
            <ul className="mt-3 text-sm space-y-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {escolhido.inclui.map((i) => <li key={i}>· {i}</li>)}
            </ul>
          )}
          <button onClick={onContinuar} className="mt-5 w-full rounded-xl py-3 font-bold" style={{ backgroundColor: OURO, color: FUNDO }}>
            Reservar {escolhido.codigo}
          </button>
        </div>
      ) : (
        <p className="mt-5 text-center text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Toque num lounge verde para ver o valor.</p>
      )}
    </section>
  );
}

function Resumo({ evento, lounge, valor }: { evento: { nome: string; data: string; dia_semana: string | null } | null; lounge: string; valor: number }) {
  return (
    <div className="rounded-2xl p-4 flex items-center justify-between gap-3" style={{ backgroundColor: CARTAO, border: `1px solid ${OURO}22` }}>
      <div className="min-w-0">
        <p className="font-semibold truncate">{lounge}</p>
        {evento && <p className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>{evento.nome} · {dataCurta(evento.data)}</p>}
      </div>
      <p className="text-xl font-bold shrink-0" style={{ color: OURO }}>{reais(valor)}</p>
    </div>
  );
}

function Campo({ rotulo, erro, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>{rotulo}</span>
      <input
        {...props}
        className="mt-1 w-full rounded-xl px-4 py-3 text-base outline-none"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: `1px solid ${erro ? 'rgba(220,60,40,0.8)' : OURO + '33'}`, color: '#fff' }}
      />
    </label>
  );
}

function Dados({ evento, lounge, form, setForm, erroCampo, enviando, onVoltar, onReservar }: {
  evento: Evento; lounge: Lounge; form: { nome: string; cpf: string; telefone: string };
  setForm: (f: { nome: string; cpf: string; telefone: string }) => void; erroCampo: string | null; enviando: boolean;
  onVoltar: () => void; onReservar: () => void;
}) {
  const pronto = form.nome.trim().split(/\s+/).length >= 2 && form.cpf.replace(/\D/g, '').length === 11 && form.telefone.replace(/\D/g, '').length >= 10;
  return (
    <section>
      <button onClick={onVoltar} className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>← Voltar ao mapa</button>
      <Resumo evento={evento} lounge={lounge.nome} valor={lounge.preco} />
      <h2 className="text-lg font-semibold mt-6 mb-1">Titular do lounge</h2>
      <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.55)' }}>Quem vai apresentar o documento na entrada.</p>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (pronto && !enviando) onReservar(); }}>
        <Campo rotulo="Nome completo" autoComplete="name" value={form.nome} erro={erroCampo === 'nome'}
          onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <Campo rotulo="CPF" inputMode="numeric" value={form.cpf} erro={erroCampo === 'cpf'}
          onChange={(e) => setForm({ ...form, cpf: mascaraCpf(e.target.value) })} placeholder="000.000.000-00" />
        <Campo rotulo="WhatsApp" inputMode="tel" autoComplete="tel" value={form.telefone} erro={erroCampo === 'telefone'}
          onChange={(e) => setForm({ ...form, telefone: mascaraTel(e.target.value) })} placeholder="(27) 99999-9999" />
        <button type="submit" disabled={!pronto || enviando} className="w-full rounded-xl py-3 font-bold disabled:opacity-50" style={{ backgroundColor: OURO, color: FUNDO }}>
          {enviando ? 'Gerando Pix…' : `Pagar ${reais(lounge.preco)} com Pix`}
        </button>
        <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
          O lounge fica guardado por 30 minutos enquanto você paga. Venda até 18h do dia do evento.
        </p>
      </form>
    </section>
  );
}

function Confirmado({ reserva, telefone, onNova }: { reserva: Reserva; telefone: string; onNova: () => void }) {
  return (
    <section className="text-center">
      <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ backgroundColor: 'rgba(80,200,120,0.2)', border: '2px solid rgba(80,200,120,0.8)' }}>✓</div>
      <h1 className="text-2xl font-semibold mt-4">Pagamento confirmado!</h1>
      <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
        Seu <b className="text-white">{reserva.lounge?.nome}</b>{reserva.evento ? <> no <b className="text-white">{reserva.evento.nome} ({dataCurta(reserva.evento.data)})</b></> : null} está garantido.
      </p>
      <div className="mt-6 rounded-2xl p-6 inline-block" style={{ backgroundColor: CARTAO, border: `1px solid ${OURO}44` }}>
        <div className="bg-white p-3 rounded-xl inline-block">
          <QRCodeSVG value={`LAGUN-LOUNGE:${reserva.codigo}`} size={160} level="M" />
        </div>
        <p className="text-xs uppercase tracking-widest mt-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Código da reserva</p>
        <p className="text-3xl font-bold tracking-wider" style={{ color: OURO }}>{reserva.codigo}</p>
        <p className="text-sm mt-1">{reserva.nome}</p>
      </div>
      <p className="text-sm mt-6 max-w-sm mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
        Nossa equipe envia os seus ingressos no WhatsApp{telefone ? ` ${telefone}` : ''}. Tire um print desta tela.
      </p>
      <button onClick={onNova} className="mt-6 text-sm underline" style={{ color: 'rgba(255,255,255,0.5)' }}>Reservar outro lounge</button>
    </section>
  );
}
