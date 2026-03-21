"use client";

import { useEffect, useState } from "react";

export function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4567";

    async function checkHealth() {
      try {
        const res = await fetch(`${apiUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        setIsDemo(!res.ok);
      } catch {
        setIsDemo(true);
      }
    }

    checkHealth();
  }, []);

  if (!isDemo) return null;

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2.5 mb-6">
      <p className="text-xs font-mono text-yellow-400/90 text-center">
        Showing demo data &mdash; start the agent runtime for live on-chain data
      </p>
    </div>
  );
}
