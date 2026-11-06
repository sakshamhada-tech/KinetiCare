import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createBrowserRouter } from 'react-router';
import rootRoute from './routes';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('KinetiCare: #root element not found in index.html');
}

const router = createBrowserRouter(rootRoute);

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
