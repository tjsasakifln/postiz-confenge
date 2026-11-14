# Estúdio CONFENGE

Este fork acrescenta ao Postiz planejamento, pesquisa, identidade reutilizável, roteiro, produção de mídia, revisão, distribuição e acompanhamento comercial para YouTube, Instagram e LinkedIn. A entrada é **Estúdio**, no menu, ou `/studio`.

Há dois caminhos de distribuição. Os pacotes das três redes podem virar rascunhos no calendário do Postiz. Para YouTube, a grade própria também pode enviar antecipadamente vídeos privados, configurar a publicação nativa e espelhar no Instagram os vídeos confirmados como públicos. A escolha de conteúdo, as aprovações editoriais e a confirmação da grade continuam explícitas.

O código é uma implementação independente. O PDF usado para levantar requisitos contém o sumário e o primeiro capítulo do livro Framework Antares, sem os capítulos de implementação nem o programa original. O PDF e seus exemplos não são distribuídos neste repositório. A licença AGPL-3.0 do Postiz foi preservada.

## Preparar um conteúdo

1. **Defina a oportunidade comercial.** Crie o conteúdo com comprador, dúvida de compra, serviço que a equipe consegue entregar, evidências disponíveis e próximo avanço. A identidade separa evidência de hipótese.
2. **Configure e aprove a identidade.** Informe idioma, voz, plataforma, marca, cores, tipografia, fuso e horários preferenciais. É possível copiar um modelo aprovado da mesma plataforma. A cópia registra a origem e exige revisão no novo conteúdo; não transfere a aprovação. Os horários servem de referência para a grade, sem iniciar publicações por si.
3. **Pesquise e revise fontes.** Consulte YouTube/web ou cadastre fontes manualmente. Datas e avisos de consulta parcial ficam registrados. Marque fontes de alto risco. Vídeos da biblioteca podem ser medidos para duração, resolução, taxa de quadros, cortes estimados e média de cor do primeiro quadro. Cada medição informa método e limitações.
4. **Prepare o roteiro.** Escreva ou gere cenas com narração, pronúncia opcional separada da legenda, duração planejada, visual e fontes. O gerador orienta uma abertura direta de até três segundos. Revise e aprove o roteiro.
5. **Produza mídia utilizável.** Use cartelas, imagens ou vídeos da biblioteca com direitos registrados. Escolha áudio gravado, voz OpenAI ou voz local espeak-ng. Música de fundo e vinte efeitos próprios são opcionais. Gere MP4 vertical, horizontal ou quadrado; selecione cenas para uma versão curta e, quando necessário, limite o recorte a trinta segundos para Story. Assista à prévia antes de anexar. Há exportação SRT.
6. **Prepare marca, capas e pacotes.** O gerador entrega logo, avatar, banner e marca d'água; também produz três capas a partir de quadros do vídeo e carrosséis de até dez imagens. Monte o pacote de cada rede com título, descrição, chamada, mídia e destino. Cinco títulos e três propostas de capa recebem pontuação editorial, sem previsão de desempenho. Os links recebem os parâmetros UTM escolhidos.
7. **Aprove o pacote e escolha a distribuição.** Use o calendário ou a grade nativa descritos abaixo. Um rascunho, um upload privado, um agendamento e uma publicação confirmada são estados distintos.
8. **Acompanhe respostas e aprendizado.** Consulte comentários e métricas disponíveis. Respostas exigem revisão, aprovação e comando de envio. O botão “Usar na próxima pauta” adiciona uma observação ou hipótese com data e origem às notas do conteúdo. Depois de salvar, essas notas entram na geração seguinte. O ciclo é assistido, sem criar ou publicar uma nova peça sozinho.
9. **Registre fatos comerciais.** Contato, contato qualificado, oportunidade, proposta, contrato, faturamento e recebimento permanecem separados. O registro pode vir da interface ou do servidor do site/CRM, com data, referência e identificador estável do evento.

O [manual de produção](PRODUCTION.md) detalha formatos, voz local, efeitos, marca e limites de processamento.

## Distribuir nas três redes

### Rascunhos no calendário

