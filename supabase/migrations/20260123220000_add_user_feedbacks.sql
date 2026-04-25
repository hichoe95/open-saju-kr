-- User Feedbacks Table
-- 사용자 피드백 (버그 신고, 개선 제안, 기타 의견)

CREATE TABLE user_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 피드백 내용
    category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'other')),
    content TEXT NOT NULL CHECK (char_length(content) >= 10 AND char_length(content) <= 1000),
    
    -- 관리용 (내부 참고)
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
    admin_note TEXT,
    
    -- 나중에 답변 기능 확장용 (nullable)
    response TEXT,
    responded_at TIMESTAMPTZ,
    is_public BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_user_feedbacks_user_id ON user_feedbacks(user_id);
CREATE INDEX idx_user_feedbacks_category ON user_feedbacks(category);
CREATE INDEX idx_user_feedbacks_status ON user_feedbacks(status);
CREATE INDEX idx_user_feedbacks_created_at ON user_feedbacks(created_at DESC);

-- RLS 활성화
ALTER TABLE user_feedbacks ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 피드백만 INSERT 가능
CREATE POLICY "Users can insert own feedback"
    ON user_feedbacks
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text OR user_id IS NOT NULL);

-- RLS 정책: 본인 피드백만 조회 가능 (선택적 - 사용자가 자신의 피드백 이력을 볼 경우)
CREATE POLICY "Users can view own feedback"
    ON user_feedbacks
    FOR SELECT
    USING (auth.uid()::text = user_id::text);

-- 서비스 역할은 모든 피드백 접근 가능 (관리자용)
CREATE POLICY "Service role has full access"
    ON user_feedbacks
    FOR ALL
    USING (auth.role() = 'service_role');

-- 코멘트
COMMENT ON TABLE user_feedbacks IS '사용자 피드백 (버그 신고, 개선 제안, 기타)';
COMMENT ON COLUMN user_feedbacks.category IS '피드백 종류: bug(버그 신고), feature(개선 제안), other(기타)';
COMMENT ON COLUMN user_feedbacks.content IS '피드백 내용 (10-1000자)';
COMMENT ON COLUMN user_feedbacks.status IS '처리 상태: pending(대기), reviewed(검토), resolved(해결)';
COMMENT ON COLUMN user_feedbacks.admin_note IS '관리자 내부 메모';
COMMENT ON COLUMN user_feedbacks.response IS '사용자에게 보낼 답변 (향후 확장)';
COMMENT ON COLUMN user_feedbacks.is_public IS 'FAQ 공개 여부 (향후 확장)';
