# Estúdio CONFENGE

Este fork acrescenta ao Postiz uma área de planejamento, pesquisa, roteiro, produção de mídia, revisão, distribuição e acompanhamento comercial para YouTube, Instagram e LinkedIn. A entrada é **Estúdio**, no menu, ou `/studio`.

O código é uma implementação independente. O PDF fornecido para levantar requisitos contém o sumário e o primeiro capítulo do livro Framework Antares. Não contém os capítulos de implementação nem concede acesso ao programa original. O PDF e seus exemplos não são distribuídos neste repositório. A licença AGPL-3.0 do Postiz foi preservada.

## O fluxo disponível

1. Crie um projeto com o comprador, a dúvida que precisa resolver, a oferta e o próximo passo. A identidade separa evidência de hipótese. Aprove a identidade antes de pedir roteiro ou pesquisa.
2. Pesquise no YouTube e na web, ou cadastre fontes manualmente. Revise os trechos e marque fontes de alto risco. Vídeos de referência carregados na biblioteca podem ser medidos para duração, resolução, taxa de quadros, cortes e cor média do primeiro quadro. O resultado registra método e limitações.
3. Escreva ou gere cenas. Cada cena guarda a narração, uma pronúncia opcional separada da legenda, duração estimada, indicação visual e fontes. Aprove a versão do roteiro.
4. Escolha cartelas, imagens ou vídeos da biblioteca. Registre os direitos de uso. Vincule áudio gravado a cada cena ou use a narração configurada. Música de fundo é opcional. Produza MP4 vertical, horizontal ou quadrado. Selecione cenas para uma versão curta; o corte para Story tem limite explícito de 30 segundos. Anexe o resultado depois de assistir à prévia. Há exportação de legendas SRT.
5. Gere três capas ou um carrossel de até dez imagens. Prepare o pacote de cada canal com título, descrição, chamada e destino. Os candidatos de título e capa têm critérios editoriais e pontuação determinística, sem promessa de desempenho. URLs recebem os parâmetros de origem da campanha.
6. Aprove o pacote. A geração de rascunhos usa as integrações existentes do Postiz. Abra o calendário, revise as configurações específicas do canal e agende. Um rascunho não é apresentado como publicação. O histórico consulta o estado real dos posts.
7. Consulte comentários e métricas disponíveis. Uma resposta precisa de revisão, aprovação e comando explícito de envio. Se a API não confirmar uma tentativa, o sistema exige reconciliação antes de reenviar. Comentários são dados externos, nunca instruções para o sistema.
8. Registre somente avanços comerciais confirmados. Contato, lead qualificado, oportunidade, proposta, contrato, faturamento e recebimento são eventos distintos. Valores financeiros ficam em centavos, com moeda, referência e data.

## O que instalar

Use a versão de Node e de pnpm declaradas no `package.json`: Node 22.23.4 e pnpm 10.6.1. O aplicativo precisa dos mesmos serviços do Postiz: PostgreSQL, Redis e Temporal. O worker de produção precisa de FFmpeg, ffprobe e fontes DejaVu. O `Dockerfile.dev` deste fork inclui esses pacotes.

Para desenvolver em uma instalação Postiz preparada:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run prisma-generate
corepack pnpm run prisma-db-push
corepack pnpm run dev
```

O schema acrescenta tabelas próprias do Estúdio. Aplique a atualização primeiro em uma cópia de teste do banco. O comando de schema do Postiz é `prisma-db-push`; este fork não inventa um histórico de migrations sobre uma instalação que não o tinha.

### Docker a partir deste fork

A imagem pronta `ghcr.io/gitroomhq/postiz-app:latest` não contém as alterações. Para construir este código, use o arquivo adicional:

```sh
cp .env.example .env
# Preencha STUDIO_JWT_SECRET com um segredo exclusivo antes de iniciar.
docker compose -f docker-compose.yaml -f docker-compose.studio.yaml up -d --build
```

O compose original é uma configuração local, com URL `http://localhost:4007`. Para operação externa, ajuste domínio/HTTPS, credenciais de banco e URLs de retorno conforme a documentação do Postiz. Um servidor precisa permanecer ativo para os trabalhos e as publicações agendadas pelo Postiz.

A compilação do monorepositório pode precisar de mais memória que os 2 GB padrão do Node. Exemplo para o backend:

```sh
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/backend run build
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/orchestrator run build
```

### Configuração por capacidade

