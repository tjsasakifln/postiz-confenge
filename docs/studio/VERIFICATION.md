# Verificação do Estúdio

Este registro separa código testado localmente de validação nas contas reais.

## Conferido localmente

| Verificação | Resultado |
|---|---|
| Prisma Client 6.5.0 gerado a partir do schema do fork | Passou. |
| Build NestJS do backend | Passou com limite de heap de 6 GB. |
| Build NestJS do orquestrador | Passou com limite de heap de 6 GB. |
| TypeScript do frontend | Passou. |
| Testes do núcleo, audiência, pesquisa, produção e limites de workflow | 72 passaram localmente; os quatro testes PostgreSQL ficaram reservados à CI. |
| Testes de interface em ambiente de DOM simulado | 15 passaram em quatro arquivos. |
| Lint dos componentes e da rota do Estúdio | Nenhum erro; uma advertência pelo uso de imagem nas prévias da biblioteca. |
| MP4 com FFmpeg real | Verificados vídeo H.264, áudio, duração e dimensões 1080x1920, 1920x1080 e 1080x1080. |
| PNGs e legendas | Capas/carrossel reais; texto de pronúncia não entra na legenda; legenda longa não é cortada silenciosamente; corte para Story limita também a legenda. |
| Isolamento e entradas de mídia | Testados organização diferente, origem/licença ausente, link simbólico fora do armazenamento e playlist disfarçada de áudio. |
| Aprovações e concorrência | Testadas revisão obsoleta, fontes de risco alto, alteração de etapa, reserva idempotente e conteúdo histórico aprovado. |
| Respostas a comentários | Testados edição após aprovação, reserva concorrente, sucesso, timeout, HTTP 408/499, reconciliação e falha de persistência depois de envio. |
| Ausência de métricas | Testado erro de permissão, campo ausente e zero medido no LinkedIn Page. |

Ambiente local: Node 24.22.1 e pnpm 10.6.1 via Corepack. A versão declarada pelo projeto é Node 22.23.4; o workflow de CI usa essa versão.

Comandos centrais:

```sh
corepack pnpm run test:studio
corepack pnpm exec vitest run --config apps/frontend/vitest.studio.config.mts
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/backend run build
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/orchestrator run build
corepack pnpm exec tsc --project apps/frontend/tsconfig.json --noEmit
```

## Conferido no GitHub

O workflow [Studio verification, execução 43538204051](https://github.com/tjsasakifln/postiz-confenge/actions/runs/43538204051) passou usando Node 22.23.4 e PostgreSQL 16 descartável. Conferiu instalação, geração do Prisma Client, aplicação do schema, **76 testes do servidor**, **14 testes da interface** e builds do backend e do orquestrador no commit `0fe09184f8738e3771cdb38e5670a3f9f25b57f4`.

Os quatro testes de banco passaram nessa execução, incluindo disputa por revisão, reserva de envio e isolamento por organização. O teste adicional da interface para falha de conexão foi acrescentado e passou localmente depois desse commit. A situação da revisão mais recente deve ser conferida na aba **Checks** da proposta de alteração.

## Limites da validação

- Não houve publicação, resposta a comentário ou chamada paga nas contas reais. Os testes de adaptadores usam respostas controladas.
- Os quatro testes de concorrência/persistência PostgreSQL são opt-in e exigem banco descartável. Passaram no GitHub; não foram executados no ambiente local sem PostgreSQL.
- A tentativa de captura visual do frontend por Chromium foi bloqueada pelo ambiente com erro de criação de socket. Não se declara inspeção visual completa de desktop/mobile com base nos testes de DOM.
- Duas tentativas locais de build de produção Next.js terminaram por limite de memória do ambiente. A segunda já utilizava as opções documentadas `webpackMemoryOptimizations` e `webpackBuildWorker`, preservando sourcemaps, Sentry e validação TypeScript. O worker recebeu `SIGKILL` durante a otimização. A checagem TypeScript e os testes de interface passaram, mas isso não equivale a um build completo da interface.
- Docker, OAuth dos canais, armazenamento R2 e worker Temporal conectado a uma instalação real precisam de homologação de operação.

## Revisões independentes

A implementação teve revisão cruzada de núcleo, audiência, produção e interface. A revisão dos requisitos comparou os 26 itens com o sumário e o capítulo fornecidos. Falhas materiais encontradas e corrigidas incluíram exposição de erro bruto de provedor, resposta incerta tratada como falha definitiva, aceitação de playlists como mídia, truncamento de legendas longas, associação de render com material alterado e ausência de aviso de pesquisa parcial.

A matriz [COVERAGE.md](COVERAGE.md) registra a cobertura funcional e as lacunas. Aprovação dos testes locais não significa que as plataformas já concederam acesso nem que todas as promessas do livro estão implementadas.
