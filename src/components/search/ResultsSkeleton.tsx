import { Skeleton } from "@/components/ui/skeleton";

export function ResultsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-3xl border border-border/60 overflow-hidden bg-card">
          <div className="grid sm:grid-cols-[260px_1fr]">
            <Skeleton className="aspect-[4/3] sm:aspect-auto sm:h-full rounded-none" />
            <div className="p-5 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex justify-between pt-3">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-9 w-28 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
