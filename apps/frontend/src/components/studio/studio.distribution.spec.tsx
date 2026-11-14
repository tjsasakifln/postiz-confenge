import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { StudioProject } from '@gitroom/helpers/studio/studio.types';
import type {
  StudioDistributionBatch,
  StudioDistributionCapabilities,
} from '@gitroom/helpers/studio/studio.distribution.types';
import {
  StudioDistribution,
  StudioDistributionBatchView,
  studioLocalTimeToIso,
} from './studio.distribution';

const { request, refresh } = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
}));
const capabilities: StudioDistributionCapabilities = {
  available: true,
  reason: 'Fixture de teste.',
  workerRequired: true,
  maxBatchItems: 20,
  maxScheduleDays: 30,
  minAdvanceMinutes: 30,
  quotaBudgetCeiling: { uploads: 100, otherUnits: 100000 },
  quotaDisclaimer: 'Orçamento local, não saldo da plataforma.',
  integrations: [
    {
      id: 'youtube-test',
      name: 'Canal de teste',
      platform: 'youtube',
      provider: 'youtube',
      available: true,
      permissionHint: '',
    },
  ],
};
vi.mock('./studio.hooks', () => ({
  useStudioRequest: () => request,
  useStudioDistributionCapabilities: () => ({ data: capabilities }),
  useStudioDistributionInventory: () => ({
    data: { batches: [] as StudioDistributionBatch[], limit: 50 },
    mutate: refresh,
  }),
  useStudioDistributionBatch: () => ({
    data: undefined as StudioDistributionBatch | undefined,
    mutate: refresh,
  }),
}));

