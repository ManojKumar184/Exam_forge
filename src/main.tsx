import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { MathProvider } from './components/math/MathProvider';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <MathProvider>
        <App />
      </MathProvider>
    </AuthProvider>
  </StrictMode>
);
