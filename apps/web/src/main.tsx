import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';
import './styles/components.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: '13px',
          border: '1px solid #E7E4DE',
          boxShadow: '0 8px 24px rgba(24, 22, 21, 0.10)',
        },
      }}
    />
  </StrictMode>
);
