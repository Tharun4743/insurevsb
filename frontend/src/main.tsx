import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Automatically reload page when a dynamic chunk fails due to a new deployment
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Dynamic import chunk failed (new deployment detected). Reloading page...', event);
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
