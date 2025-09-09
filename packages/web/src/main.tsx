import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadConfig } from './runtime-config.ts'

await loadConfig()
const { default: App } = await import('./App.tsx')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('./service-worker.ts', import.meta.url), {
        type: 'module',
      })
      .catch((err) => console.error('Service worker registration failed', err));
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if ((event.data as { type?: string; ymd?: string })?.type === 'entry-deleted') {
      window.dispatchEvent(
        new CustomEvent('entry-deleted', {
          detail: { ymd: (event.data as { ymd?: string }).ymd },
        })
      );
    }
  });
}
