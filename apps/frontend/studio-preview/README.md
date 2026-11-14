# Prévia isolada do Estúdio

Esta pasta verifica os componentes reais do Estúdio com o CSS real da aplicação. Não cria uma rota de produto, não altera autenticação e não usa contas, mídias ou resultados comerciais reais. Um aviso permanente identifica todos os dados como fictícios.

A configuração Vite troca apenas as dependências de serviço, navegação e biblioteca de mídia por fixtures locais. Requisições desconhecidas falham. Preparar uma grade cria uma fixture em memória para revisar o formulário. Confirmação, publicação, geração e upload estão desativados. Nenhuma requisição é encaminhada a um backend.

## Executar

Na raiz do repositório, com as dependências instaladas:

```bash
corepack pnpm@10.6.1 exec playwright install chromium
corepack pnpm@10.6.1 exec playwright test --config apps/frontend/studio-preview/playwright.config.ts
```

O teste inicia Vite na porta local 4311, abre larguras de 1440 e 390 pixels, percorre as etapas, verifica rótulos e ausência de largura excedente, exige declarações na grade e registra erros de JavaScript e console. Os PNGs ficam em `test-results/studio-preview`, junto dos detalhes de falhas. A execução não compara imagens com um modelo aprovado; os PNGs precisam de inspeção humana.

Para inspecionar manualmente em um ambiente com navegador disponível:

```bash
corepack pnpm@10.6.1 exec vite --config apps/frontend/studio-preview/vite.config.mts
```

Abra `http://127.0.0.1:4311/studio?project=visual-test`. As fixtures não demonstram funcionamento de provedores ou autorização de contas. Essas integrações têm testes próprios no backend e exigem validação com credenciais autorizadas antes do uso real.
