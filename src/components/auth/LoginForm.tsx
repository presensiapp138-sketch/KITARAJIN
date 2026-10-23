/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  UserCheck,
  Lock,
  Mail,
  User,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  School,
} from 'lucide-react';
import { authenticateUser } from '../../services/storage';
import { User as UserType } from '../../types';

interface LoginFormProps {
  onLoginSuccess: (user: UserType) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMessage('Mohon masukkan Username/Email/NIP dan Password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await authenticateUser(identifier, password);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMessage(res.message);
      }
    } catch {
      setErrorMessage('Terjadi gangguan saat memproses login.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper untuk mengisi cepat akun uji coba
  const setQuickDemo = (idVal: string, passVal: string) => {
    setIdentifier(idVal);
    setPassword(passVal);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-600/20 via-teal-900/10 to-transparent pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        {/* Logo and Brand */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-xl shadow-emerald-500/30 mb-3">
            <UserCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            KITA<span className="text-emerald-400">RAJIN</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Sistem Presensi Wajah, Lokasi GPS & Penugasan Sekolah
          </p>
        </div>

        {/* Login Card */}
        <div className="mt-8 bg-white/95 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-slate-700/30">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Masuk Akun</h2>
            <p className="text-xs text-slate-500 mt-1">
              Gunakan Email (Kepala Sekolah), Username (Admin), atau NIP/ID (Karyawan).
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email / Username / NIP
              </label>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Contoh: kepsek@sekolah.sch.id / adminfauzi / 1990..."
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password akun Anda"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md shadow-emerald-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoading ? (
                  <span>Memverifikasi enkripsi...</span>
                ) : (
                  <>
                    <span>Masuk ke Sistem</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Enkripsi Info Security Badge */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Keamanan Hashing SHA-256 + Salt Kriptografis</span>
          </div>

          {/* Quick Demo Switcher for Evaluation */}
          <div className="mt-5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Akun Siap Uji (1-Klik Isi Form)</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setQuickDemo('kepsek@sekolah.sch.id', 'kepsek123')}
                className="p-2 rounded-xl border border-slate-200 bg-white text-left hover:border-emerald-500 hover:bg-emerald-50 transition-all text-xs"
              >
                <div className="font-bold text-slate-800 text-[11px]">Kep. Sekolah</div>
                <div className="text-[9px] text-slate-400 font-mono">kepsek123</div>
              </button>

              <button
                type="button"
                onClick={() => setQuickDemo('adminfauzi', 'admin123')}
                className="p-2 rounded-xl border border-slate-200 bg-white text-left hover:border-indigo-500 hover:bg-indigo-50 transition-all text-xs"
              >
                <div className="font-bold text-slate-800 text-[11px]">Admin TU</div>
                <div className="text-[9px] text-slate-400 font-mono">admin123</div>
              </button>

              <button
                type="button"
                onClick={() => setQuickDemo('sitirahma', 'staff123')}
                className="p-2 rounded-xl border border-slate-200 bg-white text-left hover:border-amber-500 hover:bg-amber-50 transition-all text-xs"
              >
                <div className="font-bold text-slate-800 text-[11px]">Guru / Tendik</div>
                <div className="text-[9px] text-slate-400 font-mono">staff123</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
