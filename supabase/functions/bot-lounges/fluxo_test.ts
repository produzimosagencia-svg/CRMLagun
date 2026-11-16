// Teste do roteiro com banco em memória. Roda com Node 22+:
//   node --test supabase/functions/bot-lounges/fluxo_test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmarPagamento, cpfValido, extrairNome, tick, tratarMensagem } from "./fluxo.ts";
import type { Conversa, Entrada, EventoInfo, Porta, Reserva } from "./fluxo.ts";
import type { Lounge, Saida } from "./textos.ts";

const CPF = "52998224725"; // CPF de teste válido

function montar(opts: { eventos?: number } = {}) {
  let agora = new Date("2026-11-06T22:00:00Z"); // 19h de Brasília
  const eventos: EventoInfo[] = [
    { id: "e1", nome: "MC POZE", data: "2026-11-06", ativo: true, aVenda: true },
    { id: "e2", nome: "Lagun Saturday", data: "2026-11-07", ativo: true, aVenda: true },
    { id: "e3", nome: "Festa do Big G", data: "2026-11-13", ativo: true, aVenda: true },
    { id: "e4", nome: "Tilia", data: "2026-11-21", ativo: true, aVenda: true },
  ].slice(0, opts.eventos ?? 4);
  const lounges: Lounge[] = [
    { id: "l1", codigo: "L1", nome: "L1 · Palco", categoria: "Palco", capacidade: 2, minimo: 1, inclui: ["Ao lado do palco"], preco: 800 },
    { id: "l2", codigo: "L2", nome: "L2 · Palco", categoria: "Palco", capacidade: 2, minimo: 1, inclui: ["Ao lado do palco"], preco: 800 },
    { id: "l3", codigo: "L3", nome: "L3 · Premium", categoria: "Premium", capacidade: 6, minimo: 3, inclui: ["Área VIP"], preco: 1500 },
  ];
  // e2 só abre L3; e1 abre tudo.
  const abertos: Record<string, string[]> = { e1: ["l1", "l2", "l3"], e2: ["l3"], e3: ["l1"], e4: ["l1", "l2"] };
  const reservas: Reserva[] = [];
  const conversas = new Map<string, Conversa>();
  const enviados: Array<{ tel: string; s: Saida }> = [];
  const avisos: Array<{ texto: string; titulo: string }> = [];
  const marcas: string[] = [];
  const bancoPago = new Set<string>();
  const cancelados: string[] = [];
  let seq = 0;

  const ocupado = (ev: string, lg: string) => reservas.some((r) => r.event_id === ev && r.lounge_id === lg && ["aguardando", "confirmada"].includes(r.status));
  const p: Porta = {
    cfg: { mapaUrl: "https://x/mapa.jpg", site: "lagunvitoria.com.br", telefoneLista: "5527998511988", pixMinutos: 30, lembreteMinutos: 20, linkConversa: (t) => `https://x/chat/${t}` },
    agora: () => agora,
    eventosAVenda: async () => eventos.filter((e) => e.aVenda && abertos[e.id].some((l) => !ocupado(e.id, l))),
    evento: async (id) => eventos.find((e) => e.id === id) ?? null,
    loungesLivres: async (ev) => lounges.filter((l) => abertos[ev]?.includes(l.id) && !ocupado(ev, l.id)),
    lounge: async (id) => lounges.find((l) => l.id === id) ?? null,
    reserva: async (id) => reservas.find((r) => r.id === id) ?? null,
    reservaPagaDoTelefone: async (t) => reservas.filter((r) => r.telefone === t && r.status === "confirmada").at(-1) ?? null,
    reservasAguardando: async () => reservas.filter((r) => r.status === "aguardando"),
    criarReserva: async (d) => {
      if (ocupado(d.eventId, d.loungeId)) return { ok: false, ocupado: true };
      const l = lounges.find((x) => x.id === d.loungeId)!;
      const r: Reserva = {
        id: `r${++seq}`, codigo: `LG-${seq}`, event_id: d.eventId, lounge_id: d.loungeId, status: "aguardando", pago: l.preco,
        nome: d.nome, cpf: d.cpf, telefone: d.telefone, txid: null, pix_copia_cola: null, expira_em: null, lembrete_em: null,
      };
      reservas.push(r);
      return { ok: true, reserva: r };
    },
    gerarPix: async (r) => {
      r.txid = `TX${r.id}`;
      r.pix_copia_cola = `000201PIX${r.id}`;
      r.expira_em = new Date(agora.getTime() + 30 * 60_000).toISOString();
      return r;
    },
    encerrarReserva: async (r, status) => {
      if (r.status !== "aguardando") return false;
      r.status = status;
      if (r.txid) cancelados.push(r.txid);
      return true;
    },
    pagamentoNoBanco: async (r) => ({ pago: !!r.txid && bancoPago.has(r.txid), endToEndId: "E2E" }),
    marcarPago: async (r) => { if (r.status !== "aguardando") return false; r.status = "confirmada"; return true; },
    marcarLembrete: async (r) => { r.lembrete_em = agora.toISOString(); },
    conversa: async (t) => {
      if (!conversas.has(t)) {
        conversas.set(t, {
          telefone: t, contact_name: null, etapa: "inicio", event_id: null, lounge_id: null, titular_nome: null, titular_cpf: null,
          reserva_id: null, pausado: false, pausado_motivo: null, pausado_em: null, atendimento_equipe: false, updated_at: agora.toISOString(),
        });
      }
      return structuredClone(conversas.get(t)!); // como no banco: cópia
    },
    conversasComEvento: async () => [...conversas.values()].filter((c) => c.event_id).map((c) => structuredClone(c)),
    salvar: async (c) => { conversas.set(c.telefone, structuredClone(c)); },
    enviar: async (tel, saidas) => { for (const s of saidas) enviados.push({ tel, s }); },
    marcarEquipe: async (_t, motivo) => { marcas.push(motivo); },
    avisarOrganizador: async (texto, tarefa) => { avisos.push({ texto, titulo: tarefa.titulo }); },
    interpretar: async () => { throw new Error("sem IA no teste"); },
  };

  const ultimas = (tel: string, n = 1) => enviados.filter((x) => x.tel === tel).slice(-n).map((x) => x.s);
  const texto = (s: Saida) => ("texto" in s ? s.texto : "legenda" in s ? s.legenda ?? "" : "");
  const msg = (tel: string, t: string) => tratarMensagem(p, tel, "Cliente", { tipo: "texto", texto: t });
  const tocar = (tel: string, id: string) => tratarMensagem(p, tel, "Cliente", { tipo: "escolha", id, texto: id });
  const enviar = (tel: string, e: Entrada) => tratarMensagem(p, tel, "Cliente", e);
  return {
    p, eventos, reservas, conversas, enviados, avisos, marcas, bancoPago, cancelados, ultimas, texto, msg, tocar, enviar,
    avancar: (min: number) => { agora = new Date(agora.getTime() + min * 60_000); },
  };
}

