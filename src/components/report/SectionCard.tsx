'use client';

import { useState, useEffect } from 'react';

interface SectionCardProps {
  sectionKey: string;
  title: string;
  text: string;
  onSave: (key: string, value: string) => void;
}

export default function SectionCard({ sectionKey, title, text, onSave }: SectionCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);

  useEffect(() => {
    if (!isEditing) setEditText(text);
  }, [text, isEditing]);

  const handleSave = () => {
    onSave(sectionKey, editText);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(text);
    setIsEditing(false);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-left"
        >
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </button>
        {!isCollapsed && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md px-3 py-1 text-sm font-medium text-[#c49a6c] transition-colors hover:bg-[#c49a6c]/10"
          >
            Edit
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="px-6 py-4">
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={10}
                className="w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm leading-relaxed text-gray-900 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-md bg-[#c49a6c] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#b08a5c]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {text || <span className="italic text-gray-400">No content generated for this section.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
