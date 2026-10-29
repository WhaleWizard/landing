import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, Crop, Download, RefreshCw, X, ZoomIn,
} from 'lucide-react';
import { notify } from './AdminFeedback';

export interface CropperTargetFile {
  key: string;
  url: string;
  name: string;
  size: number;
}

interface MediaCropperModalProps {
  file: CropperTargetFile | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (croppedFile: File) => Promise<void>;
}

export type AspectRatioPreset = '16:9' | '1:1' | '4:5' | '9:16' | 'free';

interface PresetConfig {
  id: AspectRatioPreset;
  label: string;
  description: string;
  ratio: number | null; // width / height
  targetW: number;
  targetH: number;
}

const PRESETS: PresetConfig[] = [
  {
    id: '16:9',
    label: '16:9',
    description: 'Обложка статьи / Desktop',
    ratio: 16 / 9,
    targetW: 1200,
    targetH: 675,
  },
  {
    id: '1:1',
    label: '1:1',
    description: 'Квадрат (Посты / Meta Ads)',
    ratio: 1,
    targetW: 1080,
    targetH: 1080,
  },
  {
    id: '4:5',
    label: '4:5',
    description: 'Лента Instagram / Feed',
    ratio: 4 / 5,
    targetW: 1080,
    targetH: 1350,
  },
  {
    id: '9:16',
    label: '9:16',
    description: 'Stories / Reels',
    ratio: 9 / 16,
    targetW: 1080,
    targetH: 1920,
  },
  {
    id: 'free',
    label: 'Оригинал',
    description: 'Без изменения пропорций',
    ratio: null,
    targetW: 1200,
    targetH: 800,
  },
];

