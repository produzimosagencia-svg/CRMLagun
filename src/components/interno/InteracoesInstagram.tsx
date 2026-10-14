import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { TIPOS_INTERACAO, carregarInteracoesDoContato, haQuanto, type InteracoesContato } from '@/lib/rankingInteracoes';

// Bloco de interações do Instagram no perfil do chat: posição no ranking,
// quanto a pessoa interagiu por tipo e as últimas interações.

const ROTULO_TIPO = Object.fromEntries(TIPOS_INTERACAO.map((t) => [t.tipo, t.rotulo])) as Record<string, string>;

export function InteracoesInstagram({ igsid, username }: { igsid?: string | null; username?: string | null }) {
  const [dados, setDados] = useState<InteracoesContato | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setDados(null); setErro(null);
    if (!igsid && !username) { setCarregando(false); return; }
    setCarregando(true);
    carregarInteracoesDoContato({ igsid, username })
      .then((d) => { if (ativo) setDados(d); })
      .catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar as interações.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [igsid, username]);

  if (carregando) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (erro) return <p className="text-xs text-muted-foreground">Não foi possível carregar as interações: {erro}</p>;
  if (!igsid && !username) return <p className="text-xs text-muted-foreground">Sem @ do Instagram para buscar as interações.</p>;
  if (!dados?.encontrado) return <p className="text-xs text-muted-foreground">Nenhuma interação nos últimos {dados?.dias ?? 90} dias.</p>;

  const total = Math.max(1, dados.total || 0);
  const tipos = TIPOS_INTERACAO.map((t) => ({ ...t, qtd: dados.tipos?.[t.tipo] || 0 })).filter((t) => t.qtd > 0);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-muted/50 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xl font-bold">#{dados.posicao}<span className="ml-1 text-xs font-medium text-muted-foreground">de {(dados.pessoas || 0).toLocaleString('pt-BR')}</span></p>
          <p className="text-sm font-semibold">{(dados.pontos || 0).toLocaleString('pt-BR')} pts</p>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {(dados.total || 0).toLocaleString('pt-BR')} {dados.total === 1 ? 'interação' : 'interações'} nos últimos {dados.dias} dias
        </p>
      </div>

      <div className="space-y-1.5">
        {tipos.map((t) => (
          <div key={t.tipo} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 truncate text-muted-foreground">{t.curto}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (t.qtd / total) * 100)}%` }} />
            </div>
            <span className="w-7 shrink-0 text-right font-semibold tabular-nums">{t.qtd}</span>
          </div>
        ))}
      </div>

      {(dados.ultimas || []).length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Últimas interações</p>
          {dados.ultimas!.slice(0, 6).map((u, i) => (
            <div key={`${u.quando}-${i}`} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{ROTULO_TIPO[u.tipo] || u.tipo}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{haQuanto(u.quando)}</span>
              </div>
              {u.texto && <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground">{u.texto}</p>}
            </div>
          ))}
        </div>
      )}

      <Link to="/interno/ranking" className="block text-center text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline">Ver ranking completo</Link>
    </div>
  );
}