/** Leva um telefone até o Pix gerado (M10) no evento e1, lounge l3. */
async function ateOPix(t: ReturnType<typeof montar>, tel = "5527999990000") {
  await t.msg(tel, "Oi, boa noite!");
  await t.tocar(tel, "ev:e1");
  await t.tocar(tel, "lg:l3");
  await t.msg(tel, `Mariana Souza Lima, ${CPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`);
  await t.tocar(tel, "confirmar");
  return tel;
}

test("CPF e nome", () => {
  assert.equal(cpfValido(CPF), true);
  assert.equal(cpfValido("12345678900"), false);
  assert.equal(cpfValido("11111111111"), false);
  assert.equal(extrairNome("Mariana Souza Lima, 529.982.247-25"), "Mariana Souza Lima");
  assert.equal(extrairNome("Meu nome é João da Silva e o CPF é 52998224725"), "João da Silva");
  assert.equal(extrairNome("Mariana"), null);
});

test("M1: primeira mensagem lista os eventos (4 → lista)", async () => {
  const t = montar();
  await t.msg("551", "Oi, boa noite!");
  const [s] = t.ultimas("551");
  assert.equal(s.tipo, "lista");
  assert.match(t.texto(s), /exclusivo para compra de lounges/);
  assert.match(t.texto(s), /\*MC POZE\* · sexta, 06\/11/);
});

test("M1 com até 3 eventos vira botões", async () => {
  const t = montar({ eventos: 3 });
  await t.msg("551", "quero um lounge");
  assert.equal(t.ultimas("551")[0].tipo, "botoes");
});

