const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Please sign in first.",
  CANNOT_CHALLENGE_SELF: "You can't challenge yourself.",
  CANNOT_PLAY_SELF: "You can't play against yourself.",
  INVALID_COLOR: "Pick white, black or random.",
  INVALID_TIME_CONTROL: "That time control isn't supported.",
  PLAYER_NOT_FOUND: "That player doesn't exist.",
  YOU_ARE_IN_A_GAME: "Finish your current game first.",
  OPPONENT_IN_A_GAME: "That player is in a game right now.",
  CHALLENGE_ALREADY_PENDING: "You've already challenged this player.",
  OPPONENT_ALREADY_CHALLENGED_YOU: "They've already challenged you — accept their challenge instead.",
  TOO_MANY_CHALLENGES: "You have too many open challenges. Cancel one first.",
  CHALLENGE_NOT_FOUND: "That challenge no longer exists.",
  CHALLENGE_NOT_PENDING: "That challenge is no longer open.",
  PLAYER_BUSY: "One of you is already playing another game.",
  CHAT_RATE_LIMIT: "You're sending messages too quickly.",
  CHAT_CLOSED: "Chat closes an hour after the game ends.",
  USERNAME_TAKEN: "That username is taken.",
  GAME_NOT_FOUND: "Game not found.",
};

/** Turn a Supabase/PostgREST/API error into a sentence for humans. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!err) return fallback;
  const msg = typeof err === "string" ? err : ((err as { message?: string }).message ?? "");
  for (const [code, text] of Object.entries(MESSAGES)) if (msg.includes(code)) return text;
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Can't reach the server. Check your connection.";
  if (/Database error saving new user/i.test(msg)) return MESSAGES.USERNAME_TAKEN;
  if (/Invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/Email not confirmed/i.test(msg)) return "Please confirm your email address first — check your inbox.";
  if (/User already registered/i.test(msg)) return "An account with this email already exists.";
  if (/Password should be/i.test(msg)) return msg;
  if (/rate limit/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  return msg && msg.length < 140 && !/^[A-Z_]+$/.test(msg) ? msg : fallback;
}
