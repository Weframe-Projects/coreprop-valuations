'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AddressAutocomplete from '@/components/ui/AddressAutocomplete';
import VoiceInputButton from '@/components/ui/VoiceInputButton';
import DriveFolderPicker from '@/components/ui/DriveFolderPicker';
import {
  type ReportType,
  type StructuredInspectionNotes,
  isDesktopType,
  isIHTType,
  isAuctionType,
  EMPTY_INSPECTION_NOTES,
  UI_REPORT_TYPES,
} from '@/lib/types';

// ---------- Types ----------

interface FormData {
  address: string;
  postcode: string;
  titleNumber: string;
  lat: number | null;
  lng: number | null;
  reportType: ReportType;
  inspectionNotes: StructuredInspectionNotes;
  photos: File[];
  photoLabels: string[];
  clientName: string;
  deceasedName: string;
  dateOfDeath: string;
  auctionCompany: string;
}

const PHOTO_LABEL_OPTIONS = [
  'Front Elevation',
  'Rear Elevation',
  'Kitchen',
  'Reception Room',
  'Bedroom',
  'Bathroom',
  'Garden',
  'Garage',
  'Hallway',
  'Floor Plan',
  'Building Exterior',
  'Condition',
  'Other',
];

// ---------- Collapsible Section ----------

function Section({
  title,
  defaultOpen = false,
  required = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition text-left"
      >
        <span className="font-semibold text-gray-900 text-sm">
          {title}
          {required && <span className="text-red-500 ml-1">*</span>}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-5 py-4 space-y-4">{children}</div>}
    </div>
  );
}

// ---------- Field Components ----------

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function TextareaWithVoice({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm pr-10"
      />
      <VoiceInputButton
        onTranscript={(text) => onChange(value ? `${value} ${text}` : text)}
        className="absolute top-2 right-2"
      />
    </div>
  );
}

// ---------- Main Component ----------

