interface AttachmentsProps {
  files: File[];
  onChange: (files: File[]) => void;
}

export function Attachments({ files, onChange }: AttachmentsProps) {
  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    onChange([...files, ...list]);
    e.target.value = '';
  };

  const remove = (idx: number) => {
    const next = [...files];
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="mt-2">
      <input type="file" multiple onChange={handleSelect} />
      {files.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-sm">
          {files.map((f, idx) => (
            <li key={idx}>
              {f.name}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="ml-2 text-red-600"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
