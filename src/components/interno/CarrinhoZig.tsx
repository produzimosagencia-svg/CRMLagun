import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, ShoppingCart } from 'lucide-react';
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

  return (
    <section className={`${cardCls} p-4 sm:p-5`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${ligado ? 'bg-[#FFE14D] text-black' : 'bg-white/5 text-[#FFE14D] ring-1 ring-white/10'}`}><ShoppingCart size={18} /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">Carrinho abandonado</h3>
            <p className="mt-0.5 text-xs text-[#8F8A7C]">
              {ligado
                ? `Ligado desde ${new Date(cfg!.ligado_em!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Quem deixar o Pix pendente por 30 min ou tiver o pedido descartado na Zig recebe o template no WhatsApp, uma vez só.`
                : 'Escolha o template e ligue: quem não concluir a compra na Zig recebe a mensagem no WhatsApp, sozinho, de 10 em 10 minutos.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={escolhido}
              disabled={!templates || salvando}
              onChange={(e) => { const chave = e.target.value; const t = ordenados.find((x) => `${x.name}|${x.language}` === chave); setEscolhido(chave); void salvar({ enabled: ligado && !!t && !analisar(t).motivo, chave }); }}
              className="h-10 w-[260px] max-w-full appearance-none truncate rounded-lg border border-[#2A2822] bg-[#12110E] pl-3 pr-9 text-sm text-white outline-none focus:border-[#FFE14D]/60 disabled:opacity-50"
            >
              <option value="">{templates ? 'Escolha o template' : 'Carregando templates…'}</option>
              {ordenados.map((t) => {
                const a = analisar(t);
                return <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`} disabled={!!a.motivo}>{t.name} · {t.language}{a.motivo ? ` (${a.motivo})` : ''}</option>;
              })}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8F8A7C]" />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ligado}
            aria-label="Ligar carrinho abandonado"
            disabled={salvando || !templates}
            onClick={() => void salvar({ enabled: !ligado, chave: escolhido })}
            className={`relative h-7 w-12 flex-none rounded-full transition-colors disabled:opacity-50 ${ligado ? 'bg-[#FFE14D]' : 'bg-white/10'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full shadow transition-all ${ligado ? 'left-6 bg-black' : 'left-1 bg-[#D8D2C7]'}`} />
            {salvando && <Loader2 size={12} className="absolute -right-5 top-1.5 animate-spin text-[#8F8A7C]" />}
          </button>
        </div>
      </div>

      {(info || erro) && (
        <div className="mt-4 grid gap-3 border-t border-white/5 pt-4 md:grid-cols-[1fr_auto]">
          {erro ? <p className="text-xs text-red-400">{erro}</p> : (
            <div className="flex min-w-0 gap-3">
              {info?.imagem && <img src={info.imagem} alt="" className="h-16 w-16 flex-none rounded-lg object-cover ring-1 ring-white/10" />}
              <p className="line-clamp-4 whitespace-pre-line text-xs text-[#D8D2C7]">{info?.corpo.replace(/\{\{1\}\}/g, '[primeiro nome]')}</p>
            </div>
          )}
          <div className="flex gap-5 text-right">
            <div><p className="text-lg font-bold tabular-nums text-white">{ok.length}</p><p className="text-[11px] text-[#8F8A7C]">enviados</p></div>
            <div><p className="text-lg font-bold tabular-nums text-white">{recuperados.length}</p><p className="text-[11px] text-[#8F8A7C]">compraram depois</p></div>
            <div><p className="text-lg font-bold tabular-nums text-[#FFE14D]">{brl(valor)}</p><p className="text-[11px] text-[#8F8A7C]">recuperado</p></div>
          </div>
        </div>
      )}
    </section>
  );
}
