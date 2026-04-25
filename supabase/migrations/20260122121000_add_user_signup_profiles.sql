-- 회원가입(개인정보 동의 항목) 심사용 프로필 테이블
-- - 필수 수집 항목: 이름, 성별, 연령대, 생일, 출생 연도

CREATE TABLE IF NOT EXISTS public.user_signup_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  birthyear integer NOT NULL CHECK (birthyear BETWEEN 1900 AND EXTRACT(YEAR FROM NOW())::int),
  birthday_mmdd text NOT NULL CHECK (birthday_mmdd ~ '^[0-9]{4}$'),
  age_range text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_signup_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signup_profiles_select_own" ON public.user_signup_profiles;
DROP POLICY IF EXISTS "signup_profiles_insert_own" ON public.user_signup_profiles;
DROP POLICY IF EXISTS "signup_profiles_update_own" ON public.user_signup_profiles;

CREATE POLICY "signup_profiles_select_own" ON public.user_signup_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "signup_profiles_insert_own" ON public.user_signup_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "signup_profiles_update_own" ON public.user_signup_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_signup_profiles_user_id
  ON public.user_signup_profiles(user_id);
