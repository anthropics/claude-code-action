interface UsageBarProps {
  used: number;
  limit: number;
  label?: string;
}

export default function UsageBar({ used, limit, label }: UsageBarProps) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = percentage >= 80;
  const isCritical = percentage >= 95;

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-gray-400">{label}</span>
          <span className="text-gray-300">
            {used.toLocaleString()} / {limit.toLocaleString()}
          </span>
        </div>
      )}
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full rounded-full transition-all ${
            isCritical
              ? "bg-red-500"
              : isWarning
                ? "bg-amber-500"
                : "bg-brand-500"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
