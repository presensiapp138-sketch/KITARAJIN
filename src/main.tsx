import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA offline capabilities and installability
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-update when new version available
  },
  onOfflineReady() {
    console.log('KITARAJIN siap digunakan secara offline.');
  },
});

createRoot(document.getElementById('root')!).render(<App />);
