// Máquina de estados do Bot de Lounges (fluxograma da página 2 do roteiro v2).
// Não fala com banco, Meta nem Inter: tudo passa pela `Porta`, que o index.ts
// implementa de verdade e o teste implementa em memória.

import * as T from "./textos.ts";
import type { Evento, Lounge, Saida } from "./textos.ts";

export type Etapa = "inicio" | "evento" | "lounge" | "dados" | "resumo" | "pix" | "pago" | "expirado";

export type Conversa = {
  telefone: string;
  contact_name: string | null;
  etapa: Etapa;
  event_id: string | null;
  lounge_id: string | null;
  titular_nome: string | null;
  titular_cpf: string | null;
  reserva_id: string | null;
  pausado: boolean;
  pausado_motivo: string | null;
  pausado_em: string | null;
  atendimento_equipe: boolean;
  updated_at: string;
};

export type Reserva = {
  id: string; codigo: string; event_id: string; lounge_id: string;
  /** whatsapp = bot; site = lagunvitoria.com.br/lounges (sem conversa, sem mensagem livre no WhatsApp). */
  origem?: "whatsapp" | "site";
  status: "aguardando" | "confirmada" | "cancelada" | "expirada";
  pago: number; nome: string; cpf: string | null; telefone: string;
  txid: string | null; pix_copia_cola: string | null; expira_em: string | null; lembrete_em: string | null;
};

/** ativo = ainda na landing (não acabou). aVenda = ativo e antes do horário limite de venda. */
export type EventoInfo = Evento & { ativo: boolean; aVenda: boolean };

/** Mensagem que chegou: texto digitado, toque em botão/lista, comprovante (imagem/PDF) ou outra mídia. */
export type Entrada =
  | { tipo: "texto"; texto: string }
  | { tipo: "escolha"; id: string; texto: string }
  | { tipo: "comprovante"; texto: string }
  | { tipo: "midia"; texto: string };

export type Intencao = {
  intencao:
    | "estorno" | "cancelar" | "pagou_por_fora" | "ja_paguei" | "reenviar_pix"
    | "escolher_evento" | "escolher_lounge" | "dados" | "confirmar" | "trocar_lounge"
    | "ver_eventos" | "outro_assunto" | "conversa";
  evento_id?: string | null;
  lounge_id?: string | null;
  categoria?: string | null;
  nome?: string | null;
  cpf?: string | null;
};

export type Config = {
  mapaUrl: string | null;
  site: string;
  telefoneLista: string;
  pixMinutos: number;
  lembreteMinutos: number;
  linkConversa: (telefone: string) => string;
  /** Página do painel com as vendas da noite (aviso de venda pelo site). */
  linkPainel?: (eventId: string) => string;
};

export interface Porta {
  cfg: Config;
  agora(): Date;
  /** Eventos à venda com pelo menos um lounge livre, em ordem de data. */
  eventosAVenda(): Promise<Evento[]>;
  evento(id: string): Promise<EventoInfo | null>;
  /** Lounges abertos na noite, sem reserva aguardando ou confirmada, com o preço da noite. */
  loungesLivres(eventId: string): Promise<Lounge[]>;
  lounge(id: string, eventId: string): Promise<Lounge | null>;
  reserva(id: string): Promise<Reserva | null>;
  reservaPagaDoTelefone(telefone: string): Promise<Reserva | null>;
  reservasAguardando(): Promise<Reserva[]>;
  /** Insere a reserva (trava única no banco). ocupado = alguém pegou antes. */
  criarReserva(d: { eventId: string; loungeId: string; nome: string; cpf: string; telefone: string; pessoas: number; origem?: "whatsapp" | "site" }):
    Promise<{ ok: true; reserva: Reserva } | { ok: false; ocupado: boolean; erro?: string }>;
  /** Cria a cobrança no banco e grava txid, copia e cola e validade. Lança erro se falhar. */
  gerarPix(r: Reserva): Promise<Reserva>;
  /** aguardando → cancelada/expirada (e cancela a cobrança). true se mudou agora. */
  encerrarReserva(r: Reserva, status: "cancelada" | "expirada"): Promise<boolean>;
  pagamentoNoBanco(r: Reserva): Promise<{ pago: boolean; endToEndId?: string | null }>;
  /** aguardando → confirmada. true se mudou agora (evita aviso em dobro). */
  marcarPago(r: Reserva, endToEndId: string | null): Promise<boolean>;
  marcarLembrete(r: Reserva): Promise<void>;
  /** Comprovante chegou (M11). No Pix de teste, é o que simula o pagamento. */
  registrarComprovante?(r: Reserva): Promise<void>;
  conversa(telefone: string): Promise<Conversa>;
  conversasComEvento(): Promise<Conversa[]>;
  salvar(c: Conversa): Promise<void>;
  enviar(telefone: string, saidas: Saida[]): Promise<void>;
  /** Marca a conversa no chat interno para a equipe (indicador vermelho). */
  marcarEquipe(telefone: string, motivo: string): Promise<void>;
  /** Avisa o organizador no WhatsApp e cria a tarefa no painel. */
  avisarOrganizador(texto: string, tarefa: { titulo: string; descricao: string; eventId: string | null }): Promise<void>;
  /** IA: entende texto livre. Pode lançar erro; o fluxo cai na heurística. */
  interpretar(texto: string, ctx: { etapa: Etapa; eventos: Evento[]; lounges: Lounge[] }): Promise<Intencao>;
}

