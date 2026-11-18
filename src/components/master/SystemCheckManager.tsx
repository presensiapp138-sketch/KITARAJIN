/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  HardDrive,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Clock,
  Table2,
  Wrench,
  Copy,
  Check,
  Edit3,
} from 'lucide-react';
import { SheetRepairReport, SystemCheckResult, User } from '../../types';
import { repairSheetSync, runSystemCheck, updateSheetBinding } from '../../services/appsScriptSync';

interface SystemCheckManagerProps {
  currentUser: User;
  onNavigateToSettings?: () => void;
}

export const SystemCheckManager: React.FC<SystemCheckManagerProps> = ({
  currentUser,
  onNavigateToSettings,
}) => {
  const [result, setResult] = useState<SystemCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairReport, setRepairReport] = useState<SheetRepairReport | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedSheetId, setCopiedSheetId] = useState(false);
  const [showEditSheetId, setShowEditSheetId] = useState(false);
  const [newSheetIdInput, setNewSheetIdInput] = useState('');
  const [isSavingSheetId, setIsSavingSheetId] = useState(false);

  const performCheck = async () => {
    setIsChecking(true);
    try {
      const res = await runSystemCheck();
      setResult(res);
      if (res.spreadsheetId && !newSheetIdInput) {
        setNewSheetIdInput(res.spreadsheetId);
      }
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    performCheck();
  }, []);

  if (currentUser.role !== 'kepala_sekolah') {
    return null;
  }

  const handleCopySheetId = async () => {
    if (!result?.spreadsheetId) return;
    try {
      await navigator.clipboard.writeText(result.spreadsheetId);
      setCopiedSheetId(true);
      setTimeout(() => setCopiedSheetId(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRepairSheet = async () => {
    setIsRepairing(true);
    setActionMsg(null);
    setRepairReport(null);
    try {
      const res = await repairSheetSync({
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
      });
      if (res.ok) {
        setRepairReport(res.report || null);
        setActionMsg({
          type: 'success',
          text: res.report?.summary || 'Perbaikan ketidaksinkronan Sheet berhasil diselesaikan.',
        });
        await performCheck();
      } else {
        setActionMsg({
          type: 'error',
          text: res.error || 'Gagal memperbaiki ketidaksinkronan Sheet.',
        });
      }
    } finally {
      setIsRepairing(false);
    }
  };

  const handleSaveSheetBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newSheetIdInput.trim();
    if (!cleaned) {
      setActionMsg({ type: 'error', text: 'Masukkan ID Spreadsheet atau URL Google Sheets terlebih dahulu.' });
      return;
    }
    setIsSavingSheetId(true);
    setActionMsg(null);
    try {
      const res = await updateSheetBinding(cleaned, {
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
      });
      if (res.ok) {
        setShowEditSheetId(false);
        setActionMsg({
          type: 'success',
          text: `ID Sheet berhasil diperbarui ke "${res.sheetName || res.spreadsheetId}". Data langsung disinkronkan.`,
        });
        await performCheck();
      } else {
        setActionMsg({
          type: 'error',
          text: res.error || 'Gagal mengganti SPREADSHEET_ID.',
        });
      }
    } finally {
      setIsSavingSheetId(false);
    }
  };

  const hasMissingFrontend = (result?.missingFrontendFields?.length || 0) > 0;
  const hasMissingServer = (result?.missingScriptProperties?.length || 0) > 0;
  const syncIssues = result?.syncIssues || [];
  const hasSyncIssues = syncIssues.length > 0;
  const allHealthy =
    Boolean(result) &&
    result!.frontendConfigured &&
    result!.scriptReachable &&
    result!.authorized &&
    result!.sheetsConnected &&
    result!.driveConnected &&
    !hasMissingFrontend &&
    !hasMissingServer &&
    !hasSyncIssues;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
              <Activity className="w-3.5 h-3.5" />
              <span>Menu Kepala Sekolah &bull; Cek ID Sheet &amp; Perbaikan Sinkronisasi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Cek Sistem &amp; Sheet ID</h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Periksa ID Google Spreadsheet yang tertaut di Apps Script, diagnosa ketidaksinkronan 10 tab &amp; folder Google Drive, serta perbaiki struktur/relasi Sheet secara otomatis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRepairSheet}
              disabled={isRepairing || !result?.authorized}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Wrench className={`w-4 h-4 ${isRepairing ? 'animate-spin' : ''}`} />
              <span>{isRepairing ? 'Memperbaiki Sheet...' : 'Perbaiki Ketidaksinkronan Sheet'}</span>
            </button>

            <button
              type="button"
              onClick={performCheck}
              disabled={isChecking}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Menguji Koneksi...' : 'Uji Koneksi Sekarang'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifikasi Hasil Aksi Perbaikan / Ubah Sheet ID */}
      {actionMsg && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3 text-xs sm:text-sm ${
            actionMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 flex-1">
            <div className="font-bold">{actionMsg.text}</div>
            {repairReport && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px]">
                <div className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200">
                  Tab dibuat: <strong>{repairReport.tabsCreated.length}</strong>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200">
                  Kolom dilengkapi: <strong>{repairReport.headersAdded.length} tab</strong>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200">
                  ID / Meta diperbaiki: <strong>{repairReport.idsRepaired + repairReport.metadataNormalized}</strong>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200">
                  Foto / Relasi selaras: <strong>{repairReport.photosLinked + repairReport.crossRefsRepaired}</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ringkasan Status Utama */}
      {result && (
        <div
          className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            allHealthy
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {allHealthy ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="font-extrabold text-sm sm:text-base">
                {allHealthy
                  ? 'Google Sheets, Sheet ID & Google Drive Sehat dan Sinkron'
                  : 'Konfigurasi, Sheet ID, atau Sinkronisasi Memerlukan Perhatian'}
              </h2>
              <p className="text-xs mt-0.5 opacity-85">
                {result.error
                  ? result.error
                  : hasSyncIssues
                  ? `Ditemukan ${syncIssues.length} ketidaksinkronan di Google Sheets. Gunakan tombol "Perbaiki Ketidaksinkronan Sheet" untuk memperbaiki otomatis.`
                  : allHealthy
                  ? `Terhubung ke Spreadsheet "${result.sheetName}" (${result.latencyMs} ms). Sinkronisasi dua arah siap beroperasi.`
                  : 'Periksa daftar konfigurasi yang perlu dilengkapi di bawah ini.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs shrink-0 font-mono">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 border border-slate-200 text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {result.latencyMs} ms
            </span>
          </div>
        </div>
      )}

      {/* Diagnosa Ketidaksinkronan Sheet */}
      {hasSyncIssues && (
        <div className="bg-amber-50/80 border border-amber-300 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-950 font-extrabold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Ketidaksinkronan Terdeteksi pada Google Sheets ({syncIssues.length})</span>
            </div>
            <button
              type="button"
              onClick={handleRepairSheet}
              disabled={isRepairing}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Wrench className={`w-3.5 h-3.5 ${isRepairing ? 'animate-spin' : ''}`} />
              <span>{isRepairing ? 'Memperbaiki...' : 'Perbaiki Otomatis Sekarang'}</span>
            </button>
          </div>
          <ul className="list-disc list-inside text-xs text-amber-900 space-y-1">
            {syncIssues.map((issue, idx) => (
              <li key={`sync-issue-${idx}`}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 3 Kartu Status Koneksi + Cek ID Sheet */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Otorisasi & Endpoint Apps Script */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <KeyRound className="w-4 h-4 text-emerald-600" />
              <span>Endpoint &amp; Token</span>
            </div>
            {result?.authorized && result.scriptReachable ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-3 h-3" /> Valid
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                <XCircle className="w-3 h-3" /> Belum Siap
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 space-y-1.5">
            <div className="flex justify-between">
              <span>URL Web App:</span>
              <span className={`font-bold ${result?.frontendUrlPresent ? 'text-emerald-700' : 'text-rose-600'}`}>
                {result?.frontendUrlPresent ? 'Terisi (Terkunci)' : 'Masih Kosong'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>API Token Rahasia:</span>
              <span className={`font-bold ${result?.frontendTokenPresent ? 'text-emerald-700' : 'text-rose-600'}`}>
                {result?.frontendTokenPresent ? 'Terisi (Tersensor)' : 'Masih Kosong'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Verifikasi Server:</span>
              <span className={`font-bold ${result?.authorized ? 'text-emerald-700' : 'text-rose-600'}`}>
                {result?.authorized ? 'Diterima' : 'Ditolak / Belum Tes'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Koneksi Google Sheets & Cek SPREADSHEET_ID */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Google Sheets</span>
            </div>
            {result?.sheetsConnected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-3 h-3" /> Terhubung
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                <XCircle className="w-3 h-3" /> Terputus
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 space-y-1.5">
            <div className="flex justify-between gap-2">
              <span>Nama File:</span>
              <span className="font-bold text-slate-900 truncate max-w-[160px]">
                {result?.sheetName || '-'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>ID Sheet:</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="font-mono text-[11px] font-bold text-slate-900 truncate max-w-[130px]"
                  title={result?.spreadsheetId || ''}
                >
                  {result?.spreadsheetId || (result?.authorized ? '(Versi lama / kosong)' : '-')}
                </span>
                {result?.spreadsheetId && (
                  <button
                    type="button"
                    onClick={handleCopySheetId}
                    className="p-1 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
                    title="Salin ID Sheet"
                  >
                    {copiedSheetId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
                {result?.authorized && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewSheetIdInput(result?.spreadsheetId || '');
                      setShowEditSheetId((prev) => !prev);
                    }}
                    className="p-1 rounded-md hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                    title="Ubah SPREADSHEET_ID"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span>Jumlah Tab Skema:</span>
              <span className="font-bold text-slate-900">
                {result?.tabsStatus ? `${result.tabsStatus.filter((t) => t.exists).length} / 10 Tab` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Waktu Server WIB:</span>
              <span className="font-mono text-[11px] text-slate-700">
                {result?.serverTime
                  ? new Date(result.serverTime).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '-'}
              </span>
            </div>
          </div>

          {showEditSheetId && (
            <form onSubmit={handleSaveSheetBinding} className="pt-2 border-t border-slate-100 space-y-2">
              <label className="block text-[10px] font-bold uppercase text-slate-600">
                Tempel ID / URL Google Spreadsheet Baru:
              </label>
              <input
                type="text"
                value={newSheetIdInput}
                onChange={(e) => setNewSheetIdInput(e.target.value)}
                placeholder="1AbC... atau https://docs.google.com/spreadsheets/d/..."
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowEditSheetId(false)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingSheetId}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSavingSheetId ? 'Menautkan...' : 'Simpan ID Sheet'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* 3. Koneksi Google Drive (Foto Database Wajah) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <HardDrive className="w-4 h-4 text-emerald-600" />
              <span>Google Drive (Privat)</span>
            </div>
            {result?.driveConnected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-3 h-3" /> Terhubung
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                <XCircle className="w-3 h-3" /> Terputus
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 space-y-1.5">
            <div className="flex justify-between gap-2">
              <span>Nama Folder:</span>
              <span className="font-bold text-slate-900 truncate max-w-[160px]">
                {result?.driveFolderName || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Akses Folder:</span>
              <span className="font-bold text-emerald-700">Privat via DriveApp</span>
            </div>
            <div className="flex justify-between">
              <span>Endpoint Foto:</span>
              <span className="font-bold text-slate-800">Terlindungi Token</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bagian Konfigurasi Yang Masih Kosong (Hanya nama field, BUKAN token/password rahasia) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Pemeriksaan Konfigurasi Kosong
              </h3>
              <p className="text-[11px] text-slate-500">
                Memeriksa URL Web App, API Token, dan Script Properties tanpa menampilkan token rahasia.
              </p>
            </div>
          </div>

          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold cursor-pointer transition-colors"
            >
              Buka Pengaturan &amp; Sheets
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="font-bold text-slate-800">Konfigurasi Frontend (Aplikasi Web)</div>
            {hasMissingFrontend ? (
              <ul className="space-y-1 text-rose-700 font-semibold list-disc list-inside">
                {result!.missingFrontendFields.map((field) => (
                  <li key={field}>{field} — MASIH KOSONG</li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Tidak ada field frontend yang kosong.</span>
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="font-bold text-slate-800">Script Properties (Google Apps Script)</div>
            {!result?.authorized ? (
              <p className="text-slate-500 italic">
                Tidak dapat memeriksa Script Properties sebelum URL &amp; Token terhubung dan lolos otorisasi.
              </p>
            ) : hasMissingServer ? (
              <ul className="space-y-1 text-rose-700 font-semibold list-disc list-inside">
                {result!.missingScriptProperties.map((prop) => (
                  <li key={prop}>{prop} — MASIH KOSONG</li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Seluruh Script Properties (SPREADSHEET_ID, DRIVE_FOLDER_ID, API_TOKEN) sudah terisi.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status 10 Tab Google Sheets */}
      {result?.tabsStatus && result.tabsStatus.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Table2 className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Status Tab Spreadsheet Database Tunggal
              </h3>
              <p className="text-[11px] text-slate-500">
                Setiap baris memiliki ID unik di Kolom A, kolom <code className="font-mono">diubah_pada</code>, soft-delete <code className="font-mono">status</code>, dan semua mutasi tercatat otomatis ke tab <strong>Log</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {result.tabsStatus.map((tab) => (
              <div
                key={tab.name}
                className={`p-3 rounded-xl border text-xs ${
                  tab.exists
                    ? 'bg-emerald-50/50 border-emerald-200 text-slate-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-bold">
                  <span className="truncate">{tab.name}</span>
                  {tab.exists ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {tab.exists ? `${tab.rows} baris` : 'Otomatis dibuat saat perbaikan / tulis pertama'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
