/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
  Compass,
  Navigation,
  Sparkles,
  RefreshCw,
  Info,
} from 'lucide-react';
import { LocationConfig, User } from '../../types';
import {
  getAllLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../../services/storage';

interface LocationManagerProps {
  currentUser: User;
}

// Rumus Haversine untuk menghitung jarak nyata antara 2 koordinat (dalam meter)
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Radius bumi dalam meter
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export const LocationManager: React.FC<LocationManagerProps> = ({ currentUser }) => {
  const [locations, setLocations] = useState<LocationConfig[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Live device GPS state for testing geofence
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationConfig | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formLat, setFormLat] = useState<string>('-6.2088');
  const [formLng, setFormLng] = useState<string>('106.8456');
  const [formRadius, setFormRadius] = useState<number>(50);
  const [formAddress, setFormAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = () => {
    setLocations(getAllLocations());
  };

  useEffect(() => {
    loadData();
    detectDeviceLocation(false);
  }, []);

  if (currentUser.role !== 'kepala_sekolah') {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center max-w-lg mx-auto text-rose-800 space-y-3 my-8">
        <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
        <h2 className="text-lg font-bold">Wewenang Khusus Kepala Sekolah</h2>
        <p className="text-xs text-rose-700 leading-relaxed">
          Admin dan pengguna lainnya tidak diperkenankan mengatur titik lokasi koordinat maupun radius presensi sekolah. Pengaturan ini sepenuhnya berada di bawah otoritas Kepala Sekolah.
        </p>
      </div>
    );
  }

  const detectDeviceLocation = (applyToForm: boolean = false) => {
    if (!('geolocation' in navigator)) {
      setGpsError('Browser tidak mendukung Geolocation GPS.');
      return;
    }

    setIsDetectingGps(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setDeviceCoords({ lat: latitude, lng: longitude, accuracy });
        setIsDetectingGps(false);

        if (applyToForm) {
          setFormLat(latitude.toFixed(6));
          setFormLng(longitude.toFixed(6));
          setFeedback({
            type: 'success',
            message: `Koordinat GPS berhasil dideteksi: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (Akurasi: ±${Math.round(accuracy)}m).`,
          });
        }
      },
      (error) => {
        setIsDetectingGps(false);
        let msg = 'Gagal mendeteksi lokasi GPS.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Izin lokasi GPS ditolak oleh browser/pengguna. Silakan izinkan akses lokasi.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Informasi lokasi GPS tidak tersedia saat ini.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Waktu permintaan GPS habis. Coba ulangi kembali.';
        }
        setGpsError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  const openCreateModal = () => {
    setEditingLocation(null);
    setFormName('');
    if (deviceCoords) {
      setFormLat(deviceCoords.lat.toFixed(6));
      setFormLng(deviceCoords.lng.toFixed(6));
    } else {
      setFormLat('-6.2088');
      setFormLng('106.8456');
    }
    setFormRadius(50);
    setFormAddress('');
    setFeedback(null);
    setIsModalOpen(true);
  };

  const openEditModal = (loc: LocationConfig) => {
    setEditingLocation(loc);
    setFormName(loc.name);
    setFormLat(loc.latitude.toString());
    setFormLng(loc.longitude.toString());
    setFormRadius(loc.radiusMeters);
    setFormAddress(loc.address);
    setFeedback(null);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formAddress.trim()) {
      setFeedback({ type: 'error', message: 'Nama titik lokasi dan alamat wajib diisi.' });
      return;
    }

    const latNum = parseFloat(formLat);
    const lngNum = parseFloat(formLng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      setFeedback({ type: 'error', message: 'Koordinat Latitude dan Longitude harus berupa angka yang valid.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    if (editingLocation) {
      const res = updateLocation(currentUser, editingLocation.id, {
        name: formName,
        latitude: latNum,
        longitude: lngNum,
        radiusMeters: Number(formRadius),
        address: formAddress,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setIsModalOpen(false);
        loadData();
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } else {
      const res = createLocation(currentUser, {
        name: formName,
        latitude: latNum,
        longitude: lngNum,
        radiusMeters: Number(formRadius),
        address: formAddress,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setIsModalOpen(false);
        loadData();
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    }

    setIsSubmitting(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus titik lokasi "${name}"?`)) {
      const res = deleteLocation(currentUser, id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        loadData();
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    }
  };

  const handleToggleActive = (loc: LocationConfig) => {
    const res = updateLocation(currentUser, loc.id, { isActive: !loc.isActive });
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <MapPin className="w-4 h-4" />
            <span>Master Data &bull; Geofence Presensi Sekolah</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Titik Lokasi Presensi & Radius GPS
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Tentukan koordinat presensi sekolah dan jarak toleransi radius dalam meter.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Titik Presensi</span>
        </button>
      </div>

      {/* Feedback Message */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Real-time GPS Tester & Live Geolocation Status Card */}
      <div className="bg-gradient-to-br from-slate-900 to-emerald-950 text-white rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
              <Navigation className="w-3.5 h-3.5 animate-pulse" />
              <span>Status Sensor GPS Perangkat Anda</span>
            </div>
            <h2 className="text-lg font-bold">Kalkulasi Jarak Geodesik Haversine Nyata</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5 max-w-xl">
              Sistem menggunakan rumus Haversine untuk menguji jarak perangkat pengguna ke titik lokasi
              sekolah dengan presisi tinggi.
            </p>
          </div>

          <button
            type="button"
            onClick={() => detectDeviceLocation(false)}
            disabled={isDetectingGps}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 self-start md:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isDetectingGps ? 'animate-spin' : ''}`} />
            <span>{isDetectingGps ? 'Mendeteksi GPS...' : 'Uji Posisi GPS Saya'}</span>
          </button>
        </div>

        {/* GPS Result details */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-4 text-xs">
          {deviceCoords ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3 py-1.5 rounded-xl bg-white/10 font-mono">
                Lat: <span className="text-emerald-400 font-bold">{deviceCoords.lat.toFixed(6)}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/10 font-mono">
                Lng: <span className="text-emerald-400 font-bold">{deviceCoords.lng.toFixed(6)}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300">
                Akurasi Sensor: &plusmn;{Math.round(deviceCoords.accuracy)} meter
              </div>
            </div>
          ) : gpsError ? (
            <div className="text-rose-300 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              <span>{gpsError}</span>
            </div>
          ) : (
            <span className="text-slate-400">Klik "Uji Posisi GPS Saya" untuk membaca koordinat aktif perangkat.</span>
          )}
        </div>
      </div>

      {/* Locations Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {locations.map((loc) => {
          // Hitung jarak jika koordinat perangkat tersedia
          const currentDistance = deviceCoords
            ? calculateHaversineDistance(
                deviceCoords.lat,
                deviceCoords.lng,
                loc.latitude,
                loc.longitude
              )
            : null;

          const isInsideRadius = currentDistance !== null && currentDistance <= loc.radiusMeters;

          return (
            <div
              key={loc.id}
              className={`bg-white rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                loc.isActive ? 'border-slate-200/80 hover:border-emerald-300' : 'border-slate-200 bg-slate-50 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">{loc.name}</h3>
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.2 rounded-full ${
                          loc.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {loc.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(loc)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                      title="Edit Lokasi"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(loc)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                      title={loc.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      <Compass className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(loc.id, loc.name)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 transition-colors"
                      title="Hapus Lokasi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 mt-2 font-medium">{loc.address}</p>

                {/* Coordinates & Radius Badges */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">
                      Koordinat Titik
                    </span>
                    <span className="text-slate-800 text-[11px] block mt-0.5">
                      {loc.latitude}, {loc.longitude}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                    <span className="text-[10px] text-emerald-700 uppercase font-sans font-bold block">
                      Radius Geofence
                    </span>
                    <span className="text-sm font-extrabold block mt-0.5">
                      {loc.radiusMeters} Meter
                    </span>
                  </div>
                </div>

                {/* Distance Evaluation Simulator */}
                {currentDistance !== null && (
                  <div
                    className={`mt-3 p-3 rounded-xl border text-xs flex items-center justify-between ${
                      isInsideRadius
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div>
                      <span className="font-semibold block">Jarak Perangkat Anda Sekarang:</span>
                      <span className="font-extrabold text-sm font-mono">{currentDistance} meter</span>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        isInsideRadius ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                      }`}
                    >
                      {isInsideRadius ? 'Di Dalam Radius (Valid)' : 'Di Luar Radius (Ditolak)'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => !isSubmitting && setIsModalOpen(false)}
          />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {editingLocation ? 'Edit Titik Presensi' : 'Tambah Titik Presensi Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nama Titik Lokasi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Gedung Kampus Utama"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Quick GPS Auto-Detect Button */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <span className="text-xs text-emerald-800 font-medium">
                  Sedang berada di lokasi sekolah?
                </span>
                <button
                  type="button"
                  onClick={() => detectDeviceLocation(true)}
                  disabled={isDetectingGps}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Ambil GPS Saya Sekarang</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Latitude <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formLat}
                    onChange={(e) => setFormLat(e.target.value)}
                    placeholder="-6.2088"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Longitude <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formLng}
                    onChange={(e) => setFormLng(e.target.value)}
                    placeholder="106.8456"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Radius Toleransi (Meter) <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    required
                    value={formRadius}
                    onChange={(e) => setFormRadius(Number(e.target.value))}
                    className="w-32 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">
                    Rekomendasi: <strong>30 - 100 meter</strong> untuk cakupan area sekolah.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Alamat Lengkap Titik Presensi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Jl. Pendidikan No. 45, Kompleks Akademika..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : editingLocation ? 'Perbarui' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
