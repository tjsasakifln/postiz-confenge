import { Injectable } from '@nestjs/common';
import type { Integration } from '@prisma/client';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';
import { META_GRAPH_API_VERSION } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import type { StudioDistributionSnapshot } from '@gitroom/helpers/studio/studio.distribution.types';

export class StudioDistributionProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly definitive = false
  ) {
    super(code);
  }
}

/** Official URLs only; one HTTP attempt, no response bodies or tokens in errors. */
export async function distributionRequest<T>(
  url: URL,
  token: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: unknown
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      const ambiguous =
        [408, 499].includes(response.status) || response.status >= 500;
      const code = [401, 403].includes(response.status)
        ? 'access_denied'
        : response.status === 429
        ? 'remote_quota'
        : response.status === 404
        ? 'remote_not_found'
        : ambiguous
        ? 'remote_uncertain'
        : 'remote_rejected';
      throw new StudioDistributionProviderError(
        code,
        !ambiguous && response.status >= 400 && response.status < 500
      );
    }
    const text = await response.text();
    if (text.length > 2000000)
      throw new StudioDistributionProviderError('invalid_response');
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new StudioDistributionProviderError('invalid_response');
    }
  } catch (error) {
    if (error instanceof StudioDistributionProviderError) throw error;
    throw new StudioDistributionProviderError('remote_uncertain');
  } finally {
    clearTimeout(timeout);
  }
}

@Injectable()
export class StudioDistributionConnections {
  constructor(
    private readonly integrations: IntegrationService,
    private readonly refresh: RefreshIntegrationService
  ) {}

  async get(
    organizationId: string,
    id: string,
    providers: string[],
    internalId?: string
  ): Promise<Integration> {
    const integration = await this.integrations.getIntegrationById(
      organizationId,
      id
    );
    if (
      !integration ||
      integration.deletedAt ||
      integration.disabled ||
      integration.refreshNeeded ||
      integration.inBetweenSteps ||
      !providers.includes(integration.providerIdentifier) ||
      (internalId && integration.internalId !== internalId)
    ) {
      throw new StudioDistributionProviderError('access_denied', true);
    }
    if (
      integration.tokenExpiration &&
      integration.tokenExpiration.getTime() <= Date.now()
    ) {
      try {
        const refreshed = await this.refresh.refresh(integration);
        if (!refreshed || !refreshed.accessToken)
          throw new Error('missing_token');
        integration.token = refreshed.accessToken;
      } catch {
        throw new StudioDistributionProviderError('access_denied', true);
      }
    }
    if (!integration.token || !integration.internalId)
      throw new StudioDistributionProviderError('access_denied', true);
    return integration;
  }
}

export interface StudioYoutubeSession {
  uploadUri: string;
  videoSize: number;
  path: string;
  uploadedBytes: number;
  thumbnail: string;
  videoId?: string;
  postDbId?: string;
}
export interface StudioYoutubeObservation {
  id: string;
  privacy: 'private' | 'public' | 'unlisted';
  publishAt?: string;
  uploadStatus: string;
  durationSeconds: number;
}

@Injectable()
export class StudioDistributionYoutubeAdapter {
  readonly providers = ['youtube'];
  readonly permissionHint =
    'Requer youtube.upload e youtube.force-ssl ou youtube. A conta e o acesso de leitura serão conferidos antes do primeiro upload; a plataforma valida a permissão de cada escrita.';
  constructor(private readonly manager: IntegrationManager) {}

