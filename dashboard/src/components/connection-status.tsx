"use client";

import { useEffect, useState } from "react";

export function ConnectionStatus() {
  const [isLive, setIsLive] = useState<boolean | null>(null);

  useEffect(() => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4567";

    async function checkHealth() {
      try {
        const res = await fetch(`${apiUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        setIsLive(res.ok);
      } catch {
        setIsLive(false);
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  if (isLive === null) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-500" />
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">
          Connecting
        </span>
      </div>
    );
  }

  if (isLive) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
          Live
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
      </span>
      <span className="text-[10px] font-mono uppercase tracking-wider text-yellow-400">
        Demo
      </span>
    </div>
  );
}
