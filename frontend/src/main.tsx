import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID must be configured');

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><GoogleOAuthProvider clientId={clientId}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></GoogleOAuthProvider></React.StrictMode>);