  private provider() {
    const provider = this.manager.getSocialIntegration(
      'youtube'
    ) as YoutubeProvider;
    if (!provider?.studioStartUpload)
      throw new StudioDistributionProviderError('provider_unavailable', true);
    return provider;
  }
  private url(resource: string, params: Record<string, string> = {}) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return url;
  }
  async preflight(connection: Integration) {
    const result = await distributionRequest<{
      items?: Array<{ id?: string }>;
    }>(
      this.url('channels', { part: 'id', mine: 'true', maxResults: '50' }),
      connection.token
    );
    if (!result.items?.some((item) => item.id === connection.internalId))
      throw new StudioDistributionProviderError('ownership_unverified', true);
  }
  async start(
    connection: Integration,
    snapshot: StudioDistributionSnapshot,
    postId: string,
    madeForKids: boolean,
    containsSyntheticMedia: boolean
  ): Promise<StudioYoutubeSession> {
    // Native schedule is set only after all bytes arrived; a slow upload stays private.
    try {
      const [result] = await this.provider().studioStartUpload(
        connection.internalId,
        connection.token,
        [
          {
            id: postId,
            message: snapshot.youtube.description,
            media: [{ type: 'video', path: snapshot.media.path }],
            settings: {
              title: snapshot.youtube.title,
              type: 'private',
              selfDeclaredMadeForKids: madeForKids ? 'yes' : 'no',
              containsSyntheticMedia,
              tags: snapshot.youtube.tags.map((label) => ({
                value: label,
                label,
              })),
            },
          },
        ],
        connection
      );
      const pending = result?.pendingData as StudioYoutubeSession | undefined;
      if (!pending)
        throw new StudioDistributionProviderError('invalid_response');
      this.validateSession(pending);
      return { ...pending, thumbnail: '' };
    } catch (error) {
      if (error instanceof StudioDistributionProviderError) throw error;
      throw new StudioDistributionProviderError('upload_start_unconfirmed');
    }
  }
  private validateSession(session: StudioYoutubeSession) {
    let uri: URL;
    try {
      uri = new URL(session.uploadUri);
    } catch {
      throw new StudioDistributionProviderError('invalid_session', true);
    }
    if (
      uri.protocol !== 'https:' ||
      uri.hostname !== 'www.googleapis.com' ||
      uri.username ||
      uri.password ||
      uri.port ||
      !uri.pathname.startsWith('/upload/youtube/') ||
      !Number.isFinite(session.videoSize) ||
      session.videoSize <= 0
    )
      throw new StudioDistributionProviderError('invalid_session', true);
  }
  async resume(
    connection: Integration,
    session: StudioYoutubeSession,
    readOnly = false
  ) {
    this.validateSession(session);
    try {
      // Both existing methods probe the durable session; neither starts another insert.
      return readOnly
        ? await this.provider().checkPostStatus(
            connection.token,
            { ...session, thumbnail: '' },
            connection
          )
        : await this.provider().finalizePost(
            connection.token,
            { ...session, thumbnail: '' },
            connection
          );
    } catch {
      throw new StudioDistributionProviderError('upload_status_unavailable');
    }
  }
  async thumbnail(
    connection: Integration,
    session: StudioYoutubeSession,
    videoId: string,
    path: string
  ) {
    this.validateSession(session);
    try {
      // Separate single-attempt method: no implicit retries outside the quota ledger.
      await this.provider().studioSetThumbnail(connection.token, videoId, path);
    } catch {
      throw new StudioDistributionProviderError('thumbnail_unconfirmed');
    }
  }
  async schedule(
    connection: Integration,
    videoId: string,
    publishAt: string,
    madeForKids: boolean,
    containsSyntheticMedia: boolean
  ) {
    if (
      !Number.isFinite(Date.parse(publishAt)) ||
      Date.parse(publishAt) <= Date.now() + 60000
    )
      throw new StudioDistributionProviderError('schedule_expired', true);
    await distributionRequest(
      this.url('videos', { part: 'status' }),
      connection.token,
      'PUT',
      {
        id: videoId,
        status: {
          privacyStatus: 'private',
          publishAt,
          selfDeclaredMadeForKids: madeForKids,
          containsSyntheticMedia,
        },
      }
    );
  }
  async observe(
    connection: Integration,
    videoId: string
  ): Promise<StudioYoutubeObservation> {
    const result = await distributionRequest<{
      items?: Array<{
        id?: string;
        snippet?: { channelId?: string };
        status?: {
          privacyStatus?: string;
          publishAt?: string;
          uploadStatus?: string;
        };
        contentDetails?: { duration?: string };
      }>;
    }>(
      this.url('videos', {
        id: videoId,
        part: 'snippet,status,contentDetails',
      }),
      connection.token
    );
    const video = result.items?.find((item) => item.id === videoId);
    if (!video)
      throw new StudioDistributionProviderError('remote_not_found', true);
    if (video.snippet?.channelId !== connection.internalId)
      throw new StudioDistributionProviderError('ownership_unverified', true);
    const privacy = video.status?.privacyStatus;
    if (!['private', 'public', 'unlisted'].includes(privacy || ''))
      throw new StudioDistributionProviderError('invalid_response');
    const duration = video.contentDetails?.duration?.match(
      /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/
    );
    return {
      id: videoId,
      privacy: privacy as StudioYoutubeObservation['privacy'],
      publishAt: video.status?.publishAt,
      uploadStatus: video.status?.uploadStatus || '',
      durationSeconds: duration
        ? Number(duration[1] || 0) * 3600 +
          Number(duration[2] || 0) * 60 +
          Number(duration[3] || 0)
        : 0,
    };
  }
}

