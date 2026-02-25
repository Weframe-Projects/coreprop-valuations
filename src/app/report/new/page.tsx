'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/ui/AppShell';
import AddressAutocomplete from '@/components/ui/AddressAutocomplete';
import { UI_REPORT_TYPES, isIHTType, isAuctionType, type ReportType } from '@/lib/types';

export default function NewReportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [addressVerified, setAddressVerified] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('current_market_inspected');
  const [clientName, setClientName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [valuationDate, setValuationDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [landRegistryTitle, setLandRegistryTitle] = useState('');

  // IHT fields
  const [deceasedName, setDeceasedName] = useState('');
  const [dateOfDeath, setDateOfDeath] = useState('');

  // Auction fields
  const [auctionCompany, setAuctionCompany] = useState('');

  const isIHT = isIHTType(reportType);
  const isAuction = isAuctionType(reportType);

  // Normalize UK postcode: ensure space before the 3-char inward code
  function normalizePostcode(pc: string): string {
    const cleaned = pc.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length >= 5 && cleaned.length <= 7) {
      return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
    }
    return pc.trim().toUpperCase();
  }

  function handleAddressTextChange(value: string) {
    setAddress(value);
    setAddressVerified(false);
    // Auto-extract postcode from typed text as fallback
    const match = value.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
    if (match && !postcode) {
      setPostcode(normalizePostcode(match[1]));
    }
  }

  function handleAddressSelect(result: { address: string; postcode: string; lat: number; lng: number }) {
    setAddress(result.address);
    setPostcode(result.postcode);
    setAddressVerified(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !postcode || !reportType) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_address: address,
          postcode: normalizePostcode(postcode),
          report_type: reportType,
          reference_number: referenceNumber,
          land_registry_title: landRegistryTitle,
          client_details: {
            clientName,
            referenceNumber,
            valuationDate,
            deceasedName: isIHT ? deceasedName : '',
            dateOfDeath: isIHT ? dateOfDeath : '',
            auctionCompany: isAuction ? auctionCompany : '',
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create report');
      }

      const { id } = await res.json();

      // Fire off the generation pipeline (don't await — it runs in background)
      fetch(`/api/reports/${id}/generate`, { method: 'POST' }).catch(() => {});

      router.push(`/report/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">New Valuation Report</h1>
        <p className="text-gray-500 mb-8">
          Enter the property details below. The system will automatically fetch data and generate the report.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Property Address */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Property</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Address *
              </label>
              <AddressAutocomplete
                value={address}
                onChange={handleAddressTextChange}
                onSelect={handleAddressSelect}
                placeholder="Start typing an address, e.g. 15 Forest Road, Tunbridge Wells"
              />
              {addressVerified && (
                <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Address verified
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Postcode *
                </label>
                <input
                  type="text"
                  value={postcode}
                  onChange={(e) => { setPostcode(e.target.value.toUpperCase()); setAddressVerified(false); }}
                  onBlur={() => setPostcode(normalizePostcode(postcode))}
                  required
                  maxLength={8}
                  placeholder="TN2 4TT"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Land Registry Title
                </label>
                <input
                  type="text"
                  value={landRegistryTitle}
                  onChange={(e) => setLandRegistryTitle(e.target.value.toUpperCase())}
                  maxLength={10}
                  placeholder="e.g. TN12345"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 uppercase"
                />
              </div>
            </div>
          </div>

          {/* Report Type */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Report Type</h2>

            <div>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900 bg-white"
              >
                {UI_REPORT_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Client Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Client Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isIHT ? 'Solicitor / Executor Name & Address' : 'Client Name'}
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder={isIHT ? 'c/o Smith & Co Solicitors' : 'Client name'}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="CP-2025-001"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valuation Date
              </label>
              <input
                type="date"
                value={valuationDate}
                onChange={(e) => setValuationDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900"
              />
            </div>

            {/* IHT-specific fields */}
            {isIHT && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name of Deceased
                  </label>
                  <input
                    type="text"
                    value={deceasedName}
                    onChange={(e) => setDeceasedName(e.target.value)}
                    placeholder="Full name of the deceased"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Death
                  </label>
                  <input
                    type="date"
                    value={dateOfDeath}
                    onChange={(e) => setDateOfDeath(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900"
                  />
                </div>
              </div>
            )}

            {/* Auction-specific fields */}
            {isAuction && (
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Auction Company
                </label>
                <input
                  type="text"
                  value={auctionCompany}
                  onChange={(e) => setAuctionCompany(e.target.value)}
                  placeholder="e.g. Allsop & Co"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">{error}</div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !address || !postcode}
            className="w-full py-3.5 bg-[#c49a6c] hover:bg-[#b3895d] text-white text-lg font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
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
        </form>
      </div>
    </AppShell>
  );
}
