import styles from '../about/content.module.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

export const metadata: Metadata = {
    title: '사주 분석 활용 가이드',
    description: '사주 카드 읽기부터 대운 분석, AI 상담까지 사주 리포트를 200% 활용하는 5단계 가이드. 오행 그래프, 행운 키트, 맞춤 상담 활용법을 안내합니다.',
    alternates: {
        canonical: `${siteUrl}/how-it-works`,
    },
    openGraph: {
        title: '사주 분석 활용 가이드 | 사주 리포트',
        description: '사주 카드 읽기부터 AI 상담까지, 사주 리포트를 200% 활용하는 5단계 가이드.',
        url: `${siteUrl}/how-it-works`,
        type: 'article',
    },
};

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: '사용 가이드', item: `${siteUrl}/how-it-works` },
    ],
};

const howItWorksJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: '사주 리포트 200% 활용하기',
    description: '사주 카드, 대운 분석, 오늘의 운세, AI 상담까지 사주 리포트를 제대로 활용하는 방법을 안내합니다.',
    step: [
        {
            '@type': 'HowToStep',
            name: '내 사주 카드 읽기',
            text: '오행 그래프와 캐릭터 유형을 확인해 나의 기본 성향과 부족한 기운을 먼저 파악합니다.',
        },
        {
            '@type': 'HowToStep',
            name: '사주팔자 네 기둥 이해하기',
            text: '년주, 월주, 일주, 시주가 각각 어떤 삶의 영역을 설명하는지 읽으며 해석의 기준을 잡습니다.',
        },
        {
            '@type': 'HowToStep',
            name: '대운 분석으로 흐름 읽기',
            text: '현재 10년 대운과 앞으로 다가올 간지 흐름을 보며 인생의 큰 시즌 변화를 확인합니다.',
        },
        {
            '@type': 'HowToStep',
            name: '오늘의 행운 키트 활용하기',
            text: '행운의 색상, 장소, 부적 메시지를 활용해 오늘의 기운을 실생활 루틴에 연결합니다.',
        },
        {
            '@type': 'HowToStep',
            name: 'AI에게 구체적으로 질문하기',
            text: '연애, 진로, 금전 같은 실제 고민을 입력해 사주 명식 기반의 맞춤형 조언을 받습니다.',
        },
    ],
};

export default function HowItWorksPage() {
    return (
        <>
            <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd)}</script>
            <script type="application/ld+json">{JSON.stringify(howItWorksJsonLd)}</script>
            <main className={styles.container}>
                <Link href="/" className={styles.backLink}>← 홈으로</Link>
                <article className={styles.article}>
                    <h1>사주 리포트 200% 활용하기</h1>

                    <section>
                        <h2>1. 내 사주 카드 읽기</h2>
                        <p>
                            결과 페이지 최상단의 <strong>사주 카드</strong>는 나를 한마디로 정의하는 ID 카드입니다.
                        </p>
                        <ul>
                            <li><strong>오행 그래프</strong>: 목/화/토/금/수 중 나에게 과하거나 부족한 기운을 한눈에 보여줍니다. 부족한 기운은 행운 아이템(색상 등)으로 보완할 수 있습니다.</li>
                            <li><strong>캐릭터 유형</strong>: 나의 성향을 &apos;충직한 늑대&apos;, &apos;자유로운 나비&apos; 처럼 직관적인 캐릭터로 표현합니다.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>2. 사주팔자(네 개의 기둥) 이해하기</h2>
                        <p>
                            생년월일시는 네 개의 기둥(사주)이 되어 내 인생을 받치고 있습니다.
                        </p>
                        <ul>
                            <li><strong>년주(초년)</strong>: 나의 뿌리, 조상, 유년 시절의 환경</li>
                            <li><strong>월주(청년)</strong>: 부모님, 사회성, 직업적 적성 (가장 강력한 영향)</li>
                            <li><strong>일주(중년)</strong>: 나 자신(본원), 배우자, 내면의 성향</li>
                            <li><strong>시주(말년)</strong>: 자녀, 노후, 비밀스러운 욕망</li>
                        </ul>
                    </section>

                    <section>
                        <h2>3. 대운(Life Cycle) 분석</h2>
                        <p>
                            [대운 분석] 탭은 인생의 네비게이션입니다. 대운은 10년마다 운의 계절이 바뀌는 것을 의미합니다.
                        </p>
                        <ul>
                            <li><strong>현재 대운</strong>: 지금 내가 겪고 있는 10년의 테마입니다.</li>
                            <li><strong>간지 흐름</strong>: 앞으로 다가올 운의 변화를 미리 대비할 수 있습니다.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>4. 오늘의 행운 키트</h2>
                        <p>
                            [오늘의 운세] 탭에서는 매일매일 달라지는 일진(Daily Luck)을 바탕으로 실질적인 개운법을 제공합니다.
                        </p>
                        <ul>
                            <li>중요한 미팅이 있다면 <strong>행운의 색상</strong>의 옷을 입어보세요.</li>
                            <li>마음이 불안할 땐 <strong>행운의 장소</strong>를 방문해보세요.</li>
                            <li><strong>부적 메시지</strong>를 복사해서 카톡 배경이나 메모장에 간직하세요.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>5. 궁금한 점 물어보기</h2>
                        <p>
                            해석을 읽다가 궁금한 점이 생기거나, 선택의 기로에 섰을 때는 언제든
                            <strong>[AI에게 물어보기]</strong> 기능을 활용하세요.
                            단순한 챗봇이 아닌, 당신의 사주 명식을 꿰뚫고 있는 AI 분석가가 명쾌한 해답을 드립니다.
                        </p>
                    </section>
                </article>
                <nav className={styles.nav}>
                    <Link href="/faq">자주 묻는 질문 →</Link>
                    <Link href="/about">서비스 소개 →</Link>
                </nav>
            </main>
        </>
    );
}
