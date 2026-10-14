import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Instagram, Loader2, MessageCircle, RefreshCw, Save, Settings2, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  PONTOS_PADRAO, TIPOS_INTERACAO, carregarPontos, carregarRanking, haQuanto, nomeDeExibicao, salvarPontos,
  type LinhaRanking, type Pontos,
} from '@/lib/rankingInteracoes';

// Ranking de interação: quem mais interage com a conta no Instagram, com a
// pontuação que a equipe define para cada tipo de interação.

const PERIODOS: [number, string][] = [[30, '30 dias'], [90, '90 dias'], [180, '6 meses'], [365, '12 meses']];
const num = (n: number) => n.toLocaleString('pt-BR');

function Foto({ linha }: { linha: LinhaRanking }) {
  const [quebrou, setQuebrou] = useState(false);
  const letra = (nomeDeExibicao(linha.nome, linha.username) || linha.username || '?').slice(0, 1).toUpperCase();
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
      {linha.avatar && !quebrou
        ? <img src={linha.avatar} alt="" className="h-full w-full object-cover" onError={() => setQuebrou(true)} />
        : <span className="grid h-full w-full place-items-center text-xs font-bold text-muted-foreground">{letra}</span>}
    </span>
  );
}

export default function InternoRanking() {
  const [dias, setDias] = useState(90);
  const [aba, setAba] = useState<'ranking' | 'pontos'>('ranking');
  const [linhas, setLinhas] = useState<LinhaRanking[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pontos, setPontos] = useState<Pontos>(PONTOS_PADRAO);
  const [salvos, setSalvos] = useState<Pontos>(PONTOS_PADRAO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try { setLinhas(await carregarRanking(dias)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar o ranking.'); }
    finally { setCarregando(false); }
  }, [dias]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { carregarPontos().then((p) => { setPontos(p); setSalvos(p); }).catch(() => undefined); }, []);

  const mudou = JSON.stringify(pontos) !== JSON.stringify(salvos);
  const totalInteracoes = useMemo(() => linhas.reduce((s, l) => s + l.total, 0), [linhas]);
  const lider = linhas[0];

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarPontos(pontos);
      setSalvos(pontos);
      toast.success('Pontuação salva. Ranking recalculado.');
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a pontuação.');
    } finally { setSalvando(false); }
  };

  const cards = [
    { rotulo: 'Pessoas no ranking', valor: num(linhas.length), icone: Users, dica: linhas.length >= 200 ? 'mostrando as 200 primeiras' : undefined },
    { rotulo: 'Interações no período', valor: num(totalInteracoes), icone: MessageCircle },
    { rotulo: 'Líder', valor: lider ? (lider.username ? `@${lider.username}` : nomeDeExibicao(lider.nome, null) || 'Sem @') : 'Ninguém ainda', icone: Crown, dica: lider ? `${num(lider.pontos)} pontos` : undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Quem mais interage com você no Instagram, com a pontuação que você define.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período" className="h-10 rounded-full border border-border bg-card px-3 text-sm text-foreground outline-none">
            {PERIODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div className="inline-flex rounded-full border border-border bg-card p-1">
            {([['ranking', 'Ranking', Trophy], ['pontos', 'Pontuação', Settings2]] as const).map(([k, l, Icone]) => (
              <button key={k} type="button" onClick={() => setAba(k)} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${aba === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icone className="h-3.5 w-3.5" />{l}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void carregar()} disabled={carregando} aria-label="Atualizar" className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(({ rotulo, valor, icone: Icone, dica }) => (
          <div key={rotulo} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icone className="h-4 w-4" />{rotulo}</div>
            <p className="mt-2 truncate text-2xl font-bold tabular-nums" title={valor}>{valor}</p>
            {dica && <p className="mt-0.5 text-xs text-muted-foreground">{dica}</p>}
          </div>
        ))}
      </div>

      {aba === 'pontos' ? (
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border p-5">
            <h2 className="text-base font-bold">Pontuação por tipo de interação</h2>
            <p className="text-sm text-muted-foreground">De 0 a 10 para cada tipo. Zero tira o tipo da conta.</p>
          </header>
          <div className="divide-y divide-border px-5">
            {TIPOS_INTERACAO.map(({ tipo, rotulo }) => (
              <label key={tipo} className="flex items-center justify-between gap-4 py-3.5">
                <span className="text-sm font-medium">{rotulo}</span>
                <input type="number" min={0} max={10} value={pontos[tipo]}
                  onChange={(e) => setPontos({ ...pontos, [tipo]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}
                  className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-center text-sm text-foreground outline-none focus:border-primary" />
              </label>
            ))}
          </div>
          <footer className="flex justify-end border-t border-border p-5">
            <button type="button" onClick={() => void salvar()} disabled={!mudou || salvando} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{salvando ? 'Salvando...' : 'Salvar pontuação'}
            </button>
          </footer>
        </section>
      ) : erro ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold">Não foi possível carregar o ranking.</p>
          <p className="mt-1 text-xs text-muted-foreground">{erro}</p>
        </div>
      ) : carregando && !linhas.length ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !linhas.length ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Nenhuma interação registrada no período.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-12 px-4 py-3">#</th>
                <th className="px-4 py-3">Pessoa</th>
                {TIPOS_INTERACAO.map((t) => <th key={t.tipo} className="px-3 py-3 text-right">{t.curto}</th>)}
                <th className="px-4 py-3 text-right">Pontos</th>
                <th className="px-4 py-3 text-right">Última</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((l, i) => {
                const nome = nomeDeExibicao(l.nome, l.username);
                return (
                  <tr key={l.chave}>
                    <td className={`px-4 py-3 font-bold tabular-nums ${i < 3 ? 'text-foreground' : 'text-muted-foreground'}`}>{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Foto linha={l} />
                        <div className="min-w-0">
                          {nome && <span className="block truncate font-semibold">{nome}</span>}
                          {l.username
                            ? <a href={`https://instagram.com/${l.username}`} target="_blank" rel="noreferrer" className={`flex items-center gap-1 hover:underline ${nome ? 'text-xs text-muted-foreground' : 'font-semibold'}`}><Instagram className="h-3 w-3 shrink-0" />@{l.username}</a>
                            : !nome && <span className="text-muted-foreground">Perfil sem @ identificado</span>}
                        </div>
                      </div>
                    </td>
                    {TIPOS_INTERACAO.map((t) => {
                      const qtd = Number(l[t.coluna]) || 0;
                      return <td key={t.tipo} className={`px-3 py-3 text-right tabular-nums ${qtd ? '' : 'text-muted-foreground/40'}`}>{num(qtd)}</td>;
                    })}
                    <td className="px-4 py-3 text-right"><span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${i < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{num(l.pontos)} pts</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">{haQuanto(l.ultima)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
