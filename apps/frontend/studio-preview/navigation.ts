import { useSyncExternalStore } from 'react';
const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
export const useSearchParams = () =>
  new URLSearchParams(
    useSyncExternalStore(subscribe, () => window.location.search)
  );
export const useRouter = () => ({
  replace: (path: string) => {
    history.replaceState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  },
});
