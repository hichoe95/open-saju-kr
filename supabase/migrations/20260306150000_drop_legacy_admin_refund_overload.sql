DROP FUNCTION IF EXISTS public.admin_refund_coins(uuid, uuid, integer, text, uuid, text);
NOTIFY pgrst, 'reload schema';
