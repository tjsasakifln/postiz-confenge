# Estúdio por Claude Code, Codex, Gemini CLI e Antigravity

Este aplicativo é um servidor MCP local por `stdio`. Ele apresenta 25 ferramentas do Estúdio e chama a API pública autenticada do Postiz. O mesmo protocolo atende os quatro clientes; o modelo continua sendo escolhido no cliente.

## Preparar

Use o Node exigido pelo repositório e o PNPM do `packageManager`.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter postiz-studio-agent run build
corepack pnpm --filter postiz-studio-agent run test
```

O backend deve incluir `PublicStudioController` no `PublicApiModule`, protegido por `PublicAuthMiddleware`. Esse módulo deve importar `StudioAudienceModule` e fornecer `PublicStudioService`. A configuração `MCP_ONLY=true` desativa a API pública, conforme o comportamento existente do Postiz.

Crie um arquivo privado fora do repositório com base em `studio-agent.env.example`. Em Linux/macOS, restrinja sua leitura ao seu usuário com `chmod 600 /CAMINHO/PRIVADO/studio-agent.env`.

```dotenv
POSTIZ_STUDIO_API_URL=http://127.0.0.1:3000/public/v1/studio
POSTIZ_API_KEY=CHAVE_DA_ORGANIZACAO_NO_POSTIZ
POSTIZ_STUDIO_UI_URL=http://127.0.0.1:4200/studio
```

Substitua endereços pelos da sua instalação. Quando o backend é servido sob `/api`, o endereço termina em `/api/public/v1/studio`. Servidores remotos exigem HTTPS; HTTP é aceito apenas em `localhost`, `127.0.0.1` ou `::1`.

O middleware nativo recebe a chave crua no cabeçalho `Authorization`, sem prefixo `Bearer`. Também aceita os tokens OAuth do Postiz. A ponte não aceita chave, endereço de API, cabeçalhos adicionais ou troca de organização nos argumentos das ferramentas. Não cole credenciais em conversas, arquivos de projeto ou instruções para o modelo.

Os exemplos de configuração usam `node --env-file` para que apenas o caminho do arquivo privado apareça na configuração do cliente. Substitua os dois caminhos absolutos de cada exemplo. O processo MCP escreve no `stdout` somente mensagens do protocolo.

## Configurar os clientes

| Cliente | Configuração | Conferência |
| --- | --- | --- |
| Claude Code | Mescle `config/claude-code.mcp.example.json` no `.mcp.json` do projeto. | Abra `/mcp` e confira o servidor `confenge_studio`. |
| Codex | Mescle `config/codex.mcp.example.toml` em `~/.codex/config.toml` ou na configuração do projeto. | Use `codex mcp list` e `/mcp` no cliente. |
| Gemini CLI | Mescle `config/gemini-cli.mcp.example.json` em `~/.gemini/settings.json` ou `.gemini/settings.json`. Mantenha `trust: false`. | Use `/mcp list`; a pasta precisa estar confiada pelo cliente para iniciar processos locais. |
| Antigravity | Abra MCP Servers, Manage MCP Servers, View raw config e mescle `config/antigravity.mcp.example.json`. | Recarregue a configuração e confira o servidor. A documentação atual também descreve `~/.gemini/config/mcp_config.json` e `.agents/mcp_config.json`. |

Fontes oficiais consultadas para os formatos: [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Codex MCP](https://developers.openai.com/codex/mcp/), [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) e [Antigravity MCP](https://antigravity.google/docs/mcp). Menus e caminhos podem variar conforme a versão instalada; use o editor de configuração indicado pelo próprio cliente quando houver divergência.

## O que as ferramentas fazem

| Área | Ferramentas |
| --- | --- |
| Projeto | `studio_capabilities`, `studio_list_projects`, `studio_create_project`, `studio_get_project`, `studio_update_project` |
| Conteúdo e revisão | `studio_review_project`, `studio_approve_project`, `studio_generate`, `studio_research`, `studio_measure_style`, `studio_generate_images` |
| Vídeo e rascunhos | `studio_start_render`, `studio_render_status`, `studio_attach_render`, `studio_create_drafts` |
| Audiência | `studio_audience_capabilities`, `studio_audience_threads`, `studio_sync_audience`, `studio_draft_reply`, `studio_suggest_reply`, `studio_approve_reply`, `studio_send_reply`, `studio_reconcile_reply` |
| Resultado | `studio_metrics`, `studio_record_outcome` |

O recurso `studio://contract` apresenta o contrato ao agente. As operações usam os mesmos serviços, regras de organização, revisão, fontes, direitos de mídia e aprovação da interface. Para atualizar um projeto, leia seu documento completo, preserve os campos existentes e envie a revisão observada. A API rejeita versões obsoletas e campos desconhecidos.

