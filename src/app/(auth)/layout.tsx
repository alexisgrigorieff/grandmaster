import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { SetupNotice } from "@/components/layout/SetupNotice";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(214,170,92,0.13),transparent)]" />
        <div
          className="absolute inset-x-0 bottom-0 h-[45vh] opacity-[0.05]"
          style={{
            backgroundImage: "linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%), linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%)",
            backgroundSize: "64px 64px",
            backgroundPosition: "0 0, 32px 32px",
            maskImage: "linear-gradient(to top, black, transparent)",
          }}
        />
      </div>
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <Link href="/" className="text-[14px] text-muted hover:text-text">
          Back to home
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px]">
          <SetupNotice />
          {children}
        </div>
      </main>
    </div>
  );
}
