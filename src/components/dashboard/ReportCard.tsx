'use client';

import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import { REPORT_TYPE_LABELS, type ReportType } from '@/lib/types';

interface ReportCardProps {
  id: string;
  status: 'draft' | 'review' | 'final';
  reportType: ReportType;
  propertyAddress: string;
  postcode: string;
  valuationFigure: number | null;
  updatedAt: string;
  onDelete: (id: string) => void;
}

export default function ReportCard({
  id,
  status,
  reportType,
  propertyAddress,
  postcode,
  valuationFigure,
  updatedAt,
  onDelete,
}: ReportCardProps) {
  const formattedDate = new Date(updatedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedValue = valuationFigure
    ? `£${valuationFigure.toLocaleString('en-GB')}`
    : null;

  return (
    <Link
      href={`/report/${id}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md hover:border-[#c49a6c]/30 transition group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate group-hover:text-[#c49a6c] transition">
            {propertyAddress}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">{postcode}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {REPORT_TYPE_LABELS[reportType] || reportType}
        </span>
        {formattedValue && (
          <span className="text-sm font-semibold text-[#1a2e3b]">
            {formattedValue}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">{formattedDate}</span>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('Delete this report?')) {
              onDelete(id);
            }
          }}
          className="text-xs text-gray-400 hover:text-red-600 transition opacity-0 group-hover:opacity-100"
        >
          Delete
        </button>
      </div>
    </Link>
  );
}
