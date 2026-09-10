import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

const clientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '613308377994-5m6vgf2l1hqbana00h8831ad0lvr0spb.apps.googleusercontent.com';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><GoogleOAuthProvider clientId={clientId}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></GoogleOAuthProvider></React.StrictMode>);
