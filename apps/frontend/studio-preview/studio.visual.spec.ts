import { expect, test, type Page, type TestInfo } from '@playwright/test';

const verifyAndCapture = async (
  page: Page,
  testInfo: TestInfo,
  name: string
) => {
  await expect(page.locator('body')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(
    overflow.scroll,
    `${name}: conteúdo ultrapassa a largura da tela`
  ).toBeLessThanOrEqual(overflow.viewport + 1);
  const unlabelled = await page
    .locator('input, select, textarea')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const control = element as
            | HTMLInputElement
            | HTMLSelectElement
            | HTMLTextAreaElement;
          return (
            control.type !== 'hidden' &&
            !control.labels?.length &&
            !control.getAttribute('aria-label') &&
            !control.getAttribute('aria-labelledby')
          );
        })
        .map((element) => element.outerHTML)
    );
  expect(unlabelled, `${name}: controles sem rótulo acessível`).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
  });
};

const inspectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
};

test('identidade, cenas, produção, pacotes e resultados usam os componentes reais', async ({
  page,
}, testInfo) => {
  const errors = inspectErrors(page);
  await page.goto('/studio?project=visual-test');
  await expect(page.getByText(/AMBIENTE ISOLADO DE TESTE/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Estúdio de conteúdo' })
  ).toBeVisible();
  await expect(page.getByLabel('Nome da marca')).toHaveValue('Marca fictícia');
  await expect(
    page.getByLabel('Identidade aprovada para reutilizar')
  ).toBeEnabled();
  await expect(page.getByLabel('Origem da narração')).toHaveValue('local');
  await expect(page.getByLabel('Fuso horário IANA')).toHaveValue(
    'America/Sao_Paulo'
  );
  await verifyAndCapture(page, testInfo, '01-identidade');

  await page.getByRole('button', { name: '3. Roteiro', exact: true }).click();
  await expect(page.getByLabel('Efeito sonoro da cena 1')).toHaveValue('');
  await expect(
    page.getByLabel('Efeito sonoro da cena 1').locator('option')
  ).toHaveCount(21);
  await verifyAndCapture(page, testInfo, '02-roteiro');

  await page.getByRole('button', { name: '4. Produção', exact: true }).click();
  await expect(page.getByLabel('Voz para cenas sem gravação')).toHaveValue(
    'local'
  );
  await expect(page.getByLabel('Vídeo para extrair capas')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Criar conjunto de arquivos da marca' })
  ).toBeEnabled();
  await verifyAndCapture(page, testInfo, '03-producao');

  await page.getByRole('button', { name: '5. Pacotes', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /Pacotes por canal/ })
  ).toBeVisible();
  await verifyAndCapture(page, testInfo, '04-pacotes');

  await page
    .getByRole('button', { name: '8. Resultados', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: /Resultados comerciais/ })
  ).toBeVisible();
  await verifyAndCapture(page, testInfo, '05-resultados');
  expect(errors).toEqual([]);
});

test('grade exige declarações, mantém confirmação separada e mostra o estado privado', async ({
  page,
}, testInfo) => {
  const errors = inspectErrors(page);
  await page.goto('/studio?project=visual-test');
  await page
    .getByRole('button', { name: '6. Publicação', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Grade YouTube e espelhamento', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Estoque observado por canal' })
  ).toBeVisible();
  await page
    .getByLabel('Grades registradas')
    .selectOption('fixture-private-batch');
  await expect(
    page.getByText('Vídeo enviado como privado', { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/Publicação pública confirmada em/)).toHaveCount(
    0
  );
  await verifyAndCapture(page, testInfo, '06-grade-privada');

  await page.getByRole('button', { name: 'Nova grade', exact: true }).click();
  await page
    .getByRole('button', { name: 'Adicionar conteúdo à grade' })
    .click();
  await expect(page.getByLabel('O item 1 é feito para crianças?')).toHaveValue(
    ''
  );
  await expect(
    page.getByLabel('O item 1 contém conteúdo sintético?')
  ).toHaveValue('');
  await page
    .getByRole('button', { name: 'Sugerir horários do modelo' })
    .click();
  await expect(
    page.getByLabel(/Data e horário local do item 1/)
  ).not.toHaveValue('');
  await page.getByLabel(/Limite diário de uploads reservado/).fill('2');
  await page.getByLabel(/Limite diário de outras operações/).fill('400');
  await page
    .getByRole('button', { name: 'Preparar grade para revisão' })
    .click();
  await expect(page.getByRole('alert')).toContainText('explicitamente');
  await page.getByLabel('O item 1 é feito para crianças?').selectOption('no');
  await page
    .getByLabel('O item 1 contém conteúdo sintético?')
    .selectOption('yes');
  await page
    .getByRole('button', { name: 'Preparar grade para revisão' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Grade Em revisão' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Confirmar grade e iniciar envios privados',
    })
  ).toBeDisabled();
  const writes = await page.evaluate(() =>
    window.__studioPreviewRequests
      .filter((item) => item.method !== 'GET')
      .map((item) => item.url)
  );
  expect(writes).toEqual(['/studio/distribution/plan']);
  await verifyAndCapture(page, testInfo, '07-grade-revisao');
  expect(errors).toEqual([]);
});
