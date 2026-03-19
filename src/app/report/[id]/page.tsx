'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/ui/AppShell';
import StatusBadge from '@/components/ui/StatusBadge';
import SectionCard from '@/components/report/SectionCard';
import ComparablePanel from '@/components/report/ComparablePanel';
import ValuationPanel from '@/components/report/ValuationPanel';
import FloatingDictation from '@/components/ui/FloatingDictation';
import DriveFolderPicker from '@/components/ui/DriveFolderPicker';
import { REPORT_TYPE_LABELS, isAuctionType, type ReportType, type ReportRow, type Comparable } from '@/lib/types';

// Section display order and names — matches client's actual report format (no numbered headings)
const ALL_SECTIONS = [
  { key: 'section_1_instructions', title: 'Instructions' },
  { key: 'section_2_basis', title: 'Basis of Valuation' },
  { key: 'section_3_assumptions', title: 'Assumptions and Sources of Information' },
  { key: 'section_4_inspection', title: 'Inspection' },
  { key: 'section_5_description', title: 'Description of Property' },
  { key: 'section_6_construction', title: 'Construction' },
  { key: 'section_7_accommodation', title: 'Accommodation' },
  { key: 'section_8_externally', title: 'Externally' },
  { key: 'section_9_services', title: 'Services' },
  { key: 'section_10_floor_area', title: 'Total Floor Area' },
  { key: 'section_11_tenure', title: 'Tenure' },
  { key: 'section_12_roads', title: 'Roads' },
  { key: 'section_13_condition', title: 'Condition & Further Details' },
  { key: 'section_14_structure', title: 'Structure and External' },
  { key: 'section_15_amenity', title: 'Amenity' },
  { key: 'section_16_comparables_intro', title: 'Comparable Data' },
  { key: 'section_17_market_commentary', title: 'Valuation Conclusions and Market Commentary' },
  { key: 'section_18_valuation', title: 'Valuation Conclusion' },
  { key: 'section_19_auction_reserve', title: 'Auction Reserve' },
  { key: 'signature_block', title: 'Signature Block' },
  { key: 'appendix_1', title: 'Appendix 1' },
] as const;

type Tab = 'sections' | 'comparables' | 'data';

