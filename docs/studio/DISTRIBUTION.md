# Distribuição nativa do Estúdio

Esta extensão prepara lotes imutáveis a partir de pacotes aprovados, envia vídeos ao YouTube como privados e solicita `status.publishAt` somente depois de terminar o upload. O operador confirma o lote na grade. A preparação do plano não publica conteúdo nem modifica as plataformas.

O Instagram é uma opção do lote. Quando habilitado, o worker reutiliza o mesmo arquivo aprovado e só cria um Reel depois de consultar o YouTube e confirmar `privacyStatus=public` e `uploadStatus=processed`. O intervalo mínimo entre espelhamentos administrados pela extensão é de uma hora por identificador real da conta Instagram, inclusive quando a conta está conectada em duas organizações da mesma instalação.

## Pré-requisitos e confirmação

- Banco atualizado com as tabelas `StudioDistribution*` e cliente Prisma regenerado.
- Backend e orchestrator com `StudioDistributionModule`, activity `advanceStudioDistributionV1` e workflow novo `studioDistributionWorkflowV1`.
- Worker Temporal ativo na fila `main`. Ter a conexão configurada não comprova que o worker está executando.
- OAuth do YouTube configurado. A conexão precisa permitir upload e atualização de status. As chamadas oficiais conferem o acesso da conta e cada operação.
- Conta profissional do Instagram conectada por um dos provedores suportados. Permissões de publicação, restrições da conta e disponibilidade de cota continuam sujeitas à Meta.
- FFprobe, FFmpeg e mídia própria ou licenciada acessível no armazenamento autorizado do Postiz.
- Arquivos com URLs HTTPS acessíveis pelas plataformas. O inspetor valida autorização da organização, formato MP4, duração, dimensões e hash SHA-256 dos bytes; limite local de quinze minutos e 256 MB.

O projeto deve ter as três aprovações atuais: identidade, roteiro e pacote. O plano exige a revisão exata do projeto, uma conta YouTube da mesma organização, uma data entre trinta minutos e trinta dias no futuro e duas declarações explícitas por item: conteúdo feito para crianças e presença de conteúdo sintético. Nenhuma dessas declarações começa com uma resposta presumida na grade.

O fuso IANA é exibido no plano, e `publishAt` contém um instante ISO 8601 com fuso. Um lote aceita até vinte itens. A confirmação mostra conteúdo, contas, datas, estimativa de cota e opção de espelhamento. Depois de confirmar, o snapshot permanece imutável: editar o projeto não altera os envios já autorizados.

## Cota local e limites do plano comercial

As fontes oficiais em inglês consultadas em 14 de novembro de 2026 descrevem dois contadores relevantes para este fluxo:

| Operação | Contador utilizado |
| --- | --- |
| Iniciar `videos.insert` | Uma chamada no contador de uploads |
| Consultar canal ou vídeo | Uma unidade no contador dos demais endpoints |
| Atualizar status nativo | Cinquenta unidades |
| Aplicar miniatura | Cinquenta unidades |

Os limites padrão documentados são cem uploads por dia e dez mil unidades por dia para os demais endpoints. A quota diária usa o fuso `America/Los_Angeles`, incluindo horário de verão. A tradução antiga em português ainda mostrava o custo anterior de 1.600 unidades por upload; ela não foi usada no cálculo.

Configuração do servidor:

| Variável | Valor padrão | Finalidade |
| --- | --- | --- |
| `STUDIO_YOUTUBE_DAILY_UPLOAD_BUDGET` | `100` | Teto diário local de chamadas de upload |
| `STUDIO_YOUTUBE_DAILY_OTHER_UNITS` | `10000` | Teto diário local das demais operações |
| `STUDIO_YOUTUBE_QUOTA_PROJECT` | vazio | Identificador estável do projeto Google quando mais de um cliente OAuth compartilha a cota |

O escopo armazenado é um hash do identificador do projeto configurado, ou de `YOUTUBE_CLIENT_ID` quando não houver identificador explícito. Organizações e canais da mesma instalação não recebem cotas independentes para a mesma credencial. Instâncias que compartilham o projeto Google devem compartilhar esse escopo e o banco de reservas.

