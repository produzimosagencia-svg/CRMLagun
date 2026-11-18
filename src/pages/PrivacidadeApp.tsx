/**
 * Política de privacidade do app de iPhone "Lagun Administração" (2026-11-17).
 * Endereço: /privacidade/app. É o link usado dentro do app (tela de entrada e Mais)
 * e no App Store Connect (regra 5.1.1(i) da Apple).
 */
const SECOES: { titulo: string; texto: string }[] = [
  {
    titulo: '1. Quem somos e a quem este app se destina',
    texto: 'O app "Lagun Administração" é da Lagun Club LTDA (CNPJ 64.913.557/0001-04), casa noturna em Vitória, Espírito Santo, responsável pelos dados tratados no app. É de uso interno: serve só para a administração da Lagun e para parceiros autorizados acompanharem as noites da casa (vendas, tarefas, agenda, tempo e tráfego pago). Não é um app para o público. Só entra quem foi cadastrado pela administração da Lagun dentro do próprio app.',
  },
  {
    titulo: '2. Como funciona o login',
    texto: 'Você entra com o número do seu celular. Mandamos um código de 6 dígitos pelo WhatsApp oficial da Lagun (WhatsApp Business, da Meta) e você digita esse código no app. O código vale por 10 minutos e é guardado só como resumo criptográfico, nunca em texto. Não usamos senha, e-mail nem login de redes sociais.',
  },
  {
    titulo: '3. Que dados o app usa',
    texto: 'Dados seus: nome, número de celular, um identificador interno de usuário, o seu cargo no app (Administrador ou Parceiro) e, para parceiros, as noites liberadas para você.\nDados da operação da Lagun que você vê no app, conforme o seu cargo: noites cadastradas, totais de vendas de ingresso (somas por noite, dia, setor e cupom, sem nome de comprador), tarefas da equipe, agenda interna e números das campanhas de anúncio da Lagun.\nO app não usa câmera, fotos, localização, contatos, microfone nem rastreamento, e não mostra anúncios.',
  },
  {
    titulo: '4. Para que usamos',
    texto: 'Só para fazer o app funcionar: confirmar quem você é no login, mostrar as telas que o seu cargo permite e registrar as ações que você faz no app (por exemplo, concluir uma tarefa ou cadastrar uma noite). Não usamos seus dados para publicidade e não vendemos nem alugamos dados a ninguém.',
  },
  {
    titulo: '5. Com quem compartilhamos',
    texto: 'Usamos prestadores de serviço que processam dados em nome da Lagun, com contrato e medidas de segurança equivalentes às nossas:\n• Supabase: banco de dados, login e funções do servidor.\n• Vercel: hospedagem do site e desta política.\n• Meta (WhatsApp Business): envio do código de login para o seu celular.\n• Meta (API de Anúncios): leitura dos números das campanhas da Lagun, sem dado seu.\n• Open-Meteo: previsão do tempo de Vitória. Recebe só a coordenada da cidade, nenhum dado seu.\nCompartilhamos dados com autoridades apenas quando a lei exigir.',
  },
  {
    titulo: '6. Armazenamento no aparelho',
    texto: 'O app guarda no seu iPhone apenas a sessão de login e preferências simples de tela, para você não precisar entrar a cada abertura. Ao sair ou excluir a conta, isso é apagado.',
  },
  {
    titulo: '7. Por quanto tempo guardamos',
    texto: 'Seus dados de conta ficam guardados enquanto você tiver acesso ao app. O código de login some depois de usado ou em 10 minutos. Quando você exclui a conta, apagamos na hora o seu login, seu cadastro no app, seu cargo e as noites liberadas para você. Registros da operação da casa feitos por você (como uma tarefa concluída) continuam existindo, sem o vínculo com a sua conta, porque fazem parte da gestão da Lagun.',
  },
  {
    titulo: '8. Como excluir sua conta',
    texto: 'Dentro do app: Mais › Excluir minha conta. A exclusão é definitiva e acontece na hora. Também é possível pedir por e-mail (contato@lagun.com.br). Para tirar só o acesso ao app, sem excluir a conta, fale com a administração da Lagun.',
  },
  {
    titulo: '9. Seus direitos (LGPD)',
    texto: 'Pela Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode pedir acesso, correção, exclusão e portabilidade dos seus dados e revogar consentimentos. Basta escrever para contato@lagun.com.br. Respondemos em até 15 dias.',
  },
  {
    titulo: '10. Segurança',
    texto: 'Todo o tráfego do app é criptografado (HTTPS). O acesso aos dados é controlado no servidor conforme o cargo de cada pessoa, e as chaves dos serviços ficam só no servidor, nunca no app.',
  },
  {
    titulo: '11. Menores de idade',
    texto: 'O app é de uso profissional e não se destina a menores de 18 anos.',
  },
  {
    titulo: '12. Mudanças nesta política',
    texto: 'Se esta política mudar, a nova versão fica publicada neste endereço com a data de atualização.',
  },
  {
    titulo: '13. Contato',
    texto: 'Lagun Club LTDA · CNPJ 64.913.557/0001-04\nRua Manoel Gonçalves Carneiro, 65, Praia do Canto, Vitória/ES, CEP 29055-740\nE-mail: contato@lagun.com.br\nInstagram: @lagun.vix',
  },
];

export default function PrivacidadeApp() {
  return (
    <div style={{ backgroundColor: '#0f0a05', minHeight: '100vh', color: 'rgba(255,255,255,0.8)', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px' }}>
        <p style={{ color: '#F5D470', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 12 }}>App Lagun Administração</p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Política de Privacidade do app</h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 40 }}>Última atualização: 17 de novembro de 2026</p>
        {SECOES.map((s) => (
          <div key={s.titulo} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#F5D470', marginBottom: 8 }}>{s.titulo}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.65)', whiteSpace: 'pre-line' }}>{s.texto}</p>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(245,212,112,0.1)', paddingTop: 32, marginTop: 16, display: 'flex', gap: 24 }}>
          <a href="/privacidade" style={{ color: '#F5D470', fontSize: 13, textDecoration: 'none' }}>Política geral da Lagun</a>
          <a href="/termos" style={{ color: '#F5D470', fontSize: 13, textDecoration: 'none' }}>Termos de uso</a>
        </div>
      </div>
    </div>
  );
}
