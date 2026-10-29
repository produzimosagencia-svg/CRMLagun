import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, MessageSquareText, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { callWhatsappApi } from '@/lib/whatsappApi';

/**
 * Carrinho abandonado da Zig, no dashboard de cada evento: escolhe o template
 * aprovado e liga o envio. Quem manda é a lagun-zig-sync (a cada 10 min), só
 * para pedidos feitos depois de ligar: pendente há 30 min ou descartado.
 * Configuração em lagun_zig_carrinho, envios em lagun_zig_carrinho_envios.
 */

interface Template {
  name: string; language: string; status: string; category?: string;
  components?: { type: string; format?: string; text?: string; example?: { header_handle?: string[] } }[];
}
interface Config {
  event_id: string; enabled: boolean; template_name: string | null; template_language: string;
  template_variable_count: number; header_image_url: string | null; phone_number_id: string | null; ligado_em: string | null;
}
interface Envio { ok: boolean; recuperado_em: string | null; valor_recuperado: number | null }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// O envio automático só preenche {{1}} com o primeiro nome e o cabeçalho com a imagem do exemplo.
function analisar(t: Template) {
  const corpo = t.components?.find((c) => c.type === 'BODY')?.text ?? '';
  const header = t.components?.find((c) => c.type === 'HEADER');
  const vars = new Set(corpo.match(/\{\{\d+\}\}/g) ?? []).size;
  const imagem = header?.format === 'IMAGE' ? header.example?.header_handle?.[0] ?? null : null;
  const headerVar = header?.format === 'TEXT' && /\{\{\d+\}\}/.test(header.text ?? '');
  const midiaSemSuporte = header && ['VIDEO', 'DOCUMENT'].includes(header.format ?? '');
  const motivo = vars > 1 ? 'tem mais de uma variável' : headerVar ? 'tem variável no cabeçalho' : midiaSemSuporte ? 'cabeçalho com vídeo ou documento' : header?.format === 'IMAGE' && !imagem ? 'cabeçalho sem imagem de exemplo' : null;
  return { corpo, vars, imagem, motivo };
}

