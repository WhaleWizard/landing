import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-2xl max-h-[85vh] bg-card border border-primary/30 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            <div className="flex justify-between items-center p-4 border-b border-border">
              <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {title}
              </h2>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-primary/10 transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            {/* Добавляем класс для кастомного скроллбара */}
            <div className="p-6 overflow-y-auto modal-scroll">
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