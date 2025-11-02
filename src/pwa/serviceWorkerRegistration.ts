export const registerSW = () => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    const baseEnv = import.meta.env.BASE_URL ?? '/';
    const normalizedBase = (() => {
      const resolved = new URL(baseEnv, window.location.origin).pathname;
      return resolved.endsWith('/') ? resolved : `${resolved}/`;
    })();
    const swUrl = `${normalizedBase}sw.js`;

    navigator.serviceWorker
      .register(swUrl, { scope: normalizedBase })
      .then(() => {
        console.info(`[PWA] Service worker registered at ${swUrl} with scope ${normalizedBase}.`);
      })
      .catch((error) => {
        console.error('[PWA] Service worker registration failed:', error);
      });
  });
};
