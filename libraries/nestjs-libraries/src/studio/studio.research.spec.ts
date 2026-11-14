import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioResearchService } from './studio.research.service';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('Studio research', () => {
  it('reports missing configuration instead of generating fake sources', async () => {
    vi.stubEnv('TAVILY_API_KEY', '');
    vi.stubEnv('YOUTUBE_DATA_API_KEY', '');
    const service = new StudioResearchService();
    expect(service.capabilities().available).toBe(false);
    await expect(service.search('Projeto estrutural')).rejects.toThrow('chave');
  });
  it('normalizes bounded results and filters executable URLs', async () => {
    vi.stubEnv('YOUTUBE_DATA_API_KEY', '');
    vi.stubEnv('TAVILY_API_KEY', 'secret-test');
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: 'Fonte',
                url: 'https://example.org/source',
                content: 'Trecho para revisão',
              },
              { title: 'Inválido', url: 'javascript:alert(1)', content: '' },
            ],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetch);
    const result = await new StudioResearchService().search('compatibilização');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toBe('https://example.org/source');
    expect(JSON.stringify(result)).not.toContain('secret-test');
    expect(result.note).toContain('fontes primárias');
  });
  it('redacts provider failure details and credentials', async () => {
    vi.stubEnv('YOUTUBE_DATA_API_KEY', 'private-key');
    vi.stubEnv('TAVILY_API_KEY', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('provider URL private-key');
      })
    );
    await expect(
      new StudioResearchService().search('projetos')
    ).rejects.toThrow('cota');
    try {
      await new StudioResearchService().search('projetos');
    } catch (error) {
      expect(String(error)).not.toContain('private-key');
    }
  });
});
