-- DB Hygiene Fixes (2026-02-21)
-- Fixes identified via Supabase Advisor (security/performance) and code TODO audit.
-- All statements are idempotent (safe to re-run).

-- 1. Fix search_path on grant_bonus_coins (SECURITY DEFINER without search_path)
ALTER FUNCTION public.grant_bonus_coins(uuid, integer, text, text) SET search_path = '';

-- 2. Fix search_path on update_updated_at_column (trigger function without search_path)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- 3. Add UNIQUE constraint on webhook_events for idempotent processing
-- Code uses (event_type, order_id, status) for dedup queries.
-- Drop the old over-constrained UNIQUE(order_id, status) index — the new
-- (event_type, order_id, status) constraint is the correct dedup key.
DROP INDEX IF EXISTS public.idx_webhook_events_order_status;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'webhook_events_event_dedup'
    ) THEN
        ALTER TABLE public.webhook_events
        ADD CONSTRAINT webhook_events_event_dedup UNIQUE (event_type, order_id, status);
    END IF;
END $$;

-- 4. Revoke anon EXECUTE on rotate_refresh_token (security fix)
-- Only service_role should call this; backend already uses service_role key.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'rotate_refresh_token'
          AND pronamespace = 'public'::regnamespace
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.rotate_refresh_token(text, text, timestamptz) FROM anon;
    END IF;
END $$;

-- 5. Drop legacy alembic_version table (no code references, 1 stale row)
DROP TABLE IF EXISTS public.alembic_version;
