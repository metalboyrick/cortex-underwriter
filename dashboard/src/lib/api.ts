import { Agent, Prediction, FeedEvent } from "./types";
import {
  mockAgents,
  mockPredictions,
  mockFeedEvents,
} from "./mock-data";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4567";

async function fetchWithFallback<T>(
  path: string,
  fallback: T
): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getAgents(): Promise<Agent[]> {
  return fetchWithFallback("/agents", mockAgents);
}

export async function getAgent(address: string): Promise<Agent | undefined> {
  const agents = await getAgents();
  return agents.find((a) => a.address === address);
}

export async function getAgentScore(address: string): Promise<number> {
  const agent = await getAgent(address);
  return agent?.trustScore ?? 0;
}

export async function getPredictions(): Promise<Prediction[]> {
  return fetchWithFallback("/predictions", mockPredictions);
}

export async function getPrediction(
  id: number
): Promise<Prediction | undefined> {
  const predictions = await getPredictions();
  return predictions.find((p) => p.id === id);
}

export async function getAgentPredictions(
  address: string
): Promise<Prediction[]> {
  const predictions = await getPredictions();
  return predictions.filter((p) => p.agent === address);
}

export async function getFeedEvents(): Promise<FeedEvent[]> {
  return fetchWithFallback("/events", mockFeedEvents);
}

export function formatUSDC(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function truncateAddress(address: string): string {
  if (address.includes("...")) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function timeUntil(expiry: string): string {
  const now = new Date();
  const exp = new Date(expiry);
  const diff = exp.getTime() - now.getTime();

  if (diff <= 0) return "Expired";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function timeAgo(timestamp: string): string {
  const now = new Date();
  const t = new Date(timestamp);
  const diff = now.getTime() - t.getTime();
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
