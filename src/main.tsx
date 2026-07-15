import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for Progressive Web App (PWA) support on Android/iOS
if ('serviceWorker' in navigator) {
  if ((import.meta as any).env?.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('ARBITRAGE Service Worker registered with scope:', registration.scope);
        })
        .catch((error) => {
          console.error('ARBITRAGE Service Worker registration failed:', error);
        });
    });
  } else {
    // In development, unregister service workers and clear cache to prevent stale assets
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then(() => {
          console.log('ARBITRAGE Service Worker unregistered in development mode');
        });
      }
    });
    if (window.caches) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key);
        }
      });
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