O orçamento informado pelo operador pode ser menor que o teto do servidor. A confirmação reserva o lote inteiro por dia antes do primeiro upload, em uma transação. Se não couber, a confirmação é revertida. O worker confere novamente o dia real antes do início e antes das atualizações nativas, porque um upload retomável pode atravessar a meia-noite do Pacífico. Consultas manuais reservam margem para as leituras restantes e as escritas daquele dia.

**Essa reserva não consulta o saldo oficial do Google.** Outros aplicativos, ferramentas e operações fora da grade podem consumir cota. O servidor conserva as reservas de API feitas, inclusive quando um lote termina com falha ou cancelamento, para não devolver uma cota possivelmente consumida. Trata-se de um limite local conservador, com estimativas de consulta, e não de um relatório de faturamento ou consumo oficial.

A confirmação também aplica `CheckPolicies` para `POSTS_PER_MONTH`. A mesma contagem mensal usada pelo calendário inclui as reservas nativas. Cada alvo ocupa uma publicação: YouTube e, quando selecionado, Instagram. Falha definitiva libera a reserva mensal do alvo afetado; resultado incerto conserva a reserva. Essa contagem mensal é diferente da reserva de API do Google.

## Estados e retomada

| Estado | O que está comprovado |
| --- | --- |
| `planned` | Plano local preparado, sem autorização de envio |
| `reserved` | Operador confirmou; cota e chaves de publicação foram reservadas |
| `upload_starting` | Uma tentativa de abrir a sessão foi registrada antes da chamada |
| `uploading` | Sessão persistida; os mesmos bytes podem ser retomados consultando seu offset |
| `uploaded_private` | Upload concluído com configuração inicial privada; a visibilidade remota é consultada antes de agendar |
| `schedule_setting` | Uma tentativa de aplicar a data foi registrada |
| `schedule_verifying` | A atualização respondeu, mas a leitura de status ainda será feita |
| `youtube_scheduled` | Leitura confirmou visibilidade privada e a data solicitada |
| `youtube_public` | Leitura confirmou vídeo público e processado |
| `mirror_waiting` | Regra autorizada aguarda elegibilidade e intervalo |
| `mirror_creating` / `mirror_processing` | Contêiner solicitado ou em processamento, sem afirmar publicação |
| `mirror_publishing` | Uma tentativa de `media_publish` foi registrada antes da chamada |
| `mirrored` | Resposta ou leitura do contêiner confirmou publicação no Instagram |
| `uncertain` | Não há evidência suficiente para repetir a escrita |
| `failed` | Falha definitiva; a automação não é reativada pela consulta de situação |
| `blocked` | Precisa de conferência; não implica ausência de efeito remoto anterior |

O vídeo só passa a `PUBLISHED` no histórico do Postiz depois da confirmação pública. O link de um vídeo privado pode aparecer para seu responsável, acompanhado da privacidade observada. Um URL existente, por si só, não significa publicação pública.

O upload usa a sessão retomável já suportada pelo provedor YouTube. A URI é persistida no campo privado `uploadSession`, usando o provedor de criptografia configurado no Postiz. Ela não é retornada pela API, enviada ao modelo nem incluída nas mensagens de erro. Tokens continuam limitados aos serviços e adaptadores.

O início do upload, a capa, o agendamento e as escritas Instagram não têm repetição HTTP implícita neste fluxo. Falhas de rede, HTTP 408, 499 ou 5xx em uma escrita mantêm resultado incerto. Uma sessão de upload conhecida pode ser sondada e retomada sem criar outro vídeo. Uma sessão ou contêiner cujo identificador se perdeu não é substituído automaticamente.

Se o upload termina depois da antecedência segura, o worker não aplica uma data passada. O vídeo fica privado e a grade orienta o responsável a revisar a data no YouTube Studio. Isso evita que a plataforma publique imediatamente por receber um `publishAt` passado.

## Espelhamento e limites

