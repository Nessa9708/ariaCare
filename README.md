# AriaCare Starter

A React + Vite web app for shared glucose, meal and insulin tracking.

## Run locally

```bash
npm install
npm run dev
```

## Local fallback mode

If `.env.local` is missing, the app runs in localStorage mode for testing.

## Supabase setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase/schema.sql`.
4. Go to Authentication > Users and create two users manually:
   - `mom@ariacare.local`
   - `dad@ariacare.local`
5. Create `.env.local`:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ARIA_FAMILY_ID=aria-family
```

6. Restart Vite:

```bash
npm run dev
```

The login screen still asks for username only. The app converts `mom` to `mom@ariacare.local` and `dad` to `dad@ariacare.local` behind the scenes.

## Current MVP features

- Supabase-ready connector
- Mom/Dad username login
- Shared cloud records once Supabase is configured
- No dummy starter data
- Manual date/time on logs
- Add glucose, meal, insulin and notes
- Multiple food items and carb fields
- Edit/delete entries
- Countdown reminders
- Insights, monthly summaries and trends
- Settings, unit selection, dark mode
- PDF export and archive/restore controls
- PWA/offline foundation

## Clear test data before giving to user

Run this in Supabase SQL Editor:

```sql
-- supabase/clear_test_data.sql
```

This deletes only AriaCare entries and export history for `aria-family`. It does not delete Mom/Dad Auth users.

## Deploy on GitHub Pages

This project includes `.github/workflows/deploy.yml`.

In GitHub repo settings:

1. Go to Settings > Secrets and variables > Actions.
2. Add repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Go to Settings > Pages.
4. Set Source to GitHub Actions.
5. Push to the `main` branch.

The workflow builds the Vite app and deploys the `dist` folder to GitHub Pages.
