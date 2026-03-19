'use client';

import { useState, useEffect } from 'react';
import type { Comparable } from '@/lib/types';
import { numberToWords } from '@/lib/number-to-words';

function formatCurrency(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return parseInt(digits).toLocaleString('en-GB');
}

function parseCurrency(formatted: string): number | null {
  const digits = formatted.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return parseInt(digits);
}

interface ValuationPanelProps {
  valuationFigure: number | null;
  valuationFigureWords: string;
  auctionReserve: number | null;
  auctionReserveWords: string;
  showAuction: boolean;
  comparables: Comparable[];
  address: string;
  onChange: (updates: {
    valuation_figure?: number | null;
    valuation_figure_words?: string;
    auction_reserve?: number | null;
    auction_reserve_words?: string;
  }) => void;
}

export default function ValuationPanel({
  valuationFigure,
  valuationFigureWords,
  auctionReserve,
  auctionReserveWords,
  showAuction,
  comparables,
  address,
  onChange,
}: ValuationPanelProps) {
  const [marketDisplay, setMarketDisplay] = useState(
    valuationFigure != null ? valuationFigure.toLocaleString('en-GB') : ''
  );
  const [auctionDisplay, setAuctionDisplay] = useState(
    auctionReserve != null ? auctionReserve.toLocaleString('en-GB') : ''
  );

  // Sync when external value changes (e.g., from pipeline)
  useEffect(() => {
    if (valuationFigure != null) {
      setMarketDisplay(valuationFigure.toLocaleString('en-GB'));
    }
  }, [valuationFigure]);

  useEffect(() => {
    if (auctionReserve != null) {
      setAuctionDisplay(auctionReserve.toLocaleString('en-GB'));
    }
  }, [auctionReserve]);

  const selectedComps = comparables.filter((c) => c.isSelected);
  const avgPrice = selectedComps.length > 0
    ? Math.round(selectedComps.reduce((s, c) => s + c.salePrice, 0) / selectedComps.length)
    : null;

  const compsWithPsm = selectedComps.filter((c) => c.pricePerSqm && c.pricePerSqm > 0);
  const avgPsm = compsWithPsm.length > 0
    ? Math.round(compsWithPsm.reduce((s, c) => s + (c.pricePerSqm ?? 0), 0) / compsWithPsm.length)
    : null;

  const deviation = valuationFigure && avgPrice
    ? ((valuationFigure - avgPrice) / avgPrice) * 100
    : null;
  const showWarning = deviation != null && Math.abs(deviation) > 30;

  return (
    <div className="rounded-xl border border-gray-200 border-l-4 border-l-[#c49a6c] bg-gradient-to-r from-[#faf7f3] to-white p-6 shadow-md">
      <div className="mb-1">
        <h2 className="text-xl font-bold text-gray-900">Valuation</h2>
        <p className="text-sm text-gray-500">{address}</p>
      </div>

      <div className="mt-6 grid gap-6 sm:gap-8 md:grid-cols-[1fr,280px] lg:grid-cols-[1fr,320px]">
        <div className="space-y-6">
          {/* Market Value */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Market Value</label>
            <div className="flex items-stretch">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-100 px-4 text-2xl font-bold text-gray-600">
                {'\u00A3'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={marketDisplay}
                onChange={(e) => {
                  const formatted = formatCurrency(e.target.value);
                  setMarketDisplay(formatted);
                  onChange({ valuation_figure: parseCurrency(formatted) });
                }}
                placeholder="0"
                className="w-full rounded-r-lg border border-gray-300 px-4 py-3 text-2xl font-bold text-gray-900 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20 lg:text-3xl"
              />
            </div>
          </div>

          {/* Market Value in Words */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Market Value in Words</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={valuationFigureWords}
                onChange={(e) => onChange({ valuation_figure_words: e.target.value })}
                placeholder="e.g., Five Hundred and Thirty Thousand Pounds"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20"
              />
              {valuationFigure != null && valuationFigure > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ valuation_figure_words: numberToWords(valuationFigure) })}
                  className="shrink-0 rounded-lg border border-[#c49a6c] bg-[#faf7f3] px-3 py-2 text-xs font-medium text-[#c49a6c] hover:bg-[#c49a6c] hover:text-white transition-colors"
                  title="Auto-generate from number"
                >
                  Auto
                </button>
              )}
            </div>
          </div>

          {/* Deviation warning */}
          {showWarning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Valuation is {Math.abs(Math.round(deviation!))}% {deviation! > 0 ? 'above' : 'below'} the comparable average ({'\u00A3'}{avgPrice!.toLocaleString('en-GB')})
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    Large deviations should be clearly justified in the report.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Auction Reserve */}
          {showAuction && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Auction Reserve</label>
                <div className="flex items-stretch">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-100 px-4 text-2xl font-bold text-gray-600">
                    {'\u00A3'}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={auctionDisplay}
                    onChange={(e) => {
                      const formatted = formatCurrency(e.target.value);
                      setAuctionDisplay(formatted);
                      onChange({ auction_reserve: parseCurrency(formatted) });
                    }}
                    placeholder="0"
                    className="w-full rounded-r-lg border border-gray-300 px-4 py-3 text-2xl font-bold text-gray-900 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20 lg:text-3xl"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Auction Reserve in Words</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={auctionReserveWords}
                    onChange={(e) => onChange({ auction_reserve_words: e.target.value })}
                    placeholder="e.g., Five Hundred Thousand Pounds"
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20"
                  />
                  {auctionReserve != null && auctionReserve > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange({ auction_reserve_words: numberToWords(auctionReserve) })}
                      className="shrink-0 rounded-lg border border-[#c49a6c] bg-[#faf7f3] px-3 py-2 text-xs font-medium text-[#c49a6c] hover:bg-[#c49a6c] hover:text-white transition-colors"
                      title="Auto-generate from number"
                    >
                      Auto
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Comparable summary */}
        <div>
          {selectedComps.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No comparables selected.
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50">
              <div className="border-b border-gray-200 px-4 py-3">
                <h4 className="text-sm font-semibold text-gray-700">Comparable Summary</h4>
              </div>
              <div className="divide-y divide-gray-100">
                {selectedComps.slice(0, 7).map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="truncate pr-3 text-gray-600" title={c.address}>
                      {c.address.length > 35 ? c.address.slice(0, 35) + '...' : c.address}
                    </span>
                    <span className="whitespace-nowrap font-medium text-gray-900">
                      {'\u00A3'}{c.salePrice.toLocaleString('en-GB')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-300 bg-white px-4 py-3 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">Average Price</span>
                  <span className="font-bold text-gray-900">{'\u00A3'}{avgPrice!.toLocaleString('en-GB')}</span>
                </div>
                {avgPsm != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">Average {'\u00A3'}/m{'\u00B2'}</span>
                    <span className="font-bold text-gray-900">{'\u00A3'}{avgPsm.toLocaleString('en-GB')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
