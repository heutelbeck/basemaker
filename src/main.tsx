import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initAnalytics } from './analytics.ts';
import { App } from './App.tsx';
import './index.css';

initAnalytics();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('The root element is missing from index.html.');
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
