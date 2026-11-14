import { Metadata } from 'next';
import { Suspense } from 'react';
import { Studio } from '@gitroom/frontend/components/studio/studio.component';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CONFENGE | Estúdio de conteúdo',
  description:
    'Planeje, produza, revise e acompanhe o resultado do seu conteúdo.',
};

export default function StudioPage() {
  return (
    <Suspense fallback={<p className="p-6">Carregando o Estúdio…</p>}>
      <Studio />
    </Suspense>
  );
}
