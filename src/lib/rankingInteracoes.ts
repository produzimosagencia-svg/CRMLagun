import { supabase } from '@/integrations/supabase/client';

// Ranking de interação do Instagram: quem mais comenta, manda mensagem,
// responde e menciona nos stories. O cálculo mora no banco (funções
// ranking_interacoes e interacoes_do_contato); aqui ficam os tipos e as chamadas.

export type TipoInteracao = 'comentario' | 'resposta_story' | 'mencao_story' | 'comentario_live' | 'dm';
export type Pontos = Record<TipoInteracao, number>;

/** Ordem de exibição, com o nome da coluna que o ranking devolve para cada tipo. */
export const TIPOS_INTERACAO: { tipo: TipoInteracao; rotulo: string; curto: string; coluna: keyof LinhaRanking }[] = [
  { tipo: 'comentario', rotulo: 'Comentário', curto: 'Comentários', coluna: 'comentarios' },
  { tipo: 'resposta_story', rotulo: 'Resposta a story', curto: 'Respostas a story', coluna: 'respostas_story' },
  { tipo: 'mencao_story', rotulo: 'Menção no story', curto: 'Menções no story', coluna: 'mencoes_story' },
  { tipo: 'comentario_live', rotulo: 'Comentário em live', curto: 'Comentários em live', coluna: 'comentarios_live' },
  { tipo: 'dm', rotulo: 'Mensagem direta', curto: 'Mensagens', coluna: 'dms' },
];

export const PONTOS_PADRAO: Pontos = { comentario: 1, resposta_story: 1, mencao_story: 1, comentario_live: 1, dm: 1 };

export interface LinhaRanking {
  chave: string;
  igsid: string | null;
  username: string | null;
  nome: string | null;
  avatar: string | null;
  comentarios: number;
  comentarios_live: number;
  dms: number;
  respostas_story: number;
  mencoes_story: number;
  total: number;
  pontos: number;
  ultima: string;
}

export interface InteracoesContato {
  encontrado: boolean;
  dias: number;
  posicao?: number;
  pessoas?: number;
  pontos?: number;
  total?: number;
  ultima?: string;
  tipos?: Record<TipoInteracao, number>;
  ultimas?: { tipo: TipoInteracao; quando: string; texto: string | null; midia_id: string | null }[];
}

// As funções e a tabela do ranking ainda não estão no types.ts gerado.
const db = supabase as any;

export async function carregarRanking(dias: number, limite = 200): Promise<LinhaRanking[]> {
  const { data, error } = await db.rpc('ranking_interacoes', { p_dias: dias, p_limite: limite });
  if (error) throw new Error(error.message);
  return ((data || []) as LinhaRanking[]).map((l) => ({ ...l, pontos: Number(l.pontos) }));
}

export async function carregarPontos(): Promise<Pontos> {
  const { data, error } = await db.from('ranking_interacoes_config').select('pontos').maybeSingle();
  if (error) throw new Error(error.message);
  return { ...PONTOS_PADRAO, ...(data?.pontos || {}) };
}

export async function salvarPontos(pontos: Pontos): Promise<void> {
  const { data: sessao } = await supabase.auth.getUser();
  const { data, error } = await db.from('ranking_interacoes_config')
    .update({ pontos, updated_at: new Date().toISOString(), updated_by: sessao.user?.id ?? null })
    .eq('id', true)
    .select('id');
  if (error) throw new Error(error.message);
  // Sem erro e sem linha alterada: a regra do banco barrou (só admin edita).
  if (!data?.length) throw new Error('Só administradores podem alterar a pontuação.');
}

export async function carregarInteracoesDoContato(contato: { igsid?: string | null; username?: string | null }, dias = 90): Promise<InteracoesContato> {
  const { data, error } = await db.rpc('interacoes_do_contato', {
    p_igsid: contato.igsid || null,
    p_username: contato.username || null,
    p_dias: dias,
  });
  if (error) throw new Error(error.message);
  return (data || { encontrado: false, dias }) as InteracoesContato;
}

/** O nome salvo às vezes é o próprio @ ou o ID numérico: nesses casos não serve como nome. */
export function nomeDeExibicao(nome: string | null, username: string | null): string | null {
  const limpo = (nome || '').trim();
  if (!limpo || /^\d+$/.test(limpo)) return null;
  if (username && limpo.replace(/^@/, '').toLowerCase() === username.toLowerCase()) return null;
  return limpo;
}

export function haQuanto(iso?: string | null): string {
  if (!iso) return '';
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
