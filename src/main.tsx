import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for Progressive Web App (PWA) support on Android/iOS
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ARBITRAGE Service Worker registered with scope:', registration.scope);
      })
      .catch((error) => {
        console.error('ARBITRAGE Service Worker registration failed:', error);
      });
  });
} else if ('serviceWorker' in navigator) {
  // In development, also register so user can preview or test installation
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ARBITRAGE Service Worker registered (dev):', registration.scope);
      })
      .catch((error) => {
        console.warn('ARBITRAGE Service Worker registration failed (dev):', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
