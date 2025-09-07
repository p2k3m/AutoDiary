interface HabitStat {
  name: string;
  done: number;
  total: number;
}

export function WeeklyReview({ stats }: { stats: HabitStat[] }) {
  return (
    <div>
      <h2 className="mb-2 text-xl font-bold">Weekly Review</h2>
      <ul className="list-disc pl-4">
        {stats.map((h) => (
          <li key={h.name}>
            {h.name}: {h.done}/{h.total}
          </li>
        ))}
      </ul>
    </div>
  );
}