test("M2: nenhum evento com lounge", async () => {
  const t = montar({ eventos: 0 });
  await t.msg("551", "Tem lounge pra semana que vem?");
  assert.match(t.texto(t.ultimas("551")[0]), /todos os lounges estão esgotados/);
});

test("Caminho feliz: M6 → M8 → M9 → M10 → banco confirma → M13 + aviso + tarefa", async () => {
  const t = montar();
  const tel = "5527999990000";
  await t.msg(tel, "Oi");
  await t.tocar(tel, "ev:e1");
  const m6 = t.ultimas(tel, 2);
  assert.equal(m6[0].tipo, "imagem");
  assert.equal(m6[1].tipo, "lista");
  assert.match(t.texto(m6[1]), /L3 · Premium\* · R\$ 1\.500 · até 6 pessoas/);
  await t.tocar(tel, "lg:l3");
  assert.match(t.texto(t.ultimas(tel)[0]), /nome completo\* e o \*CPF/);
  await t.msg(tel, "Mariana Souza Lima");
  assert.match(t.texto(t.ultimas(tel)[0]), /CPF\* do titular/);
  await t.msg(tel, "529.982.247-25");
  const m9 = t.ultimas(tel)[0];
  assert.equal(m9.tipo, "botoes");
  assert.match(t.texto(m9), /CPF \*\*\*\.982\.247-\*\*/);
  assert.match(t.texto(m9), /R\$ 1\.500,00/);
  await t.tocar(tel, "confirmar");
  const m10 = t.ultimas(tel, 3);
  assert.match(t.texto(m10[0]), /reservado por \*30 minutos\*/);
  assert.match(t.texto(m10[0]), /até as \*19h30\*/);
  assert.equal(t.texto(m10[1]), "000201PIXr1");
  assert.equal(t.reservas[0].status, "aguardando");
  assert.equal(t.reservas[0].pago, 1500);

  t.bancoPago.add("TXr1");
  t.avancar(1);
  const r = await tick(t.p);
  assert.equal(r.pagos, 1);
  assert.match(t.texto(t.ultimas(tel)[0]), /Pagamento confirmado!/);
  assert.match(t.texto(t.ultimas(tel)[0]), /LG-1/);
  assert.equal(t.avisos.length, 1);
  assert.match(t.avisos[0].titulo, /Enviar ingressos · L3 · Premium · MC POZE \(06\/11\)/);
  // Webhook chegando depois não avisa de novo.
  assert.equal(await confirmarPagamento(t.p, t.reservas[0], "E2E"), false);
  assert.equal(t.avisos.length, 1);

  // M18: volta a falar com lounge pago
  await t.msg(tel, "E os ingressos?");
  assert.match(t.texto(t.ultimas(tel)[0]), /está confirmado ✅ \(reserva \*LG-1\*\)/);
  assert.deepEqual(t.marcas, ["Cliente com lounge pago · Lounges"]);
  await t.msg(tel, "Oi?");
  assert.equal(t.marcas.length, 1, "não marca a equipe de novo");
});

test("Nome e CPF na mesma mensagem vão direto ao resumo", async () => {
  const t = montar();
  await t.msg("551", "oi");
  await t.tocar("551", "ev:e1");
  await t.tocar("551", "lg:l1");
  await t.msg("551", "Mariana Souza Lima, 529.982.247-25");
  assert.match(t.texto(t.ultimas("551")[0]), /Confere se está tudo certo/);
});

test("CPF inválido pede de novo", async () => {
  const t = montar();
  await t.msg("551", "oi");
  await t.tocar("551", "ev:e1");
  await t.tocar("551", "lg:l1");
  await t.msg("551", "Mariana Souza Lima 123.456.789-00");
  assert.match(t.texto(t.ultimas("551")[0]), /CPF não parece válido/);
});

test("M7: duas pessoas no mesmo lounge, quem confirma primeiro leva", async () => {
  const t = montar();
  // B escolhe L3 e para no resumo
  await t.msg("55B", "oi");
  await t.tocar("55B", "ev:e1");
  await t.tocar("55B", "lg:l3");
  await t.msg("55B", "Bruno Faria Costa 529.982.247-25");
  // A confirma primeiro
  await ateOPix(t, "55A");
  // B confirma depois
  await t.tocar("55B", "confirmar");
  const s = t.ultimas("55B")[0];
  assert.match(t.texto(s), /acabou de ser reservado por outra pessoa/);
  assert.equal(s.tipo, "botoes"); // sobraram L1 e L2
  assert.equal(t.reservas.length, 1);
});

