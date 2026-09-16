import { useState } from 'react';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import flamingoLagun from '@/assets/flamingo-solo.png';

/**
 * Primeiro acesso: a conta foi criada com a senha geral, então a pessoa
 * cadastra a própria antes de ver o painel. Troca a senha no Auth e só depois
 * desliga a obrigação (marcar_senha_definida).
 */
export function DefinirSenha({ nome, onConcluido, onSair }: { nome: string; onConcluido: () => void; onSair: () => void }) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const problema =
    senha.length > 0 && senha.length < 8 ? 'Use pelo menos 8 caracteres.'
    : confirmacao.length > 0 && senha !== confirmacao ? 'As senhas não conferem.'
    : '';
  const pronto = senha.length >= 8 && senha === confirmacao;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pronto) return;
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        // O Supabase recusa repetir a senha atual — ou seja, a senha geral.
        throw new Error(/different from the old/i.test(error.message)
          ? 'A nova senha precisa ser diferente da senha geral.'
          : error.message);
      }
      const { error: rpcError } = await (supabase as any).rpc('marcar_senha_definida');
      if (rpcError) throw rpcError;
      toast.success('Senha cadastrada. Bem-vindo(a)!');
      onConcluido();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar a senha.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="interno-noturno flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <form onSubmit={salvar} className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-2xl">
        <img src={flamingoLagun} alt="Lagun" className="mx-auto h-10 w-auto" />
        <h1 className="mt-5 text-center font-display text-xl font-semibold">Crie sua senha</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          Olá{nome ? `, ${nome}` : ''}! Você entrou com a senha geral. Cadastre uma senha só sua para continuar.
        </p>

        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Nova senha</span>
            <Input type="password" autoComplete="new-password" autoFocus value={senha}
              onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo de 8 caracteres" className="mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Confirme a senha</span>
            <Input type="password" autoComplete="new-password" value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)} placeholder="Repita a senha" className="mt-1" />
          </label>
          {problema && <p className="text-xs text-red-400">{problema}</p>}
        </div>

        <button type="submit" disabled={!pronto || salvando}
          className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#FFE14D] text-sm font-semibold text-black transition hover:bg-[#FFEC8A] disabled:opacity-50">
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
          {salvando ? 'Salvando…' : 'Salvar e entrar'}
        </button>
        <button type="button" onClick={onSair}
          className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LogOut size={12} /> Sair
        </button>
      </form>
    </div>
  );
}
