/**
 * Automações do Instagram (estilo ManyChat) — modelo do editor + compilação
 * para as colunas do motor (tabela ig_automations, executada pelo
 * instagram-webhook e ig-queue-worker). Portado do Produzimos/BoomRAP.
 */
export type TriggerType = 'comment_feed' | 'comment_live' | 'dm' | 'story_reply' | 'story_mention';
export type MatchType = 'contains' | 'exact' | 'any';
export type Trigger = { types: TriggerType[]; keywords: string[]; match: MatchType; media_id?: string | null; once_per_24h?: boolean };
export type NodeButton = { label: string; url?: string };
export type FlowNode =
  | { id: string; type: 'dm'; text: string; buttons?: NodeButton[] }
  | { id: string; type: 'public_reply'; variants: string[] }
  | { id: string; type: 'link'; text: string; label: string; url: string; track?: boolean }
  | { id: string; type: 'delay'; minutes: number }
  | { id: string; type: 'reminder'; minutes: number; text: string }
  | { id: string; type: 'ask'; question: string; save_as: 'whatsapp' | 'email' | 'name' | 'custom'; confirm?: string }
  | { id: string; type: 'condition'; check: 'follows_you' | 'is_customer' | 'has_whatsapp'; yes_text?: string; no_text?: string; button_label?: string }
  | { id: string; type: 'tag'; tag: string };
export type Objective = 'seguidores' | 'engajamento' | 'trafego' | 'leads' | 'vendas';
export type Definition = { trigger: Trigger; nodes: FlowNode[]; objective?: Objective };
export type AutomationStatus = 'draft' | 'active' | 'paused';

/** Linha da tabela ig_automations (colunas do motor + definição do editor). */
export type Automation = {
  id: string; name: string; description?: string | null; status: AutomationStatus; active: boolean;
  template_key?: string | null; definition: Definition; media_id?: string | null; keywords: string[];
  created_at: string; updated_at: string;
};

export type Stat = { triggers: number; public_replies: number; dms: number; failed: number; links: number; clicks: number; clicked_people: number };

export const TRIGGER_LABELS: Record<TriggerType, string> = { comment_feed: 'Comentário no Feed', comment_live: 'Comentário em Live', dm: 'Mensagem Recebida', story_reply: 'Resposta ao Story', story_mention: 'Menção no Story' };
export const OBJECTIVE_LABELS: Record<Objective, string> = { seguidores: 'Aumentar seguidores', engajamento: 'Engajar o público', trafego: 'Direcionar tráfego', leads: 'Capturar leads', vendas: 'Vender ingressos' };
export const NODE_LABELS: Record<FlowNode['type'], string> = { dm: 'Enviar DM', public_reply: 'Resposta pública', link: 'DM com link', delay: 'Aguardar', reminder: 'Lembrete', ask: 'Pedir informação', condition: 'Condição', tag: 'Adicionar etiqueta' };
export const uid = () => Math.random().toString(36).slice(2, 9);
export const emptyDefinition = (): Definition => ({ trigger: { types: ['comment_feed'], keywords: [], match: 'contains', media_id: null, once_per_24h: false }, nodes: [{ id: uid(), type: 'dm', text: '' }] });

