const swUrl = '/sw.js';

export const registerSW = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(swUrl)
        .then(() => {
          console.info('[PWA] Service worker registered.');
        })
        .catch((error) => {
          console.error('[PWA] Service worker registration failed:', error);
        });
    });
  }
};
