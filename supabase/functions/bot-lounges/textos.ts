// Mensagens do Bot de Lounges, na ordem do roteiro v2 (M1 a M19a).
// Fonte: cofre/clientes/lagun/bot-lounges/roteiro-bot-lounges.html
// Sem dependências: roda no Deno (Edge Function) e no Node (testes).

export type Evento = { id: string; nome: string; data: string /* AAAA-MM-DD */ };
export type Lounge = {
  id: string; codigo: string | null; nome: string; categoria: string | null;
  capacidade: number; minimo: number; inclui: string[]; preco: number;
};
export type Linha = { id: string; titulo: string; descricao?: string };
export type Saida =
  | { tipo: "texto"; texto: string }
  | { tipo: "botoes"; texto: string; botoes: Linha[] }
  | { tipo: "lista"; texto: string; botao: string; linhas: Linha[] }
  | { tipo: "imagem"; url: string; legenda?: string };

export const ID = {
  evento: (id: string) => `ev:${id}`,
  lounge: (id: string) => `lg:${id}`,
  eventos: "eventos",
  confirmar: "confirmar",
  trocarLounge: "trocar_lounge",
  cancelar: "cancelar",
  pixDeNovo: "pix_de_novo",
  novoPix: "novo_pix",
  outrosLounges: "outros_lounges",
  outroLounge: "outro_lounge",
};

const TZ = "America/Sao_Paulo";
const CABECALHO = "Oi! Aqui é o atendimento de *Lounges da Lagun* 🦩";