Mídias precisam estar previamente registradas no projeto e na biblioteca da organização. A ponte não lê arquivos locais arbitrários nem baixa mídia de URLs passadas por ferramenta. Os rascunhos gerados precisam ser revisados e agendados no calendário do Postiz.

## Confirmação humana e custos

As ferramentas de aprovação de projeto, aprovação de resposta, envio de resposta e registro de resultado comercial exigem um formulário de elicitação MCP. O servidor mostra o conteúdo exato, a etapa e a versão ou hash relevantes. Só prossegue quando o cliente retorna `accept` e a pessoa marca a confirmação. Recusa, cancelamento e ausência de confirmação encerram a ação. Declarações inventadas pelo modelo em argumentos, como `humanConfirmed: true`, são rejeitadas.

Se o cliente não declarar suporte a elicitação por formulário, a ponte encaminha a pessoa à interface do Estúdio e não envia a aprovação ou resposta. Conteúdo longo demais para o diálogo também deve ser revisado na interface. Não configure respostas automáticas a essas elicitações.

A confirmação depende da implementação e da configuração do cliente MCP. Ela não é uma prova criptográfica de identidade humana. A chave de API representa a organização; o registro usa o ator `api:studio-agent:<organização>`. Quando a autenticação for OAuth, o usuário vinculado pelo Postiz é preservado. A API pública continua sendo uma API para integrações autorizadas e não comprova, por si só, a interação de uma pessoa.

Texto, pesquisa, imagens e voz podem consumir serviços pagos configurados no backend. As ferramentas correspondentes exigem `requestedByOperator: true` no contrato e devem ser usadas somente após a solicitação da pessoa. Esse pedido já autoriza executar a geração; a ponte não pede uma segunda confirmação. O campo não equivale a aprovação editorial nem comprova identidade humana.

Não há repetição automática de requisições HTTP. Em falha ou timeout, consulte o projeto, o job ou a resposta antes de decidir outra tentativa. O Estúdio mantém seus controles de idempotência para rascunhos, jobs e respostas; o MCP não transforma um resultado desconhecido em autorização para reenviar.

## Estado de validação

O servidor foi compilado com TypeScript e testado com o SDK MCP instalado no repositório, incluindo descoberta de ferramentas, chamada por processo `stdio`, uma API HTTP local sintética, autenticação, recusa de confirmação, versão obsoleta, isolamento da organização e ausência de credenciais nos resultados.

| Cliente real | O que foi conferido neste ambiente | O que falta |
| --- | --- | --- |
| Codex CLI | Binário disponível, versão `0.167.0-alpha.4`; configuração temporária foi aceita por `codex mcp get --json`, sem alterar arquivos do usuário. | Uma sessão interativa com o Estúdio real e seus formulários. |
| Claude Code | Configuração conferida com documentação oficial. | O cliente não está instalado neste ambiente; conexão e diálogo não foram homologados no software. |
| Gemini CLI | Configuração conferida com documentação oficial. | O cliente não está instalado neste ambiente; conexão e diálogo não foram homologados no software. |
| Antigravity | Configuração conferida com documentação oficial. | O cliente não está instalado neste ambiente; conexão e diálogo não foram homologados no software. |

Nenhuma conta social real, chave de produção, publicação ou chamada paga foi usada nos testes. Para homologar uma instalação, comece por `studio_capabilities` e leitura de um projeto. Confirme que o cliente exige revisão humana antes de habilitar uso comercial das ferramentas de aprovação e envio.

Para a entrada de leads pelo servidor do site ou CRM, veja [LEADS.md](../../docs/studio/LEADS.md). Comentário, lead recebido, lead qualificado, oportunidade, proposta, contrato, faturamento e recebimento devem continuar sendo fatos distintos.
