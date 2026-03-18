'use client';

import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Comparable } from '@/lib/types';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
};

const scoreColor = (score: number) => {
  if (score >= 70) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
};

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20';

interface ComparablePanelProps {
  comparables: Comparable[];
  postcode: string;
  onChange: (comparables: Comparable[]) => void;
}

interface ManualFormState {
  address: string;
  price: string;
  date: string;
  type: string;
  status: 'SOLD' | 'SOLD STC' | 'LISTED';
  bedrooms: string;
  floorArea: string;
  agentName: string;
  description: string;
}

const EMPTY_FORM: ManualFormState = {
  address: '',
  price: '',
  date: '',
  type: 'Semi-Detached',
  status: 'SOLD',
  bedrooms: '',
  floorArea: '',
  agentName: '',
  description: '',
};

export default function ComparablePanel({ comparables, postcode, onChange }: ComparablePanelProps) {
  const [showManualForm, setShowManualForm] = useState(false);
  const [form, setForm] = useState<ManualFormState>(EMPTY_FORM);

  const selected = comparables.filter((c) => c.isSelected);

  const toggleComparable = (id: string) => {
    onChange(comparables.map((c) => c.id === id ? { ...c, isSelected: !c.isSelected } : c));
  };

  const updateDescription = (id: string, description: string) => {
    onChange(comparables.map((c) => c.id === id ? { ...c, description } : c));
  };

  const updateAdjustmentNotes = (id: string, adjustmentNotes: string) => {
    onChange(comparables.map((c) => c.id === id ? { ...c, adjustmentNotes } : c));
  };

  const removeComparable = (id: string) => {
    onChange(comparables.filter((c) => c.id !== id));
  };

  const addManual = () => {
    const price = parseInt(form.price.replace(/[^0-9]/g, ''));
    if (!form.address.trim() || !price || !form.date) return;
    const bedrooms = form.bedrooms ? parseInt(form.bedrooms) : null;
    const floorArea = form.floorArea ? parseFloat(form.floorArea) : null;
    const pricePerSqm = floorArea && floorArea > 0 ? Math.round(price / floorArea) : null;
    const newComp: Comparable = {
      id: uuidv4(),
      address: form.address.trim(),
      saleDate: form.date,
      salePrice: price,
      floorArea,
      pricePerSqm,
      propertyType: form.type,
      bedrooms,
      description: form.description.trim(),
      source: 'manual',
      epcRating: null,
      floorAreaSource: floorArea ? 'agent_floorplan' : null,
      distanceMeters: null,
      relevanceScore: 50,
      isSelected: true,
      status: form.status,
      agentName: form.agentName.trim() || null,
      condition: null,
      parking: null,
      garden: null,
      frontPhotoUrl: null,
      floorPlanUrl: null,
      tenure: null,
    };
    onChange([...comparables, newComp]);
    setForm(EMPTY_FORM);
    setShowManualForm(false);
  };

  const manualFormElement = showManualForm && (
    <ManualForm form={form} setForm={setForm} onAdd={addManual} />
  );

  if (comparables.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Comparable Sales</h2>
        <p className="text-sm text-gray-500 mb-4">No comparables found. The generation pipeline may still be running, or you can add them manually.</p>
        <button
          type="button"
          onClick={() => setShowManualForm(!showManualForm)}
          className="rounded-lg border border-[#c49a6c] px-4 py-2 text-sm font-medium text-[#c49a6c] hover:bg-[#c49a6c]/5"
        >
          + Add Manual Comparable
        </button>
        {manualFormElement}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Comparable Sales</h2>
          <p className="text-sm text-gray-500">
            {comparables.length} properties near <span className="font-medium text-gray-700">{postcode}</span>
            {' '}&middot; {selected.length} selected
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowManualForm(!showManualForm)}
          className="rounded-lg border border-[#c49a6c] px-3 py-1.5 text-xs font-medium text-[#c49a6c] hover:bg-[#c49a6c]/5"
        >
          + Add Manual
        </button>
      </div>

      {manualFormElement}

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {comparables.map((comp) => (
          <ComparableCard
            key={comp.id}
            comp={comp}
            onToggle={() => toggleComparable(comp.id)}
            onUpdateDescription={(desc) => updateDescription(comp.id, desc)}
            onUpdateAdjustmentNotes={(notes) => updateAdjustmentNotes(comp.id, notes)}
            onRemove={comp.source === 'manual' ? () => removeComparable(comp.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ManualForm({
  form,
  setForm,
  onAdd,
}: {
  form: ManualFormState;
  setForm: (f: ManualFormState) => void;
  onAdd: () => void;
}) {
  const set = (key: keyof ManualFormState, value: string) =>
    setForm({ ...form, [key]: value });

  return (
    <div className="my-4 rounded-lg border-2 border-dashed border-[#c49a6c]/40 bg-[#c49a6c]/5 p-5">
      <h4 className="mb-3 text-sm font-semibold text-gray-700">Add Comparable Manually</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Row 1: Address */}
        <div className="sm:col-span-2 lg:col-span-4">
          <input type="text" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Full address" className={inputClass} />
        </div>
        {/* Row 2: Price, Date, Status, Type */}
        <div>
          <input type="text" inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="Price (&pound;)" className={inputClass} />
        </div>
        <div>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inputClass} />
        </div>
        <div>
          <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
            <option value="SOLD">SOLD</option>
            <option value="SOLD STC">SOLD STC</option>
            <option value="LISTED">LISTED</option>
          </select>
        </div>
        <div>
          <select value={form.type} onChange={(e) => set('type', e.target.value)} className={inputClass}>
            <option value="Detached">Detached</option>
            <option value="Semi-Detached">Semi-Detached</option>
            <option value="Terraced">Terraced</option>
            <option value="Flat/Maisonette">Flat/Maisonette</option>
            <option value="Other">Other</option>
          </select>
        </div>
        {/* Row 3: Bedrooms, Floor Area, Agent Name */}
        <div>
          <input type="number" min="0" max="20" value={form.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} placeholder="Bedrooms" className={inputClass} />
        </div>
        <div>
          <input type="number" min="0" step="1" value={form.floorArea} onChange={(e) => set('floorArea', e.target.value)} placeholder="Floor area (m&sup2;)" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <input type="text" value={form.agentName} onChange={(e) => set('agentName', e.target.value)} placeholder={form.status !== 'SOLD' ? 'Agent name (e.g. Rightmove)' : 'Agent name (optional)'} className={inputClass} />
        </div>
        {/* Row 4: Description + Add button */}
        <div className="sm:col-span-1 lg:col-span-3">
          <input type="text" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Brief description (e.g. &quot;3-bed semi in fair order&quot;)" className={inputClass} />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={onAdd}
            disabled={!form.address.trim() || !form.price || !form.date}
            className="w-full rounded-lg bg-[#c49a6c] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#b08a5c] disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function ComparableCard({
  comp,
  onToggle,
  onUpdateDescription,
  onUpdateAdjustmentNotes,
  onRemove,
}: {
  comp: Comparable;
  onToggle: () => void;
  onUpdateDescription: (desc: string) => void;
  onUpdateAdjustmentNotes: (notes: string) => void;
  onRemove?: () => void;
}) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [draft, setDraft] = useState(comp.description);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const subLine = [
    comp.propertyType,
    comp.bedrooms != null ? `${comp.bedrooms} bed` : '',
    comp.agentName ? `via ${comp.agentName}` : '',
  ].filter(Boolean).join(' \u00B7 ');

  const streetViewUrl = `/api/map-image?type=streetview&address=${encodeURIComponent(comp.address)}&size=160x112`;

  return (
    <div
      className={`relative rounded-lg border transition-colors ${
        comp.isSelected ? 'border-l-4 border-[#c49a6c] bg-[#c49a6c]/5' : 'border-gray-200 bg-white opacity-70'
      } p-4 shadow-sm`}
    >
      <div className="flex gap-3">
        <div className="flex items-start pt-0.5">
          <input
            type="checkbox"
            checked={comp.isSelected}
            onChange={onToggle}
            className="h-4 w-4 rounded border-gray-300 text-[#c49a6c] accent-[#c49a6c]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{comp.address}</span>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="ml-2 text-xs text-red-400 hover:text-red-600"
                title="Remove"
              >
                &times;
              </button>
            )}
          </div>
          <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-medium uppercase ${
              comp.status === 'LISTED' ? 'bg-blue-100 text-blue-700'
              : comp.status === 'SOLD STC' ? 'bg-amber-100 text-amber-700'
              : 'bg-gray-100 text-gray-700'
            }`}>
              {comp.status}
            </span>
            <span>{fmtDate(comp.saleDate)}</span>
            <span className="font-semibold text-gray-900">{fmt(comp.salePrice)}</span>
            {comp.floorArea != null && comp.floorArea > 0 && <span>{comp.floorArea}m&sup2;</span>}
            {comp.pricePerSqm != null && comp.pricePerSqm > 0 && <span>{fmt(comp.pricePerSqm)}/m&sup2;</span>}
          </div>
          {subLine && <div className="mb-2 text-xs text-gray-500">{subLine}</div>}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">Score:</span>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
              <div className={`h-full rounded-full ${scoreColor(comp.relevanceScore)}`} style={{ width: `${comp.relevanceScore}%` }} />
            </div>
            <span className="text-xs font-medium text-gray-600">{comp.relevanceScore}%</span>
          </div>
          {!editingDesc ? (
            <button
              type="button"
              onClick={() => { setDraft(comp.description); setEditingDesc(true); }}
              className="cursor-pointer text-left text-xs text-gray-400 hover:text-gray-600"
            >
              {comp.description || 'Edit description...'}
            </button>
          ) : (
            <input
              ref={descRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { setEditingDesc(false); onUpdateDescription(draft); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { setEditingDesc(false); onUpdateDescription(draft); }
                if (e.key === 'Escape') { setEditingDesc(false); setDraft(comp.description); }
              }}
              placeholder="Edit description..."
              className="w-full rounded border border-[#c49a6c] px-2 py-1 text-xs text-gray-900 outline-none ring-2 ring-[#c49a6c]/20"
            />
          )}
          {comp.isSelected && (
            <input
              type="text"
              value={comp.adjustmentNotes ?? ''}
              onChange={(e) => onUpdateAdjustmentNotes(e.target.value)}
              placeholder="e.g. Similar but no garden, -£15k"
              className="mt-1.5 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20"
            />
          )}
        </div>
        {/* Street View thumbnail */}
        <div className="shrink-0 self-start">
          <div className="w-20 h-14 rounded overflow-hidden bg-gray-100">
            <img
              src={streetViewUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                const parent = e.currentTarget.parentElement;
                if (parent) parent.style.display = 'none';
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