test("M5: evento esgotado sugere outra data", async () => {
  const t = montar();
  await ateOPix(t, "55A"); // trava L3 no e1; e2 só tem L3... mas é outro evento
  await t.msg("55C", "oi");
  await t.tocar("55C", "ev:e2");
  await t.tocar("55C", "lg:l3");
  await t.msg("55C", "Carla Dias Rocha 529.982.247-25");
  await t.tocar("55C", "confirmar");
  // Agora e2 está esgotado
  await t.msg("55D", "oi");
  const lista = t.ultimas("55D")[0];
  assert.ok(!t.texto(lista).includes("Lagun Saturday"), "e2 some da lista");
  await t.tocar("55D", "ev:e2"); // botão antigo
  assert.match(t.texto(t.ultimas("55D")[0]), /Lagun Saturday \(07\/11\)\* esgotaram/);
});

test("M12 uma vez aos 20 min, M14 aos 30, Gerar novo Pix → M10", async () => {
  const t = montar();
  const tel = await ateOPix(t);
  t.avancar(19); await tick(t.p);
  assert.doesNotMatch(t.texto(t.ultimas(tel)[0]), /Passando para lembrar/, "ainda sem lembrete aos 19 min");
  t.avancar(1); await tick(t.p);
  assert.match(t.texto(t.ultimas(tel)[0]), /Passando para lembrar/);
  const qtd = t.enviados.length;
  t.avancar(5); await tick(t.p);
  assert.equal(t.enviados.length, qtd, "lembrete não repete");
  t.avancar(5); const r = await tick(t.p);
  assert.equal(r.expirados, 1);
  assert.match(t.texto(t.ultimas(tel)[0]), /prazo do Pix venceu/);
  assert.deepEqual(t.cancelados, ["TXr1"]);
  await t.tocar(tel, "novo_pix");
  assert.match(t.texto(t.ultimas(tel, 3)[0]), /Lounge reservado por \*30 minutos\*/);
  assert.equal(t.reservas.at(-1)!.status, "aguardando");
});

test("M11: comprovante consulta o banco", async () => {
  const t = montar();
  const tel = await ateOPix(t);
  await t.enviar(tel, { tipo: "comprovante", texto: "[document]" });
  assert.match(t.texto(t.ultimas(tel)[0]), /conferindo com o banco/);
  t.bancoPago.add("TXr1");
  await t.enviar(tel, { tipo: "comprovante", texto: "[image]" });
  assert.match(t.texto(t.ultimas(tel)[0]), /Pagamento confirmado/);
  assert.equal(t.conversas.get(tel)!.etapa, "pago");
});

test("M15 cancelar, M16 pagou por fora, M17 texto com Pix aberto", async () => {
  const t = montar();
  const tel = await ateOPix(t);
  await t.msg(tel, "Oi, ainda tá valendo?");
  assert.match(t.texto(t.ultimas(tel)[0]), /Está sim!.*reservado até as \*19h30\*/s);
  await t.tocar(tel, "pix_de_novo");
  assert.equal(t.texto(t.ultimas(tel, 2)[0]), "000201PIXr1");
  await t.msg(tel, "Fiz o pix pra chave do CNPJ, segue");
  assert.match(t.texto(t.ultimas(tel)[0]), /não foi pelo Pix desta reserva/);
  assert.deepEqual(t.marcas, ["Pagamento fora do Pix · Lounges"]);
  // Equipe conferindo: não expira sozinho
  t.avancar(40); await tick(t.p);
  assert.equal(t.reservas[0].status, "aguardando");

  const t2 = montar();
  const tel2 = await ateOPix(t2);
  await t2.tocar(tel2, "cancelar");
  assert.match(t2.texto(t2.ultimas(tel2)[0]), /reserva cancelada e lounge liberado/);
  assert.equal(t2.reservas[0].status, "cancelada");
  assert.equal((await t2.p.loungesLivres("e1")).length, 3);
});

