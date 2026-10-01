import React from 'react';
import clsx from 'clsx';

const CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800 border border-amber-200' },
  assigned: { label: 'Assigned', className: 'bg-blue-100 text-blue-800 border border-blue-200' },
  in_progress: { label: 'In Progress', className: 'bg-orange-100 text-orange-800 border border-orange-200' },
  resolved: { label: 'Resolved', className: 'bg-green-100 text-green-800 border border-green-200' },
  scheduled: { label: 'Scheduled', className: 'bg-purple-100 text-purple-800 border border-purple-200' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800 border border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  active: { label: 'Active', className: 'bg-green-100 text-green-800 border border-green-200' },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

interface Props {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  const config = CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
