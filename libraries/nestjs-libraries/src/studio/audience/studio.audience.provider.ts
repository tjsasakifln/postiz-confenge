import type { StudioPlatform } from '@gitroom/helpers/studio/studio.types';

/** Credentials stay inside services and adapters and never enter an API DTO. */
export interface AudienceConnection {
  internalId: string;
  token: string;
  username?: string;
}

export interface AudienceRemotePost {
  releaseId: string;
  releaseUrl?: string;
}

export interface AudienceRemoteComment {
  externalThreadId: string;
  externalCommentId: string;
  authorId?: string;
  authorName: string;
  text: string;
  externalUrl?: string;
  publishedAt: string;
}

export interface AudienceRemoteReply {
  id: string;
  text: string;
  publishedAt: string;
}

export interface AudienceRemoteThread {
  text: string;
  canReply: boolean;
  complete: boolean;
  ownReply?: AudienceRemoteReply;
}

export interface AudienceImportResult {
  comments: AudienceRemoteComment[];
  answered: Array<{ externalCommentId: string; reply: AudienceRemoteReply }>;
  checked: number;
  complete: boolean;
}

export interface StudioAudienceProvider {
  identifier: string;
  platform: StudioPlatform;
  permissionHint: string;
  listUnanswered(connection: AudienceConnection, post: AudienceRemotePost): Promise<AudienceImportResult>;
  inspectThread(connection: AudienceConnection, post: AudienceRemotePost, commentId: string): Promise<AudienceRemoteThread>;
  reply(connection: AudienceConnection, commentId: string, text: string): Promise<AudienceRemoteReply>;
}

export type AudienceProviderErrorCode =
  | 'access_denied'
  | 'not_found'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_rejected'
  | 'invalid_response'
  | 'ownership_unverified';

export class AudienceProviderError extends Error {
  constructor(public readonly code: AudienceProviderErrorCode, public readonly definitive: boolean) {
    // Deliberately omit provider bodies, URLs, tokens and arbitrary messages.
    super(code);
  }
}

export const audienceErrorMessage = (code: string): string => {
  const messages: Record<string, string> = {
    access_denied: 'A plataforma não concedeu acesso. Reconecte a conta com as permissões de comentários.',
    not_found: 'A publicação ou o comentário não está disponível na plataforma.',
    rate_limited: 'A plataforma limitou as consultas. Tente novamente mais tarde.',
    provider_unavailable: 'A plataforma não confirmou a operação. Consulte o resultado antes de tentar outro envio.',
    provider_rejected: 'A plataforma recusou a operação. Revise a resposta e as permissões da conta.',
    invalid_response: 'A plataforma não retornou dados suficientes para confirmar a operação.',
    ownership_unverified: 'Não foi possível confirmar que a publicação pertence à conta conectada.',
  };
  return messages[code] || 'Não foi possível consultar a plataforma. Verifique a conexão da conta.';
};

/** All callers build an official provider URL; redirects are never followed. */
export async function audienceRequest<T>(url: URL, token: string, body?: object): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      // A timeout (including a proxy's client-closed response) can arrive after
      // the platform accepted a write. It must never unlock another attempt.
      const ambiguous = response.status === 408 || response.status === 499 || response.status >= 500;
      const code: AudienceProviderErrorCode = response.status === 401 || response.status === 403
        ? 'access_denied'
        : response.status === 404 ? 'not_found'
          : response.status === 429 ? 'rate_limited'
            : ambiguous ? 'provider_unavailable' : 'provider_rejected';
      throw new AudienceProviderError(code, !ambiguous && response.status >= 400 && response.status < 500);
    }
    const text = await response.text();
    if (text.length > 2000000) throw new AudienceProviderError('invalid_response', !body);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AudienceProviderError('invalid_response', !body);
    }
  } catch (error) {
    if (error instanceof AudienceProviderError) throw error;
    throw new AudienceProviderError('provider_unavailable', false);
  } finally {
    clearTimeout(timeout);
  }
}
