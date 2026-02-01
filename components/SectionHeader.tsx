interface SectionHeaderProps {
  icon: string;
  title: string;
  count?: number;
  lastChecked?: Date;
}

export function SectionHeader({ icon, title, count, lastChecked }: SectionHeaderProps) {
  const formatLastChecked = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins === 1) return "1 min ago";
    if (diffMins < 60) return `${diffMins} mins ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;

    return "over a day ago";
  };

  return (
    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border)]">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <h2 className="font-medium text-sm uppercase tracking-wide">{title}</h2>
        {typeof count === "number" && (
          <span className="text-xs text-[var(--muted)] bg-[var(--background)] px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {lastChecked && (
        <span className="text-xs text-[var(--muted)]">
          {formatLastChecked(lastChecked)}
        </span>
      )}
    </div>
  );
}