/** Conversa parada há mais tempo que isso (sem reserva em andamento) recomeça no M1. */
const CONVERSA_VELHA_HORAS = 6;

// ------------------------------------------------------------------ utilidades
export function cpfValido(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const RE_CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
export function extrairCpf(texto: string): string | null {
  const m = texto.match(RE_CPF);
  if (m) return m[0].replace(/\D/g, "");
  const so = texto.replace(/\D/g, "");
  return so.length === 11 ? so : null;
}
// Palavras que aparecem em volta do nome ("meu nome é ... e o CPF é ...").
const NAO_NOME = new Set(["meu", "minha", "nome", "completo", "titular", "cpf", "e", "é", "o", "a", "segue", "aqui", "numero", "número", "sou", "eu"]);
export function extrairNome(texto: string): string | null {
  const palavras = texto
    .replace(RE_CPF, " ").replace(/\d+/g, " ")
    .replace(/[,;:\-–|/()]+/g, " ")
    .split(/\s+/).filter(Boolean)
    .filter((w) => !NAO_NOME.has(w.toLowerCase()));
  const limpo = palavras.join(" ").replace(/[.!]+$/, "").trim();
  if (!limpo || !/^[\p{L}' .]+$/u.test(limpo)) return null;
  return nomeCompleto(limpo) ? limpo : null;
}
const nomeCompleto = (n: string | null | undefined) =>
  !!n && n.trim().split(/\s+/).filter((p) => p.replace(/\./g, "").length >= 2).length >= 2;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Leitura sem IA: palavras-chave. Também é o plano B quando a IA falha. */
export function interpretarSemIA(texto: string, etapa: Etapa, eventos: Evento[], lounges: Lounge[]): Intencao {
  const t = norm(texto);
  if (/estorn|reembols|dinheiro de volta|devolv|devolucao/.test(t)) return { intencao: "estorno" };
  if (/\b(cancela|cancelar|cancele|desisti|desistir|nao quero mais)\b/.test(t)) return { intencao: "cancelar" };
  if (etapa === "pix") {
    if (/chave|cnpj|transferi|outra conta|ted|deposit/.test(t)) return { intencao: "pagou_por_fora" };
    if (/paguei|pago|fiz o pix|ja fiz|comprovante|transferencia/.test(t)) return { intencao: "ja_paguei" };
    if (/manda.*(pix|codigo)|copia e cola|de novo|outra vez/.test(t)) return { intencao: "reenviar_pix" };
  }
  if (/trocar? (de |o )?lounge|outro lounge/.test(t)) return { intencao: "trocar_lounge" };
  if (/trocar? (de |o )?evento|outra data|outro evento|ver eventos/.test(t)) return { intencao: "ver_eventos" };
  const cpf = extrairCpf(texto);
  if (cpf || (etapa === "dados" && extrairNome(texto))) return { intencao: "dados", cpf, nome: extrairNome(texto) };
  if (etapa === "resumo" && /^(sim|confirm|ok|pode|bora|isso|certo|fechado)/.test(t)) return { intencao: "confirmar" };
  const lg = lounges.find((l) => (l.codigo && new RegExp(`\\b${norm(l.codigo)}\\b`).test(t)) || t.includes(norm(l.nome)));
  const cat = /premium/.test(t) ? "Premium" : /palco/.test(t) ? "Palco" : null;
  const ev = eventos.find((e) => t.includes(norm(e.nome)));
  if (ev) return { intencao: "escolher_evento", evento_id: ev.id, lounge_id: lg?.id ?? null, categoria: cat };
  if (lg || cat) return { intencao: "escolher_lounge", lounge_id: lg?.id ?? null, categoria: cat };
  if (/ingresso|entrada|lista|aniversari|achados|perdi|camarote|mesa|horario|endereco|onde fica/.test(t)) return { intencao: "outro_assunto" };
  return { intencao: "conversa" };
}

function reiniciar(c: Conversa, limparTitular = true) {
  c.etapa = "inicio";
  c.event_id = null;
  c.lounge_id = null;
  c.reserva_id = null;
  c.atendimento_equipe = false;
  if (limparTitular) { c.titular_nome = null; c.titular_cpf = null; }
}

// ------------------------------------------------------------------ passos
async function mostrarEventos(p: Porta, c: Conversa) {
  const eventos = await p.eventosAVenda();
  reiniciar(c, false);
  if (!eventos.length) { await p.enviar(c.telefone, T.m2()); return; }
  c.etapa = "evento";
  await p.enviar(c.telefone, T.m1(eventos));
}

async function escolherEvento(p: Porta, c: Conversa, eventId: string, loungeId?: string | null, categoria?: string | null) {
  const ev = await p.evento(eventId);
  if (!ev || !ev.aVenda) return mostrarEventos(p, c);
  const livres = await p.loungesLivres(ev.id);
  c.event_id = ev.id;
  c.lounge_id = null;
  if (!livres.length) {
    c.etapa = "evento";
    const outros = (await p.eventosAVenda()).filter((e) => e.id !== ev.id);
    await p.enviar(c.telefone, T.m5(ev, outros));
    return;
  }
  // "quero o premium pra sexta": evento e lounge na mesma frase.
  const direto = loungeId ? livres.find((l) => l.id === loungeId) : categoria ? livres.find((l) => l.categoria === categoria) : null;
  if (direto) return escolherLounge(p, c, ev, direto.id);
  c.etapa = "lounge";
  await p.enviar(c.telefone, T.m6(ev, livres, p.cfg.mapaUrl));
}

async function mostrarLounges(p: Porta, c: Conversa, comMapa: boolean) {
  const ev = c.event_id ? await p.evento(c.event_id) : null;
  if (!ev || !ev.aVenda) return mostrarEventos(p, c);
  const livres = await p.loungesLivres(ev.id);
  if (!livres.length) {
    c.etapa = "evento";
    await p.enviar(c.telefone, T.m5(ev, (await p.eventosAVenda()).filter((e) => e.id !== ev.id)));
    return;
  }
  c.etapa = "lounge";
  c.lounge_id = null;
  await p.enviar(c.telefone, T.m6(ev, livres, p.cfg.mapaUrl, comMapa));
}

async function escolherLounge(p: Porta, c: Conversa, ev: EventoInfo, loungeId: string) {
  const livres = await p.loungesLivres(ev.id);
  const l = livres.find((x) => x.id === loungeId);
  if (!l) {
    const saiu = await p.lounge(loungeId, ev.id);
    if (!livres.length) {
      c.etapa = "evento";
      await p.enviar(c.telefone, T.m5(ev, (await p.eventosAVenda()).filter((e) => e.id !== ev.id)));
      return;
    }
    c.etapa = "lounge";
    c.lounge_id = null;
    await p.enviar(c.telefone, saiu ? T.m7(saiu, livres) : T.m6(ev, livres, p.cfg.mapaUrl, false));
    return;
  }
  c.event_id = ev.id;
  c.lounge_id = l.id;
  // Já tem os dados (veio de "Trocar lounge" no resumo): vai direto ao resumo.
  if (nomeCompleto(c.titular_nome) && c.titular_cpf && cpfValido(c.titular_cpf)) {
    c.etapa = "resumo";
    await p.enviar(c.telefone, T.m9(ev, l, c.titular_nome!, c.titular_cpf, p.cfg.pixMinutos));
    return;
  }
  c.etapa = "dados";
  await p.enviar(c.telefone, T.m8());
}

async function receberDados(p: Porta, c: Conversa, texto: string, it: Intencao) {
  const cpf = (it.cpf ? it.cpf.replace(/\D/g, "") : null) ?? extrairCpf(texto);
  const nome = it.nome && nomeCompleto(it.nome) ? it.nome.trim() : extrairNome(texto);
  if (nome) c.titular_nome = nome;
  if (cpf) {
    if (!cpfValido(cpf)) { await p.enviar(c.telefone, T.m8CpfInvalido()); return; }
    c.titular_cpf = cpf;
  }
  if (!c.titular_nome) { await p.enviar(c.telefone, c.titular_cpf ? T.m8FaltaNome() : T.m8()); return; }
  if (!c.titular_cpf) { await p.enviar(c.telefone, T.m8FaltaCpf()); return; }
  await mostrarResumo(p, c);
}

async function mostrarResumo(p: Porta, c: Conversa) {
  const ev = c.event_id ? await p.evento(c.event_id) : null;
  if (!ev || !ev.aVenda) return mostrarEventos(p, c);
  const l = c.lounge_id ? await p.lounge(c.lounge_id, ev.id) : null;
  if (!l) return mostrarLounges(p, c, false);
  c.etapa = "resumo";
  await p.enviar(c.telefone, T.m9(ev, l, c.titular_nome!, c.titular_cpf!, p.cfg.pixMinutos));
}

/** M9 → M10 (ou M7 se alguém pegou antes). Também é o "Gerar novo Pix" do M14. */
async function confirmarReserva(p: Porta, c: Conversa) {
  const ev = c.event_id ? await p.evento(c.event_id) : null;
  if (!ev || !ev.aVenda) return mostrarEventos(p, c);
  if (!c.lounge_id) return mostrarLounges(p, c, false);
  if (!nomeCompleto(c.titular_nome) || !c.titular_cpf || !cpfValido(c.titular_cpf)) {
    c.etapa = "dados";
    await p.enviar(c.telefone, T.m8());
    return;
  }
  const l = await p.lounge(c.lounge_id, ev.id);
  if (!l) return mostrarLounges(p, c, false);
  const res = await p.criarReserva({
    eventId: ev.id, loungeId: l.id, nome: c.titular_nome!, cpf: c.titular_cpf, telefone: c.telefone, pessoas: l.capacidade,
  });
  if (!res.ok) {
    if (!res.ocupado) { c.etapa = "resumo"; await p.enviar(c.telefone, T.erroPix()); return; }
    return escolherLounge(p, c, ev, l.id); // vira M7 com a lista atualizada
  }
  let r: Reserva;
  try {
    r = await p.gerarPix(res.reserva);
  } catch (e) {
    console.error("gerarPix:", e instanceof Error ? e.message : e);
    await p.encerrarReserva(res.reserva, "cancelada");
    c.etapa = "resumo";
    await p.enviar(c.telefone, T.erroPix());
    return;
  }
  c.reserva_id = r.id;
  c.etapa = "pix";
  await p.enviar(c.telefone, T.m10(r.pago, r.expira_em!, r.pix_copia_cola!, p.cfg.pixMinutos));
}

/** Pagamento confirmado pelo banco (webhook, cron ou M11). */
export async function confirmarPagamento(p: Porta, r: Reserva, endToEndId: string | null): Promise<boolean> {
  if (!(await p.marcarPago(r, endToEndId))) return false;
  const ev = await p.evento(r.event_id);
  const l = await p.lounge(r.lounge_id, r.event_id);
  const site = r.origem === "site";
  if (!site) {
    // Pelo site não há conversa: a confirmação aparece na própria página.
    const c = await p.conversa(r.telefone);
    c.reserva_id = r.id;
    c.etapa = "pago";
    c.atendimento_equipe = false;
    await p.salvar(c);
    if (ev && l && !c.pausado) await p.enviar(r.telefone, T.m13(ev, l, r.codigo));
  }
  const resumo: T.ResumoReserva = { nome: r.nome, telefone: r.telefone, codigo: r.codigo, lounge: l?.nome ?? null, evento: ev, valor: r.pago };
  const link = site && p.cfg.linkPainel ? p.cfg.linkPainel(r.event_id) : p.cfg.linkConversa(r.telefone);
  await p.avisarOrganizador(T.avisoPago(resumo, link, site ? "site" : "whatsapp"), {
    titulo: `Enviar ingressos · ${l?.nome ?? "Lounge"} · ${ev ? `${ev.nome} (${T.dataCurta(ev.data)})` : ""}`.trim(),
    descricao: `Lounge pago pelo ${site ? "site" : "bot do WhatsApp"}.\nCliente: ${r.nome}\nWhatsApp: ${T.telefoneBonito(r.telefone)}\nReserva: ${r.codigo}\nValor: ${T.reais(r.pago, true)}`,
    eventId: r.event_id,
  });
  return true;
}

async function pedirEstorno(p: Porta, c: Conversa) {
  await p.enviar(c.telefone, T.m19());
  c.pausado = true;
  c.pausado_motivo = "estorno";
  c.pausado_em = p.agora().toISOString();
  await p.salvar(c);
  const atual = c.reserva_id ? await p.reserva(c.reserva_id) : null;
  const paga = atual?.status === "confirmada" ? atual : await p.reservaPagaDoTelefone(c.telefone);
  const ev = paga ? await p.evento(paga.event_id) : null;
  const l = paga ? await p.lounge(paga.lounge_id, paga.event_id) : null;
  const nome = paga?.nome ?? c.titular_nome ?? c.contact_name ?? "Sem nome";
  await p.marcarEquipe(c.telefone, "Estorno pedido · Lounges");
  await p.avisarOrganizador(
    T.m19a({ nome, telefone: c.telefone, codigo: paga?.codigo ?? null, lounge: l?.nome ?? null, evento: ev, valor: paga?.pago ?? null }, p.cfg.linkConversa(c.telefone)),
    {
      titulo: `Estorno pedido · ${nome}${paga ? ` · ${paga.codigo}` : ""}`,
      descricao: `Pedido de estorno no WhatsApp de lounges. O bot parou de responder essa pessoa até alguém reativar no chat.\nWhatsApp: ${T.telefoneBonito(c.telefone)}`,
      eventId: paga?.event_id ?? null,
    },
  );
}

async function comPixAberto(p: Porta, c: Conversa, r: Reserva, e: Entrada, it: Intencao | null) {
  const l = await p.lounge(r.lounge_id, r.event_id);
  const escolha = e.tipo === "escolha" ? e.id : null;
  if (e.tipo === "comprovante" || it?.intencao === "ja_paguei") {
    await p.enviar(c.telefone, T.m11());
    if (e.tipo === "comprovante") await p.registrarComprovante?.(r);
    const banco = await p.pagamentoNoBanco(r).catch(() => ({ pago: false, endToEndId: null }));
    if (banco.pago && (await confirmarPagamento(p, r, banco.endToEndId ?? null))) {
      // confirmarPagamento salvou a conversa; o `c` daqui é salvo no fim e não pode voltar para "pix".
      c.etapa = "pago";
      c.reserva_id = r.id;
      c.atendimento_equipe = false;
    }
    return;
  }
  if (escolha === T.ID.cancelar || it?.intencao === "cancelar") {
    await p.encerrarReserva(r, "cancelada");
    reiniciar(c);
    await p.enviar(c.telefone, T.m15());
    return;
  }
  if (escolha === T.ID.pixDeNovo || it?.intencao === "reenviar_pix") {
    await p.enviar(c.telefone, [
      { tipo: "texto", texto: r.pix_copia_cola ?? "" },
      { tipo: "texto", texto: `Esse é o Pix copia e cola, válido até as *${T.hora(r.expira_em!)}* ⏳` },
    ]);
    return;
  }
  if (it?.intencao === "pagou_por_fora") {
    await p.enviar(c.telefone, T.m16());
    if (!c.atendimento_equipe) await p.marcarEquipe(c.telefone, "Pagamento fora do Pix · Lounges");
    c.atendimento_equipe = true;
    return;
  }
  if (l) await p.enviar(c.telefone, T.m17(l, r.expira_em!));
}

async function comLoungePago(p: Porta, c: Conversa, r: Reserva, e: Entrada) {
  if (e.tipo === "escolha" && e.id === T.ID.outroLounge) return mostrarEventos(p, c);
  const ev = await p.evento(r.event_id);
  const l = await p.lounge(r.lounge_id, r.event_id);
  if (!ev || !l) return mostrarEventos(p, c);
  await p.enviar(c.telefone, T.m18(ev, l, r.codigo));
  if (!c.atendimento_equipe) await p.marcarEquipe(c.telefone, "Cliente com lounge pago · Lounges");
  c.atendimento_equipe = true;
}

// ------------------------------------------------------------------ entrada
async function lerIntencao(p: Porta, c: Conversa, texto: string): Promise<Intencao> {
  const eventos = await p.eventosAVenda();
  const lounges = c.event_id ? await p.loungesLivres(c.event_id) : [];
  const rapido = interpretarSemIA(texto, c.etapa, eventos, lounges);
  // Palavra-chave inequívoca dispensa a IA.
  if (["estorno", "cancelar"].includes(rapido.intencao)) return rapido;
  if (rapido.intencao === "dados" && rapido.cpf && rapido.nome) return rapido;
  try {
    const it = await p.interpretar(texto, { etapa: c.etapa, eventos, lounges });
    // Só aceita ids que existem.
    if (it.evento_id && !eventos.some((e) => e.id === it.evento_id)) it.evento_id = null;
    if (it.lounge_id && !lounges.some((l) => l.id === it.lounge_id) && it.intencao !== "escolher_evento") it.lounge_id = null;
    return it;
  } catch (e) {
    console.error("interpretar:", e instanceof Error ? e.message : e);
    return rapido;
  }
}

/** Uma mensagem do cliente no número de lounges. */
export async function tratarMensagem(p: Porta, telefone: string, contactName: string | null, e: Entrada): Promise<void> {
  const c = await p.conversa(telefone);
  if (contactName) c.contact_name = contactName;
  // Estorno pedido: a equipe assume até reativar no chat.
  if (c.pausado) return;

  const it = e.tipo === "texto" ? await lerIntencao(p, c, e.texto) : null;
  if (it?.intencao === "estorno") return pedirEstorno(p, c);

  try {
    // B · reserva em andamento de evento ainda ativo
    if (c.reserva_id) {
      const r = await p.reserva(c.reserva_id);
      const ev = r ? await p.evento(r.event_id) : null;
      if (r && ev?.ativo && r.status === "aguardando") return await comPixAberto(p, c, r, e, it);
      if (r && ev?.ativo && r.status === "confirmada") return await comLoungePago(p, c, r, e);
      if (!r || !ev?.ativo) reiniciar(c);
      else c.reserva_id = null; // expirada/cancelada: segue pela etapa
    }

    const velha = p.agora().getTime() - Date.parse(c.updated_at) > CONVERSA_VELHA_HORAS * 3600_000;
    if (velha && c.etapa !== "inicio") reiniciar(c);

    // Toque em botão ou lista: vale de qualquer etapa (mensagens antigas também).
    if (e.tipo === "escolha") return await tratarEscolha(p, c, e.id);

    if (e.tipo === "midia" || e.tipo === "comprovante") {
      const eventos = await p.eventosAVenda();
      if (!eventos.length) { reiniciar(c, false); await p.enviar(c.telefone, T.m2()); return; }
      await p.enviar(c.telefone, T.m4());
      return;
    }

    const i = it!;
    // Primeira mensagem: sempre M1, a não ser que já diga o evento.
    if (c.etapa === "inicio" || c.etapa === "pago") {
      if (i.intencao === "escolher_evento" && i.evento_id) return await escolherEvento(p, c, i.evento_id, i.lounge_id, i.categoria);
      return await mostrarEventos(p, c);
    }

    switch (i.intencao) {
      case "escolher_evento":
        if (i.evento_id) return await escolherEvento(p, c, i.evento_id, i.lounge_id, i.categoria);
        break;
      case "escolher_lounge": {
        const ev = c.event_id ? await p.evento(c.event_id) : null;
        if (ev?.aVenda) {
          const livres = await p.loungesLivres(ev.id);
          const alvo = i.lounge_id ?? livres.find((l) => l.categoria === i.categoria)?.id ?? null;
          if (alvo) return await escolherLounge(p, c, ev, alvo);
          if (i.categoria) return await mostrarLounges(p, c, false);
        }
        break;
      }
      case "ver_eventos": return await mostrarEventos(p, c);
      case "trocar_lounge": if (c.event_id) return await mostrarLounges(p, c, false); break;
      case "outro_assunto": await p.enviar(c.telefone, T.m3(p.cfg.site, p.cfg.telefoneLista)); return;
      case "confirmar": if (c.etapa === "resumo") return await confirmarReserva(p, c); break;
      case "cancelar":
        reiniciar(c);
        await p.enviar(c.telefone, [{ tipo: "texto", texto: "Tudo bem! Se quiser um lounge depois, é só chamar 🦩" }]);
        return;
    }

    // Sem intenção clara: segue a etapa em que a conversa está.
    switch (c.etapa) {
      case "dados": return await receberDados(p, c, e.texto, i);
      case "resumo":
        if (i.intencao === "dados") return await receberDados(p, c, e.texto, i);
        return await mostrarResumo(p, c);
      case "lounge": return await mostrarLounges(p, c, false);
      case "expirado": {
        const l = c.lounge_id && c.event_id ? await p.lounge(c.lounge_id, c.event_id) : null;
        if (l) { await p.enviar(c.telefone, T.m14(l)); return; }
        return await mostrarEventos(p, c);
      }
      default: return await mostrarEventos(p, c);
    }
  } finally {
    c.updated_at = p.agora().toISOString();
    await p.salvar(c);
  }
}

async function tratarEscolha(p: Porta, c: Conversa, id: string) {
  if (id.startsWith("ev:")) return escolherEvento(p, c, id.slice(3));
  if (id.startsWith("lg:")) {
    const ev = c.event_id ? await p.evento(c.event_id) : null;
    if (!ev || !ev.aVenda) return mostrarEventos(p, c);
    return escolherLounge(p, c, ev, id.slice(3));
  }
  switch (id) {
    case T.ID.eventos:
    case T.ID.outroLounge:
      return mostrarEventos(p, c);
    case T.ID.trocarLounge:
    case T.ID.outrosLounges:
      return c.event_id ? mostrarLounges(p, c, false) : mostrarEventos(p, c);
    case T.ID.confirmar:
    case T.ID.novoPix:
      return confirmarReserva(p, c);
    default:
      // cancelar / pix_de_novo sem Pix aberto (botão antigo)
      return mostrarEventos(p, c);
  }
}

// ------------------------------------------------------------------ cron
/** A cada minuto: confere Pix abertos no banco, lembrete (M12), prazo (M14) e fim de evento. */
export async function tick(p: Porta): Promise<{ pagos: number; lembretes: number; expirados: number; encerrados: number }> {
  const out = { pagos: 0, lembretes: 0, expirados: 0, encerrados: 0 };
  const agora = p.agora().getTime();

  for (const r of await p.reservasAguardando()) {
    const ev = await p.evento(r.event_id);
    if (!ev || !ev.ativo) {
      // Evento saiu da landing: cancela no banco, sem mensagem para o cliente.
      if (await p.encerrarReserva(r, "cancelada")) out.encerrados++;
      continue;
    }
    if (r.txid) {
      const banco = await p.pagamentoNoBanco(r).catch(() => ({ pago: false, endToEndId: null }));
      if (banco.pago) { if (await confirmarPagamento(p, r, banco.endToEndId ?? null)) out.pagos++; continue; }
    }
    const c = await p.conversa(r.telefone);
    const daConversa = c.reserva_id === r.id;
    // M16: a equipe está conferindo um pagamento por fora; o lounge segue travado.
    if (daConversa && c.atendimento_equipe) continue;
    const expira = r.expira_em ? Date.parse(r.expira_em) : 0;
    if (agora >= expira) {
      if (!(await p.encerrarReserva(r, "expirada"))) continue;
      out.expirados++;
      if (daConversa) {
        c.reserva_id = null;
        c.etapa = "expirado";
        await p.salvar(c);
        const l = await p.lounge(r.lounge_id, r.event_id);
        if (l && !c.pausado) await p.enviar(r.telefone, T.m14(l));
      }
      continue;
    }
    const lembrarEm = expira - (p.cfg.pixMinutos - p.cfg.lembreteMinutos) * 60_000;
    if (!r.lembrete_em && agora >= lembrarEm) {
      await p.marcarLembrete(r);
      out.lembretes++;
      const l = await p.lounge(r.lounge_id, r.event_id);
      if (l && daConversa && !c.pausado) await p.enviar(r.telefone, T.m12(l, r.expira_em!));
    }
  }

  // Fim de evento: conversas ligadas a evento que saiu da landing recomeçam do zero.
  for (const c of await p.conversasComEvento()) {
    const ev = c.event_id ? await p.evento(c.event_id) : null;
    if (ev?.ativo) continue;
    reiniciar(c);
    await p.salvar(c);
  }
  return out;
}
