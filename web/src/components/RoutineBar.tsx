import { useEffect, useState } from 'react';

export interface RoutineItem {
  text: string;
  done: boolean;
}

interface RoutineBarProps {
  items: RoutineItem[];
  onChange?: (items: RoutineItem[]) => void;
}

export function RoutineBar({ items, onChange }: RoutineBarProps) {
  const [local, setLocal] = useState<RoutineItem[]>(items);

  useEffect(() => setLocal(items), [items]);

  const update = (next: RoutineItem[]) => {
    setLocal(next);
    onChange?.(next);
  };

  const toggle = (idx: number) => {
    const next = [...local];
    next[idx].done = !next[idx].done;
    update(next);
  };

  const changeText = (idx: number, text: string) => {
    const next = [...local];
    next[idx].text = text;
    update(next);
  };

  const addItem = () => {
    update([...local, { text: '', done: false }]);
  };

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {local.map((item, idx) => (
        <label key={idx} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={item.done}
            onChange={() => toggle(idx)}
          />
          <input
            className="border-b bg-transparent outline-none"
            value={item.text}
            onChange={(e) => changeText(idx, e.target.value)}
            placeholder={`Task ${idx + 1}`}
          />
        </label>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="rounded bg-gray-200 px-2 py-1 text-sm dark:bg-gray-700"
      >
        +
      </button>
    </div>
  );
}
