# Verificação do Estúdio

Este registro distingue processamento e contratos testados de operação homologada nas contas reais. A matriz [COVERAGE.md](COVERAGE.md) registra o alcance de cada capacidade.

## Resultado conferido no GitHub

Em 14 de novembro de 2026, a revisão `bb10900be426dc862a6d647b54b65fe9a8d57693` passou na [compilação completa, execução 43543055814](https://github.com/tjsasakifln/postiz-confenge/actions/runs/43543055814) e na [verificação do Estúdio, execução 43543055952](https://github.com/tjsasakifln/postiz-confenge/actions/runs/43543055952). Essa revisão já contém a distribuição nativa, o agente MCP, a entrada de eventos comerciais e a validação de mídia para Instagram.

| Verificação | Resultado |
| --- | --- |
| Compilação completa do monorepositório | Passou, incluindo frontend Next.js, backend e orquestrador. |
| Prisma Client 6.5.0 e schema ampliado | Gerados e aplicados ao PostgreSQL 16 descartável do teste. |
| TypeScript do frontend | Passou, incluindo a recuperação da grade após falha de início. |
| Suíte do servidor | 140 testes passaram em dezenove arquivos, sem testes ignorados. Inclui treze testes com PostgreSQL e a síntese local espeak-ng. |
| Interface em DOM simulado | 28 testes passaram em seis arquivos. |
| Servidor MCP | TypeScript compilado e 29 testes passaram em quatro arquivos, incluindo processo real por stdio contra API HTTP sintética. |
| Chromium em computador e celular | Quatro fluxos passaram, com catorze capturas de tela. |
| Revisão das imagens capturadas | Sete estados em cada tamanho foram abertos e conferidos. Sem corte horizontal ou sobreposição material nas ações de decisão. |
| Lockfile | Instalação congelada e sem scripts passou. |
| Diferenças de arquivos | git diff --check passou. |

O ambiente CI usa Node 22.23.4, pnpm 10.6.1, PostgreSQL 16, FFmpeg, fontes DejaVu e espeak-ng. O workflow do Estúdio fixa Ubuntu 24.04, compatível com a versão do Playwright. Também houve conferência local com Node 24.22.1 e pnpm 10.6.1 via Corepack. Os resultados completos acima são os do CI na versão declarada pelo projeto, com banco e sintetizador disponíveis.

A suíte de mídia usa FFmpeg e Sharp reais. Confere MP4 H.264 com áudio, duração e dimensões vertical/horizontal/quadrada, legendas, recorte de Story, fontes, direitos de uso, organização, link simbólico e playlist disfarçada de áudio. Capas e carrosséis são JPEGs reais; peças de marca preservam PNG e transparência. A validação Instagram verifica os bytes, o tamanho máximo, a proporção com orientação EXIF e a duração mínima do vídeo. Marca e capa extraída também foram abertas como imagens durante a revisão. A voz configurada na identidade é resolvida antes do trabalho; áudio gravado e voz local não caem silenciosamente em voz paga.

Os adaptadores sociais usam respostas controladas. Os testes cobrem upload privado, sessão retomável, agendamento confirmado por leitura, virada do dia de cota, conteúdo público antes do espelho, intervalo Instagram, escrita incerta, reconciliação terminal, reserva por alvo e isolamento. A API comercial confere valores financeiros, externalId, revisão e autoria. Os testes PostgreSQL exercitam concorrência real, chaves compostas, cota compartilhada, limite mensal e repetição de eventos externos.

Comandos reproduzíveis, com as dependências descritas no [manual](README.md). Para incluir os treze testes de banco, configure `STUDIO_DATABASE_TESTS=true` e `DATABASE_URL` apontando para PostgreSQL descartável com o schema aplicado. Nunca use o banco de operação para essa suíte.

```sh
corepack pnpm run test:studio
corepack pnpm exec vitest run --config apps/frontend/vitest.studio.config.mts
corepack pnpm --filter postiz-studio-agent run test
corepack pnpm exec tsc --project apps/frontend/tsconfig.json --noEmit
corepack pnpm exec playwright install --with-deps chromium
corepack pnpm exec playwright test --config apps/frontend/studio-preview/playwright.config.ts
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/backend run build
NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm --filter ./apps/orchestrator run build
```

## Inspeção da interface

A prévia fica fora das rotas do produto. Usa os componentes reais e a folha de estilos do frontend, com serviços substituídos por dados fictícios e aviso permanente na tela. Não acessa contas sociais nem IA paga. Os quatro fluxos de navegador percorrem identidade, roteiro, produção, pacotes e resultados, além de grade privada e revisão da grade, nas larguras de 1.440 e 390 pixels.

As catorze capturas ficam no artefato studio-interface da execução. Três imagens dessa revisão foram preservadas neste repositório:

- [Produção no computador](images/production-desktop.png).
- [Produção no celular](images/production-mobile.png).
- [Resultados comerciais fictícios no computador](images/results-desktop.png).

A inspeção identificou uma captura de página inteira com a barra sticky deslocada após rolagem. O helper foi ajustado para voltar ao topo antes de cada imagem; a revisão da grade e suas ações já estavam legíveis. O texto de ajuda passou a explicitar o intervalo de três segundos a três minutos e a capa JPEG de até 8 MB. O histórico e as verificações da revisão mais recente estão na [proposta de alteração](https://github.com/tjsasakifln/postiz-confenge/pull/1).

A compilação Next mantém a sanitização e carrega isomorphic-dompurify como pacote externo de servidor, preservando os arquivos de execução de sua dependência jsdom.

## Revisão independente

Houve revisão cruzada de núcleo, produção, distribuição, interface, MCP, audiência e requisitos. Os achados materiais corrigidos incluem voz aprovada substituída indevidamente por voz paga, repetição de Reel depois de reconciliação, reserva de cota após meia-noite, retomada do lote confirmado após indisponibilidade do Temporal, aceitação de valor financeiro nulo pela API pública e imagens PNG usadas onde o Instagram exige JPEG. O controle de confirmação do MCP foi revisado por outro implementador e sua suíte foi executada novamente.

## Limites da validação

- Não houve publicação, resposta a comentário ou chamada paga em contas reais. OAuth, permissões e processamento remoto continuam sujeitos à homologação da instalação.
- Docker completo, worker Temporal conectado à instalação e armazenamento R2 real não foram homologados. As configurações e os caminhos de código estão documentados; isso não equivale a operação observada.
- A sessão real dos quatro clientes MCP não foi executada. O protocolo stdio e os contratos foram testados; o formato de configuração do Codex instalado foi aceito por mcp get. Os outros exemplos foram confrontados com a documentação oficial.
- A síntese espeak-ng precisa do binário no worker e deve ser ouvida para aprovação editorial. O teste no CI produz áudio real, mas não comprova a pronúncia de uma campanha da empresa.
- O teste de navegador usa dados fictícios, sem autenticação completa, upload real pelo navegador ou integração com o backend. A experiência completa da instalação permanece uma etapa de homologação.
- Não se verificou geração de leads, resultado financeiro ou qualidade de uma campanha real da CONFENGE. Eventos comerciais registrados são fatos informados pela origem autorizada, e as etapas permanecem distintas.
