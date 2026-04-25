-- ================================================================
-- P1-4: PII 암호화 마이그레이션
-- user_identities: provider_user_id 해시화, email/name 암호화
-- user_signup_profiles: 모든 필드 암호화
-- ================================================================

-- 1. 기존 사용자 데이터 전체 삭제 (테스트 데이터)
TRUNCATE TABLE 
    user_flow_advices, 
    user_unlocks, 
    coin_transactions, 
    user_readings, 
    saju_profiles, 
    saju_cache, 
    user_wallets,
    user_streaks,
    user_free_usage,
    user_mission_completions,
    user_consents,
    user_signup_profiles, 
    user_identities, 
    users 
CASCADE;

-- 2. user_identities 테이블 재설계
-- 기존 평문 컬럼 삭제
ALTER TABLE user_identities
    DROP COLUMN IF EXISTS provider_user_id,
    DROP COLUMN IF EXISTS email,
    DROP COLUMN IF EXISTS name;

-- 새 암호화 컬럼 추가
ALTER TABLE user_identities
    ADD COLUMN IF NOT EXISTS provider_user_id_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS email_ct TEXT,
    ADD COLUMN IF NOT EXISTS email_iv TEXT,
    ADD COLUMN IF NOT EXISTS email_tag TEXT,
    ADD COLUMN IF NOT EXISTS name_ct TEXT,
    ADD COLUMN IF NOT EXISTS name_iv TEXT,
    ADD COLUMN IF NOT EXISTS name_tag TEXT,
    ADD COLUMN IF NOT EXISTS key_id TEXT DEFAULT 'v1';

-- 해시 기반 빠른 조회를 위한 유니크 인덱스
DROP INDEX IF EXISTS idx_user_identities_provider_hash;
CREATE UNIQUE INDEX idx_user_identities_provider_hash 
    ON user_identities(provider, provider_user_id_hash);

-- 3. user_signup_profiles 테이블 재설계
-- 기존 평문 컬럼 삭제
ALTER TABLE user_signup_profiles
    DROP COLUMN IF EXISTS name,
    DROP COLUMN IF EXISTS gender,
    DROP COLUMN IF EXISTS birthyear,
    DROP COLUMN IF EXISTS birthday_mmdd,
    DROP COLUMN IF EXISTS age_range;

-- 기존 CHECK 제약조건 제거
ALTER TABLE user_signup_profiles
    DROP CONSTRAINT IF EXISTS user_signup_profiles_gender_check,
    DROP CONSTRAINT IF EXISTS user_signup_profiles_birthyear_check,
    DROP CONSTRAINT IF EXISTS user_signup_profiles_birthday_mmdd_check;

-- 새 암호화 컬럼 추가
ALTER TABLE user_signup_profiles
    ADD COLUMN IF NOT EXISTS name_ct TEXT,
    ADD COLUMN IF NOT EXISTS name_iv TEXT,
    ADD COLUMN IF NOT EXISTS name_tag TEXT,
    ADD COLUMN IF NOT EXISTS gender_ct TEXT,
    ADD COLUMN IF NOT EXISTS gender_iv TEXT,
    ADD COLUMN IF NOT EXISTS gender_tag TEXT,
    ADD COLUMN IF NOT EXISTS birthyear_ct TEXT,
    ADD COLUMN IF NOT EXISTS birthyear_iv TEXT,
    ADD COLUMN IF NOT EXISTS birthyear_tag TEXT,
    ADD COLUMN IF NOT EXISTS birthday_mmdd_ct TEXT,
    ADD COLUMN IF NOT EXISTS birthday_mmdd_iv TEXT,
    ADD COLUMN IF NOT EXISTS birthday_mmdd_tag TEXT,
    ADD COLUMN IF NOT EXISTS key_id TEXT DEFAULT 'v1';
