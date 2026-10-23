/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, Smartphone, Share2, PlusSquare, X, CheckCircle } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'header' | 'drawer' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'header',
}) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    showIOSInstructions,
    setShowIOSInstructions,
    promptInstall,
  } = usePWAInstall();

  if (isInstalled) {
    if (variant === 'drawer') {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>Aplikasi Terpasang (PWA)</span>
        </div>
      );
    }
    return null;
  }

  // If not installable yet on desktop/android (no beforeinstallprompt fired) and not iOS, don't show button in header unless forced
  if (!isInstallable && !isIOS && variant === 'header') {
    return null;
  }

  const handleInstallClick = () => {
    promptInstall();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer ${
          variant === 'header'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 hover:shadow-emerald-500/20 animate-pulse'
            : variant === 'drawer'
            ? 'w-full justify-center bg-emerald-600 text-white hover:bg-emerald-700 py-2.5'
            : 'bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2'
        } ${className}`}
        title="Pasang KITARAJIN sebagai aplikasi di perangkat Anda (Desktop, Android & iOS)"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install Aplikasi</span>
      </button>

      {/* iOS Safari Installation Instructions Modal */}
      {showIOSInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                <span>Pasang di Perangkat iOS / Safari</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSInstructions(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Untuk menginstal aplikasi <strong className="text-slate-900 font-bold">KITARAJIN</strong> di iPhone / iPad tanpa App Store:
            </p>

            <ol className="space-y-3 text-xs text-slate-700">
              <li className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </div>
                <div>
                  Ketuk tombol <strong className="text-slate-900 font-semibold">Bagikan (Share)</strong> <Share2 className="w-3.5 h-3.5 inline text-blue-600 mx-1" /> di bilah bawah peramban Safari.
                </div>
              </li>

              <li className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </div>
                <div>
                  Gulir ke bawah dan pilih opsi <strong className="text-slate-900 font-semibold">"Tambah ke Layar Utama" (Add to Home Screen)</strong> <PlusSquare className="w-3.5 h-3.5 inline text-slate-700 mx-1" />.
                </div>
              </li>

              <li className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </div>
                <div>
                  Ketuk <strong className="text-slate-900 font-semibold">"Tambah" (Add)</strong> di sudut kanan atas. Ikon KITARAJIN akan langsung terpasang di layar utama HP Anda.
                </div>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSInstructions(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
