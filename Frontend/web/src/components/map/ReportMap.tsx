import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Report } from '../../store/reportStore';
import { StatusBadge } from '../common/StatusBadge';

// Fix leaflet default icon issue with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_COLORS: Record<string, string> = {
  pending: '#ef4444',
  assigned: '#3b82f6',
  in_progress: '#f97316',
  resolved: '#22c55e',
};

const TYPE_LABELS: Record<string, string> = {
  overflow: '🗑️ Overflow Bin',
  illegal_dumping: '⚠️ Illegal Dumping',
  damaged_bin: '🔧 Damaged Bin',
  missed_collection: '📋 Missed Collection',
};

function createColoredIcon(color: string) {
  return L.divIcon({
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

interface Props {
  reports: Report[];
  onViewReport?: (report: Report) => void;
}

export function ReportMap({ reports, onViewReport }: Props) {
  const reportsWithCoords = reports.filter((r) => r.lat && r.lng);

  return (
    <MapContainer
      center={[4.1550, 9.2410]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {reportsWithCoords.map((report) => (
        <Marker
          key={report.reportId}
          position={[report.lat, report.lng]}
          icon={createColoredIcon(STATUS_COLORS[report.status] || '#6b7280')}
        >
          <Popup>
            <div className="text-sm min-w-[180px]">
              <p className="font-semibold mb-1">
                {TYPE_LABELS[report.type] || report.type}
              </p>
              <p className="text-gray-600 text-xs mb-1">{report.address}</p>
              <div className="mb-2">
                <StatusBadge status={report.status} />
              </div>
              {onViewReport && (
                <button
                  onClick={() => onViewReport(report)}
                  className="text-primary-600 text-xs font-medium hover:underline"
                >
                  View details →
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

// Map legend
export function MapLegend() {
  const items = [
    { status: 'pending', color: '#ef4444', label: 'Pending' },
    { status: 'assigned', color: '#3b82f6', label: 'Assigned' },
    { status: 'in_progress', color: '#f97316', label: 'In Progress' },
    { status: 'resolved', color: '#22c55e', label: 'Resolved' },
  ];
  return (
    <div className="absolute bottom-4 left-4 z-[402] bg-white rounded-lg shadow-md px-3 py-2 flex gap-3 flex-wrap">
      {items.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-full border-2 border-white shadow"
            style={{ background: item.color }}
          />
          <span className="text-xs text-gray-600">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
