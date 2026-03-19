'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/ui/AppShell';
import ReportCard from '@/components/dashboard/ReportCard';
import type { ReportType } from '@/lib/types';

// Surveyors / folder owners
const SURVEYORS = ['Eddie Lisberg', 'Dylan Goldstein'] as const;
type FolderStatus = 'completed' | 'pending';

interface ReportSummary {
  id: string;
  status: 'draft' | 'review' | 'final';
  report_type: ReportType;
  property_address: string;
  postcode: string;
  valuation_figure: number | null;
  assigned_to: string | null;
  updated_at: string;
}

type ViewLevel = 'people' | 'folders' | 'reports';

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Navigation state
  const [viewLevel, setViewLevel] = useState<ViewLevel>('people');
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderStatus | null>(null);

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

  // Filter reports for current view
  function matchesPerson(r: ReportSummary, person: string): boolean {
    if (person === '__unassigned__') {
      return !r.assigned_to || !(SURVEYORS as readonly string[]).includes(r.assigned_to);
    }
    return r.assigned_to === person;
  }

  function getFilteredReports(): ReportSummary[] {
    if (!selectedPerson || !selectedFolder) return [];
    return reports.filter((r) => {
      if (!matchesPerson(r, selectedPerson)) return false;
      const isCompleted = r.status === 'final';
      return selectedFolder === 'completed' ? isCompleted : !isCompleted;
    });
  }

  // Count reports per person/folder
  function getCount(person: string, folder?: FolderStatus): number {
    return reports.filter((r) => {
      if (!matchesPerson(r, person)) return false;
      if (!folder) return true;
      const isCompleted = r.status === 'final';
      return folder === 'completed' ? isCompleted : !isCompleted;
    }).length;
  }

  function getUnassignedCount(): number {
    return reports.filter((r) => !r.assigned_to || !SURVEYORS.includes(r.assigned_to as typeof SURVEYORS[number])).length;
  }

  // Navigation
  function navigateToPerson(person: string) {
    setSelectedPerson(person);
    setSelectedFolder(null);
    setViewLevel('folders');
    setPage(1);
  }

  function navigateToFolder(folder: FolderStatus) {
    setSelectedFolder(folder);
    setViewLevel('reports');
    setPage(1);
  }

  function navigateBack() {
    if (viewLevel === 'reports') {
      setSelectedFolder(null);
      setViewLevel('folders');
    } else if (viewLevel === 'folders') {
      setSelectedPerson(null);
      setViewLevel('people');
    }
    setPage(1);
  }

  // Breadcrumb
  function renderBreadcrumb() {
    if (viewLevel === 'people') return null;
    return (
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <button onClick={() => { setViewLevel('people'); setSelectedPerson(null); setSelectedFolder(null); }} className="hover:text-[#c49a6c] transition">
          All
        </button>
        {selectedPerson && (
          <>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            <button
              onClick={() => { setViewLevel('folders'); setSelectedFolder(null); }}
              className={`hover:text-[#c49a6c] transition ${viewLevel === 'folders' ? 'text-gray-900 font-medium' : ''}`}
            >
              {selectedPerson === '__unassigned__' ? 'Unassigned' : selectedPerson}
            </button>
          </>
        )}
        {selectedFolder && (
          <>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            <span className="text-gray-900 font-medium">
              {selectedFolder === 'completed' ? 'Completed Valuations' : 'Pending Valuations'}
            </span>
          </>
        )}
      </nav>
    );
  }

  const filteredReports = getFilteredReports();
  const pagedReports = filteredReports.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          {viewLevel !== 'people' && (
            <button onClick={navigateBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-500 hover:text-gray-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {viewLevel === 'people' && 'Reports'}
              {viewLevel === 'folders' && (selectedPerson === '__unassigned__' ? 'Unassigned' : selectedPerson)}
              {viewLevel === 'reports' && (selectedFolder === 'completed' ? 'Completed Valuations' : 'Pending Valuations')}
            </h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              {viewLevel === 'people' && `${reports.length} report${reports.length !== 1 ? 's' : ''}`}
              {viewLevel === 'folders' && `${getCount(selectedPerson!)} report${getCount(selectedPerson!) !== 1 ? 's' : ''}`}
              {viewLevel === 'reports' && `${filteredReports.length} report${filteredReports.length !== 1 ? 's' : ''}`}
            </p>
          </div>
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

      {/* Breadcrumb */}
      {renderBreadcrumb()}

      {/* Search (only at reports level) */}
      {viewLevel === 'reports' && (
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by address, postcode, or reference..."
            className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
          />
        </div>
      )}

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
      ) : viewLevel === 'people' ? (
        /* ===== PEOPLE VIEW ===== */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SURVEYORS.map((person) => (
            <button
              key={person}
              onClick={() => navigateToPerson(person)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-[#c49a6c]/30 transition text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-[#1a2e3b] flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {person.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 group-hover:text-[#c49a6c] transition truncate">{person}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{getCount(person)} report{getCount(person) !== 1 ? 's' : ''}</p>
                </div>
                <svg className="h-5 w-5 text-gray-400 group-hover:text-[#c49a6c] transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}

          {/* Unassigned folder */}
          {getUnassignedCount() > 0 && (
            <button
              onClick={() => navigateToPerson('__unassigned__')}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 transition text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-gray-400 flex items-center justify-center text-white shrink-0">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 group-hover:text-gray-600 transition truncate">Unassigned</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{getUnassignedCount()} report{getUnassignedCount() !== 1 ? 's' : ''}</p>
                </div>
                <svg className="h-5 w-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          )}
        </div>
      ) : viewLevel === 'folders' ? (
        /* ===== FOLDERS VIEW (Completed / Pending) ===== */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigateToFolder('completed')}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-green-300 transition text-left group"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-gray-900 group-hover:text-green-700 transition">Completed Valuations</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {getCount(selectedPerson!, 'completed')} report{getCount(selectedPerson!, 'completed') !== 1 ? 's' : ''}
                </p>
              </div>
              <svg className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => navigateToFolder('pending')}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-amber-300 transition text-left group"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-gray-900 group-hover:text-amber-700 transition">Pending Valuations</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {getCount(selectedPerson!, 'pending')} report{getCount(selectedPerson!, 'pending') !== 1 ? 's' : ''}
                </p>
              </div>
              <svg className="h-5 w-5 text-gray-400 group-hover:text-amber-600 transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
      ) : filteredReports.length === 0 ? (
        /* ===== EMPTY REPORTS VIEW ===== */
        <div className="text-center py-16">
          <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 mb-2 mt-4">No reports here yet</h2>
          <p className="text-gray-500 mb-6">
            {selectedFolder === 'completed' ? 'No completed valuations for this surveyor.' : 'No pending valuations for this surveyor.'}
          </p>
          <Link
            href="/report/new"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#c49a6c] hover:bg-[#b3895d] text-white font-semibold rounded-lg transition"
          >
            Create Report
          </Link>
        </div>
      ) : (
        /* ===== REPORTS LIST VIEW ===== */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedReports.map((report) => (
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
          {filteredReports.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {Math.ceil(filteredReports.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(Math.ceil(filteredReports.length / PAGE_SIZE), p + 1))}
                disabled={page >= Math.ceil(filteredReports.length / PAGE_SIZE)}
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