export default function ReportEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [report, setReport] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('sections');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pdfError, setPdfError] = useState('');
  const [docxStatus, setDocxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [docxError, setDocxError] = useState('');
  const [applyingNotes, setApplyingNotes] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveFolderName, setDriveFolderName] = useState<string | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfBlobUrl = useRef<string | null>(null);
  const docxBlobUrl = useRef<string | null>(null);

  // Load report
  const loadReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Report not found');
          return;
        }
        throw new Error('Failed to load report');
      }
      const data = await res.json();
      setReport(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Warn user about unsaved changes when navigating away
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saving) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saving]);

  // Poll for generation results when report has no generated sections yet
  useEffect(() => {
    if (!report) return;

    const sections = report.generated_sections || {};
    const hasSections = Object.keys(sections).length > 0;

    if (!hasSections && report.status === 'draft') {
      setGenerating(true);
      pollTimer.current = setInterval(async () => {
        const res = await fetch(`/api/reports/${id}`);
        if (res.ok) {
          const data = await res.json();
          setReport(data);
          const updatedSections = data.generated_sections || {};
          if (Object.keys(updatedSections).length > 0) {
            setGenerating(false);
            if (pollTimer.current) clearInterval(pollTimer.current);
          }
        }
      }, 3000);
    } else {
      setGenerating(false);
    }

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [report?.status, report?.generated_sections, id]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl.current) URL.revokeObjectURL(pdfBlobUrl.current);
      if (docxBlobUrl.current) URL.revokeObjectURL(docxBlobUrl.current);
    };
  }, []);

  // Check Drive connection status
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((settings) => {
        if (settings?.google_tokens) {
          setDriveConnected(true);
        }
      })
      .catch(() => {});
  }, []);

  // Load Drive folder ID + name from report (checks both dedicated column and property_details fallback)
  useEffect(() => {
    if (report) {
      const raw = report as unknown as Record<string, unknown>;
      const pd = (report.property_details as Record<string, unknown> | null) || {};
      const folderId = (raw.google_drive_folder_id || pd.driveFolderId) as string | undefined;
      const folderName = pd.driveFolderName as string | undefined;
      if (folderId) setDriveFolderId(folderId);
      if (folderName) setDriveFolderName(folderName);
    }
  }, [report]);

  // Link Drive folder handler (called from DriveFolderPicker)
  async function handleLinkDriveFolder(folder: { id: string; name: string }) {
    setShowDrivePicker(false);
    setDriveFolderId(folder.id);
    setDriveFolderName(folder.name);
    // Persist to report — saves in both property_details (migration-safe) and the dedicated column
    const existingPd = (report?.property_details as Record<string, unknown> | null) || {};
    fetch(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        google_drive_folder_id: folder.id,
        property_details: { ...existingPd, driveFolderId: folder.id, driveFolderName: folder.name },
      }),
    }).catch(() => {});
  }

  // Auto-save with debounce
  const saveReport = useCallback(async (updates: Record<string, unknown>) => {
    if (!report) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch {
      // Silently fail on auto-save — user can retry
    } finally {
      setSaving(false);
    }
  }, [id, report]);

  const debouncedSave = useCallback((updates: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveReport(updates), 1000);
  }, [saveReport]);

  // Update report locally and trigger debounced save
  const updateReport = useCallback((updates: Record<string, unknown>) => {
    setReport((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates } as ReportRow;
    });
    debouncedSave(updates);
  }, [debouncedSave]);

  // Section edit handler
  const handleSectionSave = useCallback((key: string, value: string) => {
    if (!report) return;
    const updated = { ...report.generated_sections, [key]: value };
    updateReport({ generated_sections: updated });
  }, [report, updateReport]);

  // Comparables handler
  const handleComparablesChange = useCallback((comparables: Comparable[]) => {
    updateReport({ comparables });
  }, [updateReport]);

  // Valuation handler
  const handleValuationChange = useCallback((updates: Record<string, unknown>) => {
    updateReport(updates);
  }, [updateReport]);

  // Regenerate pipeline (with 2-minute timeout)
  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      await fetch(`/api/reports/${id}/generate`, { method: 'POST' });
      let elapsed = 0;
      const poll = setInterval(async () => {
        elapsed += 3000;
        if (elapsed > 120_000) {
          // 2-minute timeout
          setGenerating(false);
          clearInterval(poll);
          alert('Report generation is taking longer than expected. The report may still be processing — please refresh the page in a minute.');
          return;
        }
        try {
          const res = await fetch(`/api/reports/${id}`);
          if (res.ok) {
            const data = await res.json();
            setReport(data);
            if (data.status === 'review') {
              setGenerating(false);
              clearInterval(poll);
            }
          }
        } catch {
          // Network error during poll — keep trying
        }
      }, 3000);
      pollTimer.current = poll;
    } catch {
      setGenerating(false);
    }
  };

  // Generate PDF
  const handleGeneratePdf = async () => {
    if (!report) return;
    setPdfStatus('loading');
    setPdfError('');

    try {
      const res = await fetch(`/api/reports/${id}/pdf`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      if (pdfBlobUrl.current) URL.revokeObjectURL(pdfBlobUrl.current);
      const url = URL.createObjectURL(blob);
      pdfBlobUrl.current = url;

      const a = document.createElement('a');
      a.href = url;
      a.download = `CoreProp-${report.postcode.replace(/\s/g, '')}-${report.reference_number || id.slice(0, 8)}.pdf`;
      a.click();

      setPdfStatus('success');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate PDF');
      setPdfStatus('error');
    }
  };

  // Generate Word Document
  const handleGenerateDocx = async () => {
    if (!report) return;
    setDocxStatus('loading');
    setDocxError('');

    try {
      const res = await fetch(`/api/reports/${id}/docx`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      if (docxBlobUrl.current) URL.revokeObjectURL(docxBlobUrl.current);
      const url = URL.createObjectURL(blob);
      docxBlobUrl.current = url;

      const a = document.createElement('a');
      a.href = url;
      a.download = `CoreProp-${report.postcode.replace(/\s/g, '')}-${report.reference_number || id.slice(0, 8)}.docx`;
      a.click();

      setDocxStatus('success');
    } catch (err) {
      setDocxError(err instanceof Error ? err.message : 'Failed to generate Word document');
      setDocxStatus('error');
    }
  };

  // Inspection notes — stored inside property_details.inspectionNotes (no DB migration needed)
  const inspectionNotes = (report?.property_details as Record<string, unknown>)?.inspectionNotes as string || '';

  const handleInspectionNotesChange = useCallback((notes: string) => {
    if (!report) return;
    const currentDetails = (report.property_details || {}) as Record<string, unknown>;
    updateReport({ property_details: { ...currentDetails, inspectionNotes: notes } });
  }, [report, updateReport]);

  // Apply inspection notes to report via AI
  const handleApplyNotes = useCallback(async () => {
    if (!report || applyingNotes) return;
    setApplyingNotes(true);
    try {
      const res = await fetch(`/api/reports/${id}/apply-notes`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      // Reload report to get updated sections
      await loadReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply notes');
    } finally {
      setApplyingNotes(false);
    }
  }, [report, applyingNotes, id, loadReport]);

  // Mark as final
  const handleMarkFinal = () => {
    updateReport({ status: 'final' });
  };

  // ---- Loading / Error states ----
  if (loading) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 bg-gray-200 rounded" />
            <div className="h-4 w-48 bg-gray-100 rounded" />
            <div className="grid gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="h-5 w-48 bg-gray-200 rounded mb-3" />
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-gray-100 rounded" />
                    <div className="h-3 w-5/6 bg-gray-100 rounded" />
                    <div className="h-3 w-4/6 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !report) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto text-center py-16">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {error === 'Report not found' ? 'Report Not Found' : 'Error'}
          </h1>
          <p className="text-gray-500 mb-6">{error || 'Something went wrong loading this report.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2.5 bg-[#c49a6c] hover:bg-[#b3895d] text-white font-semibold rounded-lg transition"
          >
            Back to Dashboard
          </button>
        </div>
      </AppShell>
    );
  }

  // ---- Main render ----
  const sections = report.generated_sections || {};
  const hasSections = Object.keys(sections).length > 0;
  const reportLabel = REPORT_TYPE_LABELS[report.report_type] ?? report.report_type;
  const showAuction = isAuctionType(report.report_type);
  const comparables: Comparable[] = report.comparables || [];

  // Filter sections that exist in generated_sections
  const visibleSections = ALL_SECTIONS.filter((s) => {
    if (s.key === 'section_19_auction_reserve' && !showAuction) return false;
    return true;
  });

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'sections', label: 'Report Sections', count: Object.keys(sections).length },
    { key: 'comparables', label: 'Comparables', count: comparables.length },
    { key: 'data', label: 'Inspection Notes' },
  ];

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{report.property_address}</h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                <span className="text-sm text-gray-500">{report.postcode}</span>
                <span className="text-xs text-gray-400">|</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{reportLabel}</span>
                <StatusBadge status={report.status} />
                {report.reference_number && (
                  <>
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs text-gray-500">Ref: {report.reference_number}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {saving && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              )}
              {report.status !== 'final' && (
                <button
                  onClick={handleMarkFinal}
                  className="px-4 py-2 text-sm font-medium border border-green-600 text-green-700 rounded-lg hover:bg-green-50 transition"
                >
                  Mark Final
                </button>
              )}
              <button
                onClick={handleGeneratePdf}
                disabled={pdfStatus === 'loading' || !hasSections}
                className="px-5 py-2 bg-[#1a2e3b] hover:bg-[#2a4050] text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {pdfStatus === 'loading' ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate PDF
                  </>
                )}
              </button>
              <button
                onClick={handleGenerateDocx}
                disabled={docxStatus === 'loading' || !hasSections}
                className="px-5 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {docxStatus === 'loading' ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate Word
                  </>
                )}
              </button>

              {/* Google Drive folder link */}
              {driveConnected && (
                driveFolderId ? (
                  <div className="flex items-center gap-1">
                    <a
                      href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-sm font-medium border border-green-600 text-green-700 rounded-lg hover:bg-green-50 transition flex items-center gap-1.5"
                      title={driveFolderName ? `Linked: ${driveFolderName}` : 'Open linked Drive folder'}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l4.58 7.5h13.54l4.58-7.5L17.29 3.5H7.71zm-.56 1h9.7l5.83 10.5h-9.7L7.15 4.5zm-.29.5l5.83 10.5H2.99L8.86 5zm6.41 11.5h9.7l-4 6.5H6.97l4-6.5z" /></svg>
                      {driveFolderName ? driveFolderName.slice(0, 20) + (driveFolderName.length > 20 ? '…' : '') : 'Drive ✓'}
                    </a>
                    <button
                      onClick={() => setShowDrivePicker(true)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition"
                      title="Change folder"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDrivePicker(true)}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5"
                    title="Link a Google Drive folder to this report"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l4.58 7.5h13.54l4.58-7.5L17.29 3.5H7.71zm-.56 1h9.7l5.83 10.5h-9.7L7.15 4.5zm-.29.5l5.83 10.5H2.99L8.86 5zm6.41 11.5h9.7l-4 6.5H6.97l4-6.5z" /></svg>
                    Link Drive
                  </button>
                )
              )}
            </div>
          </div>

          {/* PDF status messages */}
          {pdfStatus === 'success' && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-3">
              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-green-800">PDF downloaded successfully</span>
              <button
                onClick={() => {
                  if (pdfBlobUrl.current) {
                    const a = document.createElement('a');
                    a.href = pdfBlobUrl.current;
                    a.download = `CoreProp-${report.postcode.replace(/\s/g, '')}.pdf`;
                    a.click();
                  }
                }}
                className="ml-auto text-sm font-medium text-green-700 hover:text-green-800 underline"
              >
                Download Again
              </button>
            </div>
          )}
          {pdfStatus === 'error' && pdfError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
              PDF generation failed: {pdfError}
            </div>
          )}
          {docxStatus === 'success' && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-5 py-3">
              <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-blue-800">Word document downloaded successfully</span>
              <button
                onClick={() => {
                  if (docxBlobUrl.current) {
                    const a = document.createElement('a');
                    a.href = docxBlobUrl.current;
                    a.download = `CoreProp-${report.postcode.replace(/\s/g, '')}.docx`;
                    a.click();
                  }
                }}
                className="ml-auto text-sm font-medium text-blue-700 hover:text-blue-800 underline"
              >
                Download Again
              </button>
            </div>
          )}
          {docxStatus === 'error' && docxError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
              Word generation failed: {docxError}
            </div>
          )}
        </div>

        {/* Generation progress indicator */}
        {generating && (
          <div className="mb-6 rounded-xl border border-[#c49a6c]/30 bg-[#faf7f3] p-6">
            <div className="flex items-center gap-3 mb-4">
              <svg className="animate-spin h-5 w-5 text-[#c49a6c]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <h3 className="font-semibold text-gray-900">Generating Report...</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'EPC Data', done: !!report.epc_data },
                { label: 'Google Maps', done: !!report.google_maps_data },
                { label: 'Comparables', done: (report.comparables || []).length > 0 },
                { label: 'AI Sections', done: hasSections },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-2">
                  {step.done ? (
                    <svg className="h-4 w-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
                  )}
                  <span className={`text-xs ${step.done ? 'text-green-700 font-medium' : 'text-gray-500'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
                  <div className="h-5 w-48 rounded bg-gray-200 mb-3" />
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-gray-100" />
                    <div className="h-3 w-5/6 rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab bar */}
        {hasSections && (
          <>
            <div className="flex overflow-x-auto border-b border-gray-200 mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'border-b-2 border-[#c49a6c] text-[#c49a6c]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-200 px-1.5 text-xs font-semibold text-gray-700">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
              <div className="ml-auto flex items-center">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={generating}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Regenerating...
                    </>
                  ) : (
                    'Regenerate All'
                  )}
                </button>
              </div>
            </div>

            {/* Tab content */}
            {activeTab === 'sections' && (
              <div className="space-y-4 mb-8">
                {visibleSections.map((s) => {
                  const text = sections[s.key] || '';
                  if (!text && !['section_19_auction_reserve'].includes(s.key)) {
                    // Skip empty non-optional sections silently
                  }
                  return (
                    <SectionCard
                      key={s.key}
                      sectionKey={s.key}
                      title={s.title}
                      text={text}
                      onSave={handleSectionSave}
                    />
                  );
                })}
              </div>
            )}

            {activeTab === 'comparables' && (
              <div className="mb-8">
                <ComparablePanel
                  comparables={comparables}
                  postcode={report.postcode}
                  onChange={handleComparablesChange}
                />
              </div>
            )}

            {activeTab === 'data' && (
              <PropertyDataView report={report} onUpdate={updateReport} />
            )}

            {/* Valuation Panel — always visible below tabs */}
            <ValuationPanel
              valuationFigure={report.valuation_figure}
              valuationFigureWords={report.valuation_figure_words}
              auctionReserve={report.auction_reserve}
              auctionReserveWords={report.auction_reserve_words}
              showAuction={showAuction}
              comparables={comparables}
              address={report.property_address}
              onChange={handleValuationChange}
            />

            {/* Pre-flight checks */}
            {(() => {
              const warnings: string[] = [];
              const emptySections = visibleSections.filter(s => {
                const text = sections[s.key] || '';
                return !text && s.key !== 'section_19_auction_reserve';
              });
              if (emptySections.length > 0) {
                warnings.push(`${emptySections.length} section(s) have no content: ${emptySections.slice(0, 3).map(s => s.title).join(', ')}${emptySections.length > 3 ? '...' : ''}`);
              }
              const allText = Object.values(sections).join(' ');
              const hasPlaceholders = /\[(?:Title Number|Client Name|Deceased Name|Date|Local Authority)\]/i.test(allText)
                || /\{\{[A-Z_]+\}\}/.test(allText);
              if (hasPlaceholders) {
                warnings.push('Some sections still contain placeholder text (shown in red) that needs to be filled in');
              }
              if (!report.valuation_figure_words) {
                warnings.push('Valuation figure in words is empty');
              }
              if (!report.land_registry_title || report.land_registry_title === '[Title Number]') {
                warnings.push('Land Registry title number is missing');
              }
              if (warnings.length === 0) return null;
              return (
                <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Review before generating</p>
                      <ul className="mt-1 text-sm text-amber-700 list-disc list-inside space-y-0.5">
                        {warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Document generation buttons at bottom */}
            <div className="mt-4 mb-4 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleGeneratePdf}
                disabled={pdfStatus === 'loading' || !report.valuation_figure}
                className="flex-1 rounded-xl bg-[#c49a6c] px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-[#b08a5c] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pdfStatus === 'loading' ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating PDF...
                  </span>
                ) : !report.valuation_figure ? (
                  'Enter valuation to generate'
                ) : pdfStatus === 'success' ? (
                  'Generate PDF Again'
                ) : (
                  'Generate PDF'
                )}
              </button>
              <button
                type="button"
                onClick={handleGenerateDocx}
                disabled={docxStatus === 'loading' || !report.valuation_figure}
                className="flex-1 rounded-xl bg-[#2563eb] px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-[#1d4ed8] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                {docxStatus === 'loading' ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating Word...
                  </span>
                ) : !report.valuation_figure ? (
                  'Enter valuation to generate'
                ) : docxStatus === 'success' ? (
                  'Generate Word Again'
                ) : (
                  'Generate Word'
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Floating inspection notes / dictation button */}
      <FloatingDictation
        notes={inspectionNotes}
        onChange={handleInspectionNotesChange}
        onApplyNotes={handleApplyNotes}
        applyingNotes={applyingNotes}
      />

      {/* Drive folder picker modal */}
      {showDrivePicker && (
        <DriveFolderPicker
          onSelect={handleLinkDriveFolder}
          onClose={() => setShowDrivePicker(false)}
        />
      )}
    </AppShell>
  );
}

// ---- Property Data View (read-only summary + editable key fields) ----

function PropertyDataView({
  report,
  onUpdate,
}: {
  report: ReportRow;
  onUpdate: (updates: Record<string, unknown>) => void;
}) {
  const epc = report.epc_data;
  const maps = report.google_maps_data;
  const details = (report.property_details || {}) as Record<string, unknown>;

  const inputClass =
    'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20';

  const updateDetails = (fields: Record<string, unknown>) => {
    onUpdate({ property_details: { ...details, ...fields } });
  };

  return (
    <div className="space-y-6 mb-8">
      {/* EPC Summary */}
      {epc && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">EPC Data</h3>
          <div className="grid grid-cols-1 gap-x-4 sm:gap-x-8 gap-y-3 sm:grid-cols-2">
            {[
              { label: 'Property Type', value: epc.builtForm || epc.propertyType },
              { label: 'Floor Area', value: epc.floorArea ? `${epc.floorArea} m\u00B2` : '' },
              { label: 'Construction', value: epc.constructionAgeBand },
              { label: 'EPC Rating', value: epc.currentEnergyRating ? `${epc.currentEnergyRating} (${epc.currentEnergyEfficiency})` : '' },
              { label: 'Rooms', value: epc.numberOfRooms ? `${epc.numberOfRooms}` : '' },
              { label: 'Tenure', value: epc.tenure },
              { label: 'Walls', value: epc.wallsDescription },
              { label: 'Roof', value: epc.roofDescription },
              { label: 'Windows', value: epc.windowsDescription },
              { label: 'Heating', value: epc.mainHeatingDescription },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline gap-2">
                <span className="shrink-0 text-xs font-medium text-gray-500">{row.label}:</span>
                <span className="text-sm text-gray-900">{row.value || 'N/A'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!epc && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-800">No EPC data found. The property data below can be edited manually.</p>
        </div>
      )}

      {/* Google Maps Data */}
      {maps && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">Location</h3>
          <div className="grid grid-cols-1 gap-x-4 sm:gap-x-8 gap-y-3 sm:grid-cols-2 mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-gray-500">Local Authority:</span>
              <span className="text-sm text-gray-900">{report.local_authority || maps.localAuthority || 'N/A'}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-gray-500">Postal District:</span>
              <span className="text-sm text-gray-900">{report.postal_district || 'N/A'}</span>
            </div>
          </div>
          {maps.nearbyPlaces && maps.nearbyPlaces.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-3">Nearby Amenities</h4>
              <div className="space-y-3">
                {[
                  { label: 'Transport', types: ['train_station'] },
                  { label: 'Education', types: ['primary_school', 'secondary_school', 'school'] },
                  { label: 'Medical', types: ['hospital', 'doctor'] },
                  { label: 'Shopping', types: ['supermarket'] },
                  { label: 'Recreation', types: ['park'] },
                ].map((cat) => {
                  const places = maps.nearbyPlaces.filter((p) => cat.types.includes(p.type));
                  if (places.length === 0) return null;
                  return (
                    <div key={cat.label}>
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cat.label}</span>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 mt-1">
                        {places.map((place, i) => (
                          <div key={i} className="text-sm text-gray-700">
                            <span className="font-medium">{place.name}</span>{' '}
                            <span className="text-xs text-gray-400">{place.distanceText}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* Street View + Satellite images */}
          {(maps.streetViewUrl || maps.satelliteUrl) && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {maps.streetViewUrl && (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <img src={maps.streetViewUrl} alt="Street View" className="w-full object-cover" style={{ maxHeight: '250px' }} />
                  <div className="border-t border-gray-100 px-3 py-1.5">
                    <span className="text-xs font-medium text-gray-500">Street View</span>
                  </div>
                </div>
              )}
              {maps.satelliteUrl && (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <img src={maps.satelliteUrl} alt="Satellite View" className="w-full object-cover" style={{ maxHeight: '250px' }} />
                  <div className="border-t border-gray-100 px-3 py-1.5">
                    <span className="text-xs font-medium text-gray-500">Satellite View</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Editable Property Details */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">Property Details (Editable)</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Area Character</label>
              <textarea
                rows={2}
                value={(details.areaCharacter as string) ?? ''}
                onChange={(e) => updateDetails({ areaCharacter: e.target.value })}
                placeholder="Describe the area/neighbourhood"
                className={inputClass + ' resize-y'}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Location Notes</label>
              <textarea
                rows={2}
                value={(details.locationNotes as string) ?? ''}
                onChange={(e) => updateDetails({ locationNotes: e.target.value })}
                placeholder="e.g., set on a cul-de-sac"
                className={inputClass + ' resize-y'}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Ground Floor Rooms</label>
            <input
              type="text"
              value={(details.groundFloorRooms as string) ?? ''}
              onChange={(e) => updateDetails({ groundFloorRooms: e.target.value })}
              placeholder="e.g., Hallway, Kitchen, Living Room, WC"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">First Floor Rooms</label>
            <input
              type="text"
              value={(details.firstFloorRooms as string) ?? ''}
              onChange={(e) => updateDetails({ firstFloorRooms: e.target.value })}
              placeholder="e.g., Landing, 3 Bedrooms, Bathroom"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Second Floor Rooms</label>
            <input
              type="text"
              value={(details.secondFloorRooms as string) ?? ''}
              onChange={(e) => updateDetails({ secondFloorRooms: e.target.value })}
              placeholder="Optional"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Front / Parking</label>
              <textarea
                rows={2}
                value={(details.frontDescription as string) ?? ''}
                onChange={(e) => updateDetails({ frontDescription: e.target.value })}
                placeholder="e.g., Paved driveway for 2 vehicles"
                className={inputClass + ' resize-y'}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Rear Garden</label>
              <textarea
                rows={2}
                value={(details.rearGardenDescription as string) ?? ''}
                onChange={(e) => updateDetails({ rearGardenDescription: e.target.value })}
                placeholder="e.g., Enclosed garden with patio"
                className={inputClass + ' resize-y'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Garage</label>
              <select
                value={(details.garageType as string) ?? 'none'}
                onChange={(e) => updateDetails({ garageType: e.target.value })}
                className={inputClass}
              >
                <option value="none">None</option>
                <option value="single_detached">Single Detached</option>
                <option value="single_integrated">Single Integrated</option>
                <option value="double">Double</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Road Name</label>
              <input
                type="text"
                value={(details.roadName as string) ?? ''}
                onChange={(e) => updateDetails({ roadName: e.target.value })}
                placeholder="e.g., Forest Road"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Land Registry Title</label>
              <input
                type="text"
                value={report.land_registry_title ?? ''}
                onChange={(e) => onUpdate({ land_registry_title: e.target.value.toUpperCase() })}
                placeholder="e.g., TN12345"
                className={inputClass + ' uppercase'}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {([
              ['hasWater', 'Mains Water'],
              ['hasGas', 'Mains Gas'],
              ['hasElectricity', 'Electricity'],
              ['hasDrainage', 'Mains Drainage'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={(details[key] as boolean) ?? true}
                  onChange={(e) => updateDetails({ [key]: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-[#c49a6c] accent-[#c49a6c]"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
