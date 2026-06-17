-- Clear AriaCare test data only.
-- This keeps the mom/dad Supabase Auth users.

delete from public.ariacare_export_history
where family_id = 'aria-family';

delete from public.ariacare_entries
where family_id = 'aria-family';
