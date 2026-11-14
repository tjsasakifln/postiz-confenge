# Verificação do Estúdio

Este registro distingue processamento e contratos testados de operação homologada nas contas reais. A matriz [COVERAGE.md](COVERAGE.md) registra o alcance de cada capacidade.

## Ampliação atual: conferida localmente

| Verificação | Resultado |
| --- | --- |
| Prisma Client 6.5.0 gerado com o schema ampliado | Passou. |
| Build NestJS do backend e do orquestrador | Ambos passaram com heap de 6 GB. |
| TypeScript do frontend | Passou, incluindo a recuperação da grade após falha de início. |
| Suíte do servidor | 114 testes passaram. Treze testes PostgreSQL e um teste de voz local ficaram reservados ao ambiente CI preparado. |
| Interface em DOM simulado | 28 testes passaram em seis arquivos. |
| Servidor MCP | TypeScript compilado e 29 testes passaram em quatro arquivos, incluindo processo real por stdio contra API HTTP sintética. |
| Lockfile | Instalação de conferência offline, frozen e sem scripts passou. |
| Diferenças de arquivos | git diff --check passou. |

Ambiente local: Node 24.22.1 e pnpm 10.6.1 via Corepack. A versão declarada e usada no GitHub é Node 22.23.4. O ambiente local não possui PostgreSQL nem espeak-ng para os testes opt-in correspondentes.

A suíte de mídia usa FFmpeg e Sharp reais. Confere MP4 H.264 com áudio, duração e dimensões vertical/horizontal/quadrada, PNGs, legendas, recorte de Story, fontes, direitos de uso, organização, link simbólico e playlist disfarçada de áudio. Marca e capa extraída também foram abertas como imagens durante a revisão. A voz configurada na identidade é resolvida antes do trabalho; áudio gravado não cai silenciosamente em voz paga.

Os adaptadores sociais usam respostas controladas. Os testes cobrem upload privado, sessão retomável, agendamento confirmado por leitura, virada do dia de cota, conteúdo público antes do espelho, intervalo Instagram, escrita incerta, reconciliação terminal, reserva por alvo e isolamento. A API comercial confere valores financeiros, externalId, revisão e autoria. Os testes PostgreSQL preparados exercitam concorrência real, chaves compostas, cota compartilhada, limite mensal e repetição de eventos externos.

Comandos reproduzíveis:

```sh
corepack pnpm run test:studio
corepack pnpm exec vitest run --config apps/frontend/vitest.studio.config.mts
corepack pnpm --filter postiz-studio-agent run test
corepack pnpm exec tsc --project apps/frontend/tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/backend run build
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/orchestrator run build
```

## Execuções já conferidas no GitHub

A versão anterior à ampliação passou na [compilação completa, execução 43539282725](https://github.com/tjsasakifln/postiz-confenge/actions/runs/43539282725), com frontend Next.js, backend e orquestrador, no commit `c333a694486abf3dc04a0649a18523cc4bd54514`. A [verificação do Estúdio, execução 43539282851](https://github.com/tjsasakifln/postiz-confenge/actions/runs/43539282851) passou na mesma revisão. O build Next mantém a sanitização e carrega isomorphic-dompurify como pacote externo de servidor, preservando os arquivos de runtime de sua dependência jsdom.

Essas execuções anteriores não comprovam a ampliação atual. O workflow atualizado instala FFmpeg, fontes DejaVu e espeak-ng, prepara PostgreSQL 16 descartável, aplica o schema, executa as suítes servidor/interface/MCP, confere TypeScript e realiza quatro fluxos Chromium em computador/celular antes dos builds. O resultado da revisão enviada deve ser conferido na aba Checks da [proposta de alteração](https://github.com/tjsasakifln/postiz-confenge/pull/1).

A prévia visual fica fora das rotas do produto, usa os componentes reais e a folha de estilos do frontend, mas substitui serviços por dados fictícios explicitamente identificados. Não acessa contas sociais nem IA paga. As capturas da execução ficam no artefato studio-interface. Testes de DOM isolados não são apresentados como inspeção visual de navegador.

## Revisão independente

Houve revisão cruzada de núcleo, produção, distribuição, interface, MCP, audiência e requisitos. Os achados materiais corrigidos incluem voz aprovada substituída indevidamente por voz paga, repetição de Reel depois de reconciliação, reserva de cota após meia-noite, retomada do lote confirmado após indisponibilidade do Temporal e aceitação de valor financeiro nulo pela API pública. O controle de confirmação do MCP foi revisado por outro implementador e sua suíte foi executada novamente.

## Limites da validação

- Não houve publicação, resposta a comentário ou chamada paga em contas reais. OAuth, permissões e processamento remoto continuam sujeitos à homologação da instalação.
- Docker completo, worker Temporal conectado à instalação e armazenamento R2 real não foram homologados. As configurações e os caminhos de código estão documentados; isso não equivale a operação observada.
- A sessão real dos quatro clientes MCP não foi executada. O protocolo stdio e os contratos foram testados; o formato de configuração do Codex instalado foi aceito por mcp get. Os outros exemplos foram confrontados com a documentação oficial.
- A síntese espeak-ng precisa do binário no worker e deve ser ouvida para aprovação editorial. O teste local correspondente não foi substituído por uma voz paga.
- O teste de navegador usa dados fictícios, sem autenticação completa, upload real pelo navegador ou integração com o backend. A experiência completa da instalação permanece uma etapa de homologação.
- Não se verificou geração de leads, resultado financeiro ou qualidade de uma campanha real da CONFENGE. Eventos comerciais registrados são fatos informados pela origem autorizada, e as etapas permanecem distintas.
