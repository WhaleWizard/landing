import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  dialogClassName?: string;
  bodyClassName?: string;
}

export default function Modal({ isOpen, onClose, title, children, dialogClassName, bodyClassName }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarCompensation = window.innerWidth - document.documentElement.clientWidth;

    lastActiveElementRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    if (scrollbarCompensation > 0) {
      document.body.style.paddingRight = `${scrollbarCompensation}px`;
    }

    const modalNode = modalRef.current;
    const focusableElements = modalNode?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusableElements?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !modalNode) return;

      const nodes = modalNode.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      lastActiveElementRef.current?.focus();
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.8 }}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-2xl max-h-[calc(100dvh-2rem)] md:max-h-[85vh] bg-card border border-primary/30 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col ${dialogClassName ?? ''}`}
          >
            <div className="flex justify-between items-center p-4 border-b border-border">
              <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {title}
              </h2>
              <motion.button
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
                className="p-1 rounded-full hover:bg-primary/10 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </motion.button>
            </div>
            {/* Добавляем класс для кастомного скроллбара */}
            <div className={`p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto modal-scroll ${bodyClassName ?? ''}`}>
              {children}
            </div>
            <div className="p-4 border-t border-border flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-primary/30 hover:bg-primary/10 transition-colors">
                Закрыть
              </button>
            </div>
          </motion.div>
        </>
      )}
      {/* Стили только для этого компонента */}
      <style>{`
        .modal-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(139, 92, 246, 0.5) rgba(255, 255, 255, 0.05);
        }
        .modal-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .modal-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .modal-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #8b5cf6, #6366f1, #3b82f6);
          border-radius: 10px;
        }
        .modal-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #a78bfa, #818cf8, #60a5fa);
        }
      `}</style>
    </AnimatePresence>
  );
}