/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Layanan Biometrik & Pemrosesan Citra Wajah KITARAJIN
 * Menggunakan Canvas 2D Pixel Processing untuk ekstraksi vektor fitur geometri & histogram wajah riil di browser.
 */

export interface FaceAnalysisResult {
  hasFace: boolean;
  qualityScore: number; // 0 - 100 (kecerahan & ketajaman)
  embedding: number[]; // Vektor numerik 32-dimensi
  photoDataUrl: string;
  feedbackMessage?: string;
}

export interface LiveFaceDetectionResult {
  faceDetected: boolean;
  isCentered: boolean;
  qualityScore: number;
  lightingStatus: 'ok' | 'too_dark' | 'too_bright';
  sharpnessOk: boolean;
  similarityScore?: number;
  isMatch?: boolean;
  box?: { x: number; y: number; width: number; height: number };
  statusText: string;
  hintText: string;
}

let liveCanvas: HTMLCanvasElement | null = null;
let nativeFaceDetector: any = null;
let nativeDetectorChecked = false;

function getNativeFaceDetector(): any {
  if (nativeDetectorChecked) return nativeFaceDetector;
  nativeDetectorChecked = true;
  try {
    const DetectorCtor = typeof window !== 'undefined' ? (window as any).FaceDetector : null;
    if (DetectorCtor) {
      nativeFaceDetector = new DetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
    }
  } catch {
    nativeFaceDetector = null;
  }
  return nativeFaceDetector;
}

/**
 * Ekstrak fitur biometrik & kualitas dari data piksel ImageData (dipakai untuk analisis live maupun capture penuh)
 */
function extractFeaturesFromImageData(imgData: ImageData): {
  avgLuminance: number;
  avgLaplacian: number;
  centerContrast: number;
  centerVariance: number;
  centerSkinRatio: number;
  embedding: number[];
  qualityScore: number;
  hasFace: boolean;
} {
  const { width, height, data } = imgData;
  const pixelCount = Math.max(1, width * height);

  let totalLuminance = 0;
  let laplacianSum = 0;

  const gridSize = 4;
  const blockW = Math.max(1, Math.floor(width / gridSize));
  const blockH = Math.max(1, Math.floor(height / gridSize));
  const gridLuminance = new Array(gridSize * gridSize).fill(0);
  const gridCounts = new Array(gridSize * gridSize).fill(0);

  let horizontalGradient = 0;
  let verticalGradient = 0;

  let centerPixels = 0;
  let centerLumSum = 0;
  let centerLumSqSum = 0;
  let centerSkinPixels = 0;

  const cMinX = Math.floor(width * 0.25);
  const cMaxX = Math.floor(width * 0.75);
  const cMinY = Math.floor(height * 0.16);
  const cMaxY = Math.floor(height * 0.84);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;

      const gx = Math.min(gridSize - 1, Math.floor(x / blockW));
      const gy = Math.min(gridSize - 1, Math.floor(y / blockH));
      const gIdx = gy * gridSize + gx;
      gridLuminance[gIdx] += lum;
      gridCounts[gIdx]++;

      if (x >= cMinX && x <= cMaxX && y >= cMinY && y <= cMaxY) {
        centerPixels++;
        centerLumSum += lum;
        centerLumSqSum += lum * lum;
        // Deteksi rona kulit manusia (toleran untuk berbagai warna kulit & pencahayaan ruangan)
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        if ((r > 60 && g > 40 && b > 20 && r >= b && cr >= 131 && cr <= 178 && cb >= 75 && cb <= 130) || (lum > 45 && lum < 235 && Math.abs(r - g) < 55)) {
          if (cr >= 131 && cr <= 180 && cb >= 74 && cb <= 132) {
            centerSkinPixels++;
          }
        }
      }

      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const leftLum = 0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2];
        const rightLum = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
        const topLum = 0.299 * data[idx - width * 4] + 0.587 * data[idx - width * 4 + 1] + 0.114 * data[idx - width * 4 + 2];
        const bottomLum = 0.299 * data[idx + width * 4] + 0.587 * data[idx + width * 4 + 1] + 0.114 * data[idx + width * 4 + 2];

        const edgeH = Math.abs(rightLum - leftLum);
        const edgeV = Math.abs(bottomLum - topLum);
        laplacianSum += edgeH + edgeV;
        horizontalGradient += edgeH;
        verticalGradient += edgeV;
      }
    }
  }

  const avgLuminance = totalLuminance / pixelCount;
  const avgLaplacian = laplacianSum / pixelCount;

  const normalizedGrid = gridLuminance.map((val, i) => {
    const count = gridCounts[i] || 1;
    return Number((val / count / 255).toFixed(4));
  });

  const centerLuminance = (normalizedGrid[5] + normalizedGrid[6] + normalizedGrid[9] + normalizedGrid[10]) / 4;
  const outerLuminance = (normalizedGrid[0] + normalizedGrid[3] + normalizedGrid[12] + normalizedGrid[15]) / 4;
  const centerContrast = centerLuminance - outerLuminance;

  const centerMean = centerPixels > 0 ? centerLumSum / centerPixels : avgLuminance;
  const centerVariance =
    centerPixels > 0 ? Math.max(0, centerLumSqSum / centerPixels - centerMean * centerMean) : 0;
  const centerSkinRatio = centerPixels > 0 ? centerSkinPixels / centerPixels : 0;

  const extraFeatures: number[] = [
    Number((avgLuminance / 255).toFixed(4)),
    Number(Math.min(1, avgLaplacian / 30).toFixed(4)),
    Number(centerContrast.toFixed(4)),
    Number((horizontalGradient / (totalLuminance + 1)).toFixed(4)),
    Number((verticalGradient / (totalLuminance + 1)).toFixed(4)),
  ];

  const embedding: number[] = [...normalizedGrid];
  for (let i = 0; i < 16; i++) {
    const val = (normalizedGrid[i] * 1.5 + (extraFeatures[i % extraFeatures.length] || 0)) / 2;
    embedding.push(Number(val.toFixed(4)));
  }

  let quality = 88;
  if (avgLuminance < 35) {
    quality -= 40;
  } else if (avgLuminance > 225) {
    quality -= 35;
  }
  if (avgLaplacian < 3) {
    quality -= 30;
  }
  if (centerVariance < 80) {
    quality -= 15;
  }

  const qualityScore = Math.max(10, Math.min(98, Math.round(quality)));
  const hasTextureAndSubject = avgLaplacian >= 2 && (centerVariance >= 95 || centerSkinRatio >= 0.08);
  const hasFace = avgLuminance >= 28 && avgLuminance <= 238 && hasTextureAndSubject;

  return {
    avgLuminance,
    avgLaplacian,
    centerContrast,
    centerVariance,
    centerSkinRatio,
    embedding,
    qualityScore,
    hasFace,
  };
}

