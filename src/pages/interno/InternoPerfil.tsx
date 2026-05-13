import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Save, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function InternoPerfil() {
  const { user, roles } = useAuth();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [squad, setSquad] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name, avatar_url, squad')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setFullName(data.full_name ?? '');
          setAvatarUrl(data.avatar_url ?? null);
          setSquad(data.squad ?? null);
        }
        setLoading(false);
      });
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('event-avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error('Erro ao enviar foto');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('event-avatars')
      .getPublicUrl(path);

    const url = urlData.publicUrl + '?t=' + Date.now();
    setAvatarUrl(url);

    await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('user_id', user.id);

    setUploading(false);
    toast.success('Foto atualizada!');
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('user_id', user.id);

    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar');
    } else {
      toast.success('Perfil atualizado!');
    }
  };

  const roleLabel = (r: string) => {
    const map: Record<string, string> = {
      admin: 'Admin',
      partner: 'Produtor',
      design: 'Design',
      trafego: 'Gestor de Tráfego',
    };
    return map[r] || r;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Meu Perfil</h1>

      {/* Avatar */}
      <Card>
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          <div className="relative group">
            <Avatar className="h-24 w-24 text-2xl">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-2xl font-bold">
                {fullName.charAt(0).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera size={20} className="text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          {uploading && <span className="text-xs text-muted-foreground">Enviando...</span>}
        </CardContent>
      </Card>

      {/* Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Nome completo</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">E-mail</label>
            <Input value={user?.email ?? ''} disabled className="opacity-60" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save size={16} className="mr-2" />
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </CardContent>
      </Card>

      {/* Squad & Roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield size={16} /> Squad & Cargo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Squad</label>
            <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {squad || 'Nenhum squad atribuído'}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Cargos</label>
            <div className="flex flex-wrap gap-2">
              {roles.length === 0 && (
                <span className="text-sm text-muted-foreground">Nenhum cargo atribuído</span>
              )}
              {roles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {roleLabel(r)}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
