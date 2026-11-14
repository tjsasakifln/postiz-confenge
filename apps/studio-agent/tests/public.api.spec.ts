import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PublicAuthMiddleware } from '@gitroom/backend/services/auth/public.auth.middleware';
import { PublicStudioService } from '@gitroom/nestjs-libraries/studio/agent/public.studio.service';
import { PublicStudioApproveDto } from '@gitroom/nestjs-libraries/studio/agent/public.studio.dto';

vi.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({ OrganizationService: class {} }));
vi.mock('@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service', () => ({ OAuthService: class {} }));
vi.mock('@gitroom/nestjs-libraries/database/prisma/studio/studio.service', () => ({ StudioService: class {} }));
vi.mock('@gitroom/nestjs-libraries/sentry/initialize.sentry', () => ({ setSentryUserContext: vi.fn() }));
vi.mock('@gitroom/nestjs-libraries/services/exception.filter', () => ({ HttpForbiddenException: class extends Error {} }));
afterEach(() => vi.unstubAllEnvs());

describe('Native Public API authentication used by Studio', () => {
  function middlewareFixture() {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const organization = { id: 'org-a', name: 'Test organization' };
    const organizations = { getOrgByApiKey: vi.fn(async (key: string) => key === 'valid-test-key' ? organization : null), canUseSuperAdminApi: vi.fn(async () => false) };
    const oauth = { getOrgByOAuthToken: vi.fn(async () => ({ organization, userId: 'oauth-user-a' })) };
    const middleware = new PublicAuthMiddleware(organizations as any, oauth as any);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    return { organizations, oauth, middleware, response, next };
  }

  it('rejects missing and invalid keys without reaching Studio handlers', async () => {
    const { middleware, response, next } = middlewareFixture();
    await middleware.use({ headers: {} } as any, response as any, next);
    expect(response.status).toHaveBeenLastCalledWith(401);
    await middleware.use({ headers: { authorization: 'wrong-key' } } as any, response as any, next);
    expect(response.status).toHaveBeenLastCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('derives the tenant from the key and ignores an organization supplied in the body', async () => {
    const { middleware, response, next, organizations } = middlewareFixture();
    const request = { headers: { authorization: 'valid-test-key' }, body: { organizationId: 'org-b' } } as any;
    await middleware.use(request, response as any, next);
    expect(organizations.getOrgByApiKey).toHaveBeenCalledWith('valid-test-key');
    expect(request.org.id).toBe('org-a');
    expect(request.oauthUserId).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('preserves OAuth attribution and denies unauthorized organization override', async () => {
    const { middleware, response, next } = middlewareFixture();
    const oauthRequest = { headers: { authorization: 'pos_test-token' } } as any;
    await middleware.use(oauthRequest, response as any, next);
    expect(oauthRequest.org.id).toBe('org-a');
    expect(oauthRequest.oauthUserId).toBe('oauth-user-a');
    next.mockClear();
    await middleware.use({ headers: { authorization: 'valid-test-key', 'x-postiz-org': 'org-b' } } as any, response as any, next);
    expect(response.status).toHaveBeenLastCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps the existing subscription requirement when billing is configured', async () => {
    const { middleware, response, next } = middlewareFixture();
    vi.stubEnv('STRIPE_SECRET_KEY', 'synthetic-billing-flag');
    await middleware.use({ headers: { authorization: 'valid-test-key' } } as any, response as any, next);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Public Studio authoritative review', () => {
  const reviewedHash = 'a'.repeat(64);
  function fixture() {
    const core = {
      get: vi.fn(async () => ({ id: 'project-a', title: 'Project', revision: 4, approvals: {}, document: { brief: 'Brief', identity: {}, topic: '', sources: [], scenes: [], packages: [], media: [], renders: [] } })),
      stageHash: vi.fn(() => reviewedHash), approve: vi.fn(async () => ({ approved: true })),
    };
    return { core, service: new PublicStudioService(core as any) };
  }

  it('does not invent a human identity for organization API keys', async () => {
    const { service, core } = fixture();
    await service.approve('org-a', 'project-a', { revision: 4, stage: 'identity', confirmed: true, reviewHash: reviewedHash });
    expect(core.approve.mock.calls[0][3]).toBe('api:studio-agent:org-a');
    expect(service.actor('org-a', 'oauth-user-a')).toBe('oauth-user-a');
    expect(core.get).toHaveBeenCalledWith('org-a', 'project-a');
  });

  it('rejects a changed revision or content hash before the existing approval service', async () => {
    const { service, core } = fixture();
    await expect(service.approve('org-a', 'project-a', { revision: 3, stage: 'identity', confirmed: true, reviewHash: reviewedHash })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.approve('org-a', 'project-a', { revision: 4, stage: 'identity', confirmed: true, reviewHash: 'b'.repeat(64) })).rejects.toBeInstanceOf(ConflictException);
    expect(core.approve).not.toHaveBeenCalled();
  });

  it('validates literal confirmation and rejects client supplied actor or tenant fields', async () => {
    const value = plainToInstance(PublicStudioApproveDto, { revision: 4, stage: 'identity', confirmed: false, reviewHash: reviewedHash, approvedBy: 'invented-person', organizationId: 'org-b' });
    const errors = await validate(value, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map(error => error.property).sort()).toEqual(['approvedBy', 'confirmed', 'organizationId']);
  });
});
