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
  StudioCapabilities,
  StudioDocument,
  StudioProject,
} from '@gitroom/helpers/studio/studio.types';
import { StudioApprovalPanel, StudioProjectEditor } from './studio.project';
import { StudioOutcomes, StudioPublicationEditor } from './studio.delivery';
import { StudioPackagesEditor } from './studio.content';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./studio.hooks', () => ({ useStudioRequest: () => request }));
vi.mock('./studio.production', () => ({ StudioProduction: (): null => null }));
vi.mock('./studio.audience', () => ({ StudioAudience: (): null => null }));

const project = (): StudioProject => ({
  id: 'project-test',
  title: 'Conteúdo de teste',
  revision: 1,
  status: 'draft',
  approvals: {},
  createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
  publications: [],
  outcomes: [],
  events: [],
  document: {
    brief: 'Objetivo de teste',
    identity: {
      audience: 'Compradores',
      positioning: 'Oferta documentada',
      tone: 'Claro',
      visualStyle: 'Sóbrio',
      evidence: [],
      hypotheses: [],
    },
    sources: [],
    topic: 'Pauta de teste',
    scenes: [],
    packages: [],
    media: [],
    renders: [],
  },
});
const capabilities: StudioCapabilities = {
  text: { available: true, reason: '' },
  research: { available: false, reason: 'Sem configuração.' },
  media: { available: false, reason: 'Sem configuração.' },
  publishing: { available: true, reason: '' },
  platforms: ['linkedin'],
  integrations: [
    {
      id: 'account-test',
      name: 'Conta de teste',
      platform: 'linkedin',
      provider: 'linkedin',
    },
  ],
};

const Harness = ({ initial = project() }: { initial?: StudioProject }) => {
  const [current, setCurrent] = useState(initial);
  return (
    <StudioProjectEditor
      project={current}
      capabilities={capabilities}
      onUpdated={async (next) => {
        setCurrent(next);
      }}
      onDirtyChange={() => {}}
      onRefresh={async () => current}
    />
  );
};

beforeEach(() => request.mockReset());
afterEach(cleanup);

