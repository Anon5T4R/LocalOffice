import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SlashItem } from "./items";

export interface SlashMenuRef {
  onKeyDown: (x: { event: KeyboardEvent }) => boolean;
}

interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>((props, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [props.items]);

  const pick = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!props.items.length) return false;
      if (event.key === "ArrowUp") {
        setSelected((s) => (s + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % props.items.length);
        return true;
      }
      if (event.key === "Enter") {
        pick(selected);
        return true;
      }
      return false;
    },
  }));

  if (!props.items.length) {
    return <div className="slash-menu slash-empty">Nenhum comando</div>;
  }

  return (
    <div className="slash-menu">
      {props.items.map((item, i) => (
        <button
          key={item.title}
          className={"slash-item" + (i === selected ? " is-sel" : "")}
          onMouseEnter={() => setSelected(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            pick(i);
          }}
        >
          <span className="slash-ico">{item.icon}</span>
          <span className="slash-text">
            <span className="slash-title">{item.title}</span>
            <span className="slash-sub">{item.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

SlashMenu.displayName = "SlashMenu";
