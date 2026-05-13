import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  MessageSquare, Phone, FileText, Send, DollarSign,
  RefreshCw, Upload, CheckCircle2, XCircle, AlertTriangle, Users
} from 'lucide-react';
import { toast } from 'sonner';

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
}

interface Template {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: Array<{
    type?: string;
    text?: string;
    format?: string;
  }>;
}

interface Contact {
  name: string;
  phone: string;
}

interface SendResult {
  to: string;
  name: string;
  status: string;
  error?: string;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const callApi = async (action: string, body?: unknown) => {
  const base = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-api`;
  if (body) {
    const resp = await fetch(`${base}?action=${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return resp.json();
  }
  const resp = await fetch(`${base}?action=${action}`, {
    headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
  });
  return resp.json();
};

const countTemplateVariables = (template?: Template) => {
  if (!template?.components?.length) return 0;

  return template.components.reduce((maxCount, component) => {
    if (typeof component.text !== 'string') return maxCount;
    const matches = [...component.text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    if (matches.length === 0) return maxCount;
    return Math.max(maxCount, ...matches);
  }, 0);
};

export default function InternoWhatsApp() {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<{ total: number; sent: number; errors: number; details: SendResult[] } | null>(null);
  const [step, setStep] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedTemplateData = templates.find((tpl) => tpl.name === selectedTemplate);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [phonesRes, templatesRes] = await Promise.all([
        callApi('phone_numbers'),
        callApi('templates'),
      ]);
      if (phonesRes?.data) setPhoneNumbers(phonesRes.data);
      if (templatesRes?.data) setTemplates(templatesRes.data.filter((t: Template) => t.status === 'APPROVED'));
    } catch {
      toast.error('Erro ao carregar dados do WhatsApp');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const togglePhone = (id: string) => {
    setSelectedPhones(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      const parsed: Contact[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Try comma, semicolon, or tab
        const parts = line.split(/[,;\t]/).map(p => p.trim().replace(/"/g, ''));
        if (parts.length >= 2) {
          const name = parts[0];
          let phone = parts[1].replace(/\D/g, '');
          // Skip header
          if (i === 0 && (name.toLowerCase().includes('nome') || name.toLowerCase().includes('name'))) continue;
          // Add country code if missing
          if (phone.length === 11) phone = '55' + phone;
          if (phone.length === 10) phone = '55' + phone;
          if (phone.length >= 12) parsed.push({ name, phone });
        }
      }
      setContacts(parsed);
      if (parsed.length === 0) {
        toast.error('Nenhum contato válido encontrado. Use CSV com colunas: Nome, Telefone');
      } else {
        toast.success(`${parsed.length} contatos carregados`);
      }
    };
    reader.readAsText(file);
  };

  const handleSend = async () => {
    if (!selectedPhones.length || !selectedTemplate || !contacts.length) return;
    setSending(true);
    setSendResults(null);
    try {
      const templateVariableCount = countTemplateVariables(selectedTemplateData);

      // Send from first selected phone number
      const result = await callApi('send_bulk', {
        phone_number_id: selectedPhones[0],
        template_name: selectedTemplate,
        template_language: 'pt_BR',
        template_components: selectedTemplateData?.components ?? [],
        template_variable_count: templateVariableCount,
        contacts,
      });
      setSendResults(result);
      if (result.sent > 0) toast.success(`${result.sent} mensagens enviadas com sucesso!`);
      if (result.errors > 0) toast.error(`${result.errors} mensagens falharam`);
    } catch {
      toast.error('Erro ao enviar mensagens');
    } finally {
      setSending(false);
    }
  };

  const canAdvance = (s: number) => {
    if (s === 1) return selectedPhones.length > 0;
    if (s === 2) return !!selectedTemplate;
    if (s === 3) return contacts.length > 0;
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Plataforma de Disparos WhatsApp</h2>
          <p className="text-sm text-gray-500 mt-1">Envie mensagens em massa pela API oficial</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: 'Número', icon: Phone },
          { n: 2, label: 'Template', icon: FileText },
          { n: 3, label: 'Contatos', icon: Users },
          { n: 4, label: 'Enviar', icon: Send },
        ].map(({ n, label, icon: Icon }) => (
          <button
            key={n}
            onClick={() => setStep(n)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              step === n
                ? 'bg-[#25D366] text-white shadow-lg'
                : n < step && canAdvance(n)
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {n < step && canAdvance(n) && <CheckCircle2 className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>

      {/* Step 1: Select Phone Numbers */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Selecione o(s) número(s) de envio</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <RefreshCw className="w-4 h-4 animate-spin" /> Carregando números...
            </div>
          ) : phoneNumbers.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum número encontrado na conta.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {phoneNumbers.map((phone) => (
                <Card
                  key={phone.id}
                  className={`cursor-pointer border-border transition-transform hover:scale-[1.02] ${
                    selectedPhones.includes(phone.id)
                      ? 'ring-2 ring-[#25D366] bg-card'
                      : 'bg-card hover:bg-muted/30'
                  }`}
                >
                  <button onClick={() => togglePhone(phone.id)} className="w-full text-left p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{phone.display_phone_number}</p>
                        <p className="text-muted-foreground text-xs mt-1">{phone.verified_name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {selectedPhones.includes(phone.id) && (
                          <CheckCircle2 className="w-5 h-5 text-[#25D366]" />
                        )}
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${
                          phone.quality_rating === 'GREEN'
                            ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                        }`}>
                          <span className={`w-2 h-2 rounded-full animate-pulse ${
                            phone.quality_rating === 'GREEN' ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          {phone.quality_rating === 'GREEN' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </button>
                </Card>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={!canAdvance(1)}
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
            >
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select Template */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Escolha o template de mensagem</h3>
          {templates.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum template aprovado encontrado.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((tpl) => (
                <Card
                  key={tpl.id}
                  className={`cursor-pointer border-border transition-transform hover:scale-[1.02] ${
                    selectedTemplate === tpl.name
                      ? 'ring-2 ring-orange-400 bg-card'
                      : 'bg-card hover:bg-muted/30'
                  }`}
                >
                  <button onClick={() => setSelectedTemplate(tpl.name)} className="w-full text-left p-3">
                    <div className="flex items-center justify-between mb-2">
                      <FileText className="w-5 h-5 text-orange-400" />
                      {selectedTemplate === tpl.name && (
                        <CheckCircle2 className="w-5 h-5 text-orange-400" />
                      )}
                    </div>
                    <p className="font-semibold text-sm text-foreground">{tpl.name}</p>
                    <p className="text-muted-foreground text-xs mt-1">{tpl.category}</p>
                  </button>
                </Card>
              ))}
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>← Voltar</Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!canAdvance(2)}
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
            >
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Upload Contacts */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Suba a planilha de contatos</h3>
          <p className="text-sm text-gray-500">
            Arquivo CSV com duas colunas: <strong>Nome</strong> e <strong>Telefone</strong> (com DDD, ex: 27999999999)
          </p>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#25D366] hover:bg-green-50/50 transition-colors"
          >
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Clique para selecionar o arquivo CSV</p>
            <p className="text-gray-400 text-xs mt-1">ou arraste e solte aqui</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {contacts.length > 0 && (
            <Card className="border-border bg-card">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-foreground font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#25D366]" />
                    {contacts.length} contatos carregados
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setContacts([]); if (fileRef.current) fileRef.current.value = ''; }}
                    className="text-gray-400 hover:text-red-400"
                  >
                    Limpar
                  </Button>
                </div>
                <div className="max-h-48 overflow-auto space-y-1">
                  {contacts.slice(0, 50).map((c, i) => (
                    <div key={i} className="flex justify-between border-b border-border py-1 text-xs">
                      <span className="text-foreground">{c.name}</span>
                      <span className="font-mono text-muted-foreground">{c.phone}</span>
                    </div>
                  ))}
                  {contacts.length > 50 && (
                    <p className="pt-2 text-center text-xs text-muted-foreground">
                      ... e mais {contacts.length - 50} contatos
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>← Voltar</Button>
            <Button
              onClick={() => setStep(4)}
              disabled={!canAdvance(3)}
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
            >
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Send */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Revisar e Enviar</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <div className="p-4">
                <Phone className="w-6 h-6 text-[#25D366] mb-2" />
                <p className="text-muted-foreground text-xs">Número de envio</p>
                <p className="text-foreground font-semibold text-sm mt-1">
                  {phoneNumbers.find(p => p.id === selectedPhones[0])?.display_phone_number || '-'}
                </p>
              </div>
            </Card>
            <Card className="border-border bg-card">
              <div className="p-4">
                <FileText className="w-6 h-6 text-orange-400 mb-2" />
                <p className="text-muted-foreground text-xs">Template</p>
                <p className="text-foreground font-semibold text-sm mt-1">{selectedTemplate}</p>
              </div>
            </Card>
            <Card className="border-border bg-card">
              <div className="p-4">
                <Users className="w-6 h-6 text-purple-400 mb-2" />
                <p className="text-muted-foreground text-xs">Contatos</p>
                <p className="text-foreground font-semibold text-sm mt-1">{contacts.length} destinatários</p>
              </div>
            </Card>
            <Card className="border-border bg-card">
              <div className="p-4">
                <DollarSign className="w-6 h-6 text-blue-400 mb-2" />
                <p className="text-muted-foreground text-xs">Estimativa de custo</p>
                {(() => {
                  const tpl = templates.find(t => t.name === selectedTemplate);
                  const isMarketing = !tpl || tpl.category === 'MARKETING';
                  const rate = isMarketing ? 0.36 : 0.06;
                  const total = contacts.length * rate;
                  return (
                    <>
                      <p className="text-foreground font-semibold text-sm mt-1">
                        R$ {total.toFixed(2).replace('.', ',')}
                      </p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {contacts.length} × R$ {rate.toFixed(2).replace('.', ',')} ({isMarketing ? 'Marketing' : 'Utilidade'})
                      </p>
                    </>
                  );
                })()}
              </div>
            </Card>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Atenção antes de disparar</p>
              <p className="mt-1">
                O envio será feito usando a API oficial do WhatsApp. Templates devem estar aprovados pela Meta.
                Disparos em massa podem levar alguns minutos dependendo da quantidade de contatos.
              </p>
            </div>
          </div>

          {/* Send Button */}
          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => setStep(3)}>← Voltar</Button>
            <Button
              onClick={handleSend}
              disabled={sending}
              size="lg"
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white px-8 shadow-lg"
            >
              {sending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Disparar {contacts.length} mensagens
                </>
              )}
            </Button>
          </div>

          {/* Results */}
          {sendResults && (
            <Card className="border-border bg-card">
              <div className="p-4">
                <h4 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                  <MessageSquare className="w-5 h-5 text-[#25D366]" />
                  Resultado do Disparo
                </h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{sendResults.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{sendResults.sent}</p>
                    <p className="text-xs text-muted-foreground">Enviados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{sendResults.errors}</p>
                    <p className="text-xs text-muted-foreground">Erros</p>
                  </div>
                </div>
                {sendResults.errors > 0 && (
                  <div className="max-h-40 overflow-auto space-y-1">
                    {sendResults.details.filter(d => d.status === 'error').map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span className="text-foreground">{d.name}</span>
                        <span className="font-mono text-muted-foreground">{d.to}</span>
                        <span className="text-red-400 ml-auto truncate max-w-[200px]">{d.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
