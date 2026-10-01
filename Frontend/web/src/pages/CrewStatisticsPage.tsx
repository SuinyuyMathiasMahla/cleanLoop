import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Download, RefreshCw, Users } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { crewApi, tasksApi } from '../services/api';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/LoadingSpinner';

type CrewMember = {
  crewId: string;
  name: string;
  email: string;
  status: string;
};

type TaskRecord = {
  taskId: string;
  title: string;
  status: string;
  crewIds?: string[];
  crewMemberIds?: string[];
  crewLeadId?: string;
  reportIds?: string[];
  createdAt?: string;
  scheduledAt?: string;
  completedAt?: string;
  updatedAt?: string;
  dueAt?: string;
};

type CrewStats = {
  member: CrewMember;
  assigned: number;
  completed: number;
  reportsResolved: number;
  onTime: number;
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateForTask(task: TaskRecord, field: 'createdAt' | 'completedAt') {
  const value = field === 'completedAt' ? task.completedAt ?? task.updatedAt : task.createdAt ?? task.scheduledAt;
  const date = value ? new Date(value) : null;
  return date && isValid(date) ? date : null;
}

function isInMonth(date: Date | null, selectedMonth: string) {
  return !!date && monthKey(date) === selectedMonth;
}

function releaseDateFor(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 28);
}

function csvValue(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function CrewStatisticsPage() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [crewResponse, taskResponse] = await Promise.all([
        crewApi.list(),
        tasksApi.list({ limit: 500 }),
      ]);
      setCrew(crewResponse.data.crew ?? []);
      setTasks(taskResponse.data.tasks ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load crew work statistics.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const rows = useMemo<CrewStats[]>(() => crew.map((member) => {
    const assigned = tasks.filter((task) => {
      const assignees = new Set([...(task.crewIds ?? []), ...(task.crewMemberIds ?? []), task.crewLeadId].filter(Boolean));
      return assignees.has(member.crewId) && isInMonth(dateForTask(task, 'createdAt'), selectedMonth);
    });
    const completed = tasks.filter((task) => {
      const assignees = new Set([...(task.crewIds ?? []), ...(task.crewMemberIds ?? []), task.crewLeadId].filter(Boolean));
      return task.status === 'completed' && assignees.has(member.crewId) && isInMonth(dateForTask(task, 'completedAt'), selectedMonth);
    });
    const onTime = completed.filter((task) => {
      const completedAt = dateForTask(task, 'completedAt');
      const dueAt = task.dueAt ? new Date(task.dueAt) : null;
      return !!completedAt && !!dueAt && isValid(dueAt) && completedAt.getTime() <= dueAt.getTime();
    });
    return {
      member,
      assigned: assigned.length,
      completed: completed.length,
      reportsResolved: completed.reduce((sum, task) => sum + (task.reportIds?.length ?? 0), 0),
      onTime: onTime.length,
    };
  }).sort((a, b) => b.completed - a.completed || a.member.name.localeCompare(b.member.name)), [crew, tasks, selectedMonth]);

  const completedTotal = rows.reduce((sum, row) => sum + row.completed, 0);
  const reportTotal = rows.reduce((sum, row) => sum + row.reportsResolved, 0);
  const onTimeTotal = rows.reduce((sum, row) => sum + row.onTime, 0);
  const onTimeRate = completedTotal ? Math.round(onTimeTotal / completedTotal * 100) : 0;
  const releaseDate = releaseDateFor(selectedMonth);
  const isDownloadAvailable = new Date() >= releaseDate;

  function downloadCsv() {
    if (!isDownloadAvailable) return;
    const headings = ['Crew Member', 'Email', 'Month', 'Tasks Assigned', 'Tasks Completed', 'Reports Resolved', 'Completed On Time', 'On-Time Rate'];
    const data = rows.map((row) => [
      row.member.name,
      row.member.email,
      selectedMonth,
      row.assigned,
      row.completed,
      row.reportsResolved,
      row.onTime,
      `${row.completed ? Math.round(row.onTime / row.completed * 100) : 0}%`,
    ]);
    const csv = [headings, ...data].map((line) => line.map(csvValue).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cleanloop-crew-work-${selectedMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Crew Work Statistics</h1>
          <p className="mt-1 text-sm text-gray-500">Monthly completed work by crew member.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            aria-label="Statistics month"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
          />
          <Button variant="secondary" size="sm" onClick={() => void loadData()} isLoading={isLoading} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={downloadCsv} disabled={!isDownloadAvailable || rows.length === 0} leftIcon={<Download className="h-4 w-4" />}>
            Download CSV
          </Button>
        </div>
      </div>

      {!isDownloadAvailable && (
        <p className="text-xs text-gray-500">This month’s download becomes available {format(releaseDate, 'MMMM d, yyyy')}.</p>
      )}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500"><Users className="h-4 w-4" /> Completed tasks</div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{completedTotal}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500"><CheckCircle2 className="h-4 w-4" /> Reports resolved</div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{reportTotal}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500"><Clock3 className="h-4 w-4" /> On-time completion</div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{onTimeRate}%</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">{format(new Date(`${selectedMonth}-01T00:00:00`), 'MMMM yyyy')}</h2>
          <span className="text-xs text-gray-500">Download opens on the 28th of the following month</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Crew Member</th>
                <th className="px-5 py-3 font-semibold">Assigned</th>
                <th className="px-5 py-3 font-semibold">Completed</th>
                <th className="px-5 py-3 font-semibold">Reports Resolved</th>
                <th className="px-5 py-3 font-semibold">On Time</th>
                <th className="px-5 py-3 font-semibold">On-Time Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={6}><TableSkeleton rows={5} cols={6} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="No crew work recorded" description="Completed tasks for this month will appear here." /></td></tr>
              ) : rows.map((row) => (
                <tr key={row.member.crewId}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{row.member.name}</p>
                    <p className="text-xs text-gray-500">{row.member.email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-gray-700">{row.assigned}</td>
                  <td className="px-5 py-3.5 font-medium text-gray-900">{row.completed}</td>
                  <td className="px-5 py-3.5 text-gray-700">{row.reportsResolved}</td>
                  <td className="px-5 py-3.5 text-gray-700">{row.onTime}</td>
                  <td className="px-5 py-3.5 text-gray-700">{row.completed ? Math.round(row.onTime / row.completed * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
