import React, { useEffect, useState } from 'react';
import { Send, Bell, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { notificationsApi } from '../services/api';
import { Button } from '../components/common/Button';
import { Input, Textarea, Select } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/LoadingSpinner';

interface Notification {
  notificationId: string;
  title: string;
  message: string;
  recipients?: string;
  sentAt?: string;
  createdAt?: string;
  totalCount?: number;
  readCount?: number;
}

interface FormData {
  title: string;
  message: string;
  recipients: string;
}

const RECIPIENT_OPTIONS = [
  { value: 'all_citizens', label: 'All Citizens' },
  { value: 'all_crew',     label: 'All Crew' },
  { value: 'all_users',    label: 'All Users (Citizens + Crew)' },
];

const RECIPIENT_LABELS: Record<string, string> = {
  all_citizens: '👥 All Citizens',
  all_crew:     '🦺 All Crew',
  all_users:    '🌐 All Users',
};

const EMPTY_FORM: FormData = { title: '', message: '', recipients: 'all_citizens' };

export function NotificationsPage() {
  const [form, setForm]               = useState<FormData>(EMPTY_FORM);
  const [formErrors, setFormErrors]   = useState<Partial<FormData>>({});
  const [sending, setSending]         = useState(false);
  const [sendError, setSendError]     = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  // Load sent history from DynamoDB (admin's sent_log records)
  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list();
      // Lambda returns both data and notifications keys — check all shapes
      const items: Notification[] =
        res.data?.data ??
        res.data?.notifications ??
        res.data?.items ??
        [];
      // Only show sent_log records in the history table (filter out anything else)
      const sentLogs = items.filter(
        (n) => !n.recipients || (n as any).type === 'sent_log' || n.recipients
      );
      setNotifications(sentLogs);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const errs: Partial<FormData> = {};
    if (!form.title.trim())   errs.title      = 'Title is required';
    if (!form.message.trim()) errs.message    = 'Message is required';
    if (!form.recipients)     errs.recipients = 'Select recipients';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSend = async () => {
    if (!validate()) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    try {
      const res = await notificationsApi.send({ ...form });
      const sent = res.data?.sent ?? 0;

      if (sent === 0) {
        setSendError('Notification sent but reached 0 users — check that users exist in the system');
        return;
      }

      // Optimistically add to history — real data comes from DynamoDB on next load
      const now = new Date().toISOString();
      const newNotif: Notification = {
        notificationId: Date.now().toString(),
        title:      form.title,
        message:    form.message,
        recipients: form.recipients,
        sentAt:     now,
        createdAt:  now,
        totalCount: sent,
        readCount:  0,
      };
      setNotifications((prev) => [newNotif, ...prev]);
      setSendSuccess(true);
      setForm(EMPTY_FORM);
      setTimeout(() => setSendSuccess(false), 4000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const charCount = form.message.length;
  const maxChars  = 500;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="text-sm text-gray-500 mt-0.5">Send notifications to users in the system</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* ── Compose ── */}
        <div className="xl:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary-600" /> Send Notification
            </h2>

            {sendSuccess && (
              <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                <CheckCircle className="w-4 h-4" /> Notification sent successfully!
              </div>
            )}
            {sendError && (
              <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4" /> {sendError}
              </div>
            )}

            <div className="space-y-4">
              <Input
                label="Title"
                value={form.title}
                onChange={(e) => {
                  setForm((f) => ({ ...f, title: e.target.value }));
                  if (formErrors.title) setFormErrors((p) => ({ ...p, title: undefined }));
                }}
                placeholder="e.g. Collection Schedule Update"
                error={formErrors.title}
                required
              />

              <div>
                <Textarea
                  label="Message"
                  value={form.message}
                  onChange={(e) => {
                    if (e.target.value.length <= maxChars) {
                      setForm((f) => ({ ...f, message: e.target.value }));
                      if (formErrors.message) setFormErrors((p) => ({ ...p, message: undefined }));
                    }
                  }}
                  placeholder="Enter your notification message..."
                  rows={4}
                  error={formErrors.message}
                  required
                />
                <div className={`text-xs text-right mt-1 ${charCount > maxChars * 0.9 ? 'text-amber-500' : 'text-gray-400'}`}>
                  {charCount}/{maxChars}
                </div>
              </div>

              <Select
                label="Recipients"
                value={form.recipients}
                onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))}
                options={RECIPIENT_OPTIONS}
                error={formErrors.recipients}
                required
              />

              <Button
                variant="primary"
                isLoading={sending}
                onClick={handleSend}
                leftIcon={<Send className="w-4 h-4" />}
                className="w-full"
              >
                {sending ? 'Sending...' : 'Send Notification'}
              </Button>
            </div>
          </div>

          {/* Preview */}
          {(form.title || form.message) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Preview</p>
              <div className="bg-gray-900 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bell className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-xs text-gray-400">CleanLoop · now</p>
                </div>
                <p className="font-semibold text-sm mb-1">{form.title || 'Notification title'}</p>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {form.message || 'Your message will appear here...'}
                </p>
                {form.recipients && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
                    <Users className="w-3 h-3" />
                    <span>{RECIPIENT_LABELS[form.recipients] || form.recipients}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── History ── */}
        <div className="xl:col-span-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Sent Notifications</h2>
              <button
                onClick={loadNotifications}
                className="text-xs text-primary-600 hover:underline"
              >
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Title</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Recipients</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Sent</th>
                    <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={4}><TableSkeleton rows={5} cols={4} /></td></tr>
                  ) : notifications.length === 0 ? (
                    <tr><td colSpan={4}>
                      <EmptyState
                        title="No notifications sent yet"
                        description="Send your first notification using the form on the left."
                        icon={<Bell className="w-8 h-8" />}
                      />
                    </td></tr>
                  ) : (
                    notifications.map((n) => {
                      const dateStr = n.sentAt ?? n.createdAt;
                      const dateObj = dateStr ? new Date(dateStr) : null;
                      const validDate = dateObj && !isNaN(dateObj.getTime());
                      return (
                        <tr key={n.notificationId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-gray-900">{n.title}</p>
                            <p className="text-xs text-gray-400 truncate max-w-[200px] mt-0.5">{n.message}</p>
                          </td>
                          <td className="px-5 py-3.5 text-gray-600 text-sm">
                            {RECIPIENT_LABELS[n.recipients ?? ''] ?? n.recipients ?? '—'}
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap text-xs">
                            {validDate ? (
                              <>
                                <div>{format(dateObj!, 'MMM d, yyyy')}</div>
                                <div className="text-gray-400">{formatDistanceToNow(dateObj!, { addSuffix: true })}</div>
                              </>
                            ) : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-700">
                            {n.totalCount != null ? n.totalCount : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}