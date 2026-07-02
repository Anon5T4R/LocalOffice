import { memo, type ReactNode } from "react";

interface BtnProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
  wide?: boolean;
}

/** Ribbon toolbar button. mousedown is swallowed so the editor keeps focus. */
export const Btn = memo(function Btn({ onClick, active, disabled, title, children, wide }: BtnProps) {
  return (
    <button
      type="button"
      className={"tb-btn" + (active ? " is-active" : "") + (wide ? " tb-wide" : "")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
});
