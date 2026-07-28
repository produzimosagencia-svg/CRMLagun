import { useEffect, useState } from 'react';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { useSidebarSettings, SidebarKey } from '@/hooks/useSidebarSettings';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Plus, UserPlus, Settings2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const SIDEBAR_ITEMS: { key: SidebarKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'landing', label: 'Landing Page' },
  { key: 'crm', label: 'CRM' },
  { key: 'blueticket', label: 'Blueticket' },
  { key: 'prive', label: 'Privê' },
  { key: 'zig_tickets', label: 'Zig Tickets' },
  { key: 'base', label: 'Base' },
  { key: 'tarefas', label: 'Tarefas' },
  { key: 'calendario', label: 'Calendário' },
  { key: 'chat', label: 'Chat' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'ads', label: 'Ads' },
];

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string;
  username: string | null;
  roles: AppRole[];
}

// Cargos identificados por ponto de cor discreto — sem pílulas coloridas
const ROLE_LABELS: Record<string, { label: string; dot: string }> = {
  admin: { label: 'Admin', dot: 'bg-[#B4432F]' },
  partner: { label: 'Parceiro', dot: 'bg-[#8A857B]' },
  design: { label: 'Design', dot: 'bg-[#6B7FA3]' },
  trafego: { label: 'Tráfego', dot: 'bg-[#4C7A5C]' },
};

const ASSIGNABLE_ROLES: AppRole[] = ['admin', 'design', 'trafego'];