@Injectable()
export class StudioDistributionInstagramAdapter {
  readonly providers = ['instagram', 'instagram-standalone'];
  readonly permissionHint =
    'Conta profissional; instagram_content_publish com Facebook Login, ou instagram_business_content_publish com Instagram Login. A API verifica os limites e a permissão efetiva.';
  private url(
    connection: Integration,
    resource: string,
    params: Record<string, string> = {}
  ) {
    const hosts: Record<string, string> = {
      instagram: 'graph.facebook.com',
      'instagram-standalone': 'graph.instagram.com',
    };
    const host = hosts[connection.providerIdentifier];
    if (!host) throw new StudioDistributionProviderError('access_denied', true);
    const url = new URL(
      `https://${host}/${META_GRAPH_API_VERSION}/${resource}`
    );
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return url;
  }
  private token(connection: Integration) {
    return connection.token.split('___')[0];
  }
  async preflight(connection: Integration) {
    const user = await distributionRequest<{ id?: string }>(
      this.url(connection, encodeURIComponent(connection.internalId), {
        fields: 'id',
      }),
      this.token(connection)
    );
    if (user.id !== connection.internalId)
      throw new StudioDistributionProviderError('ownership_unverified', true);
    await this.checkQuota(connection);
  }
  async checkQuota(connection: Integration) {
    const response = await distributionRequest<{
      data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }>;
    }>(
      this.url(
        connection,
        `${encodeURIComponent(connection.internalId)}/content_publishing_limit`,
        { fields: 'quota_usage,config' }
      ),
      this.token(connection)
    );
    const row = response.data?.[0];
    if (
      !row ||
      !Number.isFinite(row.quota_usage) ||
      !Number.isFinite(row.config?.quota_total)
    )
      throw new StudioDistributionProviderError('quota_unknown', true);
    if (row.quota_usage! >= row.config!.quota_total!)
      throw new StudioDistributionProviderError('remote_quota', true);
  }
  async create(connection: Integration, snapshot: StudioDistributionSnapshot) {
    const data = await distributionRequest<{ id?: string }>(
      this.url(
        connection,
        `${encodeURIComponent(connection.internalId)}/media`
      ),
      this.token(connection),
      'POST',
      {
        media_type: 'REELS',
        video_url: snapshot.media.path,
        caption: snapshot.instagram!.caption,
        ...(snapshot.instagram?.thumbnail
          ? { cover_url: snapshot.instagram.thumbnail.path }
          : {}),
      }
    );
    if (!data.id) throw new StudioDistributionProviderError('invalid_response');
    return data.id;
  }
  async container(connection: Integration, containerId: string) {
    const result = await distributionRequest<{
      id?: string;
      status_code?: string;
    }>(
      this.url(connection, encodeURIComponent(containerId), {
        fields: 'status_code',
      }),
      this.token(connection)
    );
    if (
      !['FINISHED', 'IN_PROGRESS', 'PUBLISHED', 'ERROR', 'EXPIRED'].includes(
        result.status_code || ''
      )
    )
      throw new StudioDistributionProviderError('invalid_response');
    return result.status_code!;
  }
  async publish(connection: Integration, containerId: string) {
    const result = await distributionRequest<{ id?: string }>(
      this.url(
        connection,
        `${encodeURIComponent(connection.internalId)}/media_publish`
      ),
      this.token(connection),
      'POST',
      { creation_id: containerId }
    );
    if (!result.id)
      throw new StudioDistributionProviderError('invalid_response');
    return result.id;
  }
  async media(connection: Integration, mediaId: string) {
    const result = await distributionRequest<{
      id?: string;
      owner?: { id?: string };
      permalink?: string;
    }>(
      this.url(connection, encodeURIComponent(mediaId), {
        fields: 'id,owner,permalink',
      }),
      this.token(connection)
    );
    if (result.owner?.id !== connection.internalId || result.id !== mediaId)
      throw new StudioDistributionProviderError('ownership_unverified', true);
    let url: string | undefined;
    try {
      const candidate = new URL(result.permalink || '');
      if (
        candidate.protocol === 'https:' &&
        !candidate.username &&
        !candidate.password &&
        ['instagram.com', 'www.instagram.com'].includes(candidate.hostname)
      )
        url = candidate.toString();
    } catch {
      /* A confirmed id is useful even without a permalink. */
    }
    return { id: mediaId, url };
  }
}
