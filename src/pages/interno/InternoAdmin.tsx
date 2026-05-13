import { useEffect, useState } from 'react';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Trash2, Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string;
  username: string | null;
  roles: AppRole[];
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  partner: { label: 'Parceiro', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  design: { label: 'Design', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  trafego: { label: 'Gestor de Tráfego', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

const ASSIGNABLE_ROLES: AppRole[] = ['admin', 'design', 'trafego'];

export default function InternoAdmin() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('design');
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('user_id, email, full_name, username');
    const { data: rolesData } = await supabase.from('user_roles').select('user_id, role');

    if (!profiles) { setLoading(false); return; }

    // Build role map - need admin access to see all profiles
    // Since RLS only allows viewing own profile, we use a workaround
    const roleMap = new Map<string, AppRole[]>();
    rolesData?.forEach((r) => {
      const existing = roleMap.get(r.user_id) || [];
      existing.push(r.role as AppRole);
      roleMap.set(r.user_id, existing);
    });

    const mapped: UserWithRoles[] = profiles.map((p) => ({
      user_id: p.user_id,
      email: p.email || '',
      full_name: p.full_name || '',
      username: p.username,
      roles: roleMap.get(p.user_id) || [],
    }));

    setUsers(mapped.filter((u) => u.roles.length > 0));
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async () => {
    if (!newUsername || !newPassword || !newFullName) {
      toast.error('Preencha todos os campos');
      return;
    }
    setCreating(true);
    try {
      const res = await supabase.functions.invoke('create-partner', {
        body: {
          email: `${newUsername}@triade.internal`,
          password: newPassword,
          full_name: newFullName,
          username: newUsername,
          role: newRole,
        },
      });
      if (res.error) throw res.error;
      toast.success('Usuário criado com sucesso!');
      setShowCreate(false);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setNewRole('design');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar usuário');
    }
    setCreating(false);
  };

  const handleAddRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role });
    if (error) {
      toast.error('Erro ao adicionar cargo');
      return;
    }
    toast.success('Cargo adicionado');
    fetchUsers();
  };

  const handleRemoveRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role as any);
    if (error) {
      toast.error('Erro ao remover cargo');
      return;
    }
    toast.success('Cargo removido');
    fetchUsers();
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Administração</h1>
        </div>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
        >
          <UserPlus size={16} className="mr-2" /> Novo Usuário
        </Button>
      </div>

      {/* Create user form */}
      {showCreate && (
        <div className="mb-6 p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Criar Novo Usuário</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Nome Completo</label>
              <Input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Username (login)</label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Ex: joao" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Senha</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Cargo</label>
              <div className="flex gap-2">
                {ASSIGNABLE_ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setNewRole(r)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      newRole === r
                        ? ROLE_LABELS[r].color + ' ring-2 ring-offset-1 ring-current'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}
                  >
                    {ROLE_LABELS[r].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating} className="bg-green-600 hover:bg-green-700 text-white">
              {creating ? 'Criando...' : 'Criar Usuário'}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Usuários do Sistema</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {users.map((u) => (
              <div key={u.user_id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs font-bold shrink-0">
                      {(u.full_name || u.username || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.full_name || 'Sem nome'}</p>
                      <p className="text-xs text-gray-400">{u.username ? `@${u.username}` : u.email}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {u.roles.map((r) => (
                    <span
                      key={r}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${ROLE_LABELS[r]?.color || 'bg-gray-100 text-gray-600'}`}
                    >
                      {ROLE_LABELS[r]?.label || r}
                      {r !== 'partner' && (
                        <button
                          onClick={() => handleRemoveRole(u.user_id, r)}
                          className="ml-1 hover:opacity-70"
                          title="Remover cargo"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  ))}

                  {/* Add role dropdown */}
                  {ASSIGNABLE_ROLES.filter((r) => !u.roles.includes(r)).length > 0 && (
                    <div className="relative group">
                      <button className="h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <Plus size={14} />
                      </button>
                      <div className="absolute right-0 top-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-1 hidden group-hover:block z-10 min-w-[150px]">
                        {ASSIGNABLE_ROLES.filter((r) => !u.roles.includes(r)).map((r) => (
                          <button
                            key={r}
                            onClick={() => handleAddRole(u.user_id, r)}
                            className="w-full text-left px-3 py-1.5 text-xs rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                          >
                            {ROLE_LABELS[r].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
