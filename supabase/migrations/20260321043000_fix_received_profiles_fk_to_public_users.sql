ALTER TABLE public.received_profiles
DROP CONSTRAINT IF EXISTS received_profiles_receiver_user_id_fkey;

ALTER TABLE public.received_profiles
DROP CONSTRAINT IF EXISTS received_profiles_sharer_user_id_fkey;

ALTER TABLE public.received_profiles
ADD CONSTRAINT received_profiles_receiver_user_id_fkey
FOREIGN KEY (receiver_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.received_profiles
ADD CONSTRAINT received_profiles_sharer_user_id_fkey
FOREIGN KEY (sharer_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