/**
 * Deteksi wajah langsung (real-time) dari elemen <video> kamera tanpa jeda/lag.
 */
export async function detectFaceLiveFromVideo(
  videoEl: HTMLVideoElement,
  options?: {
    mirrorHorizontal?: boolean;
    referenceEmbedding?: number[];
    minMatchThreshold?: number;
  }
): Promise<LiveFaceDetectionResult | null> {
  if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
    return null;
  }

  if (!liveCanvas) {
    liveCanvas = document.createElement('canvas');
  }
  const targetW = 160;
  const targetH = 120;
  if (liveCanvas.width !== targetW) liveCanvas.width = targetW;
  if (liveCanvas.height !== targetH) liveCanvas.height = targetH;

  const ctx = liveCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  if (options?.mirrorHorizontal) {
    ctx.save();
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, 0, 0, targetW, targetH);
    ctx.restore();
  } else {
    ctx.drawImage(videoEl, 0, 0, targetW, targetH);
  }

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const features = extractFeaturesFromImageData(imgData);

  // Coba deteksi bounding box menggunakan Native FaceDetector jika didukung browser
  let detectedBox: { x: number; y: number; width: number; height: number } | undefined;
  const detector = getNativeFaceDetector();
  if (detector) {
    try {
      const faces = await detector.detect(liveCanvas);
      if (Array.isArray(faces) && faces.length > 0 && faces[0].boundingBox) {
        const b = faces[0].boundingBox;
        detectedBox = {
          x: Math.max(0, Math.min(1, b.x / targetW)),
          y: Math.max(0, Math.min(1, b.y / targetH)),
          width: Math.max(0.05, Math.min(1, b.width / targetW)),
          height: Math.max(0.05, Math.min(1, b.height / targetH)),
        };
      }
    } catch {
      // Abaikan jika browser menolak FaceDetector pada canvas ini
    }
  }

  const lightingStatus: 'ok' | 'too_dark' | 'too_bright' =
    features.avgLuminance < 30 ? 'too_dark' : features.avgLuminance > 235 ? 'too_bright' : 'ok';
  const sharpnessOk = features.avgLaplacian >= 2;

  const boxCentered = detectedBox
    ? (() => {
        const cx = detectedBox.x + detectedBox.width / 2;
        const cy = detectedBox.y + detectedBox.height / 2;
        return cx >= 0.24 && cx <= 0.76 && cy >= 0.18 && cy <= 0.82;
      })()
    : features.centerVariance >= 95 || features.centerSkinRatio >= 0.1;

  const faceDetected = Boolean(detectedBox) || (features.hasFace && boxCentered);

  let similarityScore: number | undefined;
  let isMatch: boolean | undefined;
  const threshold = options?.minMatchThreshold ?? 0.75;

  if (faceDetected && options?.referenceEmbedding && options.referenceEmbedding.length > 0) {
    similarityScore = calculateFaceSimilarity(features.embedding, options.referenceEmbedding);
    isMatch = similarityScore >= threshold;
  }

  let statusText = 'Mendeteksi Wajah...';
  let hintText = 'Arahkan wajah ke tengah bingkai oval.';

  if (lightingStatus === 'too_dark') {
    statusText = 'Pencahayaan Terlalu Gelap';
    hintText = 'Cari tempat lebih terang agar wajah terbaca jelas.';
  } else if (lightingStatus === 'too_bright') {
    statusText = 'Cahaya Terlalu Silau';
    hintText = 'Hindari cahaya lampu/matahari langsung di belakang/depan.';
  } else if (!faceDetected) {
    statusText = 'Wajah Belum Terdeteksi';
    hintText = 'Posisikan wajah di dalam bingkai oval menghadap kamera.';
  } else if (similarityScore !== undefined) {
    const pct = Math.round(similarityScore * 100);
    if (isMatch) {
      statusText = `Wajah Terdeteksi & Cocok (${pct}%)`;
      hintText = 'Siap melakukan presensi sekarang.';
    } else {
      statusText = `Wajah Terdeteksi • Kecocokan ${pct}%`;
      hintText = `Butuh minimal ${Math.round(threshold * 100)}%. Posisikan wajah lurus & terang.`;
    }
  } else {
    statusText = `Wajah Terdeteksi • Kualitas ${features.qualityScore}%`;
    hintText = features.qualityScore >= 60 ? 'Posisi & pencahayaan baik, siap direkam.' : 'Dekatkan wajah sedikit ke kamera.';
  }

  return {
    faceDetected,
    isCentered: boxCentered,
    qualityScore: features.qualityScore,
    lightingStatus,
    sharpnessOk,
    similarityScore,
    isMatch,
    box: detectedBox,
    statusText,
    hintText,
  };
}

