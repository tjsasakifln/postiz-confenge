import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useStudioRequest, StudioRequestError } from './studio.hooks';

const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetch,
}));
beforeEach(() => fetch.mockReset());
afterEach(cleanup);

describe('Erros da API permanecem visíveis', () => {
  it('keeps a conflict as a typed failure and never returns empty success data', async () => {
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'A versão mudou.' }), {
        status: 409,
      })
    );
    const { result } = renderHook(useStudioRequest);
    await expect(result.current('/studio/projects/test')).rejects.toMatchObject(
      { message: 'A versão mudou.', status: 409 }
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed JSON instead of showing a blank successful project', async () => {
    fetch.mockResolvedValueOnce(
      new Response('<html>Proxy error</html>', { status: 502 })
    );
    const { result } = renderHook(useStudioRequest);
    await expect(
      result.current('/studio/projects/test')
    ).rejects.toBeInstanceOf(StudioRequestError);
  });
  it('does not accept an empty response as confirmation of a write', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { result } = renderHook(useStudioRequest);
    await expect(
      result.current('/studio/projects/test', { method: 'PUT' })
    ).rejects.toMatchObject({ status: 204 });
  });
});
