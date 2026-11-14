import { createRoot } from 'react-dom/client';
import { Studio } from '@gitroom/frontend/components/studio/studio.component';
import './style.scss';
if (!window.location.search)
  window.history.replaceState({}, '', '/studio?project=visual-test');
createRoot(document.getElementById('root')!).render(
  <div className="dark min-h-screen">
    <div
      style={{
        padding: '10px 16px',
        color: '#1a1919',
        background: '#facc15',
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      AMBIENTE ISOLADO DE TESTE. Conteúdo fictício e serviços simulados para
      revisão visual. Nenhum canal conectado ou envio real.
    </div>
    <Studio />
  </div>
);
