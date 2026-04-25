'use client';

import { useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { usePayment } from '@/contexts/PaymentContext';
import styles from './page.module.css';
import { publicBusinessSummary, publicContactEmail, publicContactSummary, publicMailOrderNumber } from '@/lib/publicConfig';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Scroll,
  Brain,
  MessageCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  Sparkle,
} from 'lucide-react';

const SEEN_ABOUT_KEY = 'seen_about_before_signup';

export default function AboutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { prices } = usePayment();
  const isFromSignup = searchParams.get('from') === 'signup';

  const handleContinueToSignup = () => {
    sessionStorage.setItem(SEEN_ABOUT_KEY, 'true');
    router.replace('/signup');
  };

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const {
    readingPrice,
    aiChatPrice,
    aiChatFollowupPrice,
    flowAdvicePrice,
    compatibilityPrice,
  } = useMemo(() => ({
    readingPrice: prices?.reading_reanalyze ?? 150,
    aiChatPrice: prices?.ai_chat ?? 10,
    aiChatFollowupPrice: prices?.ai_chat_followup ?? 10,
    flowAdvicePrice: prices?.flow_ai_advice ?? 20,
    compatibilityPrice: prices?.compatibility ?? 50,
  }), [prices]);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.hero}>
          {!isFromSignup && (
            <Link href="/" className={styles.backButton}>
              <ArrowLeft size={18} />
              <span>돌아가기</span>
            </Link>
          )}
          <div className={styles.heroBadge}>
            <Sparkles size={14} />
            <span>현대적 명리학 플랫폼</span>
          </div>
          <h1 className={styles.heroTitle}>
            당신의 인생,<br />
            <span className={styles.highlight}>데이터</span>로 읽다
          </h1>
          <p className={styles.heroSubtitle}>
            수천 년의 명리학을 AI가 만나다<br />
            할머니 점집의 정성 + AI의 정확함
          </p>
          <div className={styles.heroImageWrapper}>
            <Image
              src="/icons/about/dosa_welcome.png"
              alt="AI 도사"
              width={160}
              height={160}
              className={styles.heroImage}
              priority
            />
          </div>
        </header>

        <section className={styles.introSection}>
          <div className={styles.introCard}>
            <h3>&quot;할머니 점집 가기 민망했잖소&quot;</h3>
            <p>
              궁금한 건 많은데 점집 가기엔 좀 그렇고,<br />
              인터넷 운세는 &quot;오늘 좋은 일이 있을 거예요&quot; 같은<br />
              뻔한 말만 해서 답답하셨나요?
            </p>
          </div>
          <div className={styles.solutionCard}>
            <div className={styles.solutionHeader}>
              <Brain className={styles.solutionIcon} size={24} />
              <h3>AI x 명리학</h3>
            </div>
            <p>
              이 도사는 <strong>수천 년의 데이터</strong>를 학습하고<br />
              <strong>최신 AI 기술</strong>로 분석하여,<br />
              &quot;그래서 나 어떻게 하라고?&quot;에 대한<br />
              <strong>실질적인 인생 공략집</strong>을 드립니다.
            </p>
          </div>
        </section>

        <section className={styles.featureSection}>
          <h2 className={styles.sectionTitle}>
            <Scroll size={24} />
            <span>인생의 모든 영역 분석</span>
          </h2>
          <div className={styles.grid8}>
            {[
              { icon: '/icons/about/dosa_crystal.png', label: '종합 분석', desc: '나의 캐릭터와 그릇' },
              { icon: '/icons/love.png', label: '연애운', desc: '인연 시기와 스타일' },
              { icon: '/icons/money.png', label: '금전운', desc: '돈 그릇과 투자 성향' },
              { icon: '/icons/career.png', label: '커리어', desc: '적성과 이직 타이밍' },
              { icon: '/icons/clover.png', label: '학업운', desc: '합격운과 공부법' },
              { icon: '/icons/today.png', label: '건강운', desc: '취약 부위 관리' },
              { icon: '/icons/compatibility.png', label: '관계/궁합', desc: '케미 지수와 처세술' },
              { icon: '/icons/daeun.png', label: '인생 흐름', desc: '10년 대운과 시즌' },
            ].map((item) => (
              <div key={item.label} className={styles.gridItem}>
                <Image src={item.icon} alt={item.label} width={40} height={40} />
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.funSection}>
          <h2 className={styles.sectionTitle}>
            <Zap size={24} />
            <span>이런 것도 알려준대요</span>
          </h2>
          <div className={styles.funGrid}>
            <div className={styles.funCard}>
              <div className={styles.funHeader}>
                <span className={styles.funBadge}>NEW</span>
                <h3>숨겨진 내 캐릭터</h3>
              </div>
              <ul className={styles.funList}>
                <li>조선시대 내 직업은?</li>
                <li>나의 영혼의 동물</li>
                <li><Sparkle size={16} style={{ display: 'inline', marginRight: '4px' }} /> 타고난 아우라 컬러</li>
                <li>인생 5대 스탯 차트</li>
              </ul>
            </div>
            <div className={styles.funCard}>
              <div className={styles.funHeader}>
                <span className={styles.funBadge}>HOT</span>
                <h3>현실 밀착 가이드</h3>
              </div>
              <ul className={styles.funList}>
                <li>오늘의 미션 & 부적</li>
                <li>오늘 점심 메뉴 추천</li>
                <li>필살 플러팅 멘트</li>
                <li>내 돈샘 경고 신호</li>
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.personaSection}>
          <h2 className={styles.sectionTitle}>
            <MessageCircle size={24} />
            <span>4가지 도사 페르소나</span>
          </h2>
          <p className={styles.sectionDesc}>내 스타일에 맞는 도사를 골라보세요</p>

          <div className={styles.personaGrid}>
            <div className={styles.personaCard}>
              <div className={styles.personaImageWrapper}>
                <Image
                  src="/icons/persona/dosa_classic.png"
                  alt="정통 도사"
                  width={80}
                  height={80}
                  className={styles.personaImage}
                />
              </div>
              <strong>정통 도사</strong>
              <p>&quot;자네의 운명을 논해보세.&quot;<br />진중하고 깊이 있는 선생님</p>
            </div>
            <div className={styles.personaCard}>
              <div className={styles.personaImageWrapper}>
                <Image
                  src="/icons/persona/dosa_mz.png"
                  alt="MZ 도사"
                  width={80}
                  height={80}
                  className={styles.personaImage}
                />
              </div>
              <strong>MZ 도사</strong>
              <p>&quot;너 완전 럭키비키잖아!&quot;<br />솔직하고 힙한 친구</p>
            </div>
            <div className={styles.personaCard}>
              <div className={styles.personaImageWrapper}>
                <Image
                  src="/icons/persona/dosa_warm.png"
                  alt="따뜻한 도사"
                  width={80}
                  height={80}
                  className={styles.personaImage}
                />
              </div>
              <strong>따뜻한 도사</strong>
              <p>&quot;많이 힘들었죠?&quot;<br />다정하게 공감해주는 어른</p>
            </div>
            <div className={styles.personaCard}>
              <div className={styles.personaImageWrapper}>
                <Image
                  src="/icons/persona/dosa_witty.png"
                  alt="위트 도사"
                  width={80}
                  height={80}
                  className={styles.personaImage}
                />
              </div>
              <strong>위트 도사</strong>
              <p>&quot;이러다 거지꼴을 못 면해!&quot;<br />유머러스한 팩폭러</p>
            </div>
          </div>
        </section>

        <section className={styles.pricingSection}>
          <h2 className={styles.sectionTitle}>
            <div className={styles.coinIconWrapper}>
              <div className={styles.coinIcon}>엽</div>
            </div>
            <span>이용 요금</span>
          </h2>
          <div className={styles.pricingTable}>
            <div className={styles.pricingRow}>
              <div className={styles.pricingInfo}>
                <strong>기본 사주 분석</strong>
                <span>정밀 리포트 제공</span>
              </div>
              <span className={styles.price}>{readingPrice} 엽전</span>
            </div>
            <div className={styles.pricingRow}>
              <div className={styles.pricingInfo}>
                <strong>AI 도사 상담</strong>
                <span>사주 기반 맞춤 상담 · 추가 대화는 1회당 {aiChatFollowupPrice} 엽전</span>
              </div>
              <span className={styles.price}>{aiChatPrice} 엽전</span>
            </div>
            <div className={styles.pricingRow}>
              <div className={styles.pricingInfo}>
                <strong>AI 일운 조언</strong>
                <span>오늘의 운세 심층 분석</span>
              </div>
              <span className={styles.price}>{flowAdvicePrice} 엽전</span>
            </div>
            <div className={styles.pricingRow}>
              <div className={styles.pricingInfo}>
                <strong>AI 궁합 분석</strong>
                <span>상대방과의 케미</span>
              </div>
              <span className={styles.price}>{compatibilityPrice} 엽전</span>
            </div>
          </div>
          <p className={styles.pricingNote}>
            * 1,000원 = 100엽전 · 가입 시 100엽전 지급!
          </p>
        </section>

        <section className={styles.faqSection}>
          <h2 className={styles.sectionTitle}>자주 묻는 질문</h2>
          <div className={styles.accordion}>
            {[
              {
                q: '정말 맞나요?',
                a: "동양 명리학 이론을 충실히 따르고, 수많은 케이스로 검증된 알고리즘을 사용합니다. 다만 100% 예측은 불가능하니, 인생을 주체적으로 살아가기 위한 '전략 지도'로 활용해주세요."
              },
              {
                q: '태어난 시간을 모르면요?',
                a: "'모름'을 선택하시면 됩니다. 시간 없이도 생년월일만으로 전체적인 흐름과 성향 분석이 가능합니다. 다만 시주(시간)와 관련된 말년운 등은 제외됩니다."
              },
              {
                q: '개인정보는 안전한가요?',
                a: '철통 보안! 생년월일은 암호화되어 분석에만 사용되며, 회원 탈퇴 시 모든 데이터는 즉시 파기됩니다. 안심하고 이용하세요.'
              }
            ].map((item, idx) => (
              <div key={item.q} className={styles.faqItem}>
                <button
                  type="button"
                  className={styles.faqQuestion}
                  onClick={() => toggleFaq(idx)}
                >
                  <span>Q. {item.q}</span>
                  {openFaqIndex === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {openFaqIndex === idx && (
                  <div className={styles.faqAnswer}>
                    <p>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.ctaContent}>
            <Image
              src="/icons/about/dosa_promise.png"
              alt="도사"
              width={80}
              height={80}
              className={styles.ctaIcon}
            />
            {isFromSignup ? (
              <>
                <h2 className={styles.ctaTitle}>서비스 소개를 확인하셨군요!</h2>
                <p className={styles.ctaDesc}>
                  이제 회원가입을 완료하고<br />진짜 내 모습을 발견해보세요.
                </p>
                <button
                  type="button"
                  onClick={handleContinueToSignup}
                  className={styles.ctaButton}
                >
                  <span>회원가입 계속하기</span>
                  <ArrowRight size={20} />
                </button>
              </>
            ) : (
              <>
                <h2 className={styles.ctaTitle}>준비되셨나요?</h2>
                <p className={styles.ctaDesc}>
                  당신의 사주를 AI 도사가<br />지금 바로 분석해드립니다.
                </p>
                <Link href="/" className={styles.ctaButton}>
                  <span>내 사주 보러 가기</span>
                  <ArrowRight size={20} />
                </Link>
              </>
            )}
          </div>
        </section>

        <footer className={styles.footer}>
          <p className={styles.footerContact}>문의: {publicContactEmail}</p>
          <div className={styles.footerLinks}>
            <Link href="/privacy">개인정보처리방침</Link>
            <Link href="/terms">이용약관</Link>
          </div>
          <p className={styles.businessInfo}>
            {publicBusinessSummary}<br />
            통신판매업신고: {publicMailOrderNumber}<br />
            {publicContactSummary}
          </p>
          <p className={styles.copyright}>© 2026 AI 운세 리포트. 재미로 보는 운세입니다.</p>
        </footer>
      </div>
    </main>
  );
}
