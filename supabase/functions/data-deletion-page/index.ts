const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exclusão de Dados — Lagun</title>
  <style>
    body { background: #0f0a05; color: rgba(255,255,255,0.75); font-family: system-ui, sans-serif; margin: 0; padding: 0; }
    .wrap { max-width: 680px; margin: 0 auto; padding: 60px 24px; }
    .label { color: #F5D470; font-size: 11px; letter-spacing: .3em; text-transform: uppercase; margin-bottom: 12px; }
    h1 { font-size: 26px; font-weight: 700; color: #fff; margin-bottom: 6px; }
    .sub { color: rgba(255,255,255,.3); font-size: 13px; margin-bottom: 40px; }
    h2 { font-size: 14px; font-weight: 700; color: #F5D470; margin-bottom: 8px; margin-top: 32px; }
    p { font-size: 14px; line-height: 1.75; color: rgba(255,255,255,.6); white-space: pre-line; }
    a { color: #F5D470; }
    hr { border: none; border-top: 1px solid rgba(245,212,112,.1); margin-top: 40px; padding-top: 24px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="label">Lagun · Vitória/ES</div>
    <h1>Exclusão de Dados</h1>
    <div class="sub">Última atualização: maio de 2026</div>

    <h2>Como solicitar a exclusão dos seus dados</h2>
    <p>Você pode solicitar a exclusão dos seus dados pessoais armazenados pela Lagun de duas formas:

1. Através do Facebook/Instagram: acesse as configurações da sua conta → Segurança e Login → Aplicativos e Sites → encontre a Lagun → clique em "Remover" → selecione "Solicitar exclusão de dados".

2. Por e-mail: envie uma solicitação para contato@lagun.com.br com o assunto "Exclusão de Dados" informando seu nome e o canal de contato utilizado.</p>

    <h2>Quais dados são excluídos</h2>
    <p>Ao solicitar a exclusão, removemos permanentemente:
• Histórico de mensagens via Instagram Direct
• Dados de cadastro vinculados à sua conta
• Preferências e dados de atendimento

Dados de compra de ingressos podem ser retidos por até 5 anos para fins fiscais.</p>

    <h2>Prazo</h2>
    <p>A exclusão é processada em até 30 dias corridos após a confirmação da solicitação.</p>

    <h2>Contato</h2>
    <p>E-mail: contato@lagun.com.br
Instagram: @lagun.vix
WhatsApp: (27) 99778-9988</p>

    <hr>
    <a href="https://lagun.com.br">← Voltar ao site</a>
  </div>
</body>
</html>`;

Deno.serve(() =>
  new Response(HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
);
