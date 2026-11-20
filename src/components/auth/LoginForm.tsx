/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  UserCheck,
  Lock,
  User,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import {
  authenticateSuperadmin,
  authenticateUser,
  bootstrapFirstKepalaSekolahAccount,
  getAllUsers,
  getSuperadminCachedPassword,
} from '../../services/storage';
import {
  hydrateAppsScriptConfig,
  isAppsScriptConfigured,
  pullUsersForLogin,
} from '../../services/appsScriptSync';
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
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Mode Login Superadmin (klik ikon/logo orang kecil -> hanya password, tanpa username, disimpan di cache)
  const [showSuperadminLogin, setShowSuperadminLogin] = useState(false);
  const [superadminPassword, setSuperadminPassword] = useState('');
  const [showSuperadminPass, setShowSuperadminPass] = useState(false);

  const [usersCount, setUsersCount] = useState<number>(() => getAllUsers().length);
  const [preferFirstKepsekForm, setPreferFirstKepsekForm] = useState<boolean>(false);

  // Form Buat Akun Kepala Sekolah Pertama (hanya muncul jika daftar akun masih benar-benar 0)
  const [firstName, setFirstName] = useState('');
  const [firstNip, setFirstNip] = useState('');
  const [firstEmail, setFirstEmail] = useState('');
  const [firstUsername, setFirstUsername] = useState('');
  const [firstPassword, setFirstPassword] = useState('');
  const [isCreatingFirstKepsek, setIsCreatingFirstKepsek] = useState(false);

  useEffect(() => {
    // Pastikan password default superadmin ('superadmin') terinisialisasi di cache aplikasi
    getSuperadminCachedPassword();

    const syncState = () => {
      const nextCount = getAllUsers().length;
      setUsersCount(nextCount);
      if (nextCount > 0) {
        setPreferFirstKepsekForm(false);
      }
    };

    window.addEventListener('kitarajin_cloud_sync', syncState);
    window.addEventListener('kitarajin_settings_updated', syncState);
    window.addEventListener('storage', syncState);

    hydrateAppsScriptConfig()
      .then((configured) => {
        if (configured || isAppsScriptConfigured()) {
          return pullUsersForLogin(false).then(() => {
            syncState();
          });
        }
        return undefined;
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('kitarajin_cloud_sync', syncState);
      window.removeEventListener('kitarajin_settings_updated', syncState);
      window.removeEventListener('storage', syncState);
    };
  }, []);

  const openSuperadminMode = () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setSuperadminPassword('');
    setPreferFirstKepsekForm(false);
    setShowSuperadminLogin(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMessage('Mohon masukkan Username dan Password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

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

  const handleSuperadminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!superadminPassword) {
      setErrorMessage('Mohon masukkan password Superadmin.');
      return;
    }
    setErrorMessage(null);
    setInfoMessage(null);
    const res = authenticateSuperadmin(superadminPassword);
    if (res.success && res.user) {
      onLoginSuccess(res.user);
    } else {
      setErrorMessage(res.message);
    }
  };

  const handleCreateFirstKepsek = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !firstUsername.trim() || !firstPassword.trim()) {
      setErrorMessage('Nama, Username, dan Password wajib diisi.');
      return;
    }
    setIsCreatingFirstKepsek(true);
    setErrorMessage(null);
    try {
      const res = await bootstrapFirstKepalaSekolahAccount({
        name: firstName,
        nip: firstNip,
        email: firstEmail,
        username: firstUsername,
        rawPassword: firstPassword,
      });
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMessage(res.message);
      }
    } catch {
      setErrorMessage('Gagal menyimpan akun Kepala Sekolah ke database.');
    } finally {
      setIsCreatingFirstKepsek(false);
    }
  };

  const showFirstKepsekBootstrap = !showSuperadminLogin && usersCount === 0 && preferFirstKepsekForm;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-600/20 via-teal-900/10 to-transparent pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        {/* Logo and Brand (Klik logo orang kecil untuk Login Superadmin) */}
        <div className="text-center">
          <button
            type="button"
            onClick={openSuperadminMode}
            title="Login Superadmin (Pengaturan & Sheets)"
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-xl shadow-emerald-500/30 mb-3 hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          >
            <UserCheck className="w-8 h-8" />
          </button>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            KITA<span className="text-emerald-400">RAJIN</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Sistem Presensi Wajah, Lokasi GPS & Penugasan Sekolah
          </p>
        </div>

        {/* Main Card */}
        <div className="mt-8 bg-white/95 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-slate-700/30">
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {showSuperadminLogin ? (
            <>
              <div className="mb-6 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Login Superadmin</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Kelola Pengaturan &amp; Sheets (tanpa username, password tersimpan di cache aplikasi).
                  </p>
                </div>
                <span className="w-8 h-8 rounded-full bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </span>
              </div>

              <form onSubmit={handleSuperadminSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Password Superadmin
                  </label>
                  <div className="relative rounded-xl shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showSuperadminPass ? 'text' : 'password'}
                      required
                      autoFocus
                      value={superadminPassword}
                      onChange={(e) => setSuperadminPassword(e.target.value)}
                      placeholder="Masukkan password superadmin"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSuperadminPass(!showSuperadminPass)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showSuperadminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 space-y-2.5">
                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Masuk sebagai Superadmin</span>
                    <ArrowRight className="w-4 h-4 text-emerald-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setShowSuperadminLogin(false);
                    }}
                    className="w-full py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    Kembali ke Login Akun
                  </button>
                </div>
              </form>
            </>
          ) : showFirstKepsekBootstrap ? (
            <>
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900">Buat Akun Kepala Sekolah</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Belum ada akun terdaftar. Buat akun Kepala Sekolah untuk masuk ke sistem sekolah.
                </p>
              </div>

              <form onSubmit={handleCreateFirstKepsek} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Nama Kepala Sekolah"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      NIP / ID
                    </label>
                    <input
                      type="text"
                      value={firstNip}
                      onChange={(e) => setFirstNip(e.target.value)}
                      placeholder="NIP"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      value={firstUsername}
                      onChange={(e) => setFirstUsername(e.target.value)}
                      placeholder="username"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={firstEmail}
                    onChange={(e) => setFirstEmail(e.target.value)}
                    placeholder="email@sekolah.sch.id"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={firstPassword}
                    onChange={(e) => setFirstPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreatingFirstKepsek}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isCreatingFirstKepsek ? 'Tunggu sebentar...' : 'Simpan & Masuk sebagai Kepala Sekolah'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setPreferFirstKepsekForm(false);
                  }}
                  className="w-full py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Kembali ke Form Login
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Masuk Akun</h2>
                </div>
                <button
                  type="button"
                  onClick={openSuperadminMode}
                  title="Masuk Superadmin"
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                >
                  <User className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Username
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
                      placeholder="Masukkan Username"
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
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 space-y-2.5">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md shadow-emerald-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                  >
                    {isLoading ? (
                      <span>Tunggu sebentar...</span>
                    ) : (
                      <>
                        <span>Masuk ke Sistem</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {usersCount === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setInfoMessage(null);
                        setPreferFirstKepsekForm(true);
                      }}
                      className="w-full py-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
                    >
                      Instalasi Baru? Buat Akun Kepala Sekolah Pertama
                    </button>
                  )}
                </div>
              </form>
            </>
          )}

          {/* Enkripsi Info Security Badge */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Keamanan Hashing SHA-256 + Salt Kriptografis</span>
          </div>
        </div>
      </div>
    </div>
  );
};
