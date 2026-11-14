import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  StudioCapabilities,
  StudioProject,
} from '@gitroom/helpers/studio/studio.types';
import { StudioProduction } from './studio.production';

const { request, uploader, picker } = vi.hoisted(() => ({
  request: vi.fn(),
  uploader: { on: vi.fn(), off: vi.fn(), destroy: vi.fn(), addFile: vi.fn() },
  picker: vi.fn(),
}));
vi.mock('./studio.hooks', () => ({
  useStudioRequest: () => request,
  useStudioRenderJob: () => ({ data: { status: 'pending' }, mutate: vi.fn() }),
}));
vi.mock('@gitroom/frontend/components/media/media.component', () => ({
  showMediaBox: picker,
}));
vi.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => uploader,
}));

const project = (): StudioProject => ({
  id: 'production-test',
  title: 'Produção de teste',
  revision: 4,
  status: 'script_approved',
  approvals: {
    script: {
      stage: 'script',
      hash: 'script-test',
      revision: 4,
      approvedBy: 'reviewer',
      approvedAt: '2026-11-01T12:00:00Z',
    },
  },
  createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
  publications: [],
  outcomes: [],
  events: [],
  document: {
    brief: 'Teste',
    identity: {
      audience: 'Teste',
      positioning: 'Teste',
      tone: 'Teste',
      visualStyle: 'Teste',
      evidence: [],
      hypotheses: [],
    },
    sources: [],
    topic: 'Teste',
    scenes: [
      {
        id: 'scene-test',
        narration: 'Gancho de teste.',
        pronunciation: '',
        visual: 'Título de teste',
        durationSeconds: 3,
        sourceIds: [],
        kind: 'card',
      },
    ],
    packages: [],
    media: [],
    renders: [],
  },
});
const capabilities: StudioCapabilities = {
  text: { available: false, reason: '' },
  research: { available: false, reason: '' },
  publishing: { available: false, reason: '' },
  media: { available: true, reason: 'Produção configurada.' },
  platforms: [],
  integrations: [],
};

beforeEach(() => {
  request.mockReset();
  picker.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe('Produção com arquivos e trabalhos reais', () => {
  it('starts a versioned render only after a click and persists only its job identifier', async () => {
    request.mockResolvedValueOnce({ jobId: 'job-test' });
    const current = project();
    render(
      <StudioProduction
        project={current}
        document={current.document}
        onChange={() => {}}
        capabilities={capabilities}
        blocked={false}
        pending={null}
        onProjectAction={async () => {}}
      />
    );
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Produzir vídeo' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][0]).toBe(
      '/studio/projects/production-test/render'
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      revision: 4,
      format: 'vertical',
      voice: 'nova',
      attempt: 0,
    });
    await waitFor(() =>
      expect(
        localStorage.getItem('postiz:studio:production-test:render-jobs')
      ).toBe('["job-test"]')
    );
    expect(screen.getByText(/Vídeo em produção/)).toBeTruthy();
  });

  it('requires an explicit rights choice before attaching a picked library asset', () => {
    picker.mockImplementation((callback) =>
      callback({
        id: 'real-library-id',
        path: 'https://example.com/upload/image.png',
      })
    );
    const current = project();
    const change = vi.fn();
    render(
      <StudioProduction
        project={current}
        document={current.document}
        onChange={change}
        capabilities={capabilities}
        blocked={false}
        pending={null}
        onProjectAction={async () => {}}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Escolher imagem ou vídeo' })
    );
    const attach = screen.getByRole('button', {
      name: 'Anexar arquivo e direitos',
    }) as HTMLButtonElement;
    expect(attach.disabled).toBe(true);
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Direito de uso confirmado'), {
      target: { value: 'licensed' },
    });
    fireEvent.change(screen.getByLabelText(/Referência da origem ou licença/), {
      target: { value: 'https://example.com/license' },
    });
    fireEvent.click(attach);
    expect(change.mock.calls[0][0].media[0]).toMatchObject({
      id: 'real-library-id',
      license: 'licensed',
      sourceUrl: 'https://example.com/license',
      kind: 'image',
    });
  });
});