test("M19: estorno pausa o bot e avisa o organizador", async () => {
  const t = montar();
  const tel = await ateOPix(t);
  t.bancoPago.add("TXr1");
  await tick(t.p);
  await t.msg(tel, "Não vou mais poder ir, quero o estorno");
  assert.match(t.texto(t.ultimas(tel)[0]), /pedido de estorno/);
  assert.equal(t.conversas.get(tel)!.pausado, true);
  const aviso = t.avisos.at(-1)!;
  assert.match(aviso.texto, /Pedido de estorno · Lounges/);
  assert.match(aviso.texto, /Reserva: \*LG-1\* · L3 · Premium/);
  assert.match(aviso.texto, /Pago: R\$ 1\.500,00/);
  const qtd = t.enviados.length;
  await t.msg(tel, "alô?");
  assert.equal(t.enviados.length, qtd, "bot pausado não responde");
});

test("M3 outro assunto e M4 áudio", async () => {
  const t = montar();
  await t.msg("551", "oi");
  await t.msg("551", "Quanto tá o ingresso de pista?");
  assert.match(t.texto(t.ultimas("551")[0]), /Lista e aniversários: \(27\) 99851-1988/);
  await t.enviar("551", { tipo: "midia", texto: "[audio]" });
  assert.match(t.texto(t.ultimas("551")[0]), /Não consigo ouvir áudio/);
});

test("Texto livre: 'quero o premium do MC POZE' vai direto ao M8", async () => {
  const t = montar();
  await t.msg("551", "oi");
  await t.msg("551", "quero o premium do MC POZE");
  assert.match(t.texto(t.ultimas("551")[0]), /Ótima escolha/);
  assert.equal(t.conversas.get("551")!.lounge_id, "l3");
});

test("Fim do evento: cancela Pix aberto sem mensagem e conversa recomeça no M1", async () => {
  const t = montar();
  const tel = await ateOPix(t);
  const qtd = t.enviados.length;
  t.eventos[0].ativo = false;
  t.eventos[0].aVenda = false;
  const r = await tick(t.p);
  assert.equal(r.encerrados, 1);
  assert.equal(t.enviados.length, qtd, "nada sai para o cliente");
  assert.deepEqual(t.cancelados, ["TXr1"]);
  assert.equal(t.conversas.get(tel)!.event_id, null);
  await t.msg(tel, "Oi, tem lounge?");
  assert.match(t.texto(t.ultimas(tel)[0]), /Para qual evento/);
});

test("Site: reserva trava o lounge para o WhatsApp, pago avisa o organizador sem mensagem ao cliente, vence sozinha", async () => {
  const t = montar();
  t.p.cfg.linkPainel = (ev) => `https://x/interno/lounges?evento=${ev}`;
  const c = await t.p.criarReserva({ eventId: "e1", loungeId: "l3", nome: "Ana Paula Reis", cpf: CPF, telefone: "5527988887777", pessoas: 6, origem: "site" });
  assert.ok(c.ok);
  const r = c.reserva;
  r.origem = "site";
  await t.p.gerarPix(r);
  // No WhatsApp, o L3 do e1 some da lista.
  await t.msg("551", "oi");
  await t.tocar("551", "ev:e1");
  assert.ok(!(await t.p.loungesLivres("e1")).some((l) => l.id === "l3"));
  // Banco confirma pelo cron: aviso com link do painel, nada no WhatsApp do comprador.
  t.bancoPago.add(r.txid!);
  const out = await tick(t.p);
  assert.equal(out.pagos, 1);
  assert.equal(r.status, "confirmada");
  assert.equal(t.enviados.filter((x) => x.tel === "5527988887777").length, 0);
  assert.match(t.avisos[0].texto, /pago pelo site/);
  assert.match(t.avisos[0].texto, /interno\/lounges\?evento=e1/);
  assert.equal(t.conversas.has("5527988887777"), false);
  // Outra reserva do site vence aos 30 min sem mensagem.
  const c2 = await t.p.criarReserva({ eventId: "e1", loungeId: "l1", nome: "Ana Paula Reis", cpf: CPF, telefone: "5527988887777", pessoas: 2, origem: "site" });
  assert.ok(c2.ok);
  c2.reserva.origem = "site";
  await t.p.gerarPix(c2.reserva);
  t.avancar(31);
  const out2 = await tick(t.p);
  assert.equal(out2.expirados, 1);
  assert.equal(t.enviados.filter((x) => x.tel === "5527988887777").length, 0);
});
