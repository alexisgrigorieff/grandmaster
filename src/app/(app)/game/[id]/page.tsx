import { GameRoom } from "@/components/game/GameRoom";

export const metadata = { title: "Game" };

export default async function GamePage(props: PageProps<"/game/[id]">) {
  const { id } = await props.params;
  return <GameRoom gameId={id} />;
}
