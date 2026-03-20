import Link from "next/link";
import { Agent } from "@/lib/types";
import { formatUSDC } from "@/lib/api";
import { TableRow, TableCell } from "@/components/ui/table";

function getBarColor(score: number): string {
  if (score < 30) return "bg-red-500";
  if (score < 60) return "bg-yellow-500";
  return "bg-emerald-500";
}

export function AgentRow({
  agent,
  rank,
}: {
  agent: Agent;
  rank: number;
}) {
  const accuracy =
    agent.totalPredictions > 0
      ? Math.round(
          (agent.correctPredictions / agent.totalPredictions) * 100
        )
      : 0;

  return (
    <TableRow className="border-white/5 hover:bg-white/[0.02]">
      <TableCell className="font-mono text-muted-foreground w-12">
        #{rank}
      </TableCell>
      <TableCell>
        <Link
          href={`/agents/${encodeURIComponent(agent.address)}`}
          className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          {agent.address}
        </Link>
      </TableCell>
      <TableCell className="w-48">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getBarColor(
                agent.trustScore
              )}`}
              style={{ width: `${agent.trustScore}%` }}
            />
          </div>
          <span className="font-mono text-sm text-white w-8 text-right">
            {agent.trustScore}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-sm text-right">
        {agent.totalPredictions}
      </TableCell>
      <TableCell className="font-mono text-sm text-right">
        <span
          className={
            accuracy >= 70
              ? "text-emerald-400"
              : accuracy >= 50
              ? "text-yellow-400"
              : "text-red-400"
          }
        >
          {accuracy}%
        </span>
      </TableCell>
      <TableCell className="font-mono text-sm text-right">
        {formatUSDC(agent.totalStaked)}
      </TableCell>
    </TableRow>
  );
}
