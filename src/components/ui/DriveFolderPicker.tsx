'use client';

import { useState, useEffect } from 'react';

interface Folder {
  id: string;
  name: string;
}

interface BreadcrumbEntry {
  id: string | null;
  name: string;
}

interface DriveFolderPickerProps {
  onSelect: (folder: { id: string; name: string }) => void;
  onClose: () => void;
}

/** Extract folder ID from a Google Drive URL or return the raw string as an ID. */
function parseFolderUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export default function DriveFolderPicker({ onSelect, onClose }: DriveFolderPickerProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [browseMode, setBrowseMode] = useState<'myDrive' | 'shared'>('shared'); // default to shared
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([{ id: null, name: 'Shared with me' }]);

  // Paste-URL state
  const [pasteUrl, setPasteUrl] = useState('');
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [pasteError, setPasteError] = useState('');

  const currentParentId = breadcrumb[breadcrumb.length - 1].id;
  const currentFolder = breadcrumb[breadcrumb.length - 1];

  // Load folders when navigating or switching browse mode
  useEffect(() => {
    loadFolders(currentParentId);
  }, [currentParentId, browseMode]);

  // Auto-resolve folder name when a valid folder ID is detected in the URL (debounced).
  // We extract the folder ID and only re-run the fetch when the ID actually changes.
  const detectedFolderId = parseFolderUrl(pasteUrl);

  useEffect(() => {
    if (!detectedFolderId) {
      setResolvedName(null);
      return;
    }

    // Reset and debounce the API call
    setResolvedName(null);
    setResolving(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/google-drive/folder-name?folderId=${encodeURIComponent(detectedFolderId)}`
        );
        if (res.ok) {
          const data = await res.json();
          setResolvedName(data.name || null);
        }
      } catch {
        // Silently fail — user can still click Link to try again
      } finally {
        setResolving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [detectedFolderId]);

  async function loadFolders(parentId: string | null) {
    setLoading(true);
    setError('');
    try {
      let url: string;
      if (parentId) {
        url = `/api/google-drive/folders?parentId=${encodeURIComponent(parentId)}`;
      } else {
        url = `/api/google-drive/folders?source=${browseMode}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load folders');
      setFolders(data.folders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  }

  function navigateInto(folder: Folder) {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
  }

  function navigateTo(index: number) {
    setBreadcrumb((prev) => prev.slice(0, index + 1));
  }

  function switchBrowseMode(mode: 'myDrive' | 'shared') {
    setBrowseMode(mode);
    setBreadcrumb([{ id: null, name: mode === 'shared' ? 'Shared with me' : 'My Drive' }]);
  }

  async function handlePasteLink() {
    setPasteError('');
    const folderId = parseFolderUrl(pasteUrl);
    if (!folderId) {
      setPasteError('Paste a valid Google Drive folder URL or folder ID.');
      return;
    }

    // If name was already auto-resolved, use it immediately
    if (resolvedName) {
      onSelect({ id: folderId, name: resolvedName });
      return;
    }

    // Otherwise fetch it now before selecting
    setResolving(true);
    try {
      const res = await fetch(
        `/api/google-drive/folder-name?folderId=${encodeURIComponent(folderId)}`
      );
      if (res.ok) {
        const data = await res.json();
        const name = data.name || 'Linked folder';
        setResolvedName(name);
        onSelect({ id: folderId, name });
      } else {
        setPasteError('Could not fetch folder name. Check the URL and try again.');
      }
    } catch {
      setPasteError('Network error resolving folder name.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Link Google Drive Folder</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Paste URL section */}
        <div className="px-5 py-4 border-b border-gray-100 bg-blue-50/40">
          <p className="text-xs font-medium text-gray-700 mb-2">Paste a folder link from Google Drive</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={pasteUrl}
              onChange={(e) => { setPasteUrl(e.target.value); setPasteError(''); }}
              placeholder="https://drive.google.com/drive/folders/..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/40 bg-white"
            />
            <button
              type="button"
              onClick={handlePasteLink}
              disabled={!pasteUrl.trim() || resolving}
              className="px-4 py-2 bg-[#c49a6c] hover:bg-[#b08a5c] disabled:opacity-40 text-white text-sm font-medium rounded-lg transition shrink-0"
            >
              {resolving ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : 'Link'}
            </button>
          </div>
          {/* Auto-resolved folder name */}
          {resolving && (
            <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Resolving folder name...
            </p>
          )}
          {resolvedName && !resolving && (
            <p className="text-xs text-green-600 mt-1.5">
              <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {resolvedName}
            </p>
          )}
          {pasteError && <p className="text-xs text-red-500 mt-1.5">{pasteError}</p>}
          {!resolvedName && !resolving && !pasteError && (
            <p className="text-xs text-gray-400 mt-1.5">
              Open the folder in Google Drive → copy the URL → paste above.
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 px-5 py-2.5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 shrink-0">or browse</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* My Drive / Shared with me toggle — only at root level */}
        {currentParentId === null && (
          <div className="flex gap-2 px-5 pb-2">
            <button
              type="button"
              onClick={() => switchBrowseMode('shared')}
              className={`text-xs px-3 py-1.5 rounded-full transition ${
                browseMode === 'shared'
                  ? 'bg-[#c49a6c] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Shared with me
            </button>
            <button
              type="button"
              onClick={() => switchBrowseMode('myDrive')}
              className={`text-xs px-3 py-1.5 rounded-full transition ${
                browseMode === 'myDrive'
                  ? 'bg-[#c49a6c] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              My Drive
            </button>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-5 pb-2 overflow-x-auto min-h-[28px]">
          {breadcrumb.map((entry, idx) => (
            <span key={idx} className="flex items-center gap-1 shrink-0">
              {idx > 0 && <span className="text-gray-400 text-sm mx-0.5">/</span>}
              <button
                type="button"
                onClick={() => navigateTo(idx)}
                disabled={idx === breadcrumb.length - 1}
                className={`text-sm whitespace-nowrap transition ${
                  idx === breadcrumb.length - 1
                    ? 'text-gray-900 font-medium cursor-default'
                    : 'text-[#c49a6c] hover:text-[#b08a5c]'
                }`}
              >
                {entry.name}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-[80px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-[#c49a6c]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="text-center py-6">
              <p className="text-sm text-red-500 mb-1">{error}</p>
              <p className="text-xs text-gray-400">Use the paste link option above instead.</p>
            </div>
          ) : folders.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400">
              No folders found here — use the paste link above.
            </div>
          ) : (
            <div className="space-y-0.5">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50 transition group"
                >
                  <button
                    type="button"
                    onClick={() => navigateInto(folder)}
                    className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                  >
                    <svg className="w-4 h-4 text-[#c49a6c] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="text-sm text-gray-700 truncate">{folder.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect({ id: folder.id, name: folder.name })}
                    className="text-xs text-[#c49a6c] font-medium hover:text-[#b08a5c] px-2 py-1 rounded shrink-0 opacity-0 group-hover:opacity-100 transition"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          {currentFolder.id ? (
            <button
              type="button"
              onClick={() => onSelect({ id: currentFolder.id!, name: currentFolder.name })}
              className="px-5 py-2 bg-[#c49a6c] hover:bg-[#b08a5c] text-white text-sm font-medium rounded-lg transition"
            >
              Use &ldquo;{currentFolder.name}&rdquo;
            </button>
          ) : (
            <span className="text-xs text-gray-400">Navigate into a folder and click Use, or hover to Select</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