export type Template = { key: string; name: string; description: string; objective: Objective; triggers: TriggerType[]; keywords?: string[]; popular?: boolean; build: () => Definition };
const t = (types: TriggerType[], keywords: string[], nodes: FlowNode[], match: MatchType = 'contains'): Definition => ({ trigger: { types, keywords, match, media_id: null, once_per_24h: false }, nodes });
export const TEMPLATES: Template[] = [
  { key: 'link-dm', name: 'Envie o link por DM', description: 'Quem comentar a palavra-chave recebe o link no direct.', objective: 'trafego', triggers: ['comment_feed'], keywords: ['link', 'quero'], popular: true, build: () => t(['comment_feed'], ['link', 'quero'], [{ id: uid(), type: 'public_reply', variants: ['Te mandei no direct! 🦩', 'Olha o direct 👀'] }, { id: uid(), type: 'link', text: 'Oi! Aqui está o link que você pediu 👇', label: 'Abrir link', url: 'https://' }]) },
  { key: 'venda-reels', name: 'Venda pelos comentários de Reels', description: 'Um reel gerando conversa? Leve para o direct com o link do lote.', objective: 'vendas', triggers: ['comment_feed'], keywords: ['quero', 'preço', 'valor', 'ingresso'], popular: true, build: () => t(['comment_feed'], ['quero', 'preço', 'valor', 'ingresso'], [{ id: uid(), type: 'public_reply', variants: ['Mandei no direct 🎟️', 'Olha o direct 🦩'] }, { id: uid(), type: 'link', text: 'O lote atual está aqui. Garante o seu 👇', label: 'Comprar ingresso', url: 'https://' }, { id: uid(), type: 'reminder', minutes: 120, text: 'Ainda dá tempo! O lote vira em breve 🔥' }]) },
  { key: 'responder-dms', name: 'Responda todas as DMs', description: 'Resposta imediata para qualquer mensagem recebida.', objective: 'engajamento', triggers: ['dm'], popular: true, build: () => t(['dm'], [], [{ id: uid(), type: 'dm', text: 'Oi! Recebemos sua mensagem e já vamos te responder. Os ingressos estão no link da bio 🎟️' }], 'any') },
  { key: 'presenca', name: 'Comentários viram presença confirmada', description: '“Comente para participar” vira confirmação automática.', objective: 'engajamento', triggers: ['comment_feed'], keywords: ['eu vou', 'confirmado'], build: () => t(['comment_feed'], ['eu vou', 'confirmado'], [{ id: uid(), type: 'public_reply', variants: ['Presença confirmada! ✅'] }, { id: uid(), type: 'dm', text: 'Anotado! Te espero lá 🎉 Qualquer dúvida é só chamar.' }, { id: uid(), type: 'tag', tag: 'presenca-confirmada' }]) },
  { key: 'grupo-whatsapp', name: 'Convide para o grupo do WhatsApp', description: 'Envia o link do grupo para quem pedir.', objective: 'engajamento', triggers: ['comment_feed', 'story_reply'], keywords: ['grupo'], build: () => t(['comment_feed', 'story_reply'], ['grupo'], [{ id: uid(), type: 'link', text: 'Bora pro grupo! Lá saem as novidades primeiro 👇', label: 'Entrar no grupo', url: 'https://chat.whatsapp.com/' }]) },
  { key: 'ig-para-whatsapp', name: 'Leve o Instagram para o WhatsApp', description: 'Encaminha quem quer falar direto no WhatsApp.', objective: 'leads', triggers: ['dm', 'comment_feed'], keywords: ['whatsapp', 'zap'], build: () => t(['dm', 'comment_feed'], ['whatsapp', 'zap'], [{ id: uid(), type: 'link', text: 'Fala com a gente direto no WhatsApp 👇', label: 'Abrir WhatsApp', url: 'https://wa.me/5527997789988' }]) },
  { key: 'me-segue', name: 'Só entrega se seguir', description: 'Entrega o link apenas para quem segue a conta.', objective: 'seguidores', triggers: ['comment_feed'], keywords: ['eu'], build: () => t(['comment_feed'], ['eu'], [{ id: uid(), type: 'public_reply', variants: ['Te chamei no direct 👀'] }, { id: uid(), type: 'condition', check: 'follows_you', no_text: 'Segue a gente primeiro que eu te mando na hora 😉 Depois toca no botão.', button_label: 'Já sigo ✅' }, { id: uid(), type: 'link', text: 'Prontinho:', label: 'Abrir', url: 'https://', track: true }]) },
  { key: 'faq-stories', name: 'Perguntas frequentes', description: 'Responde horário, lounge, estacionamento e mais sem esforço.', objective: 'engajamento', triggers: ['story_reply', 'dm'], keywords: ['horário', 'lounge', 'mesa', 'estacionamento'], build: () => t(['story_reply', 'dm'], ['horário', 'lounge', 'mesa', 'estacionamento'], [{ id: uid(), type: 'dm', text: 'Sextas e sábados a partir das 23h, na Praia do Canto. Lounge e mesas pelo WhatsApp (27) 99778-9988. Ingressos no link da bio 🎟️' }]) },
  { key: 'cupom-stories', name: 'Cupom secreto nos stories', description: 'Quem responde o story ganha um cupom via DM.', objective: 'vendas', triggers: ['story_reply'], keywords: ['cupom'], build: () => t(['story_reply'], ['cupom'], [{ id: uid(), type: 'dm', text: 'Segredo entre a gente: use STORY15 e ganhe 15% 🤫' }, { id: uid(), type: 'link', text: 'Garante com desconto aqui 👇', label: 'Usar cupom', url: 'https://' }]) },
  { key: 'lembrete-lote', name: 'Lembrete de virada de lote', description: 'Quem pediu o link recebe um lembrete antes do lote virar.', objective: 'vendas', triggers: ['comment_feed', 'dm'], keywords: ['lote'], build: () => t(['comment_feed', 'dm'], ['lote'], [{ id: uid(), type: 'link', text: 'O lote atual está aqui 👇', label: 'Comprar agora', url: 'https://' }, { id: uid(), type: 'reminder', minutes: 1440, text: 'Lembrete: o lote vira amanhã! 🔥' }]) },
  { key: 'boas-vindas', name: 'Boas-vindas', description: 'Primeira interação de um perfil recebe uma mensagem de boas-vindas.', objective: 'engajamento', triggers: ['story_mention', 'story_reply', 'comment_feed'], build: () => t(['story_mention', 'story_reply', 'comment_feed'], [], [{ id: uid(), type: 'dm', text: 'Bem-vindo(a) à Lagun! 🦩 Aqui você fica sabendo de tudo primeiro.' }, { id: uid(), type: 'tag', tag: 'novo-contato' }], 'any') },
];

