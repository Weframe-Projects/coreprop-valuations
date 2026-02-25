'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Suggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AddressResult {
  address: string;
  postcode: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Start typing an address...',
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selecting, setSelecting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3 || selecting) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/address-lookup?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setIsOpen((data.suggestions || []).length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  }, [selecting]);

  function handleInputChange(newValue: string) {
    onChange(newValue);
    setSelecting(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(newValue), 300);
  }

  async function handleSelect(suggestion: Suggestion) {
    setSelecting(true);
    setIsOpen(false);
    setSuggestions([]);
    setLoading(true);

    try {
      const res = await fetch(`/api/address-lookup?placeId=${encodeURIComponent(suggestion.placeId)}`);
      if (!res.ok) throw new Error('Failed to fetch details');
      const result: AddressResult = await res.json();

      onChange(result.address);
      onSelect(result);
    } catch {
      // Fall back to using the description from autocomplete
      onChange(suggestion.description);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
          placeholder={placeholder}
          required
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-gray-900"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${
                i === activeIndex ? 'bg-[#c49a6c]/10' : 'hover:bg-gray-50'
              }`}
            >
              <div className="font-medium text-gray-900 text-sm">{s.mainText}</div>
              <div className="text-gray-500 text-xs mt-0.5">{s.secondaryText}</div>
            </li>
          ))}
          <li className="px-4 py-2 text-[10px] text-gray-400 bg-gray-50">
            Powered by Google
          </li>
        </ul>
      )}
    </div>
  );
}
