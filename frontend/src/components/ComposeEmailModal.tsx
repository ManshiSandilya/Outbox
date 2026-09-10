import { useState, type ChangeEvent, type FormEvent } from 'react';

import { apiFetch } from '../api';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

type ComposeEmailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onScheduled?: () => void;
  onToast: (message: string, tone: 'success' | 'error') => void;
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extractEmails(value: string): string[] {
  return [...new Set((value.match(emailPattern) ?? []).map((email) => email.toLowerCase()))];
}

export function ComposeEmailModal({ isOpen, onClose, onScheduled, onToast }: ComposeEmailModalProps) {

  const [senderId, setSenderId] = useState('manshisandilya6961@gmail.com');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientsText, setRecipientsText] = useState('');
  const [startTime, setStartTime] = useState('');
  const [delayBetweenMs, setDelayBetweenMs] = useState('1000');
  const [hourlyLimit, setHourlyLimit] = useState('25');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recipients = extractEmails(recipientsText);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setRecipientsText(await file.text());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!senderId || !subject.trim() || !body.trim() || !startTime || recipients.length === 0) {
      onToast('Complete all fields and add at least one valid email address.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch('/api/emails/schedule', {
        method: 'POST',
        body: JSON.stringify({
          senderId,
          subject: subject.trim(),
          body: body.trim(),
          recipients,
          startTime: new Date(startTime).toISOString(),
          delayBetweenMs: Number(delayBetweenMs),
          hourlyLimit: Number(hourlyLimit),
        }),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? 'Unable to schedule emails.');
      }
      onToast(`${recipients.length} email${recipients.length === 1 ? '' : 's'} scheduled successfully.`, 'success');
      setRecipientsText('');
      setSubject('');
      setBody('');
      onScheduled?.();
      onClose();

    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Unable to schedule emails.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return <Modal isOpen={isOpen} onClose={onClose} title="Compose New Email">
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-slate-700">Sender Email or ID
        <input required value={senderId} onChange={(event) => setSenderId(event.target.value)} placeholder="Sender email address or UUID" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Subject
        <input required maxLength={998} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Body
        <textarea required rows={5} value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
      </label>
      <div>
        <label className="block text-sm font-medium text-slate-700">Recipients file (CSV or text)</label>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void handleFileChange(event)} className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700 hover:file:bg-slate-200" />
        <textarea aria-label="Recipient email addresses" rows={3} value={recipientsText} onChange={(event) => setRecipientsText(event.target.value)} placeholder="Paste email addresses or upload a file" className="mt-2 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        <p className="mt-1 text-xs text-slate-500">{recipients.length} unique email address{recipients.length === 1 ? '' : 'es'} detected</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">Start time
          <input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Delay (ms)
          <input required min="0" type="number" value={delayBetweenMs} onChange={(event) => setDelayBetweenMs(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Hourly limit
          <input required min="1" type="number" value={hourlyLimit} onChange={(event) => setHourlyLimit(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Scheduling...' : 'Schedule'}</Button></div>
    </form>
  </Modal>;
}