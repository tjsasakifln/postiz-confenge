import { Metadata } from 'next';
import { Suspense } from 'react';
import { StudioEntry } from '@gitroom/frontend/components/studio/studio.quick';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CONFENGE | Estúdio de conteúdo',
  description:
    'Planeje, produza, revise e acompanhe o resultado do seu conteúdo.',
};

export default function StudioPage() {
  return (
    <Suspense fallback={<p className="p-6">Carregando o Estúdio…</p>}>
      <StudioEntry />
    </Suspense>
  );
}
