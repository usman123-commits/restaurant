import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './index.css';
import { restoreSavedLists } from './lib/restore';
import { Analytics } from '@vercel/analytics/react'

// lists saved in IndexedDB first (instant Orders / Handoffs / Spend after a refresh)
restoreSavedLists().finally(() => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Analytics />
    </BrowserRouter>
  </React.StrictMode>
));
