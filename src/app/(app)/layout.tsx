import { AppHeader } from "@/components/layout/AppHeader";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <div className="flex-1 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-0">{children}</div>
    </div>
  );
}
