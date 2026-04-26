'use client';

import { useState } from 'react';

interface FloatingFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
  error?: string;
  tag?: string;
  inputMode?: 'text' | 'numeric' | 'email';
}

export default function FloatingField({
  label, value, onChange, onBlur, placeholder, type = 'text',
  readOnly = false, error, tag, inputMode = 'text',
}: FloatingFieldProps) {
  const [focused, setFocused] = useState(false);
  const isActive = focused || !!value;

  return (
    <div>
      <div className={`relative rounded-xl border transition-all ${
        error
          ? 'border-[#FF3B30]'
          : focused
          ? 'border-[#0076DF] ring-2 ring-[#0076DF]/30'
          : 'border-slate-300 dark:border-[#333]'
      } ${readOnly ? 'bg-slate-50 dark:bg-[#1c1c1e]' : 'bg-white dark:bg-[#1c1c1e]'}`}>
        <label className={`absolute left-4 transition-all pointer-events-none ${
          isActive
            ? 'top-1.5 text-[10px] font-medium text-[#86868b]'
            : 'top-1/2 -translate-y-1/2 text-sm text-[#86868b]'
        }`}>
          {label} {tag && <span className="text-[#007AFF] text-[9px]">{tag}</span>}
        </label>
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          readOnly={readOnly}
          placeholder={focused ? placeholder : ''}
          className={`w-full px-4 pt-5 pb-2 bg-transparent text-sm text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#c7c7cc] dark:placeholder-[#48484a] focus:outline-none rounded-xl ${
            readOnly ? 'cursor-not-allowed opacity-70' : ''
          }`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-[#FF3B30]">{error}</p>}
    </div>
  );
}
