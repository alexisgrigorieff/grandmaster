import { ProfileView } from "./ProfileView";

export async function generateMetadata(props: PageProps<"/profile/[username]">) {
  const { username } = await props.params;
  return { title: `@${decodeURIComponent(username)}` };
}

export default async function ProfilePage(props: PageProps<"/profile/[username]">) {
  const { username } = await props.params;
  return <ProfileView username={decodeURIComponent(username)} />;
}
