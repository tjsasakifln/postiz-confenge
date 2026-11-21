export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { AttributionComponent } from '@gitroom/frontend/components/auth/attribution.component';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <MantineWrapper>
      <Toaster />
      <div className="confenge-auth flex min-h-screen w-full items-center justify-center p-5 text-white">
        <ReturnUrlComponent />
        <AttributionComponent />
        <div className="confenge-auth-panel flex w-full max-w-[580px] flex-col px-6 py-10 sm:p-12">
          <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
            <LogoTextComponent />
            <div className="flex">{children}</div>
          </div>
        </div>
      </div>
    </MantineWrapper>
  );
}
