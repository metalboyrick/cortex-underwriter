import Link from "next/link";
import { ConnectionStatus } from "./connection-status";

export function Header() {
  return (
    <header className="border-b border-white/5 bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span className="font-mono text-sm font-bold tracking-wider text-white">
              CORTEX UNDERWRITER
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Base Sepolia
          </span>
          <ConnectionStatus />
        </div>
      </div>
    </header>
  );
}
