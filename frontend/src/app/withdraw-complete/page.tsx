'use client';

import { useEffect, useState, Suspense, startTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, ExternalLink, Home, Smartphone, Monitor } from 'lucide-react';
import styles from './page.module.css';

type Provider = 'kakao' | 'naver' | null;

interface UnlinkGuide {
  provider: string;
  displayName: string;
  iconPath: string;
  color: string;
  mobile: {
    title: string;
    steps: string[];
  };
  pc: {
    title: string;
    steps: string[];
    url?: string;
  };
}

const UNLINK_GUIDES: Record<string, UnlinkGuide> = {
  kakao: {
    provider: 'kakao',
    displayName: '카카오',
    iconPath: '/icons/emoji-replacements/misc/kakao_circle.png',
    color: '#FEE500',
    mobile: {
      title: '카카오톡 앱에서',
      steps: [
        '카카오톡 앱 실행',
        '더보기(···) → 설정 탭',
        '카카오계정 선택',
        '연결된 서비스 관리',
        '외부 서비스 → "mysaju" 선택',
        '연결 끊기 → 전체 동의 철회',
      ],
    },
    pc: {
      title: 'PC 웹에서',
      steps: [
        'accounts.kakao.com 접속 및 로그인',
        '좌측 메뉴 "계정 이용" 클릭',
        '"연결된 서비스 관리" 선택',
        '"외부 서비스" 탭에서 "mysaju" 찾기',
        '연결 끊기',
      ],
      url: 'https://accounts.kakao.com',
    },
  },
  naver: {
    provider: 'naver',
    displayName: '네이버',
    iconPath: '/icons/emoji-replacements/misc/naver_circle.png',
    color: '#03C75A',
    mobile: {
      title: '네이버 앱에서',
      steps: [
        '네이버 앱 실행 → 좌측 상단 메뉴(≡)',
        '프로필 영역(이름) 클릭',
        '스크롤하여 "이력 관리" 섹션 찾기',
        '"연결된 서비스 관리" 클릭',
        '"mysaju" 선택 → 서비스 동의 철회',
      ],
    },
    pc: {
      title: 'PC 웹에서',
      steps: [
        '네이버 로그인 후 "내정보" 클릭',
        '"이력관리" 메뉴 선택',
        '"연결된 서비스 관리"에서 전체보기 클릭',
        '"mysaju" 찾아서 이용 동의 철회',
      ],
      url: 'https://nid.naver.com/user2/help/myInfo',
    },
  },
};

function WithdrawCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [guide, setGuide] = useState<UnlinkGuide | null>(null);

   useEffect(() => {
      const providerParam = searchParams.get('provider') as Provider;
      if (providerParam && UNLINK_GUIDES[providerParam]) {
        startTransition(() => {
          setGuide(UNLINK_GUIDES[providerParam]);
        });
      }
   }, [searchParams]);

  const handleGoHome = () => {
    router.push('/onboarding');
  };

  const handleOpenUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={styles.container}>
      <main className={styles.content}>
        {/* Success Message */}
        <section className={styles.successSection}>
          <div className={styles.successIcon}>
            <CheckCircle size={64} strokeWidth={1.5} />
          </div>
          <h1 className={styles.title}>탈퇴가 완료되었습니다</h1>
          <p className={styles.subtitle}>
            그동안 mysaju를 이용해 주셔서 감사합니다.
            <br />
            언제든 다시 찾아주세요!
          </p>
        </section>

        {/* Unlink Guide */}
        {guide && (
          <section className={styles.guideSection}>
            <div className={styles.guideHeader}>
              <img src={guide.iconPath} alt={guide.displayName} width={24} height={24} className={styles.providerIcon} />
              <h2 className={styles.guideTitle}>
                {guide.displayName} 연동 해제 안내
              </h2>
            </div>

            <p className={styles.guideDescription}>
              완전한 개인정보 삭제를 위해,
              <br />
              <strong>{guide.displayName} 계정</strong>에서도 앱 연결을 해제해 주세요.
            </p>

            <div className={styles.guideCards}>
              {/* Mobile Guide */}
              <div className={styles.guideCard}>
                <div className={styles.cardHeader}>
                  <Smartphone size={20} />
                  <span>{guide.mobile.title}</span>
                </div>
                <ol className={styles.stepList}>
                  {guide.mobile.steps.map((step, index) => (
                    <li key={index} className={styles.stepItem}>
                      <span className={styles.stepNumber}>{index + 1}</span>
                      <span className={styles.stepText}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* PC Guide */}
              <div className={styles.guideCard}>
                <div className={styles.cardHeader}>
                  <Monitor size={20} />
                  <span>{guide.pc.title}</span>
                </div>
                <ol className={styles.stepList}>
                  {guide.pc.steps.map((step, index) => (
                    <li key={index} className={styles.stepItem}>
                      <span className={styles.stepNumber}>{index + 1}</span>
                      <span className={styles.stepText}>{step}</span>
                    </li>
                  ))}
                </ol>
                {guide.pc.url && (
                  <button
                    className={styles.linkButton}
                    onClick={() => handleOpenUrl(guide.pc.url!)}
                    style={{ '--provider-color': guide.color } as React.CSSProperties}
                  >
                    <span>{guide.displayName} 계정 관리 페이지</span>
                    <ExternalLink size={16} />
                  </button>
                )}
              </div>
            </div>

            <p className={styles.guideNote}>
              * 연동 해제를 하지 않으면, 재가입 시 별도의 인증 없이 자동 로그인될 수 있습니다.
            </p>
          </section>
        )}

        {/* No Provider - Generic Message */}
        {!guide && (
          <section className={styles.guideSection}>
            <p className={styles.guideDescription}>
              소셜 로그인을 사용하셨다면,
              <br />
              해당 플랫폼에서도 앱 연결을 해제해 주세요.
            </p>
          </section>
        )}

        {/* Home Button */}
        <button className={styles.homeButton} onClick={handleGoHome}>
          <Home size={20} />
          <span>홈으로 돌아가기</span>
        </button>
      </main>
    </div>
  );
}

export default function WithdrawCompletePage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <main className={styles.content}>
          <section className={styles.successSection}>
            <div className={styles.successIcon}>
              <CheckCircle size={64} strokeWidth={1.5} />
            </div>
            <h1 className={styles.title}>로딩 중...</h1>
          </section>
        </main>
      </div>
    }>
      <WithdrawCompleteContent />
    </Suspense>
  );
}
