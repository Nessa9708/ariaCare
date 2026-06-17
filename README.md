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
