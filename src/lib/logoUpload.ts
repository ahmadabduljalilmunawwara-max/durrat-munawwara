export const MAX_IMAGE_FILE_BYTES = 1024 * 1024; // 1 MB
export const MIN_LOGO_WIDTH_PX = 600;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const TARGET_MAX_DATA_URL_LENGTH = 340_000; // Keeps logoUrl + sloganUrl comfortably inside 1 MiB Firestore doc

export interface ProcessedBrandingImage {
  dataUrl: string;
  width: number;
  height: number;
  hasTransparency: boolean;
  sizeBytes: number;
}

async function detectAllowedImageFormatFromHeader(file: File): Promise<'image/png' | 'image/jpeg' | 'image/webp' | null> {
  const lowerName = file.name.toLowerCase();
  if (file.type === 'image/svg+xml' || lowerName.endsWith('.svg')) {
    return null;
  }

  const headerBuf = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(headerBuf);
  if (bytes.length < 4) return null;

  // Reject XML/SVG text signatures disguised with another extension
  const asciiPrefix = String.fromCharCode(...bytes.slice(0, Math.min(12, bytes.length))).trimStart().toLowerCase();
  if (asciiPrefix.startsWith('<svg') || asciiPrefix.startsWith('<?xml')) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  if (ALLOWED_MIME_TYPES.has(file.type)) {
    return file.type as 'image/png' | 'image/jpeg' | 'image/webp';
  }

  return null;
}

export function analyzeDataUrlTransparency(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve(true);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.min(256, img.naturalWidth || 1);
        const h = Math.min(256, img.naturalHeight || 1);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(true);
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const pixels = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] < 250) {
            resolve(true);
            return;
          }
        }
        resolve(false);
      } catch {
        resolve(true);
      }
    };
    img.onerror = () => resolve(true);
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('تعذر قراءة ملف الصورة.'));
      }
    };
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('الملف لا يحتوي على صورة صالحة.'));
    img.src = src;
  });
}

export async function validateAndProcessBrandingImage(
  file: File,
  options: { label: string; minWidthPx?: number }
): Promise<ProcessedBrandingImage> {
  const minWidth = options.minWidthPx ?? MIN_LOGO_WIDTH_PX;
  const detectedMime = await detectAllowedImageFormatFromHeader(file);

  if (!detectedMime) {
    throw new Error(
      `صيغة ملف ${options.label} غير مدعومة. يُسمح فقط بصور PNG أو JPG أو WebP (ملفات SVG غير مسموح بها).`
    );
  }

  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error(`حجم صورة ${options.label} يتجاوز الحد الأقصى المسموح (1 ميجابايت).`);
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(originalDataUrl);
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  if (!width || !height) {
    throw new Error(`تعذر قراءة أبعاد صورة ${options.label}.`);
  }

  if (width < minWidth) {
    throw new Error(
      `عرض صورة ${options.label} (${width} بكسل) أقل من الحد الأدنى المطلوب (${minWidth} بكسل على الأقل) لضمان جودة الطباعة.`
    );
  }

  const hasTransparency =
    detectedMime === 'image/jpeg' ? false : await analyzeDataUrlTransparency(originalDataUrl);

  // If the original base64 data URL already fits comfortably under the Firestore budget, preserve it intact.
  if (originalDataUrl.length <= TARGET_MAX_DATA_URL_LENGTH) {
    return {
      dataUrl: originalDataUrl,
      width,
      height,
      hasTransparency,
      sizeBytes: file.size,
    };
  }

  // Re-encode inside a canvas preserving transparency (WebP supports alpha cleanly at small sizes)
  // while keeping width >= minWidth (600px).
  const targetWidth = Math.max(minWidth, Math.min(width, 960));
  const targetHeight = Math.max(1, Math.round((height / width) * targetWidth));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر معالجة الصورة في المتصفح.');
  }

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const exportMime = hasTransparency ? 'image/webp' : detectedMime === 'image/png' ? 'image/webp' : detectedMime;
  let optimized = '';
  for (const quality of [0.9, 0.82, 0.72, 0.62, 0.52]) {
    const candidate = canvas.toDataURL(exportMime, quality);
    optimized = candidate;
    if (candidate.startsWith(`data:${exportMime};base64,`) && candidate.length <= TARGET_MAX_DATA_URL_LENGTH) {
      break;
    }
  }

  if (!optimized || optimized.length > 420_000) {
    // Final fallback at exact 600px width
    const minCanvas = document.createElement('canvas');
    minCanvas.width = minWidth;
    minCanvas.height = Math.max(1, Math.round((height / width) * minWidth));
    const minCtx = minCanvas.getContext('2d');
    if (minCtx) {
      minCtx.clearRect(0, 0, minCanvas.width, minCanvas.height);
      minCtx.imageSmoothingEnabled = true;
      minCtx.imageSmoothingQuality = 'high';
      minCtx.drawImage(img, 0, 0, minCanvas.width, minCanvas.height);
      const webpFinal = minCanvas.toDataURL('image/webp', 0.8);
      if (webpFinal.startsWith('data:image/webp;base64,')) {
        optimized = webpFinal;
      } else {
        optimized = minCanvas.toDataURL('image/png');
      }
    }
  }

  if (!optimized || optimized.length > 450_000) {
    throw new Error(
      `حجم الصورة بعد الضغط ما زال كبيراً لتخزينه في الإعدادات. يُرجى استخدام صورة WebP أو PNG مضغوطة.`
    );
  }

  return {
    dataUrl: optimized,
    width,
    height,
    hasTransparency,
    sizeBytes: optimized.length,
  };
}
