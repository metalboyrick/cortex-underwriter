"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrustGauge } from "@/components/trust-gauge";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4567";

const BASESCAN = "https://sepolia.basescan.org";

const CONTRACTS = {
  PredictionMarket: "0xDe13Ff737d98a9538bb4bE9CF0ba6407DAA603D9",
  TrustScorer: "0xA17bD5f41053Ee7a3B4e38AC29D91490b30b485e",
  AgentRegistry: "0x6CFCdEE09D7eFC1DdF7f8491d8a96444160B6454",
};

const AGENTS = [
  {
    role: "Predictor",
    address: "0x8618416B7803dFaE42641Cf56C3f97F21Bf1F253",
    description: "Analyzes market data and submits on-chain predictions",
  },
  {
    role: "Insurer",
    address: "0x041502334D4a6Ca337488956aef612C78b6aC29A",
    description: "Evaluates predictions and provides insurance coverage",
  },
  {
    role: "Validator",
    address: "0x2a0dc499F7F77077507f892Fa11710e51a65546b",
    description: "Resolves predictions and updates trust scores",
  },
];

type StepStatus = "pending" | "active" | "complete" | "error";

interface StepState {
  status: StepStatus;
  result?: Record<string, unknown>;
  error?: string;
}

function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function BasescanLink({
  hash,
  type = "tx",
  label,
}: {
  hash: string;
  type?: "tx" | "address";
  label?: string;
}) {
  return (
    <a
      href={`${BASESCAN}/${type}/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline underline-offset-2 font-mono text-xs break-all transition-colors"
    >
      {label || truncAddr(hash)}
    </a>
  );
}

function StepCard({
  number,
  title,
  description,
  status,
  children,
  isLast = false,
}: {
  number: number;
  title: string;
  description: string;
  status: StepStatus;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  const borderColor =
    status === "complete"
      ? "border-emerald-500/30"
      : status === "active"
      ? "border-blue-500/40"
      : status === "error"
      ? "border-red-500/30"
      : "border-white/5";

  const bgColor =
    status === "pending" ? "bg-[#111118]/50" : "bg-[#111118]";

  const numberBg =
    status === "complete"
      ? "bg-emerald-500"
      : status === "active"
      ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.4)]"
      : status === "error"
      ? "bg-red-500"
      : "bg-white/10";

  return (
    <div className="relative flex gap-4">
      {/* Timeline */}
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold text-white shrink-0 transition-all duration-500 ${numberBg}`}
        >
          {status === "complete" ? (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            number
          )}
        </div>
        {!isLast && (
          <div
            className={`w-px flex-1 min-h-[24px] transition-colors duration-500 ${
              status === "complete" ? "bg-emerald-500/30" : "bg-white/5"
            }`}
          />
        )}
      </div>

      {/* Card */}
      <div className="flex-1 pb-6">
        <Card
          className={`border ${borderColor} ${bgColor} transition-all duration-500 ${
            status === "pending" ? "opacity-40" : "opacity-100"
          }`}
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-mono text-sm font-semibold text-white">
                {title}
              </h3>
              {status === "active" && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {description}
            </p>
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CodeBlock({ data }: { data: unknown }) {
  return (
    <pre className="bg-black/40 border border-white/5 rounded-lg p-3 text-xs font-mono text-emerald-300 overflow-x-auto max-h-64 overflow-y-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-blue-400 text-xs font-mono">
      <svg
        className="w-4 h-4 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {text}
    </div>
  );
}

export default function DemoPage() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [demoStarted, setDemoStarted] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([
    { status: "pending" },
    { status: "pending" },
    { status: "pending" },
    { status: "pending" },
    { status: "pending" },
  ]);

  const abortRef = useRef<AbortController | null>(null);

  // Check API health on mount
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`${API_BASE}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        setApiOnline(res.ok);
      } catch {
        setApiOnline(false);
      }
    }
    check();
  }, []);

  const updateStep = useCallback(
    (index: number, update: Partial<StepState>) => {
      setSteps((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...update };
        return next;
      });
    },
    []
  );

  const runDemo = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setDemoStarted(true);
    setSteps([
      { status: "pending" },
      { status: "pending" },
      { status: "pending" },
      { status: "pending" },
      { status: "pending" },
    ]);

    // Step 1: Agent Registration (instant — agents are already registered)
    updateStep(0, { status: "active" });
    await new Promise((r) => setTimeout(r, 800));
    if (signal.aborted) return;
    updateStep(0, { status: "complete" });

    // Step 2: Create Prediction
    updateStep(1, { status: "active" });
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset: "ETH" }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const prediction = await res.json();
      updateStep(1, { status: "complete", result: prediction });
    } catch (err) {
      if (signal.aborted) return;
      updateStep(1, {
        status: "error",
        error:
          err instanceof Error ? err.message : "Failed to create prediction",
      });
      return;
    }

    // Step 3: Insurer Evaluation — poll for activity
    updateStep(2, { status: "active" });
    let insurerResult = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 30000) {
      if (signal.aborted) return;
      try {
        const res = await fetch(`${API_BASE}/insurer/latest`, {
          signal,
        });
        if (res.ok) {
          insurerResult = await res.json();
          break;
        }
      } catch {
        // keep polling
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (signal.aborted) return;
    if (insurerResult) {
      updateStep(2, { status: "complete", result: insurerResult });
    } else {
      // Insurer may not respond in time — still mark complete with info
      updateStep(2, {
        status: "complete",
        result: {
          note: "Insurer evaluation timed out — the insurer agent may still be processing. Check the main dashboard for updates.",
        },
      });
    }

    // Step 4: Trust Score
    updateStep(3, { status: "active" });
    try {
      const res = await fetch(
        `${API_BASE}/agents/${AGENTS[0].address}/score`,
        { signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const scoreData = await res.json();
      updateStep(3, { status: "complete", result: scoreData });
    } catch (err) {
      if (signal.aborted) return;
      // Fallback — try agents list
      try {
        const res = await fetch(`${API_BASE}/agents`, { signal });
        if (res.ok) {
          const data = await res.json();
          const agents = Array.isArray(data) ? data : data.agents || [];
          const predictor = agents.find(
            (a: { address: string }) => a.address === AGENTS[0].address
          );
          if (predictor) {
            updateStep(3, { status: "complete", result: predictor });
          } else {
            updateStep(3, {
              status: "error",
              error: "Predictor agent not found in registry",
            });
          }
        } else {
          throw err;
        }
      } catch {
        if (signal.aborted) return;
        updateStep(3, {
          status: "error",
          error:
            err instanceof Error
              ? err.message
              : "Failed to fetch trust score",
        });
      }
    }

    // Step 5: x402 Payment Demo (display-only, no actual API call needed)
    updateStep(4, { status: "active" });
    await new Promise((r) => setTimeout(r, 600));
    if (signal.aborted) return;
    updateStep(4, {
      status: "complete",
      result: {
        status: 402,
        "x-payment": {
          scheme: "exact",
          network: "base-sepolia",
          token: "USDC",
          amount: "100000",
          recipient: CONTRACTS.TrustScorer,
          description:
            "Pay 0.10 USDC to query this agent's trust score",
        },
        message:
          "Payment required. Send USDC via x402 protocol to access this endpoint.",
      },
    });
  }, [updateStep]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-blue-400">
            Live Demo
          </span>
        </div>
        <h1 className="font-mono text-2xl font-bold text-white mb-2">
          LIVE DEMO — Cortex Underwriter
        </h1>
        <p className="text-sm text-muted-foreground">
          Watch 3 autonomous agents interact on Base Sepolia in real-time
        </p>
      </div>

      {/* API Status Banner */}
      {apiOnline === false && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3 mb-6">
          <p className="text-xs font-mono text-yellow-400/90 text-center">
            Agent runtime is offline — start the agent runtime to use
            the live demo
          </p>
        </div>
      )}

      {/* Contract Addresses */}
      <div className="mb-8">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Deployed Contracts
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(CONTRACTS).map(([name, addr]) => (
            <Card
              key={name}
              className="border-0 bg-[#111118] ring-white/5"
            >
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {name}
                </p>
                <BasescanLink hash={addr} type="address" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Start Button */}
      <div className="flex justify-center mb-8">
        <button
          onClick={runDemo}
          disabled={apiOnline === false}
          className={`font-mono text-sm px-8 py-3 rounded-lg font-semibold transition-all ${
            apiOnline === false
              ? "bg-white/5 text-white/30 cursor-not-allowed"
              : demoStarted
              ? "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]"
              : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] animate-pulse"
          }`}
        >
          {demoStarted ? "Restart Demo" : "Start Demo"}
        </button>
      </div>

      {/* Steps */}
      <div className="relative">
        {/* Step 1: Agent Registration */}
        <StepCard
          number={1}
          title="Agent Registration"
          description="Three autonomous agents register on the AgentRegistry contract with staked USDC."
          status={steps[0].status}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {AGENTS.map((agent) => (
              <div
                key={agent.role}
                className={`rounded-lg border p-3 transition-all duration-500 ${
                  steps[0].status === "complete"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-semibold text-white">
                    {agent.role}
                  </span>
                  {steps[0].status === "complete" && (
                    <svg
                      className="w-3.5 h-3.5 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  {agent.description}
                </p>
                <BasescanLink
                  hash={agent.address}
                  type="address"
                />
              </div>
            ))}
          </div>
        </StepCard>

        {/* Step 2: Create Prediction */}
        <StepCard
          number={2}
          title="Create Prediction"
          description='The Predictor agent analyzes ETH market data via Cortex, then submits an on-chain prediction with staked USDC.'
          status={steps[1].status}
        >
          {steps[1].status === "active" && (
            <Spinner text="Submitting prediction on-chain..." />
          )}
          {steps[1].status === "error" && (
            <div className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {steps[1].error}
            </div>
          )}
          {steps[1].status === "complete" && steps[1].result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Confirmed on-chain
              </div>
              <CodeBlock data={steps[1].result} />
              {typeof (steps[1].result as Record<string, unknown>).txHash === "string" ? (
                <div className="text-xs text-muted-foreground">
                  Transaction:{" "}
                  <BasescanLink
                    hash={
                      (steps[1].result as Record<string, unknown>)
                        .txHash as string
                    }
                    type="tx"
                    label={truncAddr(
                      (steps[1].result as Record<string, unknown>)
                        .txHash as string
                    )}
                  />
                </div>
              ) : null}
            </div>
          )}
        </StepCard>

        {/* Step 3: Insurer Evaluation */}
        <StepCard
          number={3}
          title="Insurer Evaluation"
          description="The Insurer agent runs a counter-analysis: checks the Predictor's trust score, queries Cortex independently, and decides whether to provide insurance."
          status={steps[2].status}
        >
          {steps[2].status === "active" && (
            <Spinner text="Waiting for insurer evaluation (up to 30s)..." />
          )}
          {steps[2].status === "complete" && steps[2].result && (
            <div className="space-y-3">
              <CodeBlock data={steps[2].result} />
              {typeof (steps[2].result as Record<string, unknown>).txHash === "string" ? (
                <div className="text-xs text-muted-foreground">
                  Insurance TX:{" "}
                  <BasescanLink
                    hash={
                      (steps[2].result as Record<string, unknown>)
                        .txHash as string
                    }
                    type="tx"
                  />
                </div>
              ) : null}
            </div>
          )}
        </StepCard>

        {/* Step 4: Trust Score */}
        <StepCard
          number={4}
          title="Trust Score"
          description="Query the Predictor agent's on-chain trust score, computed from prediction accuracy, stake volume, and history."
          status={steps[3].status}
        >
          {steps[3].status === "active" && (
            <Spinner text="Fetching trust score..." />
          )}
          {steps[3].status === "error" && (
            <div className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {steps[3].error}
            </div>
          )}
          {steps[3].status === "complete" && steps[3].result && (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <TrustGauge
                score={
                  ((steps[3].result as Record<string, unknown>)
                    .trustScore as number) ??
                  ((steps[3].result as Record<string, unknown>)
                    .score as number) ??
                  0
                }
                size={120}
                strokeWidth={10}
              />
              <div className="flex-1">
                <CodeBlock data={steps[3].result} />
              </div>
            </div>
          )}
        </StepCard>

        {/* Step 5: x402 Payment Demo */}
        <StepCard
          number={5}
          title="x402 Payment Gate"
          description="External agents that want to query trust scores must pay USDC via the x402 protocol. Here's what an unauthenticated request returns."
          status={steps[4].status}
          isLast
        >
          {steps[4].status === "active" && (
            <Spinner text="Demonstrating x402 flow..." />
          )}
          {steps[4].status === "complete" && steps[4].result && (
            <div className="space-y-3">
              <div className="text-xs font-mono text-muted-foreground mb-2">
                <span className="text-red-400">GET</span>{" "}
                /api/trust-score/{truncAddr(AGENTS[0].address)}{" "}
                <span className="text-yellow-400">
                  (no payment header)
                </span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center rounded-md border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-mono text-yellow-400">
                  402 Payment Required
                </span>
              </div>
              <CodeBlock data={steps[4].result} />
              <p className="text-xs text-muted-foreground mt-2">
                External agents pay USDC to query trust scores. The x402
                protocol enables machine-to-machine payments without
                human intervention — agents include a payment proof in
                request headers to unlock the data.
              </p>
            </div>
          )}
        </StepCard>
      </div>
    </div>
  );
}