export function CarrinhoZig({ eventoId, cardCls }: { eventoId: string; cardCls: string }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [telefoneId, setTelefoneId] = useState<string | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [escolhido, setEscolhido] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [c, e] = await Promise.all([
        (supabase as any).from('lagun_zig_carrinho').select('*').eq('event_id', eventoId).maybeSingle(),
        (supabase as any).from('lagun_zig_carrinho_envios').select('ok, recuperado_em, valor_recuperado').eq('event_id', eventoId),
      ]);
      if (!vivo) return;
      setCfg(c.data ?? null);
      setEscolhido(c.data?.template_name ? `${c.data.template_name}|${c.data.template_language}` : '');
      setEnvios(e.data ?? []);
      try {
        const [t, n] = await Promise.all([callWhatsappApi('templates'), callWhatsappApi('phone_numbers')]);
        if (!vivo) return;
        setTemplates(((t?.data ?? []) as Template[]).filter((x) => x.status === 'APPROVED'));
        setTelefoneId(n?.data?.[0]?.id ?? null);
      } catch (err) {
        if (vivo) { setTemplates([]); setErro(err instanceof Error ? err.message : 'Não deu para ler os templates.'); }
      }
    })();
    return () => { vivo = false; };
  }, [eventoId]);

  // Templates com "carrinho" no nome primeiro.
  const ordenados = useMemo(() => [...(templates ?? [])].sort((a, b) => Number(/carrinho/i.test(b.name)) - Number(/carrinho/i.test(a.name)) || a.name.localeCompare(b.name)), [templates]);
  const atual = ordenados.find((t) => `${t.name}|${t.language}` === escolhido) ?? null;
  const info = atual ? analisar(atual) : null;

  async function salvar(proximo: { enabled: boolean; chave: string }) {
    const t = ordenados.find((x) => `${x.name}|${x.language}` === proximo.chave) ?? null;
    if (proximo.enabled && (!t || !telefoneId)) { toast.error(!t ? 'Escolha o template antes de ligar.' : 'Número do WhatsApp não encontrado.'); return; }
    const a = t ? analisar(t) : null;
    if (proximo.enabled && a?.motivo) { toast.error(`Esse template não serve para o envio automático: ${a.motivo}.`); return; }
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    const linha = {
      event_id: eventoId,
      enabled: proximo.enabled,
      template_name: t?.name ?? null,
      template_language: t?.language ?? 'pt_BR',
      template_variable_count: a?.vars ?? 0,
      header_image_url: a?.imagem ?? null,
      phone_number_id: telefoneId ?? cfg?.phone_number_id ?? null,
      // Conta a partir de quando ligou: carrinho antigo não recebe mensagem.
      ligado_em: proximo.enabled ? (cfg?.enabled && cfg.ligado_em ? cfg.ligado_em : new Date().toISOString()) : cfg?.ligado_em ?? null,
      updated_at: new Date().toISOString(),
      updated_by: u.user?.id ?? null,
    };
    const { data, error } = await (supabase as any).from('lagun_zig_carrinho').upsert(linha, { onConflict: 'event_id' }).select('*').single();
    setSalvando(false);
    if (error) { toast.error(`Não salvou: ${error.message}`); return; }
    const antes = !!cfg?.enabled;
    setCfg(data);
    toast.success(proximo.enabled !== antes ? (proximo.enabled ? 'Carrinho abandonado ligado.' : 'Carrinho abandonado desligado.') : 'Template salvo.');
  }

  const ligado = !!cfg?.enabled;
  const ok = envios.filter((e) => e.ok);
  const recuperados = ok.filter((e) => e.recuperado_em);
  const valor = recuperados.reduce((s, e) => s + (Number(e.valor_recuperado) || 0), 0);

  const escolher = (chave: string) => {
    const t = ordenados.find((x) => `${x.name}|${x.language}` === chave);
    setEscolhido(chave);
    setAberto(false);
    void salvar({ enabled: ligado && !!t && !analisar(t).motivo, chave });
  };

  return (
    <section className={`${cardCls} flex min-w-0 flex-col p-4 sm:p-5`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl transition-colors ${ligado ? 'bg-[#FFE14D] text-black' : 'bg-white/5 text-[#FFE14D] ring-1 ring-white/10'}`}><ShoppingCart size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            Carrinho abandonado
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ligado ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-[#8F8A7C]'}`}>{ligado ? 'Ligado' : 'Desligado'}</span>
          </h3>
          <p className="mt-0.5 text-xs text-[#8F8A7C]">
            {ligado
              ? `Desde ${new Date(cfg!.ligado_em!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · Pix pendente há 30 min ou pedido descartado recebe o template, uma vez só.`
              : 'Escolha o template e ligue: quem não concluir a compra na Zig recebe a mensagem no WhatsApp, sozinho.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label="Ligar carrinho abandonado"
          disabled={salvando || !templates}
          onClick={() => void salvar({ enabled: !ligado, chave: escolhido })}
          className={`relative mt-1 h-7 w-12 flex-none rounded-full transition-colors disabled:opacity-50 ${ligado ? 'bg-[#FFE14D]' : 'bg-white/10'}`}
        >
          <span className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full shadow transition-all ${ligado ? 'left-6 bg-black' : 'left-1 bg-[#D8D2C7]'}`}>
            {salvando && <Loader2 size={11} className={`animate-spin ${ligado ? 'text-[#FFE14D]' : 'text-black'}`} />}
          </span>
        </button>
      </div>

      {/* Menu de templates (não usa o select do sistema) */}
      <div ref={caixa} className="relative mt-4">
        <button
          type="button"
          disabled={!templates || salvando}
          onClick={() => setAberto((v) => !v)}
          className={`flex h-11 w-full items-center gap-2 rounded-xl border bg-[#12110E] px-3 text-left text-sm transition-colors disabled:opacity-50 ${aberto ? 'border-[#FFE14D]/60' : 'border-[#2A2822] hover:border-[#3A372F]'}`}
        >
          <MessageSquareText size={15} className="flex-none text-[#FFE14D]" />
          <span className={`min-w-0 flex-1 truncate ${atual ? 'font-medium text-white' : 'text-[#8F8A7C]'}`}>
            {atual ? atual.name : templates ? 'Escolha o template' : 'Carregando templates…'}
          </span>
          {atual?.category && <span className="flex-none rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-[#8F8A7C]">{atual.category === 'MARKETING' ? 'Marketing' : atual.category === 'UTILITY' ? 'Utilidade' : atual.category.toLowerCase()}</span>}
          <ChevronDown size={15} className={`flex-none text-[#8F8A7C] transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
        {aberto && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-[#2A2822] bg-[#12110E] p-1.5 shadow-2xl shadow-black/60">
            {ordenados.length === 0 && <p className="px-3 py-4 text-center text-xs text-[#8F8A7C]">Nenhum template aprovado na Meta.</p>}
            {ordenados.map((t) => {
              const chave = `${t.name}|${t.language}`;
              const a = analisar(t);
              const sel = chave === escolhido;
              return (
                <button
                  key={chave}
                  type="button"
                  disabled={!!a.motivo}
                  onClick={() => escolher(chave)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sel ? 'bg-[#FFE14D]/10' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${sel ? 'border-[#FFE14D] bg-[#FFE14D] text-black' : 'border-white/15'}`}>{sel && <Check size={10} strokeWidth={3} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-center gap-1.5 text-sm ${sel ? 'font-semibold text-[#FFE14D]' : 'text-white'}`}>
                      <span className="truncate">{t.name}</span>
                      {/carrinho/i.test(t.name) && <span className="flex-none rounded bg-[#FFE14D]/15 px-1 text-[9px] font-bold uppercase text-[#FFE14D]">carrinho</span>}
                    </span>
                    <span className="block truncate text-[11px] text-[#8F8A7C]">{a.motivo ? `Não serve: ${a.motivo}` : a.corpo.replace(/\{\{1\}\}/g, '[nome]').replace(/\s+/g, ' ')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {erro ? <p className="mt-3 text-xs text-red-400">{erro}</p> : info && (
        <div className="mt-3 flex min-w-0 gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5">
          {info.imagem && <img src={info.imagem} alt="" className="h-16 w-16 flex-none rounded-lg object-cover ring-1 ring-white/10" />}
          <p className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-[#D8D2C7]">{info.corpo.replace(/\{\{1\}\}/g, '[primeiro nome]')}</p>
        </div>
      )}

      <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5"><p className="text-lg font-bold tabular-nums text-white">{ok.length}</p><p className="text-[11px] text-[#8F8A7C]">enviados</p></div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5"><p className="text-lg font-bold tabular-nums text-white">{recuperados.length}</p><p className="text-[11px] text-[#8F8A7C]">compraram depois</p></div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5"><p className="truncate text-lg font-bold tabular-nums text-[#FFE14D]">{brl(valor)}</p><p className="text-[11px] text-[#8F8A7C]">recuperado</p></div>
      </div>
    </section>
  );
}
