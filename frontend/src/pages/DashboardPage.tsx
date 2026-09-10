import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { useAuth } from '../context/AuthContext';

const tabs = [{ id: 'scheduled', label: 'Scheduled Emails' }, { id: 'sent', label: 'Sent Emails' }] as const;
type TabId = typeof tabs[number]['id'];

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('scheduled');
  const [isComposeOpen, setComposeOpen] = useState(false);
  if (!user) return null;

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };
  return <div className="min-h-screen bg-slate-50"><Header user={user} onLogout={() => void handleLogout()} onCompose={() => setComposeOpen(true)} /><main className="mx-auto max-w-6xl px-6 py-8"><Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} /><section className="py-12 text-center text-sm text-slate-500">{activeTab === 'scheduled' ? 'Scheduled email table will appear here.' : 'Sent email table will appear here.'}</section></main><Modal isOpen={isComposeOpen} onClose={() => setComposeOpen(false)} title="Compose New Email" /></div>;
}