// ------------------------------------------------------------------ formatos
export function diaSemana(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" }).format(d).replace("-feira", "");
}
export function dataCurta(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const quandoEvento = (e: Evento) => `${diaSemana(e.data)}, ${dataCurta(e.data)}`;

export function reais(v: number, centavos = false): string {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 });
}
export function hora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = p.find((x) => x.type === "hour")?.value ?? "00";
  const m = p.find((x) => x.type === "minute")?.value ?? "00";
  return `${h}h${m}`;
}
export function cpfMascarado(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
const pessoas = (l: Lounge) => `até ${l.capacidade} ${l.capacidade === 1 ? "pessoa" : "pessoas"}`;
const linhaLounge = (l: Lounge) => `• *${l.nome}* · ${reais(l.preco)} · ${pessoas(l)}`;
const tituloLounge = (l: Lounge) => `${l.nome} · ${reais(l.preco)}`;
const descLounge = (l: Lounge) => [pessoas(l), ...(l.inclui ?? [])].join(" · ");

// ------------------------------------------------------------------ eventos
/** Lista ou botões de eventos (até 3 viram botões direto). */
function escolhaDeEventos(texto: string, eventos: Evento[], botao: string): Saida {
  if (eventos.length <= 3) {
    return { tipo: "botoes", texto, botoes: eventos.map((e) => ({ id: ID.evento(e.id), titulo: e.nome })) };
  }
  return {
    tipo: "lista", texto, botao,
    linhas: eventos.slice(0, 10).map((e) => ({ id: ID.evento(e.id), titulo: e.nome, descricao: maiuscula(quandoEvento(e)) })),
  };
}

/** M1 · Boas-vindas e eventos. */
export function m1(eventos: Evento[]): Saida[] {
  const itens = eventos.map((e) => `• *${e.nome}* · ${quandoEvento(e)}`).join("\n");
  const fim = eventos.length <= 3 ? "Toque no evento 👇" : "Toque em *Escolher evento* 👇";
  const texto = `${CABECALHO}\n\nEste canal é *exclusivo para compra de lounges*. Para qual evento você quer o seu?\n\n${itens}\n\n${fim}`;
  return [escolhaDeEventos(texto, eventos, "Escolher evento")];
}

/** M2 · Nenhum evento com lounge disponível. */
export function m2(): Saida[] {
  return [{
    tipo: "texto",
    texto: `${CABECALHO}\n\nNo momento *todos os lounges estão esgotados* 😕\n\nAssim que abrirmos as próximas datas, é por aqui que você garante o seu.`,
  }];
}

/** M3 · Outro assunto. */
export function m3(site: string, telefoneLista: string): Saida[] {
  return [{
    tipo: "botoes",
    texto: `Por aqui eu cuido só de *lounges* 😉\n\nIngressos: ${site}\nLista e aniversários: ${telefoneBonito(telefoneLista)}\n\nSe quiser um lounge, é só escolher o evento:`,
    botoes: [{ id: ID.eventos, titulo: "Ver eventos" }],
  }];
}

/** M4 · Áudio, foto ou figurinha. */
export function m4(): Saida[] {
  return [{
    tipo: "botoes",
    texto: "Não consigo ouvir áudio nem ver imagem por aqui 🙏 Me escreve em texto ou escolhe o evento na lista:",
    botoes: [{ id: ID.eventos, titulo: "Ver eventos" }],
  }];
}

/** M5 · Evento escolhido sem lounge livre. `outros` = eventos que ainda têm lounge. */
export function m5(evento: Evento, outros: Evento[]): Saida[] {
  const cab = `Os lounges do *${evento.nome} (${dataCurta(evento.data)})* esgotaram 😕`;
  if (!outros.length) return [{ tipo: "texto", texto: `${cab}\n\nNo momento não tem lounge em outra data. Assim que abrirmos as próximas, é por aqui que você garante o seu.` }];
  return [escolhaDeEventos(`${cab}\n\nQuer ver outra data?`, outros, "Ver eventos")];
}

// ------------------------------------------------------------------ lounges
/** Escolha de lounge: até 2 livres viram botões (+ Trocar evento); mais que isso, lista. */
function escolhaDeLounges(texto: string, livres: Lounge[]): Saida {
  if (livres.length <= 2) {
    return {
      tipo: "botoes", texto,
      // Botão aceita só 20 caracteres: "L3 · R$ 1.500".
      botoes: [...livres.map((l) => ({ id: ID.lounge(l.id), titulo: `${l.codigo ?? l.nome} · ${reais(l.preco)}` })), { id: ID.eventos, titulo: "Trocar evento" }],
    };
  }
  return {
    tipo: "lista", texto, botao: "Escolher lounge",
    linhas: [
      ...livres.slice(0, 9).map((l) => ({ id: ID.lounge(l.id), titulo: tituloLounge(l), descricao: descLounge(l) })),
      { id: ID.eventos, titulo: "Trocar evento" },
    ],
  };
}

/** M6 · Mapa e lounges livres. */
export function m6(evento: Evento, livres: Lounge[], mapaUrl: string | null, comMapa = true): Saida[] {
  const fim = livres.length <= 2 ? "Toque no lounge 👇" : "Toque em *Escolher lounge* 👇";
  const texto = `*${evento.nome} · ${maiuscula(quandoEvento(evento))}*\n\nLounges disponíveis:\n\n${livres.map(linhaLounge).join("\n")}\n\n${fim}`;
  const saidas: Saida[] = [];
  if (comMapa && mapaUrl) saidas.push({ tipo: "imagem", url: mapaUrl, legenda: `Mapa de lounges · ${evento.nome}` });
  saidas.push(escolhaDeLounges(texto, livres));
  return saidas;
}

/** M7 · O lounge saiu enquanto a pessoa escolhia. */
export function m7(lounge: Lounge, livres: Lounge[]): Saida[] {
  const texto = `Poxa, o *${lounge.nome}* acabou de ser reservado por outra pessoa 😕\n\nAinda livre:\n${livres.map(linhaLounge).join("\n")}`;
  return [escolhaDeLounges(texto, livres)];
}

/** M8 · Dados do titular. */
export function m8(): Saida[] {
  return [{ tipo: "texto", texto: "Ótima escolha! 🦩\n\nPara reservar, me manda o *nome completo* e o *CPF* do titular do lounge." }];
}
export function m8CpfInvalido(): Saida[] {
  return [{ tipo: "texto", texto: "Esse CPF não parece válido 🤔 Confere e me manda de novo, só os números já resolvem." }];
}
export function m8FaltaNome(): Saida[] {
  return [{ tipo: "texto", texto: "Agora me manda o *nome completo* do titular, por favor." }];
}
export function m8FaltaCpf(): Saida[] {
  return [{ tipo: "texto", texto: "Agora me manda o *CPF* do titular, por favor." }];
}

/** M9 · Resumo para confirmar. */
export function m9(evento: Evento, lounge: Lounge, nome: string, cpf: string, minutos: number): Saida[] {
  return [{
    tipo: "botoes",
    texto: `Confere se está tudo certo:\n\n🗓 *${evento.nome} · ${dataCurta(evento.data)}*\n🛋 *${lounge.nome}* · ${pessoas(lounge)}\n👤 ${nome} · CPF ${cpfMascarado(cpf)}\n💰 *${reais(lounge.preco, true)}*\n\nAo confirmar, o lounge fica reservado para você por *${minutos} minutos* enquanto você faz o Pix.`,
    botoes: [{ id: ID.confirmar, titulo: "Confirmar e pagar" }, { id: ID.trocarLounge, titulo: "Trocar lounge" }],
  }];
}

// ------------------------------------------------------------------ pagamento
/** M10 · Pix de 30 minutos (três mensagens: aviso, copia e cola, recado). */
export function m10(valor: number, expiraEm: string, copiaCola: string, minutos: number): Saida[] {
  return [
    { tipo: "texto", texto: `Lounge reservado por *${minutos} minutos* ⏳\n\nPague *${reais(valor, true)}* no Pix até as *${hora(expiraEm)}*.\n\nCopia e cola na próxima mensagem 👇` },
    { tipo: "texto", texto: copiaCola },
    { tipo: "texto", texto: "Assim que o pagamento cair, eu te aviso por aqui. Não precisa mandar comprovante." },
  ];
}
export function erroPix(): Saida[] {
  return [{
    tipo: "botoes",
    texto: "Tive um problema para gerar o Pix agora 😕 Tenta de novo em instantes, o lounge ainda não foi travado.",
    botoes: [{ id: ID.confirmar, titulo: "Tentar de novo" }, { id: ID.trocarLounge, titulo: "Trocar lounge" }],
  }];
}

/** M11 · Comprovante recebido antes do banco avisar. */
export function m11(): Saida[] {
  return [{ tipo: "texto", texto: "Recebi! Estou conferindo com o banco, leva só alguns instantes ⏳" }];
}

/** M12 · Lembrete aos 20 minutos. */
export function m12(lounge: Lounge, expiraEm: string): Saida[] {
  return [{
    tipo: "botoes",
    texto: `Passando para lembrar: seu *${lounge.nome}* está reservado só até as *${hora(expiraEm)}* ⏳\n\nO Pix copia e cola está logo acima.`,
    botoes: [{ id: ID.cancelar, titulo: "Cancelar reserva" }],
  }];
}

/** M13 · Pagamento confirmado pelo banco. */
export function m13(evento: Evento, lounge: Lounge, codigo: string): Saida[] {
  return [{
    tipo: "texto",
    texto: `✅ *Pagamento confirmado!*\n\nSeu *${lounge.nome}* no *${evento.nome} (${dataCurta(evento.data)})* está reservado.\n\nCódigo da reserva: *${codigo}*\n\nEm breve nossa equipe envia os seus ingressos por aqui. Até ${diaSemana(evento.data)}! 🦩`,
  }];
}

/** M14 · Prazo do Pix venceu. */
export function m14(lounge: Lounge): Saida[] {
  return [{
    tipo: "botoes",
    texto: `O prazo do Pix venceu e o *${lounge.nome}* foi liberado.\n\nSe ainda quiser, posso gerar um novo Pix agora:`,
    botoes: [{ id: ID.novoPix, titulo: "Gerar novo Pix" }, { id: ID.outrosLounges, titulo: "Ver outros lounges" }],
  }];
}

/** M15 · Cancelado antes de pagar. */
export function m15(): Saida[] {
  return [{ tipo: "texto", texto: "Pronto, reserva cancelada e lounge liberado. Se mudar de ideia, é só chamar 🦩" }];
}

/** M16 · Pagou fora do Pix gerado. */
export function m16(): Saida[] {
  return [{
    tipo: "texto",
    texto: "Recebi! Como o pagamento não foi pelo Pix desta reserva, nossa equipe vai conferir e te responde aqui em breve 🙏\n\nSeu lounge continua reservado enquanto isso.",
  }];
}

/** M17 · Voltou a falar com Pix aberto. */
export function m17(lounge: Lounge, expiraEm: string): Saida[] {
  return [{
    tipo: "botoes",
    texto: `Está sim! Seu *${lounge.nome}* está reservado até as *${hora(expiraEm)}* ⏳\n\nO Pix copia e cola está logo acima. Precisa que eu mande de novo?`,
    botoes: [{ id: ID.pixDeNovo, titulo: "Mandar o Pix de novo" }, { id: ID.cancelar, titulo: "Cancelar reserva" }],
  }];
}

/** M18 · Voltou a falar com lounge já pago. */
export function m18(evento: Evento, lounge: Lounge, codigo: string): Saida[] {
  return [{
    tipo: "botoes",
    texto: `Seu *${lounge.nome}* no *${evento.nome} (${dataCurta(evento.data)})* está confirmado ✅ (reserva *${codigo}*).\n\nAvisei a equipe e eles te respondem por aqui em breve.`,
    botoes: [{ id: ID.outroLounge, titulo: "Quero outro lounge" }],
  }];
}

/** M19 · Pedido de estorno: bot pausa. */
export function m19(): Saida[] {
  return [{ tipo: "texto", texto: "Entendi. Já passei o seu pedido de estorno para a nossa equipe, que vai falar com você por aqui em breve 🙏" }];
}

// ------------------------------------------------------------------ equipe
export function telefoneBonito(t: string): string {
  const d = t.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export type ResumoReserva = {
  nome: string; telefone: string; codigo: string | null; lounge: string | null; evento: Evento | null; valor: number | null;
};
const linhaEvento = (e: Evento | null) => (e ? `${e.nome} (${dataCurta(e.data)})` : "—");

/** M19a · Aviso de estorno para o organizador. */
export function m19a(r: ResumoReserva, link: string): string {
  return [
    "⚠️ *Pedido de estorno · Lounges*", "",
    `Cliente: ${r.nome}`,
    `WhatsApp: ${telefoneBonito(r.telefone)}`,
    r.codigo ? `Reserva: *${r.codigo}* · ${r.lounge ?? ""}` : "Reserva: nenhuma paga nesta conversa",
    `Evento: ${linhaEvento(r.evento)}`,
    r.valor != null ? `Pago: ${reais(r.valor, true)}` : null,
    "", "O bot parou de responder essa pessoa.",
    `Abrir conversa: ${link}`,
  ].filter((x) => x !== null).join("\n");
}

/** Aviso de lounge pago para o organizador (ponto 4). */
export function avisoPago(r: ResumoReserva, link: string, canal: "whatsapp" | "site" = "whatsapp"): string {
  return [
    canal === "site" ? "✅ *Lounge pago pelo site · enviar ingressos*" : "✅ *Lounge pago · enviar ingressos*", "",
    `Cliente: ${r.nome}`,
    `WhatsApp: ${telefoneBonito(r.telefone)}`,
    `Reserva: *${r.codigo}* · ${r.lounge ?? ""}`,
    `Evento: ${linhaEvento(r.evento)}`,
    `Pago: ${r.valor != null ? reais(r.valor, true) : "—"}`, "",
    canal === "site" ? `Ver no painel: ${link}` : `Abrir conversa: ${link}`,
  ].join("\n");
}