| Configuração | Uso |
|---|---|
| `OPENAI_API_KEY` | Texto, sugestões de resposta e voz sintética. Ações de geração usam a conta do provedor. Edição manual e áudio gravado funcionam sem essa chave. |
| `STUDIO_TEXT_MODEL` | Modelo de texto, padrão `gpt-4.1`; confirme disponibilidade na conta. |
| `STUDIO_TTS_MODEL` | Modelo de voz, padrão `tts-1`. Cada cena gerada aceita até 4.096 caracteres de fala. |
| `YOUTUBE_DATA_API_KEY` | Pesquisa pública de vídeos. Não substitui o OAuth do canal. |
| `TAVILY_API_KEY` | Pesquisa web. Os trechos retornados continuam sujeitos à revisão. |
| `YOUTUBE_CLIENT_ID` e `YOUTUBE_CLIENT_SECRET` | Conexão do canal YouTube pelo fluxo existente do Postiz. |
| `FACEBOOK_APP_ID` e `FACEBOOK_APP_SECRET` | Instagram pela integração Meta existente. |
| `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` | Alternativa de login direto do Instagram. |
| `LINKEDIN_CLIENT_ID` e `LINKEDIN_CLIENT_SECRET` | Perfil ou página LinkedIn pelo Postiz. |
| `STORAGE_PROVIDER`, `UPLOAD_DIRECTORY` ou configuração R2 | Biblioteca e arquivos produzidos. |

As chaves ficam no ambiente do servidor. Não entram em prompts, retornos da API ou exemplos do repositório. Conectar uma conta, aprovar permissões de um aplicativo e validar uma publicação real são passos de instalação; não foram realizados durante a criação do fork.

## Limites que afetam a equivalência com o livro

A matriz completa está em [COVERAGE.md](COVERAGE.md). Esta versão entrega um estúdio funcional, mas não deve ser anunciada como reprodução integral de todas as promessas do Antares.

- O Estúdio cria rascunhos aprovados e usa o calendário do Postiz. Não implementa ainda o envio antecipado privado com `publishAt` nativo do YouTube nem um orçamento de cota para o lote inteiro. O upload retomável do YouTube já existe no Postiz e foi preservado.
- A distribuição para Instagram é escolhida pelo operador. Não há regra automática de espelhar somente Shorts já públicos, em intervalos de uma hora.
- As legendas usam a duração medida do áudio e distribuição proporcional do texto dentro de cada cena. Não há alinhamento palavra a palavra. A prévia deve ser conferida antes da publicação.
- A análise de estilo mede parâmetros concretos e registra suas limitações. Não identifica automaticamente famílias tipográficas, intenção do gancho ou sincronismo semântico.
- As capas são composições tipográficas, e o carrossel usa cenas. O gerador de marca produz alternativas de cartela. Não entrega ainda um conjunto completo de logo, avatar, banner e marca d'água, nem envia branding ao YouTube.
- Há música de fundo opcional. Não foi copiado o catálogo de efeitos sonoros do livro.
- A concorrência de renderização é limitada a dois vídeos por processo do worker. Não há painel próprio de lotes com alertas de estoque mínimo e cancelamento.
- Comentários dependem das APIs e permissões disponíveis. O LinkedIn permanece disponível para distribuição e métricas; respostas de comentários pelo novo Estúdio são implementadas para YouTube e Instagram.
- Os resultados comerciais são registros confirmados pelo usuário. Não são captura automática de formulário, CRM, emissão de proposta, faturamento ou conciliação bancária. Os links com UTM permitem integração com o site e com a carteira comercial existente.
- Crescimento, leads e receita são resultados a medir. O software não garante volume ou retorno.

## Validação

```sh
corepack pnpm run test:studio
corepack pnpm exec vitest run --config apps/frontend/vitest.studio.config.mts
```

Os testes de produção usam FFmpeg real e áudio de teste gerado localmente. Conferem container, dimensões, trilha de áudio, legendas, capas, isolamento de mídia, caminhos externos e playlists. Chamadas de IA e APIs sociais são substituídas por respostas controladas nos testes, sem custos nem publicações reais.

Os testes que dependem de banco são opt-in. Use **um banco descartável** e defina `STUDIO_DATABASE_TESTS=true`, além de `DATABASE_URL`. Nunca use esse modo contra o banco de operação. O workflow `Studio verification` configura seu próprio PostgreSQL e testa a disputa por revisões e reservas no banco.

Veja [VERIFICATION.md](VERIFICATION.md) para a execução efetivamente conferida desta entrega.

## Organização do código

- `libraries/helpers/src/studio`: contratos compartilhados.
- `libraries/nestjs-libraries/src/dtos/studio`: validação dos pedidos.
- `libraries/nestjs-libraries/src/database/prisma/studio`: persistência, aprovações, distribuição e resultados.
- `libraries/nestjs-libraries/src/studio`: texto, pesquisa, mídia e comentários.
- `apps/backend/src/api/routes/studio*`: rotas autenticadas.
- `apps/orchestrator/src/workflows/studio.production.workflow.ts`: produção durável pelo Temporal, sem repetição automática de uma chamada de voz que possa ser cobrada.
- `apps/frontend/src/components/studio`: interface de trabalho.

As aprovações guardam autor, data, conteúdo e hash. Edições relevantes invalidam a etapa e as posteriores. O projeto pertence a uma organização e exige revisão atual para alterações concorrentes. Os rascunhos e as respostas possuem reservas para evitar duplicação.
