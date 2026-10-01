import React, { useEffect, useState } from 'react';
import { Plus, Calendar, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useTaskStore, Task, TaskStatus, CreateTaskInput } from '../store/taskStore';
import { useReportStore } from '../store/reportStore';
import { useCrewStore } from '../store/crewStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { Button } from '../components/common/Button';
import { Input, Textarea, Select } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/LoadingSpinner';

interface TaskFormData {
  title: string;
  description: string;
  reportIds: string[];
  crewLeadId: string;
  crewMemberIds: string[];
  scheduledAt: string;
  dueAt: string;
  notes: string;
}

const EMPTY_FORM: TaskFormData = {
  title: '',
  description: '',
  reportIds: [],
  crewLeadId: '',
  crewMemberIds: [],
  scheduledAt: '',
  dueAt: '',
  notes: '',
};

const TASK_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function TasksPage() {
  const { tasks, total, isLoading, error, fetchTasks, createTask, updateTask, deleteTask, clearError } = useTaskStore();
  const { reports, fetchReports } = useReportStore();
  const { crew, fetchCrew } = useCrewStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<TaskFormData>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
    fetchReports();
    fetchCrew();
  }, []);

  const pendingReports = reports.filter((r) => r.status === 'pending');
  const activeCrew = crew.filter((c) => c.status === 'active');

  const validate = () => {
    const errs: Partial<TaskFormData> = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.crewLeadId) errs.crewLeadId = 'Crew lead is required';
    if (!form.scheduledAt) errs.scheduledAt = 'Scheduled date is required';
    if (!form.dueAt) errs.dueAt = 'Due date is required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const input: CreateTaskInput = {
        title: form.title,
        description: form.description || undefined,
        reportIds: form.reportIds,
        crewLeadId: form.crewLeadId,
        crewMemberIds: form.crewMemberIds,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        dueAt: new Date(form.dueAt).toISOString(),
        notes: form.notes || undefined,
      };
      await createTask(input);
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      await updateTask(taskId, { status });
    } catch {
      // error handled in store
    }
  };

  const toggleReportId = (id: string) => {
    setForm((f) => ({
      ...f,
      reportIds: f.reportIds.includes(id) ? f.reportIds.filter((r) => r !== id) : [...f.reportIds, id],
    }));
  };

  const toggleCrewMember = (id: string) => {
    setForm((f) => ({
      ...f,
      crewMemberIds: f.crewMemberIds.includes(id)
        ? f.crewMemberIds.filter((c) => c !== id)
        : [...f.crewMemberIds, id],
    }));
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} tasks total</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => { clearError(); setShowCreateModal(true); }}
        >
          Create Task
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Tasks table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Title</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Reports</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Crew Lead</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Scheduled</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Due</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={7}><TableSkeleton rows={6} cols={7} /></td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={7}>
                  <EmptyState
                    title="No tasks yet"
                    description="Create tasks to assign crew to pending reports."
                    action={
                      <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowCreateModal(true)}>
                        Create Task
                      </Button>
                    }
                  />
                </td></tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.taskId} className="table-row-hover">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{task.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                        {task.reportIds.length} report{task.reportIds.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700">
                      {task.crewLeadName || task.crewLeadId}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap text-xs">
                      {format(new Date(task.scheduledAt), 'MMM d, HH:mm')}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap text-xs">
                      {format(new Date(task.dueAt), 'MMM d, HH:mm')}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.taskId, e.target.value as TaskStatus)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                        >
                          {TASK_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => deleteTask(task.taskId)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setForm(EMPTY_FORM); setFormErrors({}); setSubmitError(null); }}
        title="Create Task"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button variant="primary" isLoading={submitting} onClick={handleSubmit}>
              Create Task
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {submitError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4" /> {submitError}
            </div>
          )}

          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Collect overflow bins in Ward 7"
            error={formErrors.title as string}
            required
          />

          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Additional details about this task..."
            rows={3}
          />

          {/* Report IDs */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Linked Reports ({form.reportIds.length} selected)
            </label>
            <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto p-2 space-y-1">
              {pendingReports.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">No pending reports</p>
              ) : (
                pendingReports.map((r) => (
                  <label key={r.reportId} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.reportIds.includes(r.reportId)}
                      onChange={() => toggleReportId(r.reportId)}
                      className="rounded text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 truncate">
                      #{r.reportId.slice(-6).toUpperCase()} · {r.address}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Crew Lead */}
          <Select
            label="Crew Lead"
            value={form.crewLeadId}
            onChange={(e) => setForm((f) => ({ ...f, crewLeadId: e.target.value }))}
            options={activeCrew.map((c) => ({ value: c.crewId, label: c.name }))}
            placeholder="Select crew lead..."
            error={formErrors.crewLeadId as string}
            required
          />

          {/* Additional crew members */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Additional Crew Members ({form.crewMemberIds.length} selected)
            </label>
            <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto p-2 space-y-1">
              {activeCrew.filter((c) => c.crewId !== form.crewLeadId).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">No other crew members</p>
              ) : (
                activeCrew
                  .filter((c) => c.crewId !== form.crewLeadId)
                  .map((c) => (
                    <label key={c.crewId} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.crewMemberIds.includes(c.crewId)}
                        onChange={() => toggleCrewMember(c.crewId)}
                        className="rounded text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{c.name} · {c.email}</span>
                    </label>
                  ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Scheduled Date & Time"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              error={formErrors.scheduledAt as string}
              required
            />
            <Input
              label="Due Date & Time"
              type="datetime-local"
              value={form.dueAt}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
              error={formErrors.dueAt as string}
              required
            />
          </div>

          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Any special instructions for the crew..."
            rows={2}
          />
        </div>
      </Modal>
    </div>
  );
}