Após aprovar o pacote, escolha as contas e crie seus rascunhos. Abra o calendário Postiz para conferir configuração da rede, capa, mídia, data e horário. Esse caminho atende YouTube, Instagram e LinkedIn, incluindo os formatos suportados pelos respectivos provedores. Stories continuam neste fluxo.

A seleção de capa é aplicada aos vídeos nos caminhos YouTube e Instagram que a suportam. A interface informa que o provedor LinkedIn atual não aplica uma capa separada. Confira a prévia final no canal. Alterações feitas no calendário não são automaticamente reconciliadas com a aprovação anterior do Estúdio.

### Grade nativa do YouTube com Reels opcionais

A grade trabalha com pacotes já aprovados e uma cópia imutável de cada item. O plano aceita de um a vinte vídeos, com datas entre trinta minutos e trinta dias no futuro, fuso explícito e decisões por vídeo sobre público infantil e conteúdo sintético. Preparar o plano permite revisá-lo; **confirmar a grade autoriza o envio do lote**.

Antes de começar, o sistema reserva a estimativa do lote inteiro em dois limites locais: quantidade de uploads e unidades de outras operações. A reserva é transacional, por projeto OAuth e dia no fuso `America/Los_Angeles`, compartilhada entre organizações que usam o mesmo aplicativo. Os tetos do servidor e o orçamento escolhido não são o saldo oficial do Google; operações externas podem consumir cota sem aparecer nessa reserva.

O worker envia o vídeo como privado com uma sessão retomável. Após concluir o upload, aplica capa e `publishAt`, depois consulta o YouTube para confirmar o agendamento. Quando o próprio YouTube confirma o agendamento, a liberação nativa não depende do computador do operador. O worker continua necessário para concluir uploads, acompanhar o resultado e executar Reels.

O espelhamento Instagram é opcional e usa o mesmo arquivo aprovado nos dois pacotes. O sistema mede orientação e duração, calcula o hash dos bytes e aceita, nesse caminho, vídeo vertical ou quadrado de até três minutos. Antes de criar e publicar o Reel, confirma pela API que o YouTube está público e processado. Há legenda/capa próprias, identificação durável do par vídeo/conta e intervalo mínimo de uma hora por conta real. A rotina cobre os itens escolhidos no lote; não importa todo o histórico do canal.

A grade informa estados privados, agendados, públicos, espelhados ou que precisam de conferência. Uma resposta remota incerta não vira autorização para repetir uma escrita. A reconciliação consulta o estado. Cancelar no Estúdio interrompe somente itens cujo upload não começou; vídeos já enviados ou agendados precisam ser revistos no YouTube Studio. Alterar o projeto depois da confirmação também não altera o plano já autorizado.

O painel mostra estoque observado por canal, limitado aos cinquenta lotes retornados. O mínimo escolhido na sessão gera aviso local, sem notificação persistente. Horários sugeridos devem ser conferidos contra publicações fora dessa grade. A atividade de outros aplicativos não está integralmente representada.

O [manual de distribuição](DISTRIBUTION.md) detalha reservas de cota, estados, retomada, limitações e rotas da grade.

## Usar por agentes ou integrar o site

O aplicativo [postiz-studio-agent](../../apps/studio-agent/README.md) é um servidor MCP por `stdio`, com vinte e cinco ferramentas e configurações para Claude Code, Codex, Gemini CLI e Antigravity. Ele chama a API pública autenticada dos mesmos serviços. A grade nativa continua na interface e não está exposta nessas ferramentas.

Aprovação de projeto, aprovação/envio de resposta e registro de fato comercial pelo MCP usam confirmação por formulário de elicitação. Quando o cliente não oferece esse recurso, a revisão é encaminhada à interface. Texto, pesquisa, imagens e voz já solicitados pela pessoa não pedem uma segunda confirmação da rotina; isso não substitui a aprovação editorial posterior. As configurações e os limites de validação dos quatro clientes estão no manual do agente.

