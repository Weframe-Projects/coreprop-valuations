'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FloatingDictationProps {
  /** Current notes text */
  notes: string;
  /** Called whenever notes change (typing or voice) */
  onChange: (notes: string) => void;
  /** Called when user wants to apply notes to report */
  onApplyNotes?: () => void;
  /** Whether the apply-notes action is currently running */
  applyingNotes?: boolean;
}

// Extend Window for vendor-prefixed SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

/**
 * Floating dictation button fixed to the bottom-right of the viewport.
 * - Tap to expand an inspection notes panel
 * - Mic button inside the panel dictates and appends text
 * - Live interim transcript shown while speaking
 * - "Update Report with Notes" button feeds notes into AI pipeline
 * - Notes persist via the `onChange` callback
 * - Auto-hides mic on unsupported browsers
 * - Designed for thumb-reachable mobile use
 */
export default function FloatingDictation({
  notes,
  onChange,
  onApplyNotes,
  applyingNotes = false,
}: FloatingDictationProps) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Use a ref to track the latest notes value so the onresult callback always appends correctly
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Feature detect
  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
        !!(
          (window as unknown as Record<string, unknown>).SpeechRecognition ||
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition
        )
    );
  }, []);

  // Focus textarea when panel opens
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // Scroll textarea to bottom when notes change (new dictation added)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [notes]);

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setInterimText('');
      return;
    }

    const recognition = createRecognition();
    if (!recognition) return;

    recognition.continuous = true;
    recognition.interimResults = true; // Enable live feedback
    recognition.lang = 'en-GB';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Process all results from resultIndex onwards
      let finalTranscript = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      // Show interim text as live preview
      setInterimText(interim);

      // Append final transcripts to notes
      if (finalTranscript.trim()) {
        const current = notesRef.current;
        onChange(current ? `${current}\n${finalTranscript.trim()}` : finalTranscript.trim());
        setInterimText('');
      }
    };

    recognition.onerror = () => {
      setListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, onChange]);

  return (
    <>
      {/* Expanded notes panel */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:left-auto sm:w-[420px] sm:rounded-xl sm:border">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-[#c49a6c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="text-sm font-semibold text-gray-800">Inspection Notes</span>
              {listening && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  Listening...
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (listening) {
                  recognitionRef.current?.stop();
                  setListening(false);
                  setInterimText('');
                }
              }}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Notes textarea */}
          <div className="p-3">
            <textarea
              ref={textareaRef}
              value={notes}
              onChange={(e) => onChange(e.target.value)}
              rows={4}
              placeholder={"Type or dictate your inspection notes here...\n\ne.g. Kitchen: 4m x 3m, fitted base and wall units, gas hob, window to rear. Some damp under sink..."}
              className="w-full resize-y rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder-gray-400 focus:border-[#c49a6c] focus:outline-none focus:ring-2 focus:ring-[#c49a6c]/20"
            />

            {/* Live interim transcript preview */}
            {interimText && (
              <div className="mt-1.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600">Hearing...</span>
                </div>
                <p className="text-sm text-amber-800 italic">{interimText}</p>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {notes.length > 0 ? `${notes.split(/\s+/).filter(Boolean).length} words` : 'No notes yet'}
              </span>
              <div className="flex items-center gap-2">
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      listening
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-[#c49a6c]/10 text-[#c49a6c] hover:bg-[#c49a6c]/20'
                    }`}
                  >
                    {listening && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                      </span>
                    )}
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0M12 19v3m-3 0h6" />
                    </svg>
                    {listening ? 'Stop' : 'Dictate'}
                  </button>
                )}
              </div>
            </div>

            {/* Apply notes to report button */}
            {notes.trim().length > 0 && onApplyNotes && (
              <button
                type="button"
                onClick={onApplyNotes}
                disabled={applyingNotes || listening}
                className="mt-3 w-full rounded-lg bg-[#1a2e3b] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#2a4050] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {applyingNotes ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Updating Report...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Update Report with Notes
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating action button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#c49a6c] text-white shadow-lg transition-all hover:bg-[#b08a5c] hover:shadow-xl active:scale-95 sm:h-12 sm:w-12"
          title="Inspection Notes"
        >
          {notes.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              !
            </span>
          )}
          <svg className="h-6 w-6 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createRecognition(): any | null {
  if (typeof window === 'undefined') return null;
  const SR =
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  if (!SR) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (SR as any)();
}
