type StatsSectionProps = {
  upcomingCount: number;
  savedCount: number;
  reflectionCount: number;
};

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  icon,
  accentColor = "sage",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accentColor?: "sage" | "terracotta" | "taupe";
}) {
  const colorMap = {
    sage: "bg-[#E8EFEB] text-[#7A9E7E]",
    terracotta: "bg-[#F5E5DD] text-[#C4704F]",
    taupe: "bg-[#E8E5DF] text-[#B5A898]",
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[#E8E4DC]/60 bg-white p-6 shadow-sm transition-all duration-200 hover:border-[#7A9E7E]/20 hover:shadow-md">
      <div className="flex items-center gap-4">
        <span className={`flex h-14 w-14 items-center justify-center rounded-xl ${colorMap[accentColor]} transition-transform duration-200 group-hover:scale-110`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline text-[#2C1A0E]">
            <span className="text-4xl font-bold tracking-tight">{value}</span>
            <span className="ml-3 text-xs font-medium uppercase tracking-wider text-[#B5A898]">
              {label}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}

export function StatsSection({ upcomingCount, savedCount, reflectionCount }: StatsSectionProps) {
  return (
    <section className="mb-10 grid gap-6 sm:grid-cols-3 lg:gap-8">
      <StatCard
        label="Upcoming Events"
        value={upcomingCount}
        icon={<CalendarIcon className="h-6 w-6" />}
        accentColor="sage"
      />
      <StatCard
        label="Saved Events"
        value={savedCount}
        icon={<BookmarkIcon className="h-6 w-6" />}
        accentColor="terracotta"
      />
      <StatCard
        label="Reflections"
        value={reflectionCount}
        icon={<SparklesIcon className="h-6 w-6" />}
        accentColor="taupe"
      />
    </section>
  );
}
