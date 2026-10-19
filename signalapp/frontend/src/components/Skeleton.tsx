import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`skeleton rounded-lg ${className}`} />
);

export const SignalCardSkeleton: React.FC = () => (
  <div className="bg-[#0d1628] border border-white/[0.06] border-l-4 border-l-slate-700 rounded-2xl p-4 space-y-3 animate-pulse">
    <div className="flex items-center gap-2">
      <Skeleton className="w-24 h-5" />
      <Skeleton className="w-16 h-5 rounded-full" />
      <Skeleton className="w-10 h-5" />
    </div>
    <div className="grid grid-cols-4 gap-2 bg-[#060913]/60 rounded-xl p-3">
      {[...Array(4)].map((_, i) => (
        <div key={i}>
          <Skeleton className="w-12 h-2 mb-1.5" />
          <Skeleton className="w-16 h-4" />
        </div>
      ))}
    </div>
    <Skeleton className="w-full h-3" />
    <Skeleton className="w-3/4 h-3" />
    <Skeleton className="w-full h-1.5 rounded-full" />
    <div className="flex gap-2 pt-2 border-t border-white/5">
      <Skeleton className="flex-1 h-8 rounded-lg" />
      <Skeleton className="flex-1 h-8 rounded-lg" />
      <Skeleton className="w-8 h-8 rounded-lg" />
    </div>
  </div>
);

export const NewsCardSkeleton: React.FC = () => (
  <div className="bg-[#0d1628] border border-white/[0.06] rounded-2xl p-4 space-y-2.5 animate-pulse">
    <div className="flex items-center justify-between">
      <Skeleton className="w-20 h-4 rounded-full" />
      <Skeleton className="w-16 h-3" />
    </div>
    <Skeleton className="w-full h-4" />
    <Skeleton className="w-4/5 h-4" />
    <Skeleton className="w-full h-3" />
    <Skeleton className="w-2/3 h-3" />
  </div>
);

export const KPICardSkeleton: React.FC = () => (
  <div className="bg-[#0d1628] border border-white/[0.06] rounded-2xl p-4 animate-pulse">
    <div className="flex items-center justify-between mb-3">
      <Skeleton className="w-20 h-3" />
      <Skeleton className="w-7 h-7 rounded-lg" />
    </div>
    <Skeleton className="w-24 h-8 mb-1.5" />
    <Skeleton className="w-32 h-3" />
  </div>
);

export const TableRowSkeleton: React.FC = () => (
  <tr className="animate-pulse">
    {[...Array(6)].map((_, i) => (
      <td key={i} className="py-3 pr-4">
        <Skeleton className="w-16 h-3" />
      </td>
    ))}
  </tr>
);
