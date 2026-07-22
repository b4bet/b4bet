import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Wait for maintenance guard to give the green light before mounting React.
// The guard in index.html sets window.__b4betReady = true when maintenance is OFF.
// This prevents React from overwriting the maintenance page on production builds.
function mount() {
  createRoot(document.getElementById('root')!).render(<App />);
}

if ((window as unknown as Record<string, unknown>).__b4betReady) {
  mount();
} else {
  window.addEventListener('b4bet:ready', mount, { once: true });
}
