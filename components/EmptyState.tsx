interface EmptyStateProps {
  message?: string;
  submessage?: string;
}

export function EmptyState({
  message = "All caught up.",
  submessage = "I'm watching."
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <p className="text-[var(--muted)] text-sm">{message}</p>
      {submessage && (
        <p className="text-[var(--muted)] text-xs mt-1 opacity-60">{submessage}</p>
      )}
    </div>
  );
}