A [API de leads e resultados](LEADS.md) recebe eventos do servidor do site ou CRM. Um `externalId` estável evita duplicar o mesmo evento em novas tentativas; reutilizá-lo com conteúdo diferente gera conflito. A chave permanece no servidor, e a organização vem da autenticação. O fork não instala um formulário no site, não qualifica sozinho o lead e não transforma um envio de formulário em contrato ou recebimento.

## Instalar

Use Node 22.23.4 e pnpm 10.6.1, declarados no `package.json`. O aplicativo requer PostgreSQL, Redis e Temporal, como o Postiz. O worker precisa de FFmpeg, ffprobe e fontes DejaVu. A síntese local também requer espeak-ng. O `Dockerfile.dev` deste fork inclui esses pacotes; API e worker devem usar configuração compatível.

Para desenvolver em uma instalação Postiz preparada:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run prisma-generate
corepack pnpm run prisma-db-push
corepack pnpm run dev
```

O schema acrescenta tabelas do Estúdio, da distribuição e dos eventos comerciais. Aplique a atualização primeiro em uma cópia de teste do banco. O comando de schema do Postiz é `prisma-db-push`; este fork preserva esse fluxo, sem inventar um histórico de migrations para uma instalação que não o tinha.

### Docker a partir deste fork

A imagem pronta `ghcr.io/gitroomhq/postiz-app:latest` não contém as alterações. Para construir este código:

```sh
cp .env.example .env
# Preencha STUDIO_JWT_SECRET com um segredo exclusivo antes de iniciar.
docker compose -f docker-compose.yaml -f docker-compose.studio.yaml up -d --build
```

O compose original usa `http://localhost:4007` para a configuração local. Para operação externa, ajuste domínio/HTTPS, credenciais de banco, armazenamento e URLs de retorno conforme a instalação Postiz. A distribuição nativa exige os arquivos aprovados em URLs HTTPS acessíveis aos provedores. A configuração local padrão, sozinha, não atende essa exigência.

Um servidor ativo é necessário para trabalhos, uploads, monitoramento, espelhamento e publicações executadas pelo calendário Postiz. Isso é diferente da liberação nativa de um vídeo cujo agendamento já foi confirmado pelo YouTube.

A compilação do monorepositório pode precisar de mais memória que os 2 GB padrão do Node. Exemplo:

```sh
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/backend run build
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/orchestrator run build
```

### Configuração por capacidade

| Configuração | Uso |
| --- | --- |
| `OPENAI_API_KEY` | Texto, sugestões de resposta e voz OpenAI. As ações usam a conta do provedor. Edição manual, áudio gravado e espeak-ng funcionam sem essa chave. |
| `STUDIO_TEXT_MODEL` | Modelo de texto, padrão `gpt-4.1`; confirme disponibilidade na conta. |
| `STUDIO_TTS_MODEL` | Modelo de voz, padrão `tts-1`. A narração gerada aceita até 4.096 caracteres por cena. |
| `YOUTUBE_DATA_API_KEY` | Pesquisa pública de vídeos. Não substitui o OAuth do canal. |
| `TAVILY_API_KEY` | Pesquisa web. Resultados são fontes para revisão, não comprovação automática. |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Conexão OAuth do canal e distribuição nativa YouTube. |
| `STUDIO_YOUTUBE_QUOTA_PROJECT` | Identificador estável do projeto de cota usado para compartilhar a reserva local. Sem ele, o serviço usa o client ID. Aplicativos que compartilham um projeto precisam de configuração coerente. |
| `STUDIO_YOUTUBE_DAILY_UPLOAD_BUDGET`, `STUDIO_YOUTUBE_DAILY_OTHER_UNITS` | Tetos locais do servidor para os dois limites de cota. Ajuste ao orçamento disponível para esta operação; não representam descoberta do saldo oficial do Google. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Instagram pela integração Meta existente. |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | Alternativa de login direto do Instagram. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Perfil ou página LinkedIn pelo Postiz. |
| `STORAGE_PROVIDER`, `UPLOAD_DIRECTORY` ou configuração R2 | Biblioteca e arquivos produzidos. |
| `POSTIZ_STUDIO_API_URL`, `POSTIZ_API_KEY`, `POSTIZ_STUDIO_UI_URL` | Configuração privada do processo MCP, descrita no manual do agente. Não são argumentos de ferramenta. |

