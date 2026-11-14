import { META_GRAPH_API_VERSION } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import {
  AudienceConnection,
  AudienceImportResult,
  AudienceProviderError,
  AudienceRemotePost,
  AudienceRemoteReply,
  AudienceRemoteThread,
  StudioAudienceProvider,
  audienceRequest,
} from './studio.audience.provider';

interface InstagramComment {
  id: string;
  text: string;
  timestamp: string;
  from?: { id?: string; username?: string };
  username?: string;
  media?: { id?: string };
}

export class InstagramAudienceProvider implements StudioAudienceProvider {
  platform = 'instagram' as const;
  permissionHint: string;

  constructor(public readonly identifier = 'instagram', private readonly host = 'graph.facebook.com') {
    this.permissionHint = identifier === 'instagram-standalone'
      ? 'A conta precisa conceder instagram_business_manage_comments. A leitura confirma o acesso pela API oficial.'
      : 'A conta profissional precisa conceder instagram_manage_comments. A leitura confirma o acesso pela API oficial.';
  }

  private token(connection: AudienceConnection): string {
    // Facebook-connected Instagram stores page and user tokens together.
    return connection.token.split('___')[0];
  }

  private url(resource: string, parameters: Record<string, string> = {}): URL {
    const url = new URL(`https://${this.host}/${META_GRAPH_API_VERSION}/${resource}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    return url;
  }

  private async assertOwnership(connection: AudienceConnection, post: AudienceRemotePost) {
    const result = await audienceRequest<{ owner?: { id?: string }; username?: string }>(
      this.url(encodeURIComponent(post.releaseId), { fields: 'id,owner,username' }), this.token(connection)
    );
    if (result.owner?.id !== connection.internalId) throw new AudienceProviderError('ownership_unverified', true);
    return { ...connection, username: result.username };
  }

  private ownComment(connection: AudienceConnection, comment: InstagramComment) {
    const username = comment.from?.username || comment.username;
    return comment.from?.id === connection.internalId || !!(connection.username && username && connection.username.toLowerCase() === username.toLowerCase());
  }

  private async replies(connection: AudienceConnection, commentId: string): Promise<{ ownReply?: AudienceRemoteReply; complete: boolean }> {
    let after = '';
    for (let page = 0; page < 3; page++) {
      const response = await audienceRequest<{ data?: InstagramComment[]; paging?: { next?: string; cursors?: { after?: string } } }>(
        this.url(`${encodeURIComponent(commentId)}/replies`, { fields: 'id,text,timestamp,from,username', limit: '100', ...(after ? { after } : {}) }),
        this.token(connection)
      );
      if (!Array.isArray(response.data)) throw new AudienceProviderError('invalid_response', true);
      // Missing author identity is not evidence that the brand has not replied.
      if (response.data.some(item => !item.from?.id)) return { complete: false };
      const own = response.data.find(item => this.ownComment(connection, item));
      if (own) return { ownReply: { id: own.id, text: own.text || '', publishedAt: own.timestamp }, complete: true };
      if (!response.paging?.next) return { complete: true };
      after = response.paging?.cursors?.after || '';
      if (!after) return { complete: false };
    }
    return { complete: false };
  }

  async listUnanswered(connection: AudienceConnection, post: AudienceRemotePost): Promise<AudienceImportResult> {
    connection = await this.assertOwnership(connection, post);
    const response = await audienceRequest<{ data?: InstagramComment[]; paging?: { next?: string } }>(
      this.url(`${encodeURIComponent(post.releaseId)}/comments`, { fields: 'id,text,timestamp,from,username', limit: '25' }),
      this.token(connection)
    );
    if (!Array.isArray(response.data)) throw new AudienceProviderError('invalid_response', true);
    const result: AudienceImportResult = { comments: [], answered: [], checked: response.data.length, complete: !response.paging?.next };
    for (const comment of response.data) {
      if (!comment.id || !comment.from?.id) { result.complete = false; continue; }
      if (this.ownComment(connection, comment)) continue;
      const replies = await this.replies(connection, comment.id);
      if (replies.ownReply) result.answered.push({ externalCommentId: comment.id, reply: replies.ownReply });
      else if (replies.complete) result.comments.push({
        externalThreadId: comment.id,
        externalCommentId: comment.id,
        authorId: comment.from.id,
        authorName: comment.from.username || comment.username || 'Pessoa do público',
        text: comment.text || '',
        externalUrl: post.releaseUrl,
        publishedAt: comment.timestamp,
      });
      else result.complete = false;
    }
    return result;
  }

  async inspectThread(connection: AudienceConnection, post: AudienceRemotePost, commentId: string): Promise<AudienceRemoteThread> {
    connection = await this.assertOwnership(connection, post);
    const comment = await audienceRequest<InstagramComment>(
      this.url(encodeURIComponent(commentId), { fields: 'id,text,timestamp,from,username,media' }), this.token(connection)
    );
    if (!comment.id || comment.media?.id !== post.releaseId) throw new AudienceProviderError('not_found', true);
    return { text: comment.text || '', canReply: !!comment.from?.id && !this.ownComment(connection, comment), ...await this.replies(connection, commentId) };
  }

  async reply(connection: AudienceConnection, commentId: string, text: string): Promise<AudienceRemoteReply> {
    const result = await audienceRequest<{ id?: string }>(
      this.url(`${encodeURIComponent(commentId)}/replies`), this.token(connection), { message: text }
    );
    if (!result.id) throw new AudienceProviderError('invalid_response', false);
    return { id: result.id, text, publishedAt: new Date().toISOString() };
  }
}

export class InstagramStandaloneAudienceProvider extends InstagramAudienceProvider {
  constructor() { super('instagram-standalone', 'graph.instagram.com'); }
}
