/**
 * Política de privacidade do app de iPhone "Lagun" (app de clientes, bundle br.com.lagunvitoria.app),
 * com o Programa de Embaixadoras dentro (2026-11-25). Endereço: /privacidade/app-lagun.
 * Link usado dentro do app (boas-vindas, Mais, cadastro de embaixadora) e no App Store Connect
 * (regra 5.1.1(i) da Apple). O app "Lagun Administração" tem a política própria em /privacidade/app.
 */
const SECOES: { titulo: string; texto: string }[] = [
  {
    titulo: '1. Quem somos',
    texto: 'O app "Lagun" é da Lagun Club LTDA (CNPJ 64.913.557/0001-04), casa noturna em Vitória, Espírito Santo, responsável pelos dados tratados no app. Ele serve para o público da casa acompanhar a programação, comprar ingresso, reservar lounge, participar do Clube e, para quem for aprovada, participar do Programa de Embaixadoras da Lagun. O app é para maiores de 18 anos.',
  },
  {
    titulo: '2. Como funciona o login',
    texto: 'Você entra com o número do seu celular. Mandamos um código de 6 dígitos pelo WhatsApp oficial da Lagun (WhatsApp Business, da Meta) e você digita esse código no app. O código vale por 10 minutos e é guardado só como resumo criptográfico. Não usamos senha nem login de redes sociais.',
  },
  {
    titulo: '3. Que dados o app usa (cliente)',
    texto: '• Conta: nome, número de celular e um identificador interno de usuário.\n• Compras e reservas: ingressos, reservas de lounge (nome de quem fica com a reserva, número de pessoas, observações), pedidos e o status do pagamento por Pix. Não guardamos dados de cartão nem dados bancários seus.\n• Clube e divulgação: seus pontos e nível no Clube e, se você for divulgador, o seu link e as vendas feitas por ele.\n• Preferências: avisos da semana pelo WhatsApp, se você ativar.',
  },
  {
    titulo: '4. Programa de Embaixadoras',
    texto: 'Só para quem pede para participar, em "Sou embaixadora › quero ser". O cadastro pede: nome completo, WhatsApp, data de nascimento (o programa é só para maiores de 18 anos), CPF, chave Pix, perfil do Instagram e, se houver, quem indicou.\nPara que serve cada um: data de nascimento e CPF confirmam a idade e evitam cadastro duplicado; a chave Pix é usada só se a casa fizer um pagamento a você dentro das regras do programa; o Instagram serve para a equipe conferir o perfil e as publicações das missões.\nDurante o programa também guardamos: os prints e links que você envia para comprovar as missões, os pontos ganhos e vencidos, os resgates da loja, o seu nível, o número do seu cartão e as presenças registradas na portaria pelo QR do fast-pass.\nQuem vê: só você e a equipe da Lagun que opera o programa. Os prints ficam num armazenamento privado e nunca são publicados pelo app. A Lagun não lê sua conta do Instagram nem pede a senha dela: só olha o perfil público que você informou.',
  },
  {
    titulo: '5. Recursos do iPhone',
    texto: '• Notificações: só se você tocar em "Me lembre" numa noite. O lembrete é agendado no próprio iPhone, sem passar pelo nosso servidor. Você pode desligar quando quiser.\n• Câmera e fotos: só quando você escolhe anexar o print de uma missão. O app não acessa a sua galeria inteira.\n• Brilho da tela: o app aumenta o brilho enquanto um QR de entrada está aberto, para a leitura na portaria, e volta ao normal ao sair.\nO app não usa localização, contatos nem microfone, não faz rastreamento e não mostra anúncios.',
  },
  {
    titulo: '6. Para que usamos',
    texto: 'Só para fazer o app funcionar: confirmar quem você é, entregar ingressos e reservas, calcular pontos do Clube e do Programa de Embaixadoras, analisar cadastros e comprovações e registrar presenças na portaria. Não usamos seus dados para publicidade de terceiros e não vendemos nem alugamos dados a ninguém.',
  },
  {
    titulo: '7. Com quem compartilhamos',
    texto: 'Usamos prestadores de serviço que processam dados em nome da Lagun, com contrato e medidas de segurança equivalentes às nossas:\n• Supabase: banco de dados, login, armazenamento dos prints e funções do servidor.\n• Vercel: hospedagem do site e desta política.\n• Meta (WhatsApp Business): envio do código de login e dos avisos que você pediu, como a aprovação do cadastro de embaixadora.\n• Zig: sistema de ingressos e consumo da casa, para conferir entrada e consumo na noite.\nCompartilhamos dados com autoridades apenas quando a lei exigir.',
  },
  {
    titulo: '8. Armazenamento no aparelho',
    texto: 'O app guarda no seu iPhone apenas a sessão de login, preferências simples de tela e os lembretes que você agendou. Ao sair ou excluir a conta, a sessão é apagada.',
  },
  {
    titulo: '9. Por quanto tempo guardamos',
    texto: 'Os dados da conta e do Programa de Embaixadoras ficam guardados enquanto você usar o app. Pontos do programa vencem conforme as regras de cada nível. O código de login some depois de usado ou em 10 minutos. Registros de pagamento que a lei manda guardar ficam só pelo prazo legal, sem uso para mais nada.',
  },
  {
    titulo: '10. Como excluir sua conta',
    texto: 'Dentro do app: Mais › Excluir minha conta (na área de cliente) ou Perfil › Excluir minha conta (na área de embaixadora). A exclusão é definitiva e acontece na hora: apaga seu login, seu cadastro, seus pontos e, se você for embaixadora, também CPF, chave Pix, Instagram, prints enviados, pontos e resgates do programa. Também é possível pedir por e-mail (contato@lagun.com.br).',
  },
  {
    titulo: '11. Seus direitos (LGPD)',
    texto: 'Pela Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode pedir acesso, correção, exclusão e portabilidade dos seus dados e revogar consentimentos. Seu Instagram e sua chave Pix podem ser corrigidos direto no app, no Perfil da embaixadora. Para o resto, escreva para contato@lagun.com.br. Respondemos em até 15 dias.',
  },
  {
    titulo: '12. Segurança',
    texto: 'Todo o tráfego do app é criptografado (HTTPS). O acesso aos dados é controlado no servidor: cada pessoa só vê o que é dela, e só a equipe que opera o programa vê os cadastros de embaixadoras. As chaves dos serviços ficam só no servidor, nunca no app.',
  },
  {
    titulo: '13. Mudanças nesta política',
    texto: 'Se esta política mudar, a nova versão fica publicada neste endereço com a data de atualização.',
  },
  {
    titulo: '14. Contato',
    texto: 'Lagun Club LTDA · CNPJ 64.913.557/0001-04\nRua Manoel Gonçalves Carneiro, 65, Praia do Canto, Vitória/ES, CEP 29055-740\nE-mail: contato@lagun.com.br\nInstagram: @lagun.vix',
  },
];

export default function PrivacidadeAppCliente() {
  return (
    <div style={{ backgroundColor: '#0f0a05', minHeight: '100vh', color: 'rgba(255,255,255,0.8)', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px' }}>
        <p style={{ color: '#F5D470', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 12 }}>App Lagun</p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Política de Privacidade do app</h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 40 }}>Última atualização: 25 de novembro de 2026</p>
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