export default function InternoAdmin() {
  const { isAdmin, user: currentUser } = useAuth();
  const { isGlobalEnabled, refetch: refetchSidebarSettings } = useSidebarSettings();
  const [activeTab, setActiveTab] = useState<'usuarios' | 'configuracoes'>('usuarios');
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('design');
  const [creating, setCreating] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', username: '', password: '' });
  const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>({});
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [togglingAccessKey, setTogglingAccessKey] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    // No banco live, profiles usa `id` como referência ao usuário (não user_id) e não tem coluna email
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name, username');
    const { data: rolesData } = await supabase.from('user_roles').select('user_id, role');

    if (profilesError) toast.error('Erro ao carregar usuários: ' + profilesError.message);
    if (!profiles) { setLoading(false); return; }

    const roleMap = new Map<string, AppRole[]>();
    rolesData?.forEach((r) => {
      const existing = roleMap.get(r.user_id) || [];
      existing.push(r.role as AppRole);
      roleMap.set(r.user_id, existing);
    });

    const mapped: UserWithRoles[] = profiles.map((p) => ({
      user_id: p.id,
      email: '',
      full_name: p.full_name || '',
      username: p.username,
      roles: roleMap.get(p.id) || [],
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

  const openUser = async (u: UserWithRoles) => {
    if (expandedUser === u.user_id) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(u.user_id);
    setEditForm({ full_name: u.full_name, username: u.username || '', password: '' });
    setUserOverrides({});
    const { data } = await supabase
      .from('user_menu_overrides')
      .select('key, enabled')
      .eq('user_id', u.user_id);
    const map: Record<string, boolean> = {};
    (data || []).forEach((r) => { map[r.key] = r.enabled; });
    setUserOverrides(map);
  };

  const handleSaveUser = async (userId: string) => {
    if (!editForm.full_name.trim() || !editForm.username.trim()) {
      toast.error('Nome e username são obrigatórios');
      return;
    }
    setSavingUser(true);
    try {
      const res = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'update',
          user_id: userId,
          full_name: editForm.full_name.trim(),
          username: editForm.username.trim(),
          password: editForm.password || undefined,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Usuário atualizado!');
      setEditForm((f) => ({ ...f, password: '' }));
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar usuário');
    }
    setSavingUser(false);
  };

  const handleDeleteUser = async (u: UserWithRoles) => {
    const name = u.full_name || u.username || 'este usuário';
    const ok = await confirmDialog({
      title: 'Excluir usuário',
      description: `Excluir ${name}? O login será removido permanentemente. Essa ação não pode ser desfeita.`,
      confirmText: 'Excluir',
      destructive: true,
    });
    if (!ok) return;
    setDeletingUser(true);
    try {
      const res = await supabase.functions.invoke('manage-user', {
        body: { action: 'delete', user_id: u.user_id },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Usuário excluído');
      setExpandedUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir usuário');
    }
    setDeletingUser(false);
  };

  const handleToggleUserAccess = async (userId: string, key: SidebarKey, enabled: boolean) => {
    setTogglingAccessKey(key);
    const { error } = await supabase
      .from('user_menu_overrides')
      .upsert({ user_id: userId, key, enabled, updated_at: new Date().toISOString() });
    if (error) {
      toast.error('Erro ao salvar acesso');
    } else {
      setUserOverrides((m) => ({ ...m, [key]: enabled }));
      toast.success(enabled ? 'Acesso habilitado' : 'Acesso removido');
      // Se o admin mexeu nos próprios acessos, atualiza o sidebar na hora
      if (userId === currentUser?.id) await refetchSidebarSettings();
    }
    setTogglingAccessKey(null);
  };

  const handleToggleSidebarItem = async (key: SidebarKey, enabled: boolean) => {
    setSavingKey(key);
    const { error } = await supabase.from('sidebar_menu_settings').update({ enabled }).eq('key', key);
    if (error) {
      toast.error('Erro ao salvar configuração');
    } else {
      toast.success(enabled ? 'Item habilitado' : 'Item desabilitado');
      await refetchSidebarSettings();
    }
    setSavingKey(null);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">Administração</h1>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mt-1">Usuários e acessos do sistema</p>
        </div>
        {activeTab === 'usuarios' && (
          <Button
            onClick={() => setShowCreate(!showCreate)}
            
          >
            <UserPlus size={16} className="mr-2" /> Novo Usuário
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('usuarios')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'usuarios'
              ? 'border-brand text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Usuários
        </button>
        <button
          onClick={() => setActiveTab('configuracoes')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'configuracoes'
              ? 'border-brand text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Configurações
        </button>
      </div>

      {activeTab === 'configuracoes' && (
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Settings2 size={16} className="text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Menu Lateral</h2>
              <p className="text-xs text-muted-foreground">Escolha quais itens aparecem no menu lateral para todos os usuários.</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {SIDEBAR_ITEMS.map((item) => (
              <div key={item.key} className="px-5 py-3 flex items-center justify-between">
                <span className="text-sm text-foreground">{item.label}</span>
                <Switch
                  checked={isGlobalEnabled(item.key)}
                  disabled={savingKey === item.key}
                  onCheckedChange={(checked) => handleToggleSidebarItem(item.key, checked)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'usuarios' && (
      <>
      {/* Create user form */}
      {showCreate && (
        <div className="mb-6 p-5 rounded-md border border-border bg-card">
          <h2 className="text-sm font-semibold mb-4 text-foreground">Criar Novo Usuário</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Nome Completo</label>
              <Input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Username (login)</label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Ex: joao" />
            </div>
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Senha</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Cargo</label>
              <div className="flex gap-2">
                {ASSIGNABLE_ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setNewRole(r)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                      newRole === r
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${ROLE_LABELS[r].dot}`} />
                    {ROLE_LABELS[r].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Criando...' : 'Criar Usuário'}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Usuários do Sistema</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : (
          <div className="divide-y divide-border">
            {users.map((u) => {
              const isSelf = u.user_id === currentUser?.id;
              const expanded = expandedUser === u.user_id;
              return (
              <div key={u.user_id} className="px-5 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                        {(u.full_name || u.username || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{u.full_name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.username ? `@${u.username}` : u.email || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Cargos */}
                  <div className="flex items-center gap-1.5 flex-wrap sm:justify-end">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${ROLE_LABELS[r]?.dot || 'bg-muted-foreground'}`} />
                        {ROLE_LABELS[r]?.label || r}
                        {r !== 'partner' && (
                          <button
                            onClick={() => handleRemoveRole(u.user_id, r)}
                            className="opacity-50 hover:opacity-100 transition-opacity"
                            title="Remover cargo"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </span>
                    ))}

                    {/* Add role dropdown */}
                    {ASSIGNABLE_ROLES.filter((r) => !u.roles.includes(r)).length > 0 && (
                      <div className="relative group">
                        <button className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Adicionar cargo">
                          <Plus size={14} />
                        </button>
                        <div className="absolute right-0 top-8 bg-popover border border-border rounded-md shadow-md p-1 hidden group-hover:block z-10 min-w-[150px]">
                          {ASSIGNABLE_ROLES.filter((r) => !u.roles.includes(r)).map((r) => (
                            <button
                              key={r}
                              onClick={() => handleAddRole(u.user_id, r)}
                              className="w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent text-foreground"
                            >
                              {ROLE_LABELS[r].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ações do usuário — separadas dos cargos */}
                  <div className="flex items-center gap-1 shrink-0 sm:pl-3 sm:border-l border-border">
                    <button
                      onClick={() => openUser(u)}
                      className={`flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors ${
                        expanded
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                      title="Gerenciar usuário"
                    >
                      <Pencil size={13} />
                      Gerenciar
                      {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {!isSelf && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        disabled={deletingUser}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
                        title="Excluir usuário"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Painel de gerenciamento do usuário */}
                {expanded && (
                  <div className="mt-4 pt-4 border-t border-border space-y-5">
                    <div>
                      <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Dados do usuário</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Nome Completo</label>
                          <Input value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Username (login)</label>
                          <Input value={editForm.username} onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} />
                        </div>
                        <div>
                          <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">Nova senha</label>
                          <Input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Deixe em branco para manter" />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSaveUser(u.user_id)}
                        disabled={savingUser}
                        className="mt-3"
                      >
                        {savingUser ? 'Salvando...' : 'Salvar alterações'}
                      </Button>
                    </div>

                    <div>
                      <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Acessos do menu</p>
                      <p className="text-xs text-muted-foreground mb-3">Desligue os itens que este usuário não deve ver no menu lateral.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1.5">
                        {SIDEBAR_ITEMS.map((item) => (
                          <div key={item.key} className="flex items-center justify-between py-1">
                            <span className="text-sm text-foreground">{item.label}</span>
                            <Switch
                              checked={userOverrides[item.key] !== false}
                              disabled={togglingAccessKey === item.key}
                              onCheckedChange={(checked) => handleToggleUserAccess(u.user_id, item.key as SidebarKey, checked)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
