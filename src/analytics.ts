/**
 * Optional GoatCounter page view counting. The endpoint is injected at
 * build time via VITE_GOATCOUNTER_URL (for example
 * https://mysite.goatcounter.com/count); without it no analytics script
 * is loaded at all, so dev servers and self-hosted builds stay clean.
 */
export function initAnalytics(): void {
  const endpoint = (import.meta.env.VITE_GOATCOUNTER_URL as string | undefined) ?? '';
  if (endpoint === '') {
    return;
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.dataset.goatcounter = endpoint;
  document.head.appendChild(script);
}
