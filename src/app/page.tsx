'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/ui/AppShell';
import ReportCard from '@/components/dashboard/ReportCard';
import type { ReportType } from '@/lib/types';

interface ReportSummary {
  id: string;
  status: 'draft' | 'review' | 'final';
  report_type: ReportType;
  property_address: string;
  postcode: string;
  valuation_figure: number | null;
  updated_at: string;
}

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  async function loadReports(searchTerm = '') {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) {
      const data = await res.json();
      setReports(data.reports || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadReports(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleDelete(id: string) {
    await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    setReports((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">
            {reports.length} report{reports.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/report/new"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#c49a6c] hover:bg-[#b3895d] text-white font-semibold rounded-lg transition"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Report
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by address, postcode, or reference..."
          className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4 text-gray-300">
            <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No reports yet</h2>
          <p className="text-gray-500 mb-6">Create your first valuation report to get started.</p>
          <Link
            href="/report/new"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#c49a6c] hover:bg-[#b3895d] text-white font-semibold rounded-lg transition"
          >
            Create Report
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((report) => (
              <ReportCard
                key={report.id}
                id={report.id}
                status={report.status}
                reportType={report.report_type}
                propertyAddress={report.property_address}
                postcode={report.postcode}
                valuationFigure={report.valuation_figure}
                updatedAt={report.updated_at}
                onDelete={handleDelete}
              />
            ))}
          </div>
          {reports.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {Math.ceil(reports.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(Math.ceil(reports.length / PAGE_SIZE), p + 1))}
                disabled={page >= Math.ceil(reports.length / PAGE_SIZE)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
