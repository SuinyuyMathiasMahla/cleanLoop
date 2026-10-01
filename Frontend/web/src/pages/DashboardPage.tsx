import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, TrendingUp, CheckCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useReportStore } from '../store/reportStore';
import { ReportMap, MapLegend } from '../components/map/ReportMap';
import { StatusBadge } from '../components/common/StatusBadge';
import { PageLoader } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { tasksApi, crewApi } from '../services/api';
import clsx from 'clsx';

const TYPE_ICONS: Record<string, string> = {
  overflow: '🗑️',
  illegal_dumping: '⚠️',
  damaged_bin: '🔧',
  missed_collection: '📋',
};

export function DashboardPage() {
  const { reports, isLoading, fetchReports, setSelectedReport } = useReportStore();
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [crewRecords, setCrewRecords] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [, tasksResponse, crewResponse] = await Promise.all([
      fetchReports(),
      tasksApi.list({ limit: 500 }),
      crewApi.list(),
    ]);
    const tasks = tasksResponse.data.tasks ?? [];
    const crew = crewResponse.data.crew ?? [];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    setCrewRecords(crew.map((member: any) => {
      const completed = tasks.filter((task: any) => {
        const assignees = [...(task.crewIds ?? []), task.crewLeadId].filter(Boolean);
        return task.status === 'completed' && assignees.includes(member.crewId) &&
          new Date(task.completedAt ?? task.updatedAt) >= monthStart;
      });
      const onTime = completed.filter((task: any) => task.dueAt &&
        new Date(task.completedAt ?? task.updatedAt) <= new Date(task.dueAt));
      return { ...member, monthlyCompleted: completed.length, monthlyOnTimeRate: completed.length ? Math.round(onTime.length / completed.length * 100) : 0 };
    }));
    setLastRefreshed(new Date());
  };

  const recentReports = [...reports]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const statCards = [
    {
      label: 'Total Reports Today',
      value: reports.length,
      icon: FileText,
      color: 'bg-blue-50 text-blue-600',
      border: 'border-blue-100',
    },
    {
      label: 'Pending',
      value: reports.filter((r) => r.status === 'pending').length,
      icon: Clock,
      color: 'bg-amber-50 text-amber-600',
      border: 'border-amber-100',
    },
    {
      label: 'In Progress',
      value: reports.filter((r) => r.status === 'in_progress').length,
      icon: TrendingUp,
      color: 'bg-orange-50 text-orange-600',
      border: 'border-orange-100',
    },
    {
      label: 'Resolved Today',
      value: reports.filter((r) => r.status === 'resolved').length,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-600',
      border: 'border-green-100',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={loadData}
          isLoading={isLoading}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={clsx('bg-white rounded-xl border p-5 shadow-sm', card.border)}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600 font-medium">{card.label}</p>
                <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', card.color)}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              {isLoading ? (
                <div className="skeleton h-8 w-16 rounded" />
              ) : (
                <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              )}
            </div>
          );
        })}
      </div>

      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Crew performance this month</h2>
          <span className="text-xs text-gray-500">{format(new Date(), 'MMMM yyyy')}</span>
        </div>
        {crewRecords.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">Crew monthly records will appear here.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {crewRecords.map((member) => (
              <div key={member.crewId} className="grid grid-cols-3 gap-3 px-5 py-3 items-center">
                <span className="text-sm font-medium text-gray-800 truncate">{member.name}</span>
                <span className="text-sm text-gray-600">{member.monthlyCompleted} completed</span>
                <span className="text-sm text-gray-600 text-right">{member.monthlyOnTimeRate}% on time</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Main content: Map + Recent Reports */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Map */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Live Map</h2>
            <Link to="/reports" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
              All reports <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="relative" style={{ height: '420px' }}>
            {isLoading ? (
              <PageLoader />
            ) : (
              <>
                <ReportMap reports={reports} onViewReport={setSelectedReport} />
                <MapLegend />
              </>
            )}
          </div>
        </div>

        {/* Recent Reports */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Reports</h2>
            <span className="text-xs text-gray-400">Last updated {formatDistanceToNow(lastRefreshed)} ago</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="skeleton h-4 rounded w-3/4" />
                    <div className="skeleton h-3 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : recentReports.length === 0 ? (
              <EmptyState title="No reports yet" description="Reports submitted by citizens will appear here." />
            ) : (
              recentReports.map((report) => (
                <div
                  key={report.reportId}
                  className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedReport(report)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                        <span>{TYPE_ICONS[report.type] || '📍'}</span>
                        <span className="truncate">{report.address}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        #{report.reportId.slice(-6).toUpperCase()} · {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <StatusBadge status={report.status} />
                  </div>
                </div>
              ))
            )}
          </div>
          {recentReports.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100">
              <Link to="/reports" className="text-sm text-primary-600 hover:underline flex items-center justify-center gap-1">
                View all reports <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}