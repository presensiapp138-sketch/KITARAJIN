/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Camera,
  CalendarCheck,
  FileText,
  ClipboardList,
  BarChart3,
  ScanFace,
  ShieldCheck,
  Users,
  Building2,
  Clock,
  MapPin,
  ShieldAlert,
  Settings,
  Menu,
  X,
  UserCheck,
  LogOut,
  Sparkles,
  ChevronDown,
  Edit3,
  Mail,
  User as UserIcon,
  Phone,
  Save,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';

import { User, UserRole, AppSettings } from '../../types';
import { getNavItemsForRole, NavItem } from '../../config/navigation';
import { updateUser, getAppSettings } from '../../services/storage';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface ShellProps {
  currentUser: User;
  onLogout: () => void;
  activeMenuId: string;
  onSelectMenu: (menuId: string) => void;
  onUpdateCurrentUser?: (user: User) => void;
  children: React.ReactNode;
}

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Camera,
  CalendarCheck,
  FileText,
  ClipboardList,
  BarChart3,
  ScanFace,
  ShieldCheck,
  Users,
  Building2,
  Clock,
  MapPin,
  ShieldAlert,
  Settings,
};

export const Shell: React.FC<ShellProps> = ({
  currentUser,
  onLogout,
  activeMenuId,
  onSelectMenu,
  onUpdateCurrentUser,
  children,
}) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(currentUser.name);
  const [editNip, setEditNip] = useState(currentUser.nip || '');
  const [editEmail, setEditEmail] = useState(currentUser.email || '');
  const [editPhone, setEditPhone] = useState(currentUser.phone || '');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings());

  React.useEffect(() => {
    const handleSettingsUpdate = () => {
      setSettings(getAppSettings());
    };
    window.addEventListener('kitarajin_settings_updated', handleSettingsUpdate);
    window.addEventListener('kitarajin_cloud_sync', handleSettingsUpdate);
    window.addEventListener('storage', handleSettingsUpdate);
    return () => {
      window.removeEventListener('kitarajin_settings_updated', handleSettingsUpdate);
      window.removeEventListener('kitarajin_cloud_sync', handleSettingsUpdate);
      window.removeEventListener('storage', handleSettingsUpdate);
    };
  }, []);

  React.useEffect(() => {
    setEditName(currentUser.name);
    setEditNip(currentUser.nip || '');
    setEditEmail(currentUser.email || '');
    setEditPhone(currentUser.phone || '');
    setEditPassword('');
  }, [currentUser]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setProfileMsg({ type: 'error', text: 'Nama tidak boleh kosong.' });
      return;
    }
    if (!editNip.trim()) {
      setProfileMsg({ type: 'error', text: 'NIP / ID tidak boleh kosong.' });
      return;
    }
    if (!editEmail.trim()) {
      setProfileMsg({ type: 'error', text: 'Email tidak boleh kosong.' });
      return;
    }
    if (editPassword.trim() && editPassword.trim().length < 6) {
      setProfileMsg({ type: 'error', text: 'Password minimal 6 karakter.' });
      return;
    }

    setIsSaving(true);
    setProfileMsg(null);

    const updatePayload: any = {
      name: editName.trim(),
      nip: editNip.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
    };
    if (editPassword.trim()) {
      updatePayload.rawPassword = editPassword.trim();
    }

    const res = await updateUser(currentUser, currentUser.id, updatePayload);

    if (res.success) {
      const updated = {
        ...currentUser,
        name: editName.trim(),
        nip: editNip.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
      };
      if (onUpdateCurrentUser) onUpdateCurrentUser(updated);
      setProfileMsg({ type: 'success', text: editPassword.trim() ? 'Profil dan Password login berhasil diperbarui!' : 'Profil berhasil diperbarui!' });
      setEditPassword('');
      setTimeout(() => setProfileModalOpen(false), 900);
    } else {
      setProfileMsg({ type: 'error', text: res.message });
    }
    setIsSaving(false);
  };


  const navItems = getNavItemsForRole(currentUser.role);

  const roleMeta: Record<UserRole, { badge: string; color: string; desc: string }> = {
    kepala_sekolah: {
      badge: 'Kepala Sekolah',
      color: 'bg-emerald-600 text-white',
      desc: 'Super Admin - Otoritas Penuh & Database Wajah',
    },
    admin: {
      badge: 'Admin Operasional',
      color: 'bg-indigo-600 text-white',
      desc: 'Admin TU & Manajemen Karyawan',
    },
    karyawan: {
      badge: 'Karyawan / Tendik',
      color: 'bg-amber-600 text-white',
      desc: 'Staf & Tenaga Pendidik',
    },
  };

  const meta = roleMeta[currentUser.role];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 font-sans antialiased">
      {/* Top Application Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo & App Name */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
                className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                aria-label="Toggle Menu"
              >
                {mobileDrawerOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectMenu('dashboard');
                }}
                className="flex items-center gap-2.5 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                      {settings.appTitle || 'KITARAJIN'}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 hidden sm:block truncate max-w-[220px] md:max-w-[320px]">
                    {settings.schoolName || 'Presensi Wajah & GPS'}
                  </p>
                </div>
              </button>
            </div>

            {/* Right Controls: Cloud Sync Badge, PWA Install Button & Current User Info & Logout */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Multi-Device Real-Time Cloud Sync Badge */}
              <div
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold shadow-2xs"
                title="Database Cloud Firestore aktif untuk sinkronisasi multi-device real-time (siap deploy ke Vercel dan dibagikan ke banyak pengguna)"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Multi-Device Sync</span>
              </div>

              <PWAInstallButton variant="header" />

              {/* User Profile Summary - Clickable to edit Name & Email */}
              <div className="flex items-center gap-3 pl-2 sm:pl-3 border-l border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setEditName(currentUser.name);
                    setEditEmail(currentUser.email || '');
                    setEditPhone(currentUser.phone || '');
                    setProfileMsg(null);
                    setProfileModalOpen(true);
                  }}
                  className="flex items-center gap-2.5 text-right hover:opacity-85 transition-opacity cursor-pointer group"
                  title="Klik untuk ubah nama & email profil Anda"
                >
                  <div className="text-right hidden sm:block">
                    <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight group-hover:text-emerald-700 transition-colors flex items-center justify-end gap-1">
                      <span>{currentUser.name}</span>
                      <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-emerald-600" />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${meta.color}`}
                      >
                        {meta.badge}
                      </span>
                    </div>
                  </div>

                  <div
                    className="w-9 h-9 rounded-full bg-emerald-100 border-2 border-emerald-500 text-emerald-800 flex items-center justify-center font-bold text-xs shadow-2xs group-hover:ring-2 group-hover:ring-emerald-400 transition-all"
                    title={`${currentUser.name} (${currentUser.role})`}
                  >
                    {currentUser.role === 'kepala_sekolah'
                      ? 'KS'
                      : currentUser.role === 'admin'
                      ? 'AD'
                      : 'KR'}
                  </div>
                </button>

                {/* Logout Button */}
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Keluar (Logout)"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-20 max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain scroll-touch custom-scrollbar bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between">
            <div>
              <div className="mb-3 pb-3 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-xs z-10 -mt-1 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Menu Akses {meta.badge}
                </span>
                <p className="text-xs text-slate-500 mt-0.5">{meta.desc}</p>
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const IconComponent = ICON_MAP[item.iconName] || LayoutDashboard;
                  const isActive = activeMenuId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectMenu(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 font-semibold'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <IconComponent
                          className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                            item.badge.includes('Khusus')
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Attendance Rule Card */}
            <div className="mt-5 pt-2">
              <div className="p-3.5 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent rounded-xl border border-emerald-500/20">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Aturan Semua Pengguna</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  Kepala Sekolah, Admin, dan Karyawan <strong>semuanya wajib</strong> melakukan
                  presensi dengan verifikasi wajah & lokasi GPS.
                </p>
              </div>
            </div>
          </div>
        </aside>


        {/* Main Content Area */}
        <main className="flex-1 min-w-0 pb-6">{children}</main>
      </div>


      {/* Mobile Drawer (Left Navigation with high-performance responsive scrolling) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setMobileDrawerOpen(false)}
          />

          <div className="relative w-80 max-w-[85vw] bg-white h-[100dvh] max-h-[100dvh] shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-left duration-200 z-10">
            {/* Pinned Top Header */}
            <div className="p-4 pb-3 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-extrabold text-slate-900 text-sm block truncate max-w-[170px]">
                      {settings.appTitle || 'Menu Navigasi'}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate max-w-[170px] font-medium">
                      {settings.schoolName || 'KITARAJIN Presensi'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  aria-label="Tutup Menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Card */}
              <div className="mt-3 py-2 px-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{currentUser.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">NIP: {currentUser.nip}</div>
                </div>
                <span className={`inline-block shrink-0 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${meta.color}`}>
                  {meta.badge}
                </span>
              </div>
            </div>

            {/* Scrollable Nav Items with Touch Inertia & Responsive Scroll */}
            <div className="flex-1 overflow-y-auto overscroll-contain scroll-touch custom-scrollbar p-4 py-2 space-y-1">
              <PWAInstallButton variant="drawer" className="mb-2" />

              {navItems.map((item) => {
                const IconComponent = ICON_MAP[item.iconName] || LayoutDashboard;
                const isActive = activeMenuId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectMenu(item.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer active:scale-[0.98] ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100/80 active:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <IconComponent
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Pinned Bottom Logout Area with iOS safe area handling */}
            <div className="p-4 pt-3 border-t border-slate-100 bg-slate-50/80 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onLogout();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors active:scale-[0.98]"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar dari Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Modal Cepat Ubah Profil (Nama & Email & Password) */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Ubah Profil {meta.badge}
                  </h3>
                  <p className="text-[11px] text-slate-500">Perbarui Nama Lengkap, Email, dan Password Login</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {profileMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  profileMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nama Lengkap"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  NIP / Nomor Identitas Pegawai <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={editNip}
                    onChange={(e) => setEditNip(e.target.value)}
                    placeholder="NIP / ID Pegawai"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Alamat Email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="nama@sekolah.sch.id"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nomor Telepon / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Ganti Password Login (Opsional)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Minimal 6 karakter jika ingin ubah..."
                    className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                    tabIndex={-1}
                    title={showEditPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Kosongkan bila tidak ingin mengganti password login saat ini.
                </span>
              </div>


              <div className="flex items-center justify-between pt-2">
                {currentUser.role === 'kepala_sekolah' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileModalOpen(false);
                      onSelectMenu('pengaturan');
                    }}
                    className="text-[11px] text-emerald-700 hover:underline font-semibold"
                  >
                    Buka Pengaturan Lengkap
                  </button>
                ) : <span />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProfileModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
