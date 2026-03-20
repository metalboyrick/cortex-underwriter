"use client";

import { useEffect, useState } from "react";
import { FeedEvent } from "@/lib/types";
import { mockFeedEvents } from "@/lib/mock-data";
import { timeAgo } from "@/lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4567";

const eventIcons: Record<string, string> = {
  PredictionCreated: "\u26A1",
  InsurancePurchased: "\u{1F6E1}\uFE0F",
  PredictionResolved: "\u2705",
};

const eventColors: Record<string, string> = {
  PredictionCreated: "text-blue-400",
  InsurancePurchased: "text-amber-400",
  PredictionResolved: "text-emerald-400",
};

function formatEvent(event: FeedEvent): string {
  const d = event.data;
  switch (event.type) {
    case "PredictionCreated":
      return `${d.agent} predicted ${d.asset} ${
        d.direction === "up" ? "\u2191" : "\u2193"
      } with $${d.stake?.toLocaleString()} stake`;
    case "InsurancePurchased":
      return `${d.agent} bought $${d.amount?.toLocaleString()} insurance on prediction #${d.predictionId}`;
    case "PredictionResolved":
      return `Prediction #${d.predictionId} resolved: ${
        d.result === "correct" ? "CORRECT" : "WRONG"
      } (${d.agent})`;
    default:
      return "Unknown event";
  }
}

export function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>(mockFeedEvents);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/events`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch {
        // Use mock data on failure -- already set
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-1">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm mt-0.5 shrink-0">
            {eventIcons[event.type]}
          </span>
          <div className="flex-1 min-w-0">
            <p
              className={`text-xs font-medium ${
                eventColors[event.type]
              }`}
            >
              {event.type.replace(/([A-Z])/g, " $1").trim()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">
              {formatEvent(event)}
            </p>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0 font-mono mt-0.5">
            {timeAgo(event.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}