export default function MediaCropperModal({
  file,
  isOpen,
  onClose,
  onSave,
}: MediaCropperModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<AspectRatioPreset>('16:9');
  const [zoom, setZoom] = useState<number>(1.0);
  const [offsetX, setOffsetX] = useState<number>(50); // в процентах (0 = слева, 50 = центр, 100 = справа)
  const [offsetY, setOffsetY] = useState<number>(50); // в процентах (0 = верх, 50 = центр, 100 = низ)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [imageError, setImageError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  // Сброс параметров при открытии нового файла
  useEffect(() => {
    if (isOpen && file) {
      setZoom(1.0);
      setOffsetX(50);
      setOffsetY(50);
      setImageError(false);
      setNaturalSize(null);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        imageElementRef.current = img;
      };
      img.onerror = () => {
        setImageError(true);
      };
      img.src = file.url;
    }
  }, [isOpen, file]);

  // Перерисовка превью на Canvas при изменении параметров
  const redrawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageElementRef.current;
    if (!canvas || !img || !naturalSize) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentConfig = PRESETS.find((p) => p.id === selectedPreset) || PRESETS[0];

    // Вычисляем размеры кропа в координатах оригинального изображения
    let cropW: number;
    let cropH: number;

    if (currentConfig.ratio === null) {
      // Оригинальные пропорции
      cropW = naturalSize.w;
      cropH = naturalSize.h;
    } else {
      const targetRatio = currentConfig.ratio;
      const imgRatio = naturalSize.w / naturalSize.h;

      if (imgRatio > targetRatio) {
        // Изображение шире целевого: высота берется полностью, ширина подрезается
        cropH = naturalSize.h;
        cropW = naturalSize.h * targetRatio;
      } else {
        // Изображение уже целевого: ширина берется полностью, высота подрезается
        cropW = naturalSize.w;
        cropH = naturalSize.w / targetRatio;
      }
    }

    // Применяем зум (уменьшаем область захвата)
    const effectiveW = cropW / zoom;
    const effectiveH = cropH / zoom;

    // Вычисляем координаты левого верхнего угла с учетом смещения в %
    const maxStartX = Math.max(0, naturalSize.w - effectiveW);
    const maxStartY = Math.max(0, naturalSize.h - effectiveH);

    const startX = (offsetX / 100) * maxStartX;
    const startY = (offsetY / 100) * maxStartY;

    // Размеры холста
    const displayW = 360;
    const targetRatio = currentConfig.ratio || (naturalSize.w / naturalSize.h);
    const displayH = Math.round(displayW / targetRatio);

    canvas.width = displayW;
    canvas.height = displayH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      img,
      startX,
      startY,
      effectiveW,
      effectiveH,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }, [naturalSize, selectedPreset, zoom, offsetX, offsetY]);

  useEffect(() => {
    redrawPreview();
  }, [redrawPreview]);

  // Генерация Blob / File из Canvas с полным разрешением
  const createCroppedFile = async (): Promise<File | null> => {
    const img = imageElementRef.current;
    if (!img || !naturalSize || !file) return null;

    const currentConfig = PRESETS.find((p) => p.id === selectedPreset) || PRESETS[0];
    const targetW = currentConfig.targetW;
    const targetRatio = currentConfig.ratio || (naturalSize.w / naturalSize.h);
    const targetH = Math.round(targetW / targetRatio);

    // Внеэкранный полноразмерный холст для максимальной четкости
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = targetW;
    offscreenCanvas.height = targetH;
    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) return null;

    let cropW: number;
    let cropH: number;

    if (currentConfig.ratio === null) {
      cropW = naturalSize.w;
      cropH = naturalSize.h;
    } else {
      const imgRatio = naturalSize.w / naturalSize.h;
      if (imgRatio > targetRatio) {
        cropH = naturalSize.h;
        cropW = naturalSize.h * targetRatio;
      } else {
        cropW = naturalSize.w;
        cropH = naturalSize.w / targetRatio;
      }
    }

    const effectiveW = cropW / zoom;
    const effectiveH = cropH / zoom;
    const maxStartX = Math.max(0, naturalSize.w - effectiveW);
    const maxStartY = Math.max(0, naturalSize.h - effectiveH);
    const startX = (offsetX / 100) * maxStartX;
    const startY = (offsetY / 100) * maxStartY;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, startX, startY, effectiveW, effectiveH, 0, 0, targetW, targetH);

    return new Promise((resolve) => {
      offscreenCanvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          const presetTag = selectedPreset.replace(':', '-');
          const newFileName = `${baseName}_crop_${presetTag}.webp`;
          const croppedFile = new File([blob], newFileName, { type: 'image/webp' });
          resolve(croppedFile);
        },
        'image/webp',
        0.92
      );
    });
  };

  const handleSaveToMedia = async () => {
    setProcessing(true);
    try {
      const croppedFile = await createCroppedFile();
      if (!croppedFile) {
        throw new Error('Не удалось сгенерировать изображение');
      }

      await onSave(croppedFile);
      notify.success('Кадрированное изображение сохранено в медиатеку');
      onClose();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Ошибка при сохранении кропа');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = async () => {
    try {
      const croppedFile = await createCroppedFile();
      if (!croppedFile) return;

      const url = URL.createObjectURL(croppedFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = croppedFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify.success('Файл скачан на диск');
    } catch {
      notify.error('Не удалось скачать файл');
    }
  };

  if (!isOpen || !file) return null;

  const currentConfig = PRESETS.find((p) => p.id === selectedPreset) || PRESETS[0];

  return (
    <div
      className="admin-cropper-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Кадрирование изображения"
      onClick={onClose}
    >
      <div
        className="admin-cropper-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок модалки */}
        <div className="admin-cropper-header">
          <div className="admin-cropper-title-row">
            <Crop className="admin-cropper-icon text-blue-400" size={20} aria-hidden="true" />
            <div>
              <h3 className="admin-cropper-title">Кадрирование и форматы: {file.name}</h3>
              <p className="admin-cropper-subtitle">
                Генерация оптимизированных вариантов изображения под стандартные форматы рекламы и блога.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="admin-icon-button"
            onClick={onClose}
            aria-label="Закрыть кадрирование"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Тело модалки */}
        <div className="admin-cropper-body">
          {/* Левая колонка: Превью и видоискатель */}
          <div className="admin-cropper-preview-col">
            <div className="admin-cropper-canvas-frame">
              {imageError ? (
                <div className="admin-cropper-error">
                  Не удалось загрузить изображение для кадрирования (CORS или недоступный URL).
                </div>
              ) : (
                <div className="admin-cropper-canvas-wrapper">
                  <canvas ref={canvasRef} className="admin-cropper-canvas" />
                  {/* Сетка третей поверх Canvas */}
                  <div className="admin-cropper-grid-overlay" aria-hidden="true">
                    <div className="admin-cropper-grid-line admin-cropper-grid-line--v1" />
                    <div className="admin-cropper-grid-line admin-cropper-grid-line--v2" />
                    <div className="admin-cropper-grid-line admin-cropper-grid-line--h1" />
                    <div className="admin-cropper-grid-line admin-cropper-grid-line--h2" />
                  </div>
                </div>
              )}
            </div>

            {/* Метрики разрешения */}
            <div className="admin-cropper-meta-bar">
              <span>
                Оригинал: <strong>{naturalSize ? `${naturalSize.w} × ${naturalSize.h} px` : '—'}</strong>
              </span>
              <span>
                Итоговый кроп: <strong>{currentConfig.targetW} × {Math.round(currentConfig.targetW / (currentConfig.ratio || 1.5))} px</strong>
              </span>
              <span>
                Формат: <strong>WebP (92%)</strong>
              </span>
            </div>
          </div>

          {/* Правая колонка: Настройки пропорций и позиционирования */}
          <div className="admin-cropper-controls-col">
            {/* Пресеты пропорций */}
            <div className="admin-cropper-section">
              <label className="admin-cropper-section-label">Целевой формат (Aspect Ratio):</label>
              <div className="admin-cropper-presets-grid">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`admin-cropper-preset-btn ${selectedPreset === p.id ? 'admin-cropper-preset-btn--active' : ''}`}
                    onClick={() => setSelectedPreset(p.id)}
                  >
                    <span className="admin-cropper-preset-ratio">{p.label}</span>
                    <span className="admin-cropper-preset-desc">{p.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Зум / Масштабирование */}
            <div className="admin-cropper-section">
              <div className="admin-cropper-slider-header">
                <span className="admin-cropper-slider-label">
                  <ZoomIn size={14} aria-hidden="true" /> Масштаб (Zoom):
                </span>
                <span className="admin-cropper-slider-val">{zoom.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="2.5"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="admin-cropper-range"
              />
            </div>

            {/* Смещение по горизонтали и вертикали */}
            <div className="admin-cropper-section">
              <div className="admin-cropper-slider-header">
                <span className="admin-cropper-slider-label">Смещение по горизонтали (X):</span>
                <span className="admin-cropper-slider-val">{offsetX}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={offsetX}
                onChange={(e) => setOffsetX(parseInt(e.target.value, 10))}
                className="admin-cropper-range"
              />

              <div className="admin-cropper-slider-header mt-3">
                <span className="admin-cropper-slider-label">Смещение по вертикали (Y):</span>
                <span className="admin-cropper-slider-val">{offsetY}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={offsetY}
                onChange={(e) => setOffsetY(parseInt(e.target.value, 10))}
                className="admin-cropper-range"
              />

              {/* Быстрые кнопки выравнивания */}
              <div className="admin-cropper-align-buttons">
                <button
                  type="button"
                  className="admin-pill"
                  onClick={() => { setOffsetX(50); setOffsetY(50); }}
                >
                  По центру
                </button>
                <button
                  type="button"
                  className="admin-pill"
                  onClick={() => setOffsetY(0)}
                >
                  Сверху
                </button>
                <button
                  type="button"
                  className="admin-pill"
                  onClick={() => setOffsetY(100)}
                >
                  Снизу
                </button>
                <button
                  type="button"
                  className="admin-pill"
                  onClick={() => { setZoom(1.0); setOffsetX(50); setOffsetY(50); }}
                >
                  Сбросить
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Подвал с действиями */}
        <div className="admin-cropper-footer">
          <div className="admin-cropper-footer-left">
            <button
              type="button"
              className="admin-button"
              onClick={() => void handleDownload()}
              title="Скачать результат на компьютер"
            >
              <Download size={15} aria-hidden="true" />
              <span>Скачать WebP</span>
            </button>
          </div>

          <div className="admin-cropper-footer-right">
            <button
              type="button"
              className="admin-button"
              onClick={onClose}
              disabled={processing}
            >
              Отмена
            </button>
            <button
              type="button"
              className="admin-button admin-button--primary"
              onClick={() => void handleSaveToMedia()}
              disabled={processing || imageError}
            >
              {processing ? (
                <>
                  <RefreshCw className="animate-spin" size={15} aria-hidden="true" />
                  <span>Сохранение…</span>
                </>
              ) : (
                <>
                  <Check size={15} aria-hidden="true" />
                  <span>Сохранить в медиатеку</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
