import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  StudioDocument,
  StudioProject,
} from '@gitroom/helpers/studio/studio.types';
import { StudioIdentitySettings } from './studio.identity';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./studio.hooks', () => ({ useStudioRequest: () => request }));
const document = (): StudioDocument => ({
  brief: 'Teste',
  identity: {
    audience: 'Público atual',
    positioning: 'Oferta atual',
    tone: 'Claro',
    visualStyle: 'Sóbrio',
    evidence: [],
    hypotheses: [],
    channel: { platform: 'youtube', integrationId: 'target-account' },
  },
  sources: [],
  topic: '',
  scenes: [],
  packages: [],
  media: [],
  renders: [],
});
const source = (): StudioProject => ({
  id: 'source-project',
  title: 'Modelo aprovado',
  revision: 5,
  status: 'identity_approved',
  document: {
    ...document(),
    identity: {
      ...document().identity,
      audience: 'Público do modelo',
      language: 'es',
      channel: { platform: 'youtube', integrationId: 'source-account' },
    },
  },
  createdAt: '2026-11-14T12:00:00Z',
  updatedAt: '2026-11-14T12:00:00Z',
  approvals: {
    identity: {
      stage: 'identity',
      revision: 5,
      hash: 'approved',
      approvedBy: 'reviewer',
      approvedAt: '2026-11-14T12:00:00Z',
    },
  },
  publications: [],
  outcomes: [],
  events: [],
});
beforeEach(() => request.mockReset());
afterEach(cleanup);

describe('Reutilização de identidade por canal', () => {
  it('copies only a freshly approved identity, preserves the target account and records the source revision', async () => {
    request.mockResolvedValueOnce(source());
    const change = vi.fn();
    const busy = vi.fn();
    render(
      <StudioIdentitySettings
        projectId="target-project"
        document={document()}
        templates={[source()]}
        onChange={change}
        onBusyChange={busy}
      />
    );
    fireEvent.change(
      screen.getByLabelText('Identidade aprovada para reutilizar'),
      { target: { value: 'source-project' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Copiar modelo para este conteúdo' })
    );
    await waitFor(() => expect(change).toHaveBeenCalledOnce());
    const copied = change.mock.calls[0][0];
    expect(copied.identity.audience).toBe('Público do modelo');
    expect(copied.identity.channel.integrationId).toBe('target-account');
    expect(copied.identity.copiedFrom).toMatchObject({
      projectId: 'source-project',
      revision: 5,
    });
    expect(copied).not.toHaveProperty('approvals');
    expect(copied.identity).not.toHaveProperty('madeForKids');
    expect(request.mock.calls[0][1]).toBeUndefined();
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('does not overwrite the current document when the selected model has lost approval', async () => {
    request.mockResolvedValueOnce({ ...source(), approvals: {} });
    const change = vi.fn();
    render(
      <StudioIdentitySettings
        projectId="target-project"
        document={document()}
        templates={[source()]}
        onChange={change}
        onBusyChange={() => {}}
      />
    );
    fireEvent.change(
      screen.getByLabelText('Identidade aprovada para reutilizar'),
      { target: { value: 'source-project' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Copiar modelo para este conteúdo' })
    );
    await screen.findByRole('alert');
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps an invalid IANA timezone invalid for the native save validation', () => {
    const current = document();
    current.identity.schedule = { timezone: 'Mars/Base', slots: [] };
    render(
      <StudioIdentitySettings
        projectId="target-project"
        document={current}
        onChange={() => {}}
        onBusyChange={() => {}}
      />
    );
    const input = screen.getByLabelText(
      'Fuso horário IANA'
    ) as HTMLInputElement;
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toContain('fuso IANA válido');
  });
});
