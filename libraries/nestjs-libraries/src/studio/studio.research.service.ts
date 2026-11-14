import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { StudioSource } from '@gitroom/helpers/studio/studio.types';

@Injectable()
export class StudioResearchService {
  capabilities() {
    return {
      available: !!(
        process.env.YOUTUBE_DATA_API_KEY || process.env.TAVILY_API_KEY
      ),
      reason:
        'Pesquisa usa YOUTUBE_DATA_API_KEY e/ou TAVILY_API_KEY. Sem chave, registre fontes manualmente. Resultados de busca são indícios, não fatos verificados.',
    };
  }

  async search(query: string) {
    const normalized = query.trim();
    if (normalized.length < 3 || normalized.length > 300)
      throw new BadRequestException('Pesquise entre 3 e 300 caracteres.');
    if (!this.capabilities().available)
      throw new ServiceUnavailableException(
        'Configure uma chave de pesquisa ou adicione fontes manualmente.'
      );
    const sources: StudioSource[] = [];
    const warnings: string[] = [];
    const observedAt = new Date().toISOString();
    // Fixed API origins, bounded results/timeouts. Search text is data, never an instruction.
    if (process.env.YOUTUBE_DATA_API_KEY) {
      try {
        const params = new URLSearchParams({
          part: 'snippet',
          type: 'video',
          maxResults: '10',
          q: normalized,
          relevanceLanguage: 'pt',
          key: process.env.YOUTUBE_DATA_API_KEY,
        });
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/search?${params}`,
          { signal: AbortSignal.timeout(20000), redirect: 'error' }
        );
        if (!response.ok) throw new Error('YouTube search failed');
        const data = await response.json();
        for (const item of data.items || []) {
          if (!/^[A-Za-z0-9_-]{11}$/.test(item.id?.videoId || '')) continue;
          sources.push({
            id: randomUUID(),
            title: String(item.snippet?.title || '').slice(0, 500),
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            excerpt: String(item.snippet?.description || '').slice(0, 2000),
            observedAt,
            risk: 'normal',
          });
        }
      } catch {
        warnings.push(
          'A consulta ao YouTube falhou. Confira chave, cota e permissões.'
        );
      }
    }
    if (process.env.TAVILY_API_KEY) {
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
          },
          body: JSON.stringify({
            query: normalized,
            max_results: 8,
            search_depth: 'basic',
            include_answer: false,
            include_raw_content: false,
          }),
          signal: AbortSignal.timeout(20000),
          redirect: 'error',
        });
        if (!response.ok) throw new Error('Web search failed');
        const data = await response.json();
        for (const item of data.results || []) {
          let url: URL;
          try {
            url = new URL(item.url);
          } catch {
            continue;
          }
          if (url.protocol !== 'https:' || url.username || url.password)
            continue;
          sources.push({
            id: randomUUID(),
            title: String(item.title || '').slice(0, 500),
            url: url.href,
            excerpt: String(item.content || '').slice(0, 2000),
            observedAt,
            risk: 'normal',
          });
        }
      } catch {
        warnings.push(
          'A pesquisa web falhou. Confira a configuração do provedor.'
        );
      }
    }
    if (!sources.length && warnings.length)
      throw new ServiceUnavailableException(warnings.join(' '));
    return {
      sources,
      warnings,
      observedAt,
      note: 'Resultados para revisão. Confirme alegações técnicas em fontes primárias antes de aprovar o roteiro.',
    };
  }
}
