import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogFocus } from './hooks/useDialogFocus';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  dialogClassName?: string;
  bodyClassName?: string;
  size?: 'default' | 'wide';
  hideFooter?: boolean;
  mobileFullscreen?: boolean;
  flushBody?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  dialogClassName,
  bodyClassName,
  size = 'default',
  hideFooter = false,
  mobileFullscreen = false,
  flushBody = false,
}: ModalProps) {
  const modalRef = useDialogFocus<HTMLDivElement>(isOpen, onClose);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    // Документы cookie открываются поверх баннера, который уже зафиксировал
    // body. Вложенная блокировка сняла бы внешний top и вернула окно в (0, 0)
    // при закрытии документа.
    if (previousPosition === 'fixed' && previousOverflow === 'hidden') return undefined;
    const scrollY = window.scrollY;
    const historyKeyWhenOpened = window.history.state?.key;
    const hrefWhenOpened = window.location.href;
    const hasStableScrollbarGutter = getComputedStyle(document.documentElement)
      .scrollbarGutter.includes('stable');
    const scrollbarCompensation = hasStableScrollbarGutter
      ? 0
      : window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    if (scrollbarCompensation > 0) {
      document.body.style.paddingRight = `${scrollbarCompensation}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      const sameHistoryEntry = historyKeyWhenOpened
        ? window.history.state?.key === historyKeyWhenOpened
        : window.location.href === hrefWhenOpened;
      if (sameHistoryEntry) {
        window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
      }
    };
  }, [isOpen]);

  if (!isMounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[1000]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.8 }}
            ref={modalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-primary/25 shadow-2xl z-[1001] overflow-hidden flex flex-col ${
              size === 'wide' ? 'sm:w-[96vw] sm:max-w-7xl' : 'sm:w-[90vw] sm:max-w-2xl'
            } ${
              mobileFullscreen
                ? 'h-[100dvh] max-h-[100dvh] w-full rounded-none sm:h-auto sm:max-h-[92vh] sm:rounded-2xl'
                : 'w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-1.5rem)] rounded-2xl md:max-h-[85vh]'
            } ${dialogClassName ?? ''}`}
          >
            <div className="flex justify-between items-start gap-3 p-4 sm:p-5 border-b border-border">
              <h2 className="min-w-0 flex-1 break-words text-balance text-lg sm:text-xl font-semibold leading-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {title}
              </h2>
              <motion.button
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
                aria-label="Закрыть окно"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-primary/10 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </motion.button>
            </div>
            <div className={`${flushBody ? '' : 'p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]'} overflow-y-auto overscroll-contain modal-scroll ${bodyClassName ?? ''}`}>
              {children}
            </div>
            {!hideFooter && (
              <div className="p-4 border-t border-border flex justify-end">
                <button onClick={onClose} className="min-h-11 px-4 py-2 rounded-lg border border-primary/30 hover:bg-primary/10 transition-colors">
                  Закрыть
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
      <style>{`
        .modal-scroll {
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--primary) 55%, transparent) rgba(255, 255, 255, 0.05);
        }
        .modal-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .modal-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .modal-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, var(--primary), var(--accent), var(--secondary));
          border-radius: 10px;
        }
        .modal-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 78%, white 22%), color-mix(in srgb, var(--accent) 78%, white 22%), color-mix(in srgb, var(--secondary) 78%, white 22%));
        }
      `}</style>
    </AnimatePresence>,
    document.body
  );
}
