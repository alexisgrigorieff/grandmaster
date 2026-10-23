import { Page, PageHeader } from "@/components/layout/Page";
import { QuickPlay } from "@/components/lobby/QuickPlay";
import { PlayerList } from "@/components/lobby/PlayerList";
import { ChallengesPanel } from "@/components/lobby/ChallengesPanel";
import { SectionTitle } from "@/components/ui";

export const metadata = { title: "Lobby" };

export default function LobbyPage() {
  return (
    <Page width="wide">
      <PageHeader eyebrow="Live lobby" title="Find a game" subtitle="Challenge anyone who's online, or let Quick Play pair you with the next available player." />
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="card p-5">
            <SectionTitle>Quick play</SectionTitle>
            <QuickPlay />
          </section>
          <section className="card p-5">
            <SectionTitle>Challenges</SectionTitle>
            <ChallengesPanel />
          </section>
        </div>
        <section>
          <PlayerList />
        </section>
      </div>
    </Page>
  );
}
