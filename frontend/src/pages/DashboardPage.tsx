import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchEmails, searchEmails, type EmailListItem } from '../api';

import { ComposeEmailModal } from '../components/ComposeEmailModal';
import { Header } from '../components/layout/Header';
import { Tabs } from '../components/ui/Tabs';
import { Table, TableSkeleton, type TableColumn } from '../components/ui/Table';
import { useAuth } from '../context/AuthContext';

const tabs = [{ id: 'scheduled', label: 'Scheduled Emails' }, { id: 'sent', label: 'Sent Emails' }] as const;
type TabId = typeof tabs[number]['id'];

const scheduledColumns: readonly TableColumn<EmailListItem>[] = [
  { key: 'email', header: 'Email', render: (email) => email.email },
  { key: 'subject', header: 'Subject', render: (email) => email.subject },
  { key: 'scheduled_time', header: 'Scheduled time', render: (email) => new Date(email.scheduled_time).toLocaleString() },
  { key: 'status', header: 'Status', render: (email) => <span className="capitalize">{email.status}</span> },
];

const sentColumns: readonly TableColumn<EmailListItem>[] = [
  { key: 'email', header: 'Email', render: (email) => email.email },
  { key: 'subject', header: 'Subject', render: (email) => email.subject },
  { key: 'sent_time', header: 'Sent time', render: (email) => email.sent_time ? new Date(email.sent_time).toLocaleString() : 'Not available' },
  { key: 'status', header: 'Status', render: (email) => <span className="capitalize">{email.status}</span> },
];

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('scheduled');
  const [isComposeOpen, setComposeOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [isLoadingEmails, setIsLoadingEmails] = useState(true);
  const [emailLoadError, setEmailLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  const loadEmails = (showLoading = false) => {
    if (searchQuery.trim()) return;
    if (showLoading) setIsLoadingEmails(true);
    setEmailLoadError(null);
    return fetchEmails(activeTab === 'scheduled' ? 'scheduled' : 'sent|failed')
      .then((response) => { setEmails(response.emails); })
      .catch(() => { setEmailLoadError('Unable to load emails right now.'); })
      .finally(() => { setIsLoadingEmails(false); });
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      void loadEmails(true);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      const interval = setInterval(() => { void loadEmails(false); }, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) return;
    setIsLoadingEmails(true);
    setEmailLoadError(null);
    void searchEmails(query.trim())
      .then((response) => { setEmails(response.emails); })
      .catch(() => { setEmailLoadError('Search failed.'); })
      .finally(() => { setIsLoadingEmails(false); });
  };

  if (!user) return null;

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };
  const columns = activeTab === 'scheduled' ? scheduledColumns : sentColumns;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} onLogout={() => void handleLogout()} onCompose={() => setComposeOpen(true)} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search emails (Elasticsearch)..."
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
        <section className="mt-6">

          {isLoadingEmails && emails.length === 0 ? (
            <TableSkeleton />
          ) : emailLoadError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{emailLoadError}</p>
          ) : emails.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              No {activeTab === 'scheduled' ? 'scheduled' : 'sent'} emails yet.
            </p>
          ) : (
            <Table
              columns={columns}
              rows={emails}
              getRowKey={(email, index) => `${email.email}-${email.scheduled_time}-${index}`}
            />
          )}
        </section>
      </main>
      <ComposeEmailModal
        isOpen={isComposeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={() => void loadEmails(false)}
        onToast={(message, tone) => setToast({ message, tone })}
      />
      {toast && (
        <div role="status" className={`fixed bottom-6 right-6 z-[60] rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.tone === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
          <button type="button" className="ml-3 text-white/80 hover:text-white" onClick={() => setToast(null)} aria-label="Dismiss notification">Dismiss</button>
        </div>
      )}
    </div>
  );
}

