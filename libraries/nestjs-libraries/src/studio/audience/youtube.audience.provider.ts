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

interface YoutubeComment {
  id: string;
  snippet: {
    textOriginal?: string;
    textDisplay?: string;
    authorDisplayName?: string;
    authorChannelId?: { value?: string };
    publishedAt: string;
    videoId?: string;
    parentId?: string;
  };
}

interface YoutubeThread {
  id: string;
  snippet: { topLevelComment: YoutubeComment; canReply: boolean; totalReplyCount: number };
}

export class YoutubeAudienceProvider implements StudioAudienceProvider {
  identifier = 'youtube';
  platform = 'youtube' as const;
  permissionHint = 'A conta precisa conceder youtube.force-ssl. A leitura confirma o acesso pela API oficial.';

  private url(resource: string, parameters: Record<string, string>): URL {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    return url;
  }

  private async assertOwnership(connection: AudienceConnection, post: AudienceRemotePost) {
    const response = await audienceRequest<{ items?: Array<{ snippet?: { channelId?: string } }> }>(
      this.url('videos', { part: 'snippet', id: post.releaseId }), connection.token
    );
    if (response.items?.[0]?.snippet?.channelId !== connection.internalId) {
      throw new AudienceProviderError('ownership_unverified', true);
    }
  }

  private async replies(connection: AudienceConnection, commentId: string): Promise<{ ownReply?: AudienceRemoteReply; complete: boolean }> {
    let pageToken = '';
    for (let page = 0; page < 3; page++) {
      const response = await audienceRequest<{ items?: YoutubeComment[]; nextPageToken?: string }>(
        this.url('comments', { part: 'snippet', parentId: commentId, maxResults: '100', textFormat: 'plainText', ...(pageToken ? { pageToken } : {}) }),
        connection.token
      );
      if (!Array.isArray(response.items)) throw new AudienceProviderError('invalid_response', true);
      if (response.items.some(item => !item.snippet?.authorChannelId?.value)) return { complete: false };
      const own = response.items.find(item => item.snippet.authorChannelId?.value === connection.internalId);
      if (own) return { ownReply: { id: own.id, text: own.snippet.textOriginal || own.snippet.textDisplay || '', publishedAt: own.snippet.publishedAt }, complete: true };
      if (!response.nextPageToken) return { complete: true };
      pageToken = response.nextPageToken;
    }
    // An incomplete reply history is never classified as unanswered.
    return { complete: false };
  }

  async listUnanswered(connection: AudienceConnection, post: AudienceRemotePost): Promise<AudienceImportResult> {
    await this.assertOwnership(connection, post);
    const response = await audienceRequest<{ items?: YoutubeThread[]; nextPageToken?: string }>(
      this.url('commentThreads', { part: 'snippet', videoId: post.releaseId, maxResults: '25', order: 'time', textFormat: 'plainText' }),
      connection.token
    );
    if (!Array.isArray(response.items)) throw new AudienceProviderError('invalid_response', true);
    const result: AudienceImportResult = { comments: [], answered: [], checked: response.items.length, complete: !response.nextPageToken };
    for (const thread of response.items) {
      const comment = thread.snippet.topLevelComment;
      if (!comment?.id || !comment.snippet?.authorChannelId?.value || !Number.isFinite(thread.snippet.totalReplyCount)) { result.complete = false; continue; }
      if (comment.snippet.authorChannelId?.value === connection.internalId) continue;
      const replies = thread.snippet.totalReplyCount > 0 ? await this.replies(connection, comment.id) : { complete: true };
      if (replies.ownReply) {
        result.answered.push({ externalCommentId: comment.id, reply: replies.ownReply });
      } else if (replies.complete && thread.snippet.canReply === true) {
        result.comments.push({
          externalThreadId: thread.id,
          externalCommentId: comment.id,
          authorId: comment.snippet.authorChannelId?.value,
          authorName: comment.snippet.authorDisplayName || 'Pessoa do público',
          text: comment.snippet.textOriginal || comment.snippet.textDisplay || '',
          externalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(post.releaseId)}&lc=${encodeURIComponent(comment.id)}`,
          publishedAt: comment.snippet.publishedAt,
        });
      } else {
        result.complete = false;
      }
    }
    return result;
  }

  async inspectThread(connection: AudienceConnection, post: AudienceRemotePost, commentId: string): Promise<AudienceRemoteThread> {
    await this.assertOwnership(connection, post);
    const response = await audienceRequest<{ items?: YoutubeComment[] }>(
      this.url('comments', { part: 'snippet', id: commentId, textFormat: 'plainText' }), connection.token
    );
    const comment = response.items?.[0];
    if (!comment || comment.snippet.videoId !== post.releaseId || comment.snippet.parentId) {
      throw new AudienceProviderError('not_found', true);
    }
    const replies = await this.replies(connection, commentId);
    return {
      text: comment.snippet.textOriginal || comment.snippet.textDisplay || '',
      canReply: !!comment.snippet.authorChannelId?.value && comment.snippet.authorChannelId.value !== connection.internalId,
      ...replies,
    };
  }

  async reply(connection: AudienceConnection, commentId: string, text: string): Promise<AudienceRemoteReply> {
    const result = await audienceRequest<YoutubeComment>(
      this.url('comments', { part: 'snippet' }), connection.token,
      { snippet: { parentId: commentId, textOriginal: text } }
    );
    if (!result.id || result.snippet?.parentId !== commentId) throw new AudienceProviderError('invalid_response', false);
    return { id: result.id, text: result.snippet.textOriginal || text, publishedAt: result.snippet.publishedAt || new Date().toISOString() };
  }
}
