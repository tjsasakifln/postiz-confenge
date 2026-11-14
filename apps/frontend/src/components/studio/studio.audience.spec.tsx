import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  StudioAudienceCapabilities,
  StudioAudienceMetrics,
  StudioAudienceThread,
  StudioAudienceThreadsResponse,
} from '@gitroom/helpers/studio/studio.audience.types';
import type { StudioDocument } from '@gitroom/helpers/studio/studio.types';
import { StudioAudience, StudioAudienceThreadCard } from './studio.audience';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./studio.hooks', () => ({
  useStudioRequest: () => request,
  useStudioAudienceCapabilities: () => ({
    data: {
      integrations: [],
      textGeneration: { available: false, reason: '' },
    } as StudioAudienceCapabilities,
  }),
  useStudioAudienceThreads: () => ({
    data: {
      threads: [],
      coverage: [],
      limit: 25,
    } as StudioAudienceThreadsResponse,
    mutate: vi.fn(),
  }),
  useStudioAudienceMetrics: () => ({
    data: {
      periodDays: 28,
      observedAt: '2026-11-14T12:00:00Z',
      source: 'connected-platform-api',
      posts: [],
      note: 'Dados de teste.',
      recommendations: [
        {
          kind: 'hypothesis',
          statement: 'A dúvida sobre prazo pode orientar uma pauta.',
          nextAction: 'Explicar as etapas antes de estimar prazo.',
          threadIds: [],
          postIds: ['post-test'],
        },
      ],
    } as StudioAudienceMetrics,
    mutate: vi.fn(),
    isValidating: false,
  }),
}));
const capabilities: StudioAudienceCapabilities = {
  integrations: [
    {
      id: 'account-test',
      name: 'Canal de teste',
      provider: 'youtube',
      comments: { available: true, reason: '' },
      reply: { available: true, reason: '' },
      metrics: { available: true, reason: '' },
    },
  ],
  textGeneration: { available: false, reason: 'Não configurado.' },
};
const thread = (): StudioAudienceThread => ({
  id: 'thread-test',
  integrationId: 'account-test',
  postId: 'post-test',
  platform: 'youtube',
  authorName: 'Autor de teste',
  text: 'Qual é o próximo passo?',
  publishedAt: '2026-11-01T12:00:00Z',
  observedAt: '2026-11-01T12:00:00Z',
  replyDraft: 'Resposta aprovada anteriormente.',
  draftHash: 'a'.repeat(64),
  approvalHash: 'a'.repeat(64),
  replyState: 'approved',
  revision: 1,
});
const Harness = ({
  initial = thread(),
}: {
  initial?: StudioAudienceThread;
}) => {
  const [current, setCurrent] = useState(initial);
  return (
    <StudioAudienceThreadCard
      projectId="project-test"
      thread={current}
      capabilities={capabilities}
      onUpdated={async (next) => {
        setCurrent(next);
      }}
    />
  );
};
beforeEach(() => request.mockReset());
afterEach(cleanup);

describe('Respostas públicas exigem revisão e envio separados', () => {
  it('adds a dated hypothesis and its source posts to editorial notes without saving or publishing automatically', () => {
    const document: StudioDocument = {
      brief: '',
      identity: {
        audience: '',
        positioning: '',
        tone: '',
        visualStyle: '',
        evidence: [],
        hypotheses: [],
      },
      sources: [],
      topic: '',
      scenes: [],
      packages: [],
      media: [],
      renders: [],
    };
    const change = vi.fn();
    render(
      <StudioAudience
        projectId="project-test"
        document={document}
        onChange={change}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Usar na próxima pauta' })
    );
    const note = change.mock.calls[0][0].editorialNotes[0];
    expect(note).toContain('Hipótese a testar');
    expect(note).toContain('2026-11-14T12:00:00Z');
    expect(note).toContain('post-test');
    expect(note).toContain('Explicar as etapas');
    expect(request).not.toHaveBeenCalled();
  });
  it('invalidates send after editing, then approves and sends only on separate clicks with current hashes', async () => {
    render(<Harness />);
    const send = () =>
      screen.getByRole('button', {
        name: 'Enviar resposta ao comentário',
      }) as HTMLButtonElement;
    expect(send().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Resposta a Autor de teste'), {
      target: { value: 'Resposta revisada.' },
    });
    expect(send().disabled).toBe(true);
    const draft: StudioAudienceThread = {
      ...thread(),
      replyDraft: 'Resposta revisada.',
      revision: 2,
      draftHash: 'b'.repeat(64),
      approvalHash: undefined,
      replyState: 'draft' as const,
    };
    request.mockResolvedValueOnce(draft);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar resposta' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      reply: 'Resposta revisada.',
      revision: 1,
    });
    await screen.findByLabelText(/Revisei esta resposta/);
    expect(send().disabled).toBe(true);
    request.mockResolvedValueOnce({
      ...draft,
      revision: 3,
      approvalHash: draft.draftHash,
      replyState: 'approved',
    });
    fireEvent.click(screen.getByLabelText(/Revisei esta resposta/));
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar resposta' }));
    await waitFor(() => expect(send().disabled).toBe(false));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toMatch(/\/approve$/);
    request.mockResolvedValueOnce({
      ...draft,
      revision: 4,
      replyState: 'sent',
    });
    fireEvent.click(send());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls[2][0]).toMatch(/\/send$/);
    expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({
      revision: 3,
      draftHash: draft.draftHash,
      confirmed: true,
    });
  });

  it('blocks resending an uncertain reply and offers a readback reconciliation action', async () => {
    const initial = { ...thread(), replyState: 'uncertain' as const };
    request.mockResolvedValueOnce({
      ...initial,
      revision: 2,
      replyState: 'sent',
    });
    render(<Harness initial={initial} />);
    expect(
      screen.queryByRole('button', { name: 'Enviar resposta ao comentário' })
    ).toBeNull();
    expect(
      (
        screen.getByLabelText(
          'Resposta a Autor de teste'
        ) as HTMLTextAreaElement
      ).disabled
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Conferir resultado do envio' })
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][0]).toMatch(/\/reconcile$/);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ revision: 1 });
    await screen.findByText('Resposta enviada');
  });
});