describe('Revisão humana e versões do conteúdo', () => {
  it('requires explicit source-risk acknowledgement before approving the script', () => {
    const current = project();
    current.approvals.identity = {
      stage: 'identity',
      hash: 'identity',
      revision: 1,
      approvedAt: current.updatedAt,
      approvedBy: 'reviewer',
    };
    current.document.sources = [
      {
        id: 'source-risk',
        title: 'Referência a revisar',
        url: 'https://example.com/reference',
        excerpt: '',
        observedAt: current.updatedAt,
        risk: 'high',
      },
    ];
    const approve = vi.fn();
    const view = render(
      <StudioApprovalPanel
        project={current}
        stage="script"
        blocked={false}
        pending={false}
        onApprove={approve}
      />
    );
    const button = screen.getByRole('button', {
      name: 'Aprovar roteiro',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Revisei as afirmações/));
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Revisei as fontes de risco alto/));
    fireEvent.click(button);
    expect(approve).toHaveBeenCalledWith('script', ['source-risk']);
    view.rerender(
      <StudioApprovalPanel
        project={{ ...current, revision: 2 }}
        stage="script"
        blocked={false}
        pending={false}
        onApprove={approve}
      />
    );
    expect(
      (screen.getByLabelText(/Revisei as afirmações/) as HTMLInputElement)
        .checked
    ).toBe(false);
  });

  it('saves the current revision before enabling a new explicit identity approval', async () => {
    const saved = { ...project(), title: 'Título revisado', revision: 2 };
    request.mockResolvedValueOnce(saved);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/Nome do conteúdo/), {
      target: { value: 'Título revisado' },
    });
    expect(
      (
        screen.getByRole('button', {
          name: 'Aprovar identidade',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][0]).toBe('/studio/projects/project-test');
    expect(request.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      revision: 1,
      title: 'Título revisado',
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Salvar alterações',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true)
    );
    request.mockResolvedValueOnce({
      ...saved,
      approvals: {
        identity: {
          stage: 'identity',
          hash: 'saved',
          revision: 2,
          approvedAt: saved.updatedAt,
          approvedBy: 'reviewer',
        },
      },
    });
    fireEvent.click(screen.getByLabelText(/Revisei a identidade/));
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar identidade' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1][0]).toBe(
      '/studio/projects/project-test/approve'
    );
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
      revision: 2,
      stage: 'identity',
      confirmed: true,
    });
  });

  it('preserves local edits after a conflict and does not fabricate a successful save', async () => {
    request.mockRejectedValueOnce(
      new Error('O projeto mudou. Atualize a página antes de continuar.')
    );
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/Nome do conteúdo/), {
      target: { value: 'Texto preservado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByRole('alert');
    expect(
      (screen.getByLabelText(/Nome do conteúdo/) as HTMLInputElement).value
    ).toBe('Texto preservado');
    expect(screen.getByText(/Alterações ainda não salvas/)).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole('button', {
          name: 'Aprovar identidade',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
});

describe('Publicação e resultado comercial', () => {
  it('lets the editor type consecutive hashtags without losing the separating space', () => {
    const TagEditor = () => {
      const [document, setDocument] = useState<StudioDocument>({ ...project().document, packages: [{ platform: 'linkedin', title: '', description: '', hashtags: ['obra'], cta: '', landingUrl: '', utmSource: '', utmMedium: '', utmCampaign: '', mediaIds: [] }] });
      return <StudioPackagesEditor document={document} onChange={setDocument} onGenerate={() => {}} generateDisabled />;
    };
    render(<TagEditor />);
    const input = screen.getByLabelText('Hashtags') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'obra ' } });
    expect(input.value).toBe('obra ');
    fireEvent.change(input, { target: { value: 'obra projeto' } });
    expect(input.value).toBe('obra projeto');
  });
  it('creates only account-specific draft targets after approval and explicit review', () => {
    const current = project();
    current.approvals.package = {
      stage: 'package',
      hash: 'package',
      revision: 1,
      approvedAt: current.updatedAt,
      approvedBy: 'reviewer',
    };
    current.document.packages = [
      {
        platform: 'linkedin',
        title: 'Título',
        description: 'Texto',
        hashtags: [],
        cta: '',
        landingUrl: '',
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        mediaIds: [],
      },
    ];
    current.publications = [
      {
        id: 'draft-test',
        revision: 1,
        platform: 'linkedin',
        integrationId: 'account-test',
        postId: 'post-test',
        state: 'DRAFT',
        createdAt: current.updatedAt,
      },
    ];
    const create = vi.fn();
    render(
      <StudioPublicationEditor
        project={current}
        capabilities={capabilities}
        blocked={false}
        pending={false}
        onCreate={create}
      />
    );
    const button = screen.getByRole('button', {
      name: 'Criar rascunhos no Postiz',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('LinkedIn · Conta de teste'));
    fireEvent.click(screen.getByLabelText(/Conferi as contas selecionadas/));
    fireEvent.click(button);
    expect(create).toHaveBeenCalledWith([
      { platform: 'linkedin', integrationId: 'account-test' },
    ]);
    expect(screen.getByText('Rascunho')).toBeTruthy();
    expect(screen.queryByText('Publicado')).toBeNull();
  });

  it('records received money independently from proposals with exact cents and a source reference', async () => {
    const current = project();
    request.mockResolvedValueOnce(current);
    const update = vi.fn(async () => {});
    render(
      <StudioOutcomes
        project={current}
        onUpdated={update}
        blocked={false}
        onBusyChange={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText('Etapa comprovada'), {
      target: { value: 'received' },
    });
    fireEvent.change(screen.getByLabelText(/Valor em reais/), {
      target: { value: '12.34' },
    });
    fireEvent.change(screen.getByLabelText(/Referência do registro/), {
      target: { value: 'Comprovante teste 01' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Registrar resultado' })
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body).toMatchObject({
      stage: 'received',
      valueCents: 1234,
      currency: 'BRL',
      reference: 'Comprovante teste 01',
    });
    expect(body).not.toHaveProperty('revision');
    expect(update).toHaveBeenCalledWith(current);
    expect(screen.getByRole('option', { name: 'Proposta' })).toBeTruthy();
    expect(
      screen.getByRole('option', { name: 'Contato qualificado' })
    ).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Oportunidade' })).toBeTruthy();
  });
});
