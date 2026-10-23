# Deploying

Grandmaster is a standard Next.js app. Any Node.js host works; Vercel is the
simplest and its free Hobby plan is enough.

## Vercel

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. In Vercel, click **Add New → Project** and import the repository.
   The framework preset is detected as **Next.js**; keep the defaults.
3. Under **Environment Variables**, add (for Production, Preview and Development):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable / anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret / service_role key |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` (or your custom domain) |

4. Click **Deploy**.
5. Back in Supabase, go to **Authentication → URL Configuration** and set the
   **Site URL** to the deployed URL, and add `https://<your-domain>/**` to
   **Redirect URLs**.
6. Open the site, create an account, and send the link to a friend.

`NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing them.

## Other hosts

```bash
npm ci
npm run build
npm start            # serves on $PORT (default 3000)
```

Requires Node.js 20.9 or newer. Set the same four environment variables.
The app keeps no state on the web server — everything lives in Supabase — so
you can run several instances behind a load balancer.

## After deploying: smoke test

1. Register in one browser, register a second account in a private window.
2. Both show as **Available** in the Lobby.
3. Challenge, accept, make a few moves on each side, refresh one window mid-game.
4. Finish the game and check that it appears in both players' **Recent games**.