/** Compila a definição do editor nas colunas do motor. Devolve o que o motor ainda não executa. */
export function compileForEngine(a: { name: string; status: AutomationStatus; definition: Definition }) {
  const d = a.definition; const nodes = d.nodes; const unsupported: string[] = [];
  const dm = nodes.find((n) => n.type === 'dm') as Extract<FlowNode, { type: 'dm' }> | undefined;
  const reply = nodes.find((n) => n.type === 'public_reply') as Extract<FlowNode, { type: 'public_reply' }> | undefined;
  const link = nodes.find((n) => n.type === 'link') as Extract<FlowNode, { type: 'link' }> | undefined;
  const reminder = nodes.find((n) => n.type === 'reminder') as Extract<FlowNode, { type: 'reminder' }> | undefined;
  const ask = nodes.find((n) => n.type === 'ask') as Extract<FlowNode, { type: 'ask' }> | undefined;
  const condition = nodes.find((n) => n.type === 'condition') as Extract<FlowNode, { type: 'condition' }> | undefined;
  const followGate = condition?.check === 'follows_you' ? condition : undefined;
  for (const n of nodes) if ((n.type === 'condition' && n.check !== 'follows_you') || ['tag', 'delay', 'ask'].includes(n.type)) unsupported.push(NODE_LABELS[n.type]);
  const welcome = dm?.text || ask?.question || (condition && !followGate ? condition.yes_text : null) || null;
  return {
    payload: {
      name: a.name, status: a.status, active: a.status === 'active',
      trigger_comment: d.trigger.types.some((x) => x === 'comment_feed' || x === 'comment_live'),
      trigger_story: d.trigger.types.some((x) => x === 'story_reply' || x === 'story_mention'),
      trigger_dm: d.trigger.types.includes('dm'),
      keywords: d.trigger.keywords, match_type: d.trigger.match, media_id: d.trigger.media_id || null,
      public_replies: reply?.variants.filter(Boolean) || [],
      welcome_message: welcome, quick_reply_text: dm?.buttons?.[0]?.label || (link ? (link.label || 'Quero o link') : null),
      link_message: link?.text || null, link_button_label: link?.label || null, link_url: link?.url || null,
      reminder_message: reminder?.text || null, reminder_delay_minutes: reminder?.minutes || 0,
      require_follow: Boolean(followGate), follow_prompt_message: followGate?.no_text || null, follow_prompt_button_label: followGate?.button_label || null,
      track_links: link ? link.track !== false : true,
      definition: d,
    },
    unsupported,
  };
}

/** Reconstrói uma definição a partir das colunas do motor (linhas sem definition). */
export function fromEngine(row: any): Definition {
  const types: TriggerType[] = []; if (row.trigger_comment) types.push('comment_feed'); if (row.trigger_dm) types.push('dm'); if (row.trigger_story) types.push('story_reply', 'story_mention');
  const nodes: FlowNode[] = [];
  if (row.public_replies?.length) nodes.push({ id: uid(), type: 'public_reply', variants: row.public_replies });
  if (row.welcome_message) nodes.push({ id: uid(), type: 'dm', text: row.welcome_message, buttons: row.quick_reply_text ? [{ label: row.quick_reply_text }] : undefined });
  if (row.require_follow) nodes.push({ id: uid(), type: 'condition', check: 'follows_you', no_text: row.follow_prompt_message || '', button_label: row.follow_prompt_button_label || '' });
  if (row.link_url) nodes.push({ id: uid(), type: 'link', text: row.link_message || '', label: row.link_button_label || 'Abrir', url: row.link_url, track: row.track_links !== false });
  if (row.reminder_message) nodes.push({ id: uid(), type: 'reminder', minutes: row.reminder_delay_minutes || 60, text: row.reminder_message });
  return { trigger: { types: types.length ? types : ['comment_feed'], keywords: row.keywords || [], match: row.match_type || 'contains', media_id: row.media_id || null, once_per_24h: false }, nodes: nodes.length ? nodes : [{ id: uid(), type: 'dm', text: '' }] };
}

export const fmtNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
export const fmtDateTime = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
