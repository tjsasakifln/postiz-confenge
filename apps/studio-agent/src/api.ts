export interface StudioAgentConfiguration {
  apiUrl: URL;
  apiKey: string;
  uiUrl?: URL;
}

export class StudioAgentError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

function configuredUrl(value: string, api: boolean): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new StudioAgentError('configuration', 'Configure um endereço válido para o Estúdio.'); }
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback.has(url.hostname)))) {
    throw new StudioAgentError('configuration', 'Use HTTPS, ou HTTP somente no computador local, sem credenciais ou parâmetros na URL.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (api && !url.pathname.endsWith('/public/v1/studio')) {
    throw new StudioAgentError('configuration', 'POSTIZ_STUDIO_API_URL precisa terminar em /public/v1/studio.');
  }
  return url;
}

export function loadConfiguration(environment: NodeJS.ProcessEnv = process.env): StudioAgentConfiguration {
  const apiKey = environment.POSTIZ_API_KEY?.trim();
  if (!apiKey || apiKey.length > 8192 || /\s|[\u0000-\u001f\u007f]/.test(apiKey)) {
    throw new StudioAgentError('configuration', 'Configure POSTIZ_API_KEY no ambiente do processo, sem prefixo Bearer.');
  }
  if (!environment.POSTIZ_STUDIO_API_URL) throw new StudioAgentError('configuration', 'Configure POSTIZ_STUDIO_API_URL no ambiente do processo.');
  if (environment.POSTIZ_STUDIO_API_URL.includes(apiKey) || environment.POSTIZ_STUDIO_UI_URL?.includes(apiKey)) {
    throw new StudioAgentError('configuration', 'A credencial deve ficar somente em POSTIZ_API_KEY, nunca nos endereços configurados.');
  }
  return {
    apiUrl: configuredUrl(environment.POSTIZ_STUDIO_API_URL, true), apiKey,
    ...(environment.POSTIZ_STUDIO_UI_URL ? { uiUrl: configuredUrl(environment.POSTIZ_STUDIO_UI_URL, false) } : {}),
  };
}

const sensitiveField = /^(token|access_?token|refresh_?token|id_?token|api_?key|authorization|password|(?:client_?)?secret|cookie|set-cookie)$/i;

export class StudioApiClient {
  constructor(private readonly configuration: StudioAgentConfiguration, private readonly fetcher: typeof fetch = fetch) {}

  reviewLocation(): string {
    return this.configuration.uiUrl?.toString() || 'Abra Estúdio na interface autenticada do Postiz.';
  }

  private sanitize(value: unknown): unknown {
    if (typeof value === 'string') return value.split(this.configuration.apiKey).join('[credencial omitida]');
    if (Array.isArray(value)) return value.map(item => this.sanitize(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, sensitiveField.test(key) ? '[credencial omitida]' : this.sanitize(item)]));
    return value;
  }

  async request(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const base = this.configuration.apiUrl;
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new StudioAgentError('invalid_path', 'Operação não permitida.');
    const url = new URL(`${base.toString()}${path}`);
    if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`)) throw new StudioAgentError('invalid_path', 'Operação não permitida.');
    try {
      const response = await this.fetcher(url, {
        method,
        headers: { Authorization: this.configuration.apiKey, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
      });
      if (!response.ok) {
        // Never expose server bodies, proxy HTML, request headers or credential-bearing URLs.
        await response.body?.cancel();
        const errors: Record<number, [string, string]> = {
          400: ['invalid_input', 'O Estúdio recusou os dados. Consulte a versão atual e confira os campos da operação.'],
          401: ['unauthorized', 'A API do Postiz recusou a credencial ou a assinatura. Confira a configuração fora da conversa.'],
          402: ['plan_limit', 'A operação depende de um recurso ou limite do plano do Postiz.'],
          403: ['forbidden', 'A credencial não tem permissão para esta operação.'],
          404: ['not_found', 'O projeto, a publicação ou o recurso não pertence à organização conectada ou não está disponível.'],
          409: ['conflict', 'A versão, aprovação ou tentativa mudou. Leia o estado atual e solicite nova revisão quando necessário.'],
          429: ['rate_limited', 'A API limitou as solicitações. Aguarde antes de consultar novamente.'],
        };
        const [code, message] = errors[response.status] || ['unconfirmed', 'A API não confirmou a operação. Consulte o estado antes de considerar outra tentativa; o servidor MCP não repete requisições.'];
        throw new StudioAgentError(code, message);
      }
      const limit = 4 * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new StudioAgentError('response_too_large', 'A resposta ultrapassou o limite. Abra o projeto na interface.'); }
      if (!response.body) throw new StudioAgentError('invalid_response', 'A API não retornou um resultado legível. Consulte o estado na interface.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > limit) { await reader.cancel(); throw new StudioAgentError('response_too_large', 'A resposta ultrapassou o limite. Abra o projeto na interface.'); }
          chunks.push(item.value);
        }
      } finally { reader.releaseLock(); }
      const content = Buffer.concat(chunks).toString('utf8');
      try { return this.sanitize(JSON.parse(content)); }
      catch { throw new StudioAgentError('invalid_response', 'A API não retornou um resultado legível. Consulte o estado na interface.'); }
    } catch (error) {
      if (error instanceof StudioAgentError) throw error;
      throw new StudioAgentError('unconfirmed', 'A conexão não confirmou a operação. Consulte o estado antes de considerar outra tentativa; o servidor MCP não repete requisições.');
    }
  }
}
