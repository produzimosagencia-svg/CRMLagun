import { noAppDesktop } from '@/components/interno/sessoes';

/**
 * Memória do app de computador enquanto ele está aberto.
 *
 * Dados antes da tela: cada tela guarda o último resultado que carregou e, ao
 * voltar, mostra esse resultado na hora enquanto busca o novo por baixo. Nada
 * de "—" piscando nem página nascendo vazia. Vale só dentro do app: no site a
 * tela segue carregando como sempre.
 */
const dados = new Map<string, unknown>();
const rolagem = new Map<string, number>();

export function lembrado<T>(chave: string): T | undefined {
  if (!noAppDesktop()) return undefined;
  return dados.get(chave) as T | undefined;
}

export function lembrar<T>(chave: string, valor: T) {
  if (!noAppDesktop()) return;
  dados.set(chave, valor);
}

/** Posição de rolagem de cada tela (CascaApp guarda ao sair e devolve ao voltar). */
export function guardarRolagem(caminho: string, topo: number) {
  rolagem.set(caminho, topo);
}
export function rolagemDe(caminho: string) {
  return rolagem.get(caminho) ?? 0;
}
