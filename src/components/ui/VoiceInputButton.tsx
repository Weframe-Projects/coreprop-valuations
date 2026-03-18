'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
}

// Extend Window for vendor-prefixed SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

/**
 * Microphone button that uses the Web Speech API to dictate text.
 * - Appends transcribed text via `onTranscript` callback
 * - Shows a pulsing red indicator while listening
 * - Gracefully returns null on unsupported browsers (Safari iOS, Firefox)
 */
export default function VoiceInputButton({ onTranscript, className = '' }: VoiceInputButtonProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);

  // Feature-detect on mount (must run client-side)
  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        !!(
          (window as unknown as Record<string, unknown>).SpeechRecognition ||
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition
        )
    );
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      // Stop
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = createRecognition();
    if (!recognition) return;

    recognition.continuous = true;
    recognition.interimResults = false; // only fire on final results
    recognition.lang = 'en-GB';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) onTranscript(text);
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, onTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? 'Stop dictation' : 'Start voice input'}
      className={`relative inline-flex items-center justify-center rounded-md p-2.5 transition-colors ${
        listening
          ? 'bg-red-100 text-red-600 hover:bg-red-200'
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
      } ${className}`}
    >
      {/* Pulsing ring when listening */}
      {listening && (
        <span className="absolute inset-0 animate-ping rounded-md bg-red-400 opacity-30" />
      )}
      {/* Microphone icon */}
      <svg
        className="relative h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 11a7 7 0 01-14 0M12 19v3m-3 0h6"
        />
      </svg>
    </button>
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
