'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type {
  StudioCapabilities,
  StudioProject,
  StudioRender,
} from '@gitroom/helpers/studio/studio.types';
import type {
  StudioAudienceCapabilities,
  StudioAudienceMetrics,
  StudioAudienceThreadsResponse,
} from '@gitroom/helpers/studio/studio.audience.types';

export class StudioRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'StudioRequestError';
  }
}

export const useStudioRequest = () => {
  const fetch = useFetch();
  return useCallback(
    async <T>(path: string, options?: RequestInit): Promise<T> => {
      const response = await fetch(path, options);
      const raw = await response.text();
      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        throw new StudioRequestError(
          'O serviço não retornou uma resposta válida. Tente novamente.',
          response.status
        );
      }
      if (!response.ok) {
        const message =
          body && typeof body === 'object' && 'message' in body
            ? (body as { message: unknown }).message
            : undefined;
        throw new StudioRequestError(
          Array.isArray(message)
            ? message.filter((item) => typeof item === 'string').join(' ')
            : typeof message === 'string'
            ? message
            : response.status === 409
            ? 'Este conteúdo mudou em outra sessão. Atualize a versão antes de continuar.'
            : 'Não foi possível concluir a solicitação. Tente novamente.',
          response.status
        );
      }
      if (body === undefined) {
        throw new StudioRequestError(
          'O serviço retornou uma resposta vazia. Atualize para conferir o resultado antes de repetir a ação.',
          response.status
        );
      }
      return body as T;
    },
    [fetch]
  );
};

export const useStudioCapabilities = () => {
  const request = useStudioRequest();
  return useSWR<StudioCapabilities, StudioRequestError>(
    '/studio/capabilities',
    request,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
};

export const useStudioProjects = () => {
  const request = useStudioRequest();
  return useSWR<StudioProject[], StudioRequestError>(
    '/studio/projects',
    request,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
};

export const useStudioProject = (id: string | null) => {
  const request = useStudioRequest();
  return useSWR<StudioProject, StudioRequestError>(
    id ? `/studio/projects/${encodeURIComponent(id)}` : null,
    request,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      refreshInterval: 15000,
      refreshWhenHidden: false,
    }
  );
};

export interface StudioRenderJobResponse {
  status: 'pending' | 'completed' | 'failed';
  result?: StudioRender;
  error?: string;
}

export const useStudioRenderJob = (projectId: string, jobId: string) => {
  const request = useStudioRequest();
  return useSWR<StudioRenderJobResponse, StudioRequestError>(
    `/studio/projects/${encodeURIComponent(
      projectId
    )}/render/${encodeURIComponent(jobId)}`,
    request,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      refreshInterval: (data) => (data?.status === 'pending' ? 2500 : 0),
      refreshWhenHidden: false,
    }
  );
};

export const useStudioAudienceCapabilities = (projectId: string) => {
  const request = useStudioRequest();
  return useSWR<StudioAudienceCapabilities, StudioRequestError>(
    `/studio/projects/${encodeURIComponent(projectId)}/audience/capabilities`,
    request,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
};

export const useStudioAudienceThreads = (projectId: string) => {
  const request = useStudioRequest();
  return useSWR<StudioAudienceThreadsResponse, StudioRequestError>(
    `/studio/projects/${encodeURIComponent(projectId)}/audience/threads`,
    request,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
};

export const useStudioAudienceMetrics = (projectId: string, days: number) => {
  const request = useStudioRequest();
  return useSWR<StudioAudienceMetrics, StudioRequestError>(
    `/studio/projects/${encodeURIComponent(
      projectId
    )}/audience/metrics?days=${days}`,
    request,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
};
