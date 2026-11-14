# Registrar leads e avanços comerciais pela API

O servidor do site ou CRM pode registrar eventos no projeto do Estúdio por `POST /public/v1/studio/projects/:projectId/outcomes`. A rota usa a autenticação pública existente do Postiz e o mesmo serviço de resultados da interface. A organização é obtida da credencial, nunca do corpo enviado.

**A chave deve permanecer no servidor.** Não a inclua em JavaScript entregue ao navegador, formulários públicos, parâmetros de URL ou mensagens para o modelo. A interface pública do seu site envia o formulário ao seu próprio servidor; depois da validação e persistência do lead na origem, esse servidor registra o evento no Postiz.

## Corpo

```json
{
  "stage": "lead",
  "currency": "BRL",
  "reference": "web-form:evento-uuid-da-origem",
  "note": "Lead recebido pelo formulário e registrado na origem.",
  "occurredAt": "2026-11-14T12:00:00.000Z",
  "externalId": "lead:evento-uuid-da-origem"
}
```

`externalId` deve ser um identificador estável de até 150 caracteres para **um evento**, único na organização. Use o UUID do evento na origem, com um prefixo da etapa se necessário. Não use nome, email ou telefone como identificador. Cada avanço posterior recebe outro identificador, preservando a relação com o lead no CRM por uma referência verificável.

Uma repetição do mesmo evento retorna o projeto sem criar outro registro. Usar o mesmo `externalId` com projeto, etapa, referência, valor, observação ou data diferentes resulta em conflito `409`. Preserve o horário original e o corpo completo quando repetir uma tentativa. Gere o identificador e grave o evento na origem antes da primeira chamada; gerar um UUID novo a cada tentativa elimina a proteção contra duplicatas.

Para proposta, contrato, faturamento e recebimento, `valueCents` é obrigatório. Os valores estão em centavos e a moeda suportada neste contrato é BRL. Não envie valores estimados como dinheiro recebido.

## Etapas

| `stage` | Fato que deve existir na origem |
| --- | --- |
| `lead` | Um contato comercial foi recebido e registrado. |
| `qualified_lead` | A equipe concluiu a qualificação conforme seus critérios. |
| `opportunity` | Há uma oportunidade identificada, com próximo avanço comercial. |
| `proposal` | Uma proposta foi efetivamente emitida ou registrada pela equipe. |
| `contract` | Há um contrato efetivamente firmado e referenciável. |
| `invoiced` | Houve faturamento, com referência do documento. |
| `received` | O recebimento foi confirmado pelo controle financeiro. |

A integração não qualifica um lead nem muda de etapa automaticamente. Um formulário enviado também não prova que o conteúdo causou a compra. Guarde origem, campanha e referência no sistema responsável e use informações verificáveis para a análise comercial.

## Exemplo de chamada no servidor

Este exemplo deve ser chamado pelo código de confiança da origem depois de validar o formulário, limitar abuso e persistir o evento. Ele não é um endpoint público pronto para aceitar solicitações anônimas.

```javascript
export async function registerLeadEvent(event) {
  const base = new URL(process.env.POSTIZ_STUDIO_API_URL);
  const key = process.env.POSTIZ_API_KEY;
  if (!key || !base.pathname.endsWith('/public/v1/studio')) {
    throw new Error('Configuração do Estúdio ausente');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash ||
      (base.protocol !== 'https:' && !(base.protocol === 'http:' && local))) {
    throw new Error('Endereço do Estúdio inválido');
  }

  // event.id e event.createdAt já foram persistidos na origem.
  const body = {
    stage: 'lead',
    currency: 'BRL',
    reference: event.reference,
    note: 'Lead recebido e registrado na origem.',
    occurredAt: event.createdAt,
    externalId: `lead:${event.id}`,
  };
  const response = await fetch(
    `${base.href}/projects/${encodeURIComponent(event.projectId)}/outcomes`,
    {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!response.ok) {
    // Registre somente código HTTP e ID interno do evento. Nunca cabeçalhos ou chave.
    throw new Error(`Registro do evento não confirmado: HTTP ${response.status}`);
  }
  return response.json();
}
```

Em falha de conexão ou timeout, a origem pode não saber se o evento foi gravado. Reenvie apenas o mesmo evento persistido, com o mesmo `externalId`, horário e corpo. Em `409`, investigue a divergência; não gere um identificador novo para ocultá-la. Em `401` ou `403`, corrija a credencial ou a autorização no servidor. Os limites e a exigência de assinatura do Postiz continuam valendo quando configurados.

O endpoint registra o fato comercial. Ele não envia email, não conversa com o lead e não movimenta dinheiro. Um CRM que possua essas ações deve manter seus próprios controles de autorização e entrega.
