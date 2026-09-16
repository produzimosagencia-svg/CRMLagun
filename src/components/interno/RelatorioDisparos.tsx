import type { CSSProperties } from 'react';
import { Destaque, Faixa, FolhaA4, H2 } from './RelatorioCampanhas';

/**
 * Relatório de disparos do WhatsApp em A4 — mesmo corpo e mesmas posições do
 * relatório de campanhas (cabeçalho com marca, destaque, faixa de métricas e
 * tabela), reaproveitando os blocos daquele template.
 */
export type LinhaDisparo = {
  id: string; contato: string; telefone: string; status?: string | null;
  texto?: string | null; quando: string; categoria?: string | null;
};

const fraco = (a: number) => `rgba(25,24,19,${a})`;
const ROTULO: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: fraco(0.5) };
const n = (v: number) => v.toLocaleString('pt-BR');
const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '—');
const cortar = (t: string | undefined | null, max: number) => { const x = (t || '—').trim(); return x.length > max ? `${x.slice(0, max - 1).trimEnd()}…` : x; };
const ROTULO_STATUS: Record<string, string> = { sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Falhou', error: 'Falhou', undelivered: 'Não entregue' };

export function RelatorioDisparos({ periodo, total, total30d, entregues, lidas, falhas, gasto, marketing, utilidade, apiConectada, linhas }: {
  periodo: string; total: number; total30d: number; entregues: number; lidas: number; falhas: number;
  gasto: number; marketing: number; utilidade: number; apiConectada: boolean; linhas: LinhaDisparo[];
}) {
  const th: CSSProperties = { ...ROTULO, textAlign: 'right', padding: '0 0 5px', whiteSpace: 'nowrap' };
  const td: CSSProperties = { padding: '7px 0', textAlign: 'right', whiteSpace: 'nowrap' };
  return (
    <FolhaA4 contexto={`Disparos · WhatsApp · ${periodo}`}>
      <div data-bloco style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, fontSize: 30, lineHeight: 1.05, letterSpacing: '-.025em', margin: 0 }}>Disparos</h1>
          <p style={{ margin: '7px 0 0', fontSize: 11.5, lineHeight: 1.45, color: fraco(0.65), maxWidth: '40em' }}>
            Lagun · WhatsApp Cloud API {apiConectada ? 'conectada' : 'sem conexão'} · {n(total)} mensagens no histórico, {n(total30d)} nos últimos 30 dias.
          </p>
        </div>
        <Destaque rotulo="Gasto estimado" valor={reais(gasto)} sub={`${n(marketing)} marketing · ${n(utilidade)} utilidade`} />
      </div>

      <Faixa itens={[
        { rotulo: 'Enviados', valor: n(total), sub: 'histórico da API' },
        { rotulo: 'Últimos 30 dias', valor: n(total30d), sub: 'mensagens disparadas' },
        { rotulo: 'Entregues', valor: n(entregues), sub: `${pct(entregues, total)} do total` },
        { rotulo: 'Lidas', valor: n(lidas), sub: entregues ? `${pct(lidas, entregues)} das entregues` : 'sem entregas' },
        { rotulo: 'Falhas', valor: n(falhas), sub: 'números inválidos', destaque: true },
      ]} />

      <div data-bloco>
        <H2 linha={false}>Últimos disparos</H2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: '28%' }} /><col style={{ width: '20%' }} /><col style={{ width: '27%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} /></colgroup>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Contato</th><th style={{ ...th, textAlign: 'left' }}>Telefone</th>
            <th style={{ ...th, textAlign: 'left' }}>Mensagem</th><th style={th}>Status</th><th style={th}>Data</th>
          </tr></thead>
          <tbody>
            {linhas.slice(0, 22).map((l, i, arr) => {
              const st = String(l.status || '').toLowerCase();
              const falhou = ['failed', 'error', 'undelivered'].includes(st);
              return (
                <tr key={l.id} style={{ borderTop: `1px solid ${fraco(0.1)}`, borderBottom: i === arr.length - 1 ? `1px solid ${fraco(0.1)}` : undefined }}>
                  <td style={{ padding: '7px 8px 7px 0', fontSize: 10.5, whiteSpace: 'nowrap' }}>{cortar(l.contato, 26)}</td>
                  <td style={{ padding: '7px 8px 7px 0', fontSize: 10.5, whiteSpace: 'nowrap', color: fraco(0.6) }}>{l.telefone}</td>
                  <td style={{ padding: '7px 8px 7px 0', fontSize: 10.5, whiteSpace: 'nowrap', color: fraco(0.6) }}>{cortar(l.texto, 34)}</td>
                  <td style={{ ...td, fontWeight: 600, color: falhou ? '#B4432F' : '#0F8A3E' }}>{ROTULO_STATUS[st] || l.status || '—'}</td>
                  <td style={{ ...td, color: fraco(0.6) }}>{new Date(l.quando).toLocaleDateString('pt-BR')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ margin: '6px 0 0', fontSize: 9.5, color: fraco(0.5) }}>
          Custo por mensagem conforme a tabela da Meta: R$ 0,36 marketing e R$ 0,06 utilidade.
          {linhas.length > 22 ? ` Mostrando os 22 mais recentes (de ${n(linhas.length)}).` : ''}
        </p>
      </div>
    </FolhaA4>
  );
}
