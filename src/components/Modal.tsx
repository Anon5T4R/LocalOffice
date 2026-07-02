import { useRef, type CSSProperties, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra style for the modal box (e.g. maxHeight for scrollable lists). */
  boxStyle?: CSSProperties;
}

/**
 * Modal base: backdrop que fecha no clique, Escape, focus trap, header com ✕
 * e aria de diálogo. O conteúdo vem como children (tipicamente .modal-body).
 */
export function Modal({ title, onClose, children, boxStyle }: ModalProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(boxRef, { onEscape: onClose });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={boxRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={boxStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <strong>{title}</strong>
          <button className="tb-btn" onClick={onClose} title="Fechar (Esc)">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
