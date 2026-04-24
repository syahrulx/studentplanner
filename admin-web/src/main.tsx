import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Defense in depth: if a production bundle is ever built with the admin-auth
// bypass on, refuse to boot. `RequireAdmin` already gates on DEV===true, but
// this catches misconfiguration at the top level so the app never renders.
const bypass = (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_BYPASS_ADMIN_AUTH === 'true';
const isProdBuild = !import.meta.env.DEV;
if (bypass && isProdBuild) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="font-family: ui-sans-serif, system-ui; padding: 48px; max-width: 640px; margin: 0 auto; color: #0f172a;">
        <h1 style="font-weight: 900; font-size: 24px; color: #b91c1c;">Admin bypass active in a production build</h1>
        <p style="margin-top: 12px;">
          This build was compiled with <code>VITE_BYPASS_ADMIN_AUTH=true</code>. That would ship a
          service-role bypass key to every visitor. The app refuses to boot.
        </p>
        <p style="margin-top: 12px;">
          Rebuild with <code>VITE_BYPASS_ADMIN_AUTH=false</code> (or unset) and redeploy.
        </p>
      </div>`;
  }
  throw new Error('admin-web: refusing to boot production bundle with VITE_BYPASS_ADMIN_AUTH=true');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
