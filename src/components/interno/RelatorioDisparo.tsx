import type { CSSProperties } from 'react';
import { Destaque, Faixa, FolhaA4, H2 } from './RelatorioCampanhas';

/**
 * Relatório em A4 de um disparo da fila (whatsapp_disparo_resumo), para mandar
 * a produtores e organizadores: mesmo corpo do relatório de campanhas e do de
 * disparos (cabeçalho com a marca, destaque, faixa de métricas). Só totais,
 * nenhum nome ou telefone.
 */
export type ResumoDisparo = {
  job: { template_name: string; total: number; created_at: string };
  aceitos: number; entregues: number; lidos: number; falhas: number;
  clicaram: number; cliques: number; responderam: number;
  inicio: string | null; fim: string | null;
  motivos: { motivo: string; code: string | null; n: number; conta: string | null }[];
};

const fraco = (a: number) => `rgba(25,24,19,${a})`;
const ROTULO: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: fraco(0.5) };
const n = (v: number) => Number(v).toLocaleString('pt-BR');
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '—');
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—');
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

// Motivos da Meta em linguagem de quem lê o relatório.
const MOTIVO: Record<string, string> = {
  '131026': 'Número sem WhatsApp, app desatualizado ou termos não aceitos',
  '131049': 'Limite diário de mensagens de marketing por pessoa (regra da Meta)',
  '130472': 'Número em grupo de teste da Meta, que não recebe marketing',
  '131047': 'Mais de 24h sem conversa (exige template)',
  '131050': 'A pessoa pediu para não receber marketing',
};

export function RelatorioDisparo({ titulo, r }: { titulo: string; r: ResumoDisparo }) {
  const total = r.job.total;
  const chegaram = r.entregues;
  const etapas = [
    { rotulo: 'Enviados', valor: total },
    { rotulo: 'Chegaram no celular', valor: chegaram },
    { rotulo: 'Leram', valor: r.lidos },
    { rotulo: 'Tocaram no botão', valor: r.clicaram },
  ];
  const aguardando = Math.max(0, r.aceitos - r.entregues);
  return (
    <FolhaA4 contexto={`Disparo · WhatsApp · ${dia(r.inicio ?? r.job.created_at)}`}>
      <div data-bloco style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, fontSize: 30, lineHeight: 1.05, letterSpacing: '-.025em', margin: 0 }}>{titulo}</h1>
          <p style={{ margin: '7px 0 0', fontSize: 11.5, lineHeight: 1.45, color: fraco(0.65), maxWidth: '40em' }}>
            Disparo de {dia(r.inicio ?? r.job.created_at)}, das {hora(r.inicio)} às {hora(r.fim)}, para {n(total)} contatos com o template {r.job.template_name}.
          </p>
        </div>
        <Destaque rotulo="Chegaram no celular" valor={pct(chegaram, total)} sub={`${n(chegaram)} de ${n(total)} contatos`} />
      </div>

      <Faixa itens={[
        { rotulo: 'Contatos', valor: n(total), sub: 'na lista do disparo' },
        { rotulo: 'Chegaram', valor: n(chegaram), sub: `${pct(chegaram, total)} da lista` },
        { rotulo: 'Leram', valor: n(r.lidos), sub: `${pct(r.lidos, chegaram)} das que chegaram` },
        { rotulo: 'Tocaram no botão', valor: n(r.clicaram), sub: `${pct(r.clicaram, chegaram)} das que chegaram`, destaque: true },
        { rotulo: 'Responderam', valor: n(r.responderam), sub: 'pessoas no chat' },
      ]} />

      <div data-bloco>
        <H2>Do envio ao clique</H2>
        <div style={{ display: 'grid', gap: 9 }}>
          {etapas.map((e) => (
            <div key={e.rotulo} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 110px', alignItems: 'center', gap: 12, fontSize: 11.5 }}>
              <span>{e.rotulo}</span>
              <div style={{ height: 12, borderRadius: 6, background: fraco(0.07), overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${total ? (e.valor / total) * 100 : 0}%`, borderRadius: 6, background: 'linear-gradient(90deg,#FFB84D 0%,#FFE14D 100%)' }} />
              </div>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: fraco(0.7) }}>{n(e.valor)} · {pct(e.valor, total)}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 10.5, color: fraco(0.55), lineHeight: 1.5 }}>
          "Leram" conta só quem deixa a confirmação de leitura ligada no WhatsApp. {r.cliques > r.clicaram ? `${n(r.cliques)} cliques no botão no total. ` : ''}{aguardando ? `${n(aguardando)} mensagens ainda esperavam o celular ligar quando o relatório foi gerado.` : ''}
        </p>
      </div>

      {r.motivos.length > 0 && (
        <div data-bloco>
          <H2>Por que algumas não chegaram</H2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr>
                <th style={{ ...ROTULO, textAlign: 'left', padding: '0 0 5px' }}>Motivo</th>
                <th style={{ ...ROTULO, textAlign: 'left', padding: '0 0 5px', width: 70 }}>Código</th>
                <th style={{ ...ROTULO, textAlign: 'right', padding: '0 0 5px', width: 80 }}>Contatos</th>
              </tr>
            </thead>
            <tbody>
              {r.motivos.map((m) => (
                <tr key={`${m.code}-${m.motivo}`} style={{ borderTop: `1px solid ${fraco(0.1)}` }}>
                  <td style={{ padding: '7px 10px 7px 0' }}>{m.conta ?? MOTIVO[m.code ?? ''] ?? m.motivo}</td>
                  <td style={{ padding: '7px 0', color: fraco(0.55) }}>{m.code ?? '—'}</td>
                  <td style={{ padding: '7px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n(m.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', fontSize: 10.5, color: fraco(0.55) }}>{n(r.falhas)} mensagens não chegaram ({pct(r.falhas, total)} da lista). São motivos do contato ou regras da Meta, não da conta da Lagun.</p>
        </div>
      )}
    </FolhaA4>
  );
}