const project = (): StudioProject => ({
  id: 'project-test',
  title: 'Conteúdo de teste',
  revision: 8,
  status: 'approved',
  approvals: {
    package: {
      stage: 'package',
      hash: 'approved-test',
      revision: 8,
      approvedAt: '2026-11-14T12:00:00Z',
      approvedBy: 'reviewer-test',
    },
  },
  document: {
    brief: 'Teste',
    identity: {
      audience: 'Teste',
      positioning: 'Teste',
      tone: 'Teste',
      visualStyle: 'Teste',
      evidence: [],
      hypotheses: [],
      channel: { platform: 'youtube', integrationId: 'youtube-test' },
      schedule: {
        timezone: 'America/Sao_Paulo',
        slots: [{ dayOfWeek: 1, time: '09:00' }],
        weeklyFrequency: 1,
      },
    },
    sources: [],
    topic: '',
    scenes: [],
    packages: [
      {
        platform: 'youtube',
        title: 'Teste',
        description: '',
        cta: '',
        hashtags: [],
        landingUrl: '',
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        mediaIds: ['video-test'],
      },
    ],
    media: [{ id: 'video-test', kind: 'video', license: 'owned' }],
    renders: [],
  },
  createdAt: '2026-11-14T12:00:00Z',
  updatedAt: '2026-11-14T12:00:00Z',
  publications: [],
  outcomes: [],
  events: [],
});
const batch = (): StudioDistributionBatch => ({
  id: 'batch-test',
  revision: 1,
  state: 'planned',
  timezone: 'America/Sao_Paulo',
  quotaBudget: { uploads: 2, otherUnits: 200 },
  quotaEstimate: [
    {
      day: '2026-11-15',
      timezone: 'America/Los_Angeles',
      uploads: 1,
      otherUnits: 100,
    },
  ],
  quotaDisclaimer: 'Estimativa de teste.',
  mirrorEnabled: false,
  mirrorIntervalMinutes: 60,
  warnings: [],
  createdAt: '2026-11-14T12:00:00Z',
  items: [
    {
      id: 'item-test',
      batchId: 'batch-test',
      projectId: 'project-test',
      projectRevision: 8,
      title: 'Conteúdo de teste',
      integrationId: 'youtube-test',
      integrationName: 'Canal de teste',
      mediaId: 'video-test',
      publishAt: '2026-11-15T12:00:00Z',
      madeForKids: false,
      containsSyntheticMedia: true,
      phase: 'planned',
      revision: 1,
      canCancel: true,
      canReconcile: false,
    },
  ],
});
beforeEach(() => {
  request.mockReset();
  refresh.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Grade com data e autorização explícitas', () => {
  it('converts local times without silently changing nonexistent or ambiguous DST times', () => {
    expect(studioLocalTimeToIso('2026-11-15T09:00', 'America/Sao_Paulo')).toBe(
      '2026-11-15T12:00:00.000Z'
    );
    expect(() =>
      studioLocalTimeToIso('2026-03-08T02:30', 'America/New_York')
    ).toThrow(/não existe/);
    expect(() =>
      studioLocalTimeToIso('2026-11-01T01:30', 'America/New_York')
    ).toThrow(/duas vezes/);
    expect(() => studioLocalTimeToIso('2026-02-30T09:00', 'UTC')).toThrow(
      /não é válido/
    );
  });

  it('requires declarations per item and prepares only a plan before separate confirmation', async () => {
    request.mockResolvedValueOnce(batch());
    render(
      <StudioDistribution
        project={project()}
        blocked={false}
        onBusyChange={() => {}}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Adicionar conteúdo à grade' })
    );
    const childFlag = screen.getByLabelText(
      'O item 1 é feito para crianças?'
    ) as HTMLSelectElement;
    const synthetic = screen.getByLabelText(
      'O item 1 contém conteúdo sintético?'
    ) as HTMLSelectElement;
    expect(childFlag.value).toBe('');
    expect(synthetic.value).toBe('');
    const localDate =
      new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) + 'T09:00';
    fireEvent.change(screen.getByLabelText(/Data e horário local do item 1/), {
      target: { value: localDate },
    });
    fireEvent.change(screen.getByLabelText(/Limite diário de uploads/), {
      target: { value: '2' },
    });
    fireEvent.change(
      screen.getByLabelText(/Limite diário de outras operações/),
      { target: { value: '200' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Preparar grade para revisão' })
    );
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('explicitamente');
    fireEvent.change(childFlag, { target: { value: 'no' } });
    fireEvent.change(synthetic, { target: { value: 'yes' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Preparar grade para revisão' })
    );
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0][0]).toBe('/studio/distribution/plan');
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      timezone: 'America/Sao_Paulo',
      items: [
        {
          projectId: 'project-test',
          revision: 8,
          madeForKids: false,
          containsSyntheticMedia: true,
        },
      ],
    });
  });

  it('ties review to the exact batch and version before starting private uploads', async () => {
    request.mockResolvedValue(batch());
    const current = batch();
    const { rerender } = render(
      <StudioDistributionBatchView
        batch={current}
        blocked={false}
        onChanged={refresh}
        onBusyChange={() => {}}
      />
    );
    const button = () =>
      screen.getByRole('button', {
        name: 'Confirmar grade e iniciar envios privados',
      }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button().disabled).toBe(false);
    rerender(
      <StudioDistributionBatchView
        batch={{ ...current, id: 'different-batch' }}
        blocked={false}
        onChanged={refresh}
        onBusyChange={() => {}}
      />
    );
    expect(button().disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button());
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0][0]).toBe(
      '/studio/distribution/batches/different-batch/confirm'
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      revision: 1,
      confirmed: true,
    });
  });

  it('shows private state separately and reconciles without posting a second video', async () => {
    const current = batch();
    current.state = 'attention';
    current.items[0] = {
      ...current.items[0],
      phase: 'uncertain',
      youtubePrivacy: 'private',
      revision: 4,
      canReconcile: true,
      canCancel: false,
    };
    render(
      <StudioDistributionBatchView
        batch={current}
        blocked={false}
        onChanged={refresh}
        onBusyChange={() => {}}
      />
    );
    expect(screen.getByText(/Privacidade observada: privado/)).toBeTruthy();
    expect(screen.queryByText(/Publicação pública confirmada em/)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Verificar situação deste item' })
    );
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0][0]).toBe(
      '/studio/distribution/items/item-test/reconcile'
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ revision: 4 });
  });

  it('resumes a confirmed reservation without collecting the same editorial approval again', async () => {
    const current = {
      ...batch(),
      state: 'confirmed' as const,
      revision: 2,
      confirmedAt: '2026-11-14T12:00:00Z',
      error: 'Processamento ainda não iniciado.',
    };
    request.mockResolvedValueOnce(current);
    render(
      <StudioDistributionBatchView
        batch={current}
        blocked={false}
        onChanged={refresh}
        onBusyChange={() => {}}
      />
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retomar início do lote confirmado' })
    );
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0][0]).toBe(
      '/studio/distribution/batches/batch-test/confirm'
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      revision: 2,
      confirmed: true,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it('refreshes the stored reservation after an unconfirmed response without automatically repeating the write', async () => {
    request.mockRejectedValueOnce(
      new Error('Não foi possível iniciar o processamento.')
    );
    render(
      <StudioDistributionBatchView
        batch={batch()}
        blocked={false}
        onChanged={refresh}
        onBusyChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirmar grade e iniciar envios privados',
      })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível iniciar'
    );
  });
});
