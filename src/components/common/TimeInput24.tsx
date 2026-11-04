/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Clock } from 'lucide-react';

interface TimeInput24Props {
  value: string; // 'HH:mm', e.g. '06:00', '13:30'
  onChange: (value: string) => void;
  className?: string;
  variant?: 'emerald' | 'indigo' | 'default';
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export const TimeInput24: React.FC<TimeInput24Props> = ({
  value = '07:00',
  onChange,
  className = '',
  variant = 'default',
  disabled = false,
  id,
}) => {
  // Parse current value into HH and mm
  const parts = (value || '07:00').split(':');
  const currentHour = parts[0] ? parts[0].padStart(2, '0') : '07';
  const currentMinute = parts[1] ? parts[1].padStart(2, '0') : '00';

  const safeHour = HOURS_24.includes(currentHour) ? currentHour : '07';
  const safeMinute = MINUTES_60.includes(currentMinute) ? currentMinute : '00';

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newH = e.target.value;
    onChange(`${newH}:${safeMinute}`);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newM = e.target.value;
    onChange(`${safeHour}:${newM}`);
  };

  const variantStyles = {
    emerald: 'border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-500 bg-emerald-50/40 text-emerald-950',
    indigo: 'border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-500 bg-indigo-50/40 text-indigo-950',
    default: 'border-slate-300 focus-within:ring-2 focus-within:ring-emerald-500 bg-white text-slate-800',
  }[variant];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl border font-mono font-bold text-xs transition-all shadow-2xs ${variantStyles} ${
        disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''
      } ${className}`}
    >
      <Clock className={`w-3.5 h-3.5 shrink-0 ${variant === 'indigo' ? 'text-indigo-600' : 'text-emerald-600'}`} />

      {/* Jam Selector (00 - 23 Jam) */}
      <div className="flex items-center gap-0.5">
        <select
          id={id ? `${id}-hour` : undefined}
          value={safeHour}
          onChange={handleHourChange}
          disabled={disabled}
          title="Pilih Jam (Format 24 Jam: 00 s/d 23)"
          className="bg-transparent font-mono font-bold text-xs focus:outline-none cursor-pointer py-0.5 px-1 rounded hover:bg-black/5"
        >
          {HOURS_24.map((h) => (
            <option key={h} value={h} className="text-slate-900 font-mono font-semibold bg-white py-1">
              {h}
            </option>
          ))}
        </select>

        <span className="font-extrabold text-slate-400 select-none pb-0.5">:</span>

        {/* Menit Selector (00 - 59 Menit) */}
        <select
          id={id ? `${id}-minute` : undefined}
          value={safeMinute}
          onChange={handleMinuteChange}
          disabled={disabled}
          title="Pilih Menit (00 s/d 59)"
          className="bg-transparent font-mono font-bold text-xs focus:outline-none cursor-pointer py-0.5 px-1 rounded hover:bg-black/5"
        >
          {MINUTES_60.map((m) => (
            <option key={m} value={m} className="text-slate-900 font-mono font-semibold bg-white py-1">
              {m}
            </option>
          ))}
        </select>
      </div>

      <span className="text-[10px] font-sans font-bold text-slate-400 px-1 py-0.2 rounded bg-slate-100 select-none ml-auto">
        WIB
      </span>
    </div>
  );
};
