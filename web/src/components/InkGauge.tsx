interface InkGaugeProps {
  used: number;
  total: number;
  className?: string;
}

export function InkGauge({ used, total, className }: InkGaugeProps) {
  const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div
      className={`h-2 w-full rounded bg-gray-300 dark:bg-gray-700 ${
        className ?? ''
      }`}
    >
      <div
        className="h-full rounded bg-blue-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
