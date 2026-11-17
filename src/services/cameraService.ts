/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CameraFacing = 'user' | 'environment';

export interface StartCameraResult {
  stream: MediaStream;
  activeFacing: CameraFacing;
  deviceLabel?: string;
}

/**
 * Terjemahkan error WebRTC getUserMedia ke pesan Bahasa Indonesia yang jelas dan actionable.
 */
export function formatCameraError(err: any): string {
  const name = String(err?.name || '');
  const message = String(err?.message || '').toLowerCase();

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Kamera membutuhkan koneksi aman (HTTPS). Pastikan alamat aplikasi menggunakan HTTPS.';
  }
  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    message.includes('permission denied') ||
    message.includes('not allowed')
  ) {
    return 'Izin akses kamera ditolak peramban. Klik ikon gembok/kamera di bilah alamat browser untuk mengizinkan kamera, lalu klik Coba Kamera Ulang.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Kamera tidak ditemukan atau belum terpasang pada perangkat ini.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || message.includes('could not start video source')) {
    return 'Kamera sedang digunakan aplikasi/tab lain atau masih terkunci. Tutup aplikasi kamera lain lalu klik Coba Kamera Ulang.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'Mode kamera yang dipilih tidak didukung perangkat ini. Coba ganti kamera atau klik Coba Kamera Ulang.';
  }
  return 'Gagal mengakses kamera perangkat. Pastikan izin kamera aktif lalu klik Coba Kamera Ulang.';
}

/**
 * Hentikan semua track kamera dengan aman dan lepaskan dari elemen video.
 */
export function stopCameraStream(
  stream: MediaStream | null | undefined,
  videoEl?: HTMLVideoElement | null
): void {
  if (stream) {
    try {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Abaian jika track sudah berhenti
        }
      });
    } catch {
      // Abaikan error pelepasan track
    }
  }
  if (videoEl) {
    try {
      videoEl.pause();
    } catch {
      // Abaikan
    }
    if (videoEl.srcObject) {
      videoEl.srcObject = null;
    }
  }
}

/**
 * Memilih device kamera yang paling sesuai (depan vs belakang) saat constraint facingMode gagal.
 */
async function findPreferredVideoDevice(facing: CameraFacing): Promise<MediaDeviceInfo | null> {
  if (!navigator.mediaDevices?.enumerateDevices) return null;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');
    if (videoInputs.length === 0) return null;

    const frontKeywords = ['front', 'user', 'facetime', 'integrated', 'webcam', 'hd camera', 'depan'];
    const backKeywords = ['back', 'rear', 'environment', 'belakang'];
    const targetKeywords = facing === 'user' ? frontKeywords : backKeywords;

    const matched = videoInputs.find((d) => {
      const label = (d.label || '').toLowerCase();
      return targetKeywords.some((kw) => label.includes(kw));
    });

    if (matched) return matched;
    if (facing === 'environment' && videoInputs.length > 1) {
      return videoInputs[videoInputs.length - 1];
    }
    return videoInputs[0];
  } catch {
    return null;
  }
}

/**
 * Buka stream kamera dengan fallback progresif agar tidak gagal pada perangkat laptop, Android, iOS, maupun iframe.
 */
export async function acquireCameraStream(facing: CameraFacing = 'user'): Promise<StartCameraResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      typeof window !== 'undefined' && !window.isSecureContext
        ? 'Kamera membutuhkan koneksi aman (HTTPS).'
        : 'Peramban tidak mendukung akses kamera (MediaDevices API tidak tersedia).'
    );
  }

  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    },
    {
      video: {
        facingMode: facing,
      },
      audio: false,
    },
  ];

  let lastError: any = null;

  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      const detectedFacing: CameraFacing =
        settings?.facingMode === 'environment' ? 'environment' : settings?.facingMode === 'user' ? 'user' : facing;
      return {
        stream,
        activeFacing: detectedFacing,
        deviceLabel: track?.label,
      };
    } catch (err: any) {
      lastError = err;
      // Jika izin eksplisit ditolak, jangan ulang dengan constraint lain agar tidak memicu dialog ganda
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        throw err;
      }
      // Jika device masih terkunci sesaat, beri jeda singkat sebelum fallback berikutnya
      if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  // Fallback spesifik berdasarkan deviceId jika facingMode ditolak driver/OS
  const preferredDevice = await findPreferredVideoDevice(facing);
  if (preferredDevice?.deviceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: preferredDevice.deviceId } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      return {
        stream,
        activeFacing: facing,
        deviceLabel: track?.label || preferredDevice.label,
      };
    } catch (err: any) {
      lastError = err;
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        throw err;
      }
    }
  }

  // Fallback paling umum: kamera video apapun yang tersedia
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    return {
      stream,
      activeFacing: facing,
      deviceLabel: track?.label,
    };
  } catch (err: any) {
    throw lastError || err;
  }
}

/**
 * Pasangkan MediaStream ke elemen <video> dan tunggu hingga frame video benar-benar siap (videoWidth > 0).
 */
export async function attachStreamToVideo(
  videoEl: HTMLVideoElement,
  stream: MediaStream,
  timeoutMs = 5000
): Promise<boolean> {
  videoEl.playsInline = true;
  videoEl.muted = true;
  videoEl.autoplay = true;

  if (videoEl.srcObject !== stream) {
    videoEl.srcObject = stream;
  }

  const waitReady = new Promise<boolean>((resolve) => {
    if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      resolve(true);
      return;
    }

    let settled = false;
    const cleanup = () => {
      videoEl.removeEventListener('loadedmetadata', onReady);
      videoEl.removeEventListener('loadeddata', onReady);
      videoEl.removeEventListener('canplay', onReady);
      clearTimeout(timer);
      clearInterval(poller);
    };

    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };

    const onReady = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        done(true);
      }
    };

    videoEl.addEventListener('loadedmetadata', onReady);
    videoEl.addEventListener('loadeddata', onReady);
    videoEl.addEventListener('canplay', onReady);

    const poller = setInterval(() => {
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        done(true);
      }
    }, 100);

    const timer = setTimeout(() => {
      done(videoEl.videoWidth > 0 && videoEl.videoHeight > 0);
    }, timeoutMs);
  });

  try {
    await videoEl.play();
  } catch (err: any) {
    // Abaikan AbortError karena swap srcObject yang cepat saat berpindah kamera/tab
    if (err?.name !== 'AbortError') {
      console.warn('Video play note:', err);
    }
  }

  return waitReady;
}

/**
 * Ambil 1 frame foto dari elemen <video> ke Canvas dengan orientasi mirror konsisten (untuk kamera depan).
 */
export function captureVideoFrameToCanvas(
  videoEl: HTMLVideoElement,
  mirrorHorizontal: boolean
): HTMLCanvasElement | null {
  if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  if (mirrorHorizontal) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  }

  return canvas;
}
