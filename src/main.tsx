import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles/base.css';
import './themes/themes.css';
import { ThemeProvider } from './themes/ThemeProvider';
import { GraphRoute } from './graph/GraphRoute';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<App />} />
          {/* Both render the same page; the slug just opens a note in it. */}
          <Route path="/graph" element={<GraphRoute />} />
          <Route path="/graph/:slug" element={<GraphRoute />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