export default function InspectionWizard() {
  const router = useRouter();
  const [data, setData] = useState<FormData>({
    address: '',
    postcode: '',
    titleNumber: '',
    lat: null,
    lng: null,
    reportType: 'current_market_inspected',
    inspectionNotes: {
      ...EMPTY_INSPECTION_NOTES,
      inspectionDate: new Date().toISOString().split('T')[0],
      timeOfDay: new Date().getHours() < 12 ? 'morning' : 'afternoon',
    },
    photos: [],
    photoLabels: [],
    clientName: '',
    deceasedName: '',
    dateOfDeath: '',
    auctionCompany: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [userInitials, setUserInitials] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drive folder state
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveFolderName, setDriveFolderName] = useState<string | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveAutoFilled, setDriveAutoFilled] = useState<string[]>([]); // tracks which fields were auto-filled

  // Structured condition fields (combined into conditionNotes for DB storage)
  const [kitchenCondition, setKitchenCondition] = useState('');
  const [bathroomCondition, setBathroomCondition] = useState('');
  const [flooringCondition, setFlooringCondition] = useState('');
  const [electricalCondition, setElectricalCondition] = useState('');
  const [decorativeCondition, setDecorativeCondition] = useState('');
  const [generalIssues, setGeneralIssues] = useState('');

  // Fetch user settings (initials + Drive connection status)
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((settings) => {
        if (settings?.signatory_name) {
          const parts = settings.signatory_name.trim().split(/\s+/);
          const initials = parts.map((p: string) => p[0]?.toUpperCase() || '').join('');
          setUserInitials(initials);
          setData((prev) => ({
            ...prev,
            inspectionNotes: {
              ...prev.inspectionNotes,
              inspectorInitials: initials,
            },
          }));
        }
        if (settings?.google_tokens) {
          setDriveConnected(true);
        }
      })
      .catch(() => {});
  }, []);

  const isDesktop = isDesktopType(data.reportType);

  // Auto-generated reference number
  const referenceNumber = data.inspectionNotes.inspectorInitials && data.postcode
    ? `${data.inspectionNotes.inspectorInitials}/${data.postcode.replace(/\s+/g, '')}`
    : '';

  const update = useCallback((updates: Partial<FormData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateNotes = useCallback((updates: Partial<StructuredInspectionNotes>) => {
    setData((prev) => ({
      ...prev,
      inspectionNotes: { ...prev.inspectionNotes, ...updates },
    }));
  }, []);

  /**
   * Parse address details from a Drive folder name.
   *
   * Handles multiple CoreProp conventions:
   *   "P1 - 66 Swiftsden Way, Bromley, BR1 4NT"  → strips "P1 - " prefix
   *   "36E Eardley Crescent, SW16 5PJ"            → starts with house number/alphanumeric
   *   "Flat 59 Courtenay Road, London, N7 9BS"    → starts with Flat/Apartment/Floor
   *
   * Returns { address, postcode } or null if the folder doesn't look like a property address.
   */
  function parseAddressFromFolderName(folderName: string): { address: string; postcode: string } | null {
    let address = folderName.trim();

    // Case 1: Strip leading "P[number] - " prefix  (e.g. "P1 - ", "P12 - ")
    const prefixMatch = address.match(/^P\d+\s*[-–]\s*/i);
    if (prefixMatch) {
      address = address.slice(prefixMatch[0].length).trim();
    } else {
      // Case 2: Folder starts with a house number (digit or digit+letter, e.g. "36E", "81B", "1-19")
      const startsWithNumber = /^\d/.test(address);
      // Case 3: Starts with "Flat", "Apartment", "Floor", "Unit"
      const startsWithFlat = /^(flat|apartment|floor|unit)\b/i.test(address);

      // If neither pattern, this isn't a simple property folder — skip
      if (!startsWithNumber && !startsWithFlat) return null;
    }

    if (!address) return null;

    // Extract UK postcode from the end (e.g. "BR1 4NT", "SW1A 2AA", "EC1A 1BB")
    const postcodeMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\s*$/i);
    const postcode = postcodeMatch
      ? postcodeMatch[1].replace(/\s+/g, ' ').trim().toUpperCase()
      : '';

    return { address, postcode };
  }

  // Normalize UK postcode
  function normalizePostcode(pc: string): string {
    const cleaned = pc.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length >= 5 && cleaned.length <= 7) {
      return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
    }
    return pc.trim().toUpperCase();
  }

  // Validate required fields
  function validate(): string[] {
    const errors: string[] = [];
    if (!data.address) errors.push('Property address is required');
    if (!data.postcode) errors.push('Postcode is required');
    if (!data.reportType) errors.push('Report type is required');
    if (!data.clientName) errors.push('Client name is required');
    if (isIHTType(data.reportType)) {
      if (!data.deceasedName) errors.push('Deceased name is required for IHT reports');
      if (!data.dateOfDeath) errors.push('Date of death is required for IHT reports');
    }
    if (isAuctionType(data.reportType) && !data.auctionCompany) {
      errors.push('Auction company is required for auction reports');
    }
    return errors;
  }

  // Handle photo addition
  function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    update({
      photos: [...data.photos, ...files],
      photoLabels: [...data.photoLabels, ...files.map(() => 'Front Elevation')],
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removePhoto(index: number) {
    update({
      photos: data.photos.filter((_, i) => i !== index),
      photoLabels: data.photoLabels.filter((_, i) => i !== index),
    });
  }

  function updatePhotoLabel(index: number, label: string) {
    const labels = [...data.photoLabels];
    labels[index] = label;
    update({ photoLabels: labels });
  }

  // Title number auto-fetch
  async function fetchTitleNumber() {
    if (!data.postcode || !data.address) return;
    try {
      const res = await fetch(
        `/api/address-lookup?titleSearch=true&postcode=${encodeURIComponent(data.postcode)}&address=${encodeURIComponent(data.address)}`
      );
      if (res.ok) {
        const result = await res.json();
        if (result.titleNumber) {
          update({ titleNumber: result.titleNumber });
        }
      }
    } catch {
      // Non-blocking
    }
  }

  async function handleSubmit() {
    const errors = validate();
    if (errors.length > 0) {
      setValidationErrors(errors);
      window.scrollTo(0, 0);
      return;
    }
    setValidationErrors([]);
    setSubmitting(true);
    setError('');

    try {
      const postcode = normalizePostcode(data.postcode);

      // Combine structured condition fields into conditionNotes for DB storage
      // (can't add new DB columns due to PostgREST schema cache, so we encode them with labels)
      const conditionParts = [
        kitchenCondition && `Kitchen: ${kitchenCondition}`,
        bathroomCondition && `Bathroom: ${bathroomCondition}`,
        flooringCondition && `Flooring: ${flooringCondition}`,
        electricalCondition && `Electrical: ${electricalCondition}`,
        decorativeCondition && `Decorative: ${decorativeCondition}`,
        generalIssues && `General: ${generalIssues}`,
      ].filter(Boolean);

      const combinedConditionNotes = conditionParts.length > 0
        ? conditionParts.join('\n')
        : data.inspectionNotes.conditionNotes; // fallback to existing field if structured fields empty

      const inspectionNotesToSave = {
        ...data.inspectionNotes,
        conditionNotes: combinedConditionNotes,
      };

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_address: data.address,
          postcode,
          report_type: data.reportType,
          reference_number: referenceNumber,
          land_registry_title: data.titleNumber,
          ...(driveFolderId && { google_drive_folder_id: driveFolderId }),
          property_details: {
            ...(driveFolderId && { driveFolderId, driveFolderName }),
          },
          client_details: {
            clientName: data.clientName,
            referenceNumber: referenceNumber,
            valuationDate: data.inspectionNotes.inspectionDate || new Date().toISOString().split('T')[0],
            deceasedName: isIHTType(data.reportType) ? data.deceasedName : '',
            dateOfDeath: isIHTType(data.reportType) ? data.dateOfDeath : '',
            auctionCompany: isAuctionType(data.reportType) ? data.auctionCompany : '',
          },
          ...(!isDesktop && {
            inspection_notes: inspectionNotesToSave,
          }),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to create report');
      }

      const { id } = await res.json();

      // Upload photos
      if (data.photos.length > 0) {
        const formData = new FormData();
        data.photos.forEach((file, i) => {
          formData.append('photos', file);
          formData.append('labels', data.photoLabels[i] || 'Property Photo');
        });
        await fetch(`/api/reports/${id}/photos`, {
          method: 'POST',
          body: formData,
        }).catch(() => {});
      }

      // Fire generation pipeline
      fetch(`/api/reports/${id}/generate`, { method: 'POST' }).catch(() => {});
      router.push(`/report/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  // Group report types for dropdown
  const groupedTypes = UI_REPORT_TYPES.reduce((acc, t) => {
    if (!acc[t.group]) acc[t.group] = [];
    acc[t.group].push(t);
    return acc;
  }, {} as Record<string, typeof UI_REPORT_TYPES>);

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-32">
      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="font-semibold text-red-700 text-sm mb-2">Please fix the following:</p>
          <ul className="text-red-600 text-sm space-y-1">
            {validationErrors.map((e, i) => (
              <li key={i}>- {e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">{error}</div>
      )}

      {/* ===== GOOGLE DRIVE BANNER (shown first — link Drive, then auto-fill address) ===== */}
      {driveConnected ? (
        driveFolderId ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <svg className="w-5 h-5 text-green-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.71 3.5L1.15 15l4.58 7.5h13.54l4.58-7.5L17.29 3.5H7.71zm-.56 1h9.7l5.83 10.5h-9.7L7.15 4.5zm-.29.5l5.83 10.5H2.99L8.86 5zm6.41 11.5h9.7l-4 6.5H6.97l4-6.5z" />
              </svg>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-green-800">Drive folder linked</p>
                <p className="text-xs text-green-600 truncate">{driveFolderName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDrivePicker(true)}
              className="text-xs text-green-700 hover:text-green-900 underline shrink-0 ml-3"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.71 3.5L1.15 15l4.58 7.5h13.54l4.58-7.5L17.29 3.5H7.71zm-.56 1h9.7l5.83 10.5h-9.7L7.15 4.5zm-.29.5l5.83 10.5H2.99L8.86 5zm6.41 11.5h9.7l-4 6.5H6.97l4-6.5z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-blue-800">Link Google Drive folder</p>
                <p className="text-xs text-blue-600">Photos and report auto-upload to the property&apos;s folder</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDrivePicker(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition shrink-0 ml-3"
            >
              Link Folder
            </button>
          </div>
        )
      ) : (
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.71 3.5L1.15 15l4.58 7.5h13.54l4.58-7.5L17.29 3.5H7.71zm-.56 1h9.7l5.83 10.5h-9.7L7.15 4.5zm-.29.5l5.83 10.5H2.99L8.86 5zm6.41 11.5h9.7l-4 6.5H6.97l4-6.5z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-600">Google Drive not connected</p>
              <p className="text-xs text-gray-400">Connect in Settings to auto-sync photos and reports</p>
            </div>
          </div>
          <a href="/settings" className="text-xs text-[#c49a6c] hover:text-[#b08a5c] underline shrink-0 ml-3">
            Connect
          </a>
        </div>
      )}

      {/* ===== DRIVE AUTO-FILL NOTICE ===== */}
      {driveAutoFilled.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-800">
              <strong>Auto-filled from folder name:</strong>{' '}
              {driveAutoFilled.map((f) => ({ address: 'address', postcode: 'postcode' }[f] || f)).join(', ')}.{' '}
              Please verify and correct if needed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDriveAutoFilled([])}
            className="text-amber-500 hover:text-amber-700 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ===== PROPERTY ADDRESS ===== */}
      <Section title="Property Address" defaultOpen={true} required>
        <Field label="Address" required>
          <AddressAutocomplete
            value={data.address}
            onChange={(v) => update({ address: v })}
            onSelect={(result) => {
              update({
                address: result.address,
                postcode: result.postcode,
                lat: result.lat,
                lng: result.lng,
              });
              // Auto-fetch title number after address selection
              setTimeout(fetchTitleNumber, 500);
            }}
            placeholder="Start typing an address..."
          />
        </Field>

        <Field label="Postcode" required>
          <input
            type="text"
            value={data.postcode}
            onChange={(e) => update({ postcode: e.target.value })}
            placeholder="e.g. SW1A 1AA"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm"
          />
        </Field>

        <Field label="Title Number (Optional)">
          <div className="flex gap-2">
            <input
              type="text"
              value={data.titleNumber}
              onChange={(e) => update({ titleNumber: e.target.value })}
              placeholder="Leave blank if not known"
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm"
            />
            <button
              type="button"
              onClick={fetchTitleNumber}
              className="px-3 py-2.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
              title="Auto-fetch title number"
            >
              Fetch
            </button>
          </div>
        </Field>
      </Section>

      {/* ===== REPORT TYPE ===== */}
      <Section title="Report Type" defaultOpen={true} required>
        <Field label="Template" required>
          <select
            value={data.reportType}
            onChange={(e) => update({ reportType: e.target.value as ReportType })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm bg-white"
          >
            {Object.entries(groupedTypes).map(([group, types]) => (
              <optgroup key={group} label={group}>
                {types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {isDesktop && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
            Desktop valuation — no inspection required. Inspection notes sections below are optional.
          </div>
        )}

        {/* Auto-generated reference */}
        {referenceNumber && (
          <div className="text-xs text-gray-500">
            Reference: <span className="font-mono font-medium text-gray-700">{referenceNumber}</span>
          </div>
        )}
      </Section>

      {/* ===== CLIENT DETAILS ===== */}
      <Section title="Client Details" defaultOpen={true} required>
        <Field label="Client Name" required>
          <input
            type="text"
            value={data.clientName}
            onChange={(e) => update({ clientName: e.target.value })}
            placeholder="e.g. Smith & Co Solicitors"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm"
          />
        </Field>

        {isIHTType(data.reportType) && (
          <>
            <Field label="Deceased Name" required>
              <input
                type="text"
                value={data.deceasedName}
                onChange={(e) => update({ deceasedName: e.target.value })}
                placeholder="Full name of deceased"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm"
              />
            </Field>
            <Field label="Date of Death" required>
              <input
                type="date"
                value={data.dateOfDeath}
                onChange={(e) => update({ dateOfDeath: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm"
              />
            </Field>
          </>
        )}

        {isAuctionType(data.reportType) && (
          <Field label="Auction Company" required>
            <input
              type="text"
              value={data.auctionCompany}
              onChange={(e) => update({ auctionCompany: e.target.value })}
              placeholder="e.g. Savills Auctions"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm"
            />
          </Field>
        )}
      </Section>

      {/* ===== INSPECTION DETAILS ===== */}
      <Section title="Inspection Details" defaultOpen={!isDesktop}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date of Inspection">
            <input
              type="date"
              value={data.inspectionNotes.inspectionDate || ''}
              onChange={(e) => updateNotes({ inspectionDate: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm"
            />
          </Field>
          <Field label="Inspector Initials">
            <input
              type="text"
              value={data.inspectionNotes.inspectorInitials}
              onChange={(e) => updateNotes({ inspectorInitials: e.target.value.toUpperCase() })}
              placeholder={userInitials || 'e.g. ED'}
              maxLength={5}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm uppercase"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Time of Day">
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(['morning', 'afternoon'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateNotes({ timeOfDay: t })}
                  className={`flex-1 py-2.5 text-sm font-medium transition ${
                    data.inspectionNotes.timeOfDay === t
                      ? 'bg-[#c49a6c] text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Weather">
            <input
              type="text"
              value={data.inspectionNotes.weatherConditions}
              onChange={(e) => updateNotes({ weatherConditions: e.target.value })}
              placeholder="e.g. Dry and clear"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 text-sm"
            />
          </Field>
        </div>
      </Section>

      {/* ===== PROPERTY DESCRIPTION ===== */}
      <Section title="Property Description">
        <Field label="Description Notes">
          <TextareaWithVoice
            value={data.inspectionNotes.descriptionNotes}
            onChange={(v) => updateNotes({ descriptionNotes: v })}
            placeholder="Property type, style, setting, area character..."
          />
        </Field>
        <Field label="Construction Notes">
          <TextareaWithVoice
            value={data.inspectionNotes.constructionNotes}
            onChange={(v) => updateNotes({ constructionNotes: v })}
            placeholder="Brickwork, roof, stories, render, detailing..."
          />
        </Field>
      </Section>

      {/* ===== AMENITIES & LAYOUT ===== */}
      <Section title="Amenities & Layout">
        <Field label="Amenities, Access & Front Approach">
          <TextareaWithVoice
            value={data.inspectionNotes.amenitiesNotes}
            onChange={(v) => updateNotes({ amenitiesNotes: v })}
            placeholder="Gates, paths, parking, driveways, front garden..."
          />
        </Field>
        <Field label="Room Layout & Floor Finishes">
          <TextareaWithVoice
            value={data.inspectionNotes.layoutNotes}
            onChange={(v) => updateNotes({ layoutNotes: v })}
            placeholder="Room-by-room: Ground Floor — Hallway carpet, Kitchen tiled..."
            rows={4}
          />
        </Field>
        <Field label="Garden & External">
          <TextareaWithVoice
            value={data.inspectionNotes.gardenNotes}
            onChange={(v) => updateNotes({ gardenNotes: v })}
            placeholder="Rear garden, outbuildings, fencing, patio..."
          />
        </Field>
      </Section>

      {/* ===== CONDITION ===== */}
      <Section title="Condition" defaultOpen={true}>
        <Field label="Kitchen">
          <TextareaWithVoice
            value={kitchenCondition}
            onChange={setKitchenCondition}
            placeholder="Fittings, units, worktops, appliances, condition..."
            rows={2}
          />
        </Field>
        <Field label="Bathroom">
          <TextareaWithVoice
            value={bathroomCondition}
            onChange={setBathroomCondition}
            placeholder="Suite type, tiles, shower, condition..."
            rows={2}
          />
        </Field>
        <Field label="Heating">
          <TextareaWithVoice
            value={data.inspectionNotes.heatingNotes}
            onChange={(v) => updateNotes({ heatingNotes: v })}
            placeholder="Boiler type & make, radiators, condition..."
            rows={2}
          />
        </Field>
        <Field label="Flooring">
          <TextareaWithVoice
            value={flooringCondition}
            onChange={setFlooringCondition}
            placeholder="Carpet, laminate, tiles, exposed boards, linoleum..."
            rows={2}
          />
        </Field>
        <Field label="Electrical">
          <TextareaWithVoice
            value={electricalCondition}
            onChange={setElectricalCondition}
            placeholder="Consumer unit, rewiring needed, smoke detectors..."
            rows={2}
          />
        </Field>
        <Field label="Windows">
          <TextareaWithVoice
            value={data.inspectionNotes.windowsNotes}
            onChange={(v) => updateNotes({ windowsNotes: v })}
            placeholder="Timber s/g, uPVC d/g, sash, condition..."
            rows={2}
          />
        </Field>
        <Field label="Decorative Order">
          <TextareaWithVoice
            value={decorativeCondition}
            onChange={setDecorativeCondition}
            placeholder="Freshly decorated, dated, in need of redecoration..."
            rows={2}
          />
        </Field>
        <Field label="General Issues">
          <TextareaWithVoice
            value={generalIssues}
            onChange={setGeneralIssues}
            placeholder="Dampness, water ingress, cracking, structural concerns..."
            rows={2}
          />
        </Field>
        <Field label="Room Measurements (metres)">
          <TextareaWithVoice
            value={data.inspectionNotes.sizingNotes}
            onChange={(v) => updateNotes({ sizingNotes: v })}
            placeholder={"6.21 x 2.94\n3.89 x 1.51\n3.75 x 3.04"}
            rows={4}
          />
        </Field>
        <Field label="Additional Notes">
          <TextareaWithVoice
            value={data.inspectionNotes.extraNotes}
            onChange={(v) => updateNotes({ extraNotes: v })}
            placeholder="Any other observations..."
            rows={2}
          />
        </Field>
      </Section>

      {/* ===== PHOTOS ===== */}
      <Section title="Photos">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={handlePhotoAdd}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-[#c49a6c] hover:text-[#c49a6c] transition"
        >
          + Take Photo or Upload
        </button>

        {data.photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            {data.photos.map((file, i) => (
              <div key={i} className="relative border border-gray-200 rounded-lg overflow-hidden">
                <img
                  src={URL.createObjectURL(file)}
                  alt={data.photoLabels[i]}
                  className="w-full h-28 object-cover"
                />
                <div className="p-2">
                  <select
                    value={data.photoLabels[i]}
                    onChange={(e) => updatePhotoLabel(i, e.target.value)}
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded bg-white"
                  >
                    {PHOTO_LABEL_OPTIONS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ===== GENERATE BUTTON ===== */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:mt-6 z-40">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-4 bg-[#1a2e3b] hover:bg-[#243d4d] text-white font-bold rounded-xl text-base transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating Report...
              </span>
            ) : (
              'Generate Report'
            )}
          </button>
        </div>
      </div>

      {/* Drive folder picker modal */}
      {showDrivePicker && (
        <DriveFolderPicker
          onSelect={(folder) => {
            setDriveFolderId(folder.id);
            setDriveFolderName(folder.name);
            setShowDrivePicker(false);

            // Auto-fill address + postcode from folder name (e.g. "P1 - 66 Swiftsden Way, Bromley, BR1 4NT")
            const parsed = parseAddressFromFolderName(folder.name);
            if (parsed) {
              const filled: string[] = [];
              const updates: Partial<FormData> = {};
              if (parsed.address) {
                updates.address = parsed.address;
                filled.push('address');
              }
              if (parsed.postcode) {
                updates.postcode = parsed.postcode;
                filled.push('postcode');
              }
              if (Object.keys(updates).length > 0) {
                update(updates);
                setDriveAutoFilled(filled);
              }
            }
          }}
          onClose={() => setShowDrivePicker(false)}
        />
      )}
    </div>
  );
}