- Somente Reel com o mesmo arquivo nos pacotes aprovados de YouTube e Instagram.
- Duração medida de até 180 segundos, largura menor ou igual à altura, licença registrada e hash estável. A medida do arquivo é conferida novamente antes do envio.
- O YouTube deve responder público e processado antes da criação do contêiner e novamente antes da publicação Instagram.
- O limite de publicação da Meta é consultado antes de criar e de publicar o contêiner. Ausência de dados de cota não é tratada como saldo disponível.
- Chave durável por vídeo YouTube e identificador da conta Instagram. A consulta de um item já espelhado é terminal e não o coloca novamente na fila.
- Um gate global por conta administra a hora de intervalo. Uma publicação com resultado incerto conserva o gate até a conferência, impedindo que um segundo worker avance nessa conta.
- O intervalo cobre os espelhamentos desta instalação e considera publicações já registradas no Postiz para aquela conexão. Publicações manuais ou feitas por aplicativos externos não podem ser bloqueadas por este banco.
- O contêiner é consultado a cada minuto, até cinco vezes, conforme a orientação da Meta. Erro, expiração ou processamento não concluído encerram a tentativa automática. A regra não cria outro contêiner às cegas.
- A monitoração automática do YouTube dura até 24 horas depois da data planejada, com consultas de quinze em quinze minutos. Há limite de 120 consultas de vídeo por item, incluindo verificações manuais.
- Se `status_code=PUBLISHED` confirma o Instagram, mas o ID final se perdeu, a grade registra o sucesso confirmado sem inventar URL ou ID. Comentários e métricas desse post só ficam disponíveis quando houver um identificador verificável.
- Stories, importação do acervo inteiro do canal, seleção automática de outros vídeos e cancelamento remoto de vídeos já enviados não pertencem a esta extensão.

## Rotas autenticadas

Todas usam a organização da sessão. Nenhuma aceita `organizationId`, token, URI de sessão, ID de workflow ou snapshot fornecido pelo cliente.

| Método e rota | Efeito |
| --- | --- |
| `GET /studio/distribution/capabilities` | Configuração disponível, canais e permissões exigidas |
| `GET /studio/distribution/inventory` | Até cinquenta lotes da organização, com estados e datas observadas |
| `POST /studio/distribution/plan` | Inspeção dos arquivos e plano local imutável |
| `GET /studio/distribution/batches/:id` | Grade de um lote |
| `POST /studio/distribution/batches/:id/confirm` | `{revision, confirmed:true}`; reserva transacional e início do workflow |
| `POST /studio/distribution/batches/:id/cancel` | `{revision}`; cancela somente itens cujo upload não começou |
| `POST /studio/distribution/items/:id/reconcile` | `{revision}`; lê a situação remota sem repetir escrita incerta |

Repetir a confirmação de um lote já confirmado usa as mesmas reservas e o mesmo identificador de workflow. Uma falha ao contatar o Temporal não abre outro upload. A consulta de situação pode retomar a monitoração de um agendamento confirmado ou a regra de espelhamento já autorizada quando o estado é resolvido com segurança. Um upload privado encontrado sem agendamento e uma falha definitiva exigem decisão do operador; a consulta não agenda o vídeo silenciosamente.

## Verificação sem publicação real

O conjunto `test:studio` inclui testes de estados, autorização, inspeção de bytes, origem dos canais, uma única tentativa HTTP, proteção de credenciais, cota por dia, concorrência, intervalos e reconciliação. Os testes de persistência `studio.distribution.persistence.spec.ts` exigem `STUDIO_DATABASE_TESTS=true` em um PostgreSQL descartável com o schema atualizado. Eles não usam as APIs de YouTube ou Instagram.

Nenhum teste da implementação publica em contas reais. Antes de operar uma instalação, execute um piloto controlado com credenciais próprias, os escopos exigidos e um conteúdo aprovado, verificando no YouTube Studio a visibilidade inicial privada, a data nativa e o estado público antes de habilitar o espelho. A interface distingue configuração presente de permissão remota efetiva.

## Fontes oficiais consultadas

- [YouTube: recurso Video e status.publishAt](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- [YouTube: videos.insert](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert)
- [YouTube: calculadora de cota](https://developers.google.com/youtube/data/determine_quota_cost), atualização exibida em 12/11/2026
- [YouTube: protocolo de upload retomável](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol)
- [YouTube: Shorts de até três minutos](https://support.google.com/youtube/answer/15424877?hl=en)
- [Meta: publicação de conteúdo no Instagram](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [Meta: criação de contêineres e requisitos de mídia](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media)

Consulta realizada em 14/11/2026. O código mantém a versão Graph já usada pelo Postiz, `META_GRAPH_API_VERSION`, para não alterar o restante dos provedores por causa desta extensão.