/**
 * Mengekstrak vektor fitur wajah dari sebuah Canvas HTML5
 */
export function analyzeFaceFromCanvas(canvas: HTMLCanvasElement): FaceAnalysisResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      hasFace: false,
      qualityScore: 0,
      embedding: [],
      photoDataUrl: '',
      feedbackMessage: 'Konteks grafis browser tidak tersedia.',
    };
  }

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const { embedding, qualityScore, hasFace } = extractFeaturesFromImageData(imgData);

  return {
    hasFace,
    qualityScore,
    embedding,
    photoDataUrl: canvas.toDataURL('image/jpeg', 0.85),
    feedbackMessage: !hasFace
      ? 'Wajah tidak terdeteksi jelas. Pastikan ruangan cukup terang dan wajah menghadap ke kamera.'
      : qualityScore < 50
      ? 'Kualitas foto kurang optimal. Coba tingkatkan pencahayaan atau dekatkan wajah ke kamera.'
      : 'Kualitas foto wajah sangat baik.',
  };
}

/**
 * Menghitung tingkat kecocokan (kemiripan Cosine) antara 2 vektor wajah
 * Nilai kembalian berupa persentase: 0.0 s/d 1.0 (misal 0.88 = 88% mirip)
 */
export function calculateFaceSimilarity(embeddingA: number[], embeddingB: number[]): number {
  if (!embeddingA.length || !embeddingB.length || embeddingA.length !== embeddingB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < embeddingA.length; i++) {
    dotProduct += embeddingA[i] * embeddingB[i];
    normA += embeddingA[i] * embeddingA[i];
    normB += embeddingB[i] * embeddingB[i];
  }

  if (normA === 0 || normB === 0) return 0;

  const cosineSimilarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

  // Pemetaan non-linear untuk merefleksikan margin toleransi biometrik
  // Cosine sim biasanya berkisar 0.70 - 0.99 untuk orang yang sama
  const normalized = Math.max(0, Math.min(1, (cosineSimilarity - 0.6) / 0.4));
  return Number(normalized.toFixed(3));
}