As chaves ficam no ambiente do servidor ou no arquivo privado de configuração do MCP. Não devem entrar em prompts ou exemplos públicos. Conectar contas, obter permissões dos aplicativos e confirmar o comportamento remoto são etapas de homologação. Não foram feitas publicações nem respostas nas contas reais durante a criação do fork.

## O que permanece parcial

A [matriz dos vinte e seis requisitos](COVERAGE.md) distingue implementação, funções herdadas e lacunas. As principais diferenças funcionais ainda são:

- A pesquisa encontra resultados e mantém fontes; não calcula uma prova de demanda com desempenho relativo ao tamanho do canal ou um backlog priorizado completo.
- A medição de estilo informa dados concretos, mas não reconhece automaticamente família tipográfica, intenção do gancho e sincronismo semântico.
- O sistema monta mídia registrada. A pesquisa/seleção automática de acervo licenciado e a geração de mapas/animações complexas ainda não fazem parte dessa montagem.
- Títulos e propostas de capa usam critérios editoriais próprios. A seleção automática da maior nota e todas as regras específicas do livro não estão reproduzidas.
- O conjunto de marca é exportado. O envio de banner/marca d'água ao YouTube e a alteração de título/horário de vídeo já enviado continuam no canal.
- Stories usam corte e agendamento assistidos. Estoque integral, avisos persistentes e aprendizado automático entre projetos ainda não estão implementados.
- As legendas acompanham o tempo de cada cena por distribuição proporcional; não há alinhamento palavra a palavra.
- Comentários do novo Estúdio atendem YouTube e Instagram. LinkedIn participa de distribuição e métricas, mas não de respostas por esse módulo.
- O endpoint comercial registra eventos de uma origem autorizada. Não substitui CRM, emissão de proposta, faturamento ou conciliação bancária.

Qualidade editorial, adequação da oferta, crescimento, leads e receita precisam ser observados no uso. Não são garantias do software nem resultados que um teste de código possa comprovar.

## Validar a instalação

```sh
corepack pnpm run test:studio
corepack pnpm exec vitest run --config apps/frontend/vitest.studio.config.mts
corepack pnpm run build:studio-agent
corepack pnpm run test:studio-agent
```

Os testes de produção usam FFmpeg/Sharp reais e áudio de teste local. Conferem formato, duração, trilha de áudio, legendas, imagens, isolamento e entradas de mídia. Chamadas de IA e APIs sociais usam respostas controladas. Testes opt-in de banco exigem `STUDIO_DATABASE_TESTS=true` e um PostgreSQL descartável; não use esse modo no banco de operação.

O workflow `Studio verification` executa as verificações configuradas para a revisão enviada. Veja [VERIFICATION.md](VERIFICATION.md) para saber qual revisão e quais comandos foram efetivamente conferidos. Build e testes de DOM não equivalem a inspeção visual em navegador, sessão nos quatro clientes MCP ou publicação confirmada nas redes.

## Organização do código

- `libraries/helpers/src/studio`: contratos compartilhados de conteúdo, áudio, audiência e distribuição.
- `libraries/nestjs-libraries/src/dtos/studio`: validação das solicitações.
- `libraries/nestjs-libraries/src/database/prisma/studio`: projetos, revisões, aprovações, rascunhos e resultados.
- `libraries/nestjs-libraries/src/studio`: pesquisa, redação, voz, imagens, vídeo, audiência, reservas e distribuição nativa.
- `apps/backend/src/api/routes/studio*`: rotas autenticadas da interface.
- `apps/backend/src/public-api/routes/v1/public.studio.controller.ts`: API autenticada para agentes e eventos externos.
- `apps/orchestrator/src/workflows/studio.production.workflow.ts`: produção durável, sem repetição automática de voz paga após falha.
- `apps/orchestrator/src/workflows/studio.distribution.workflow.ts`: execução e acompanhamento dos lotes confirmados.
- `apps/frontend/src/components/studio`: interface de conteúdo, produção, revisão e grade.
- `apps/studio-agent`: ponte MCP, configurações e testes de protocolo.
