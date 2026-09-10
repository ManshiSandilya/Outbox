import { type ReactNode, useEffect } from 'react';

type ModalProps = { isOpen: boolean; onClose: () => void; title: string; children?: ReactNode };

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={onClose}>
    <section className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <h2 id="modal-title" className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 min-h-16">{children}</div>
    </section>
  </div>;
}
