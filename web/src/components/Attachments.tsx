interface AttachmentMeta {
  name: string;
  uuid: string;
}

interface AttachmentsProps {
  files: File[];
  existing: AttachmentMeta[];
  onFilesChange: (files: File[]) => void;
  onExistingChange: (items: AttachmentMeta[]) => void;
}

export function Attachments({
  files,
  existing,
  onFilesChange,
  onExistingChange,
}: AttachmentsProps) {
  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    onFilesChange([...files, ...list]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    const next = [...files];
    next.splice(idx, 1);
    onFilesChange(next);
  };

  const removeExisting = (idx: number) => {
    const next = [...existing];
    next.splice(idx, 1);
    onExistingChange(next);
  };

  return (
    <div className="mt-2">
      <input type="file" multiple onChange={handleSelect} />
      {(existing.length > 0 || files.length > 0) && (
        <ul className="mt-2 list-disc pl-4 text-sm">
          {existing.map((f, idx) => (
            <li key={f.uuid}>
              {f.name}
              <button
                type="button"
                onClick={() => removeExisting(idx)}
                className="ml-2 text-red-600"
              >
                remove
              </button>
            </li>
          ))}
          {files.map((f, idx) => (
            <li key={`new-${idx}`}>
              {f.name}
              <button
                type="button"
                onClick={() => removeFile(idx)}
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
