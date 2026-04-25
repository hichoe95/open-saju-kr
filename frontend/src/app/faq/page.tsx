import styles from '../about/content.module.css';
import legalStyles from '../legal.module.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

export const metadata: Metadata = {
    title: '자주 묻는 질문 - AI 사주 이용 안내',
    description: 'AI 사주 정확도, 이용 요금, 개인정보 보호, 궁합 분석 등 사주 리포트 이용 전 궁금한 9가지 질문과 답변. 태어난 시간을 모를 때 대처법도 안내합니다.',
    alternates: {
        canonical: `${siteUrl}/faq`,
    },
    openGraph: {
        title: '자주 묻는 질문 | 사주 리포트',
        description: 'AI 사주 정확도, 이용 요금, 개인정보 보호 등 9가지 궁금증을 해결해드립니다.',
        url: `${siteUrl}/faq`,
        type: 'article',
    },
};

const faqs = [
    {
        q: '사주 분석 결과는 얼마나 정확한가요?',
        a: '사주 리포트는 한국천문연구원 데이터를 기반으로 한 정밀 만세력 엔진을 사용하여 사주 명식을 산출합니다. 여기에 수만 건의 임상 데이터를 학습한 최신 AI 모델이 해석을 더해, 기존 어떤 프로그램보다 섬세하고 맥락에 맞는 분석을 제공합니다. 다만, 운명은 본인의 의지에 따라 변할 수 있음을 기억해주세요.'
    },
    {
        q: '결과를 나중에 다시 볼 수 있나요?',
        a: '네, 물론입니다! 분석된 결과는 브라우저에 자동으로 저장됩니다. 홈페이지 메인 화면 좌측 상단의 메뉴(햄버거 아이콘)를 누르신 후 "기록 보관함"을 선택하시면 언제든 지난 결과를 다시 확인하실 수 있습니다.'
    },
    {
        q: '대운(Great Luck) 정보가 뭔가요?',
        a: '대운은 10년마다 바뀌는 큰 운의 흐름을 말합니다. "대박 운"이 아니라 "큰(大) 주기"를 뜻합니다. 사주 리포트의 [대운 분석] 탭에서는 당신이 현재 어떤 대운을 지나고 있으며, 앞으로 어떤 변화가 다가올지 인생의 계절에 비유하여 설명해드립니다.'
    },
    {
        q: '특정 고민에 대해 질문할 수 있나요?',
        a: '네, 가능합니다. 분석 결과 페이지 하단의 [지금 고민, AI에게 물어보기] 버튼을 눌러보세요. 연애, 진로, 금전 등 구체적인 고민을 입력하면, 당신의 사주 정보를 바탕으로 AI 분석가가 개인화된 조언을 드립니다.'
    },
    {
        q: '궁합도 볼 수 있나요?',
        a: '네, [관계/궁합] 탭에서 상대방의 생년월일을 입력하면 두 사람의 기질적 조화, 장단점, 그리고 더 좋은 관계를 위한 현실적인 조언을 상세하게 받아보실 수 있습니다.'
    },
    {
        q: '개인정보는 안전한가요?',
        a: '가장 중요하게 생각하는 부분입니다. 입력하신 생년월일시는 오직 분석을 위해서만 일시적으로 사용되며, 서버에 영구 저장되지 않습니다. 기록 보관함의 데이터는 고객님의 기기(브라우저)에만 암호화되어 저장되므로 안심하셔도 됩니다.'
    },
    {
        q: '이용 요금은 얼마인가요?',
        a: '기능마다 필요한 엽전이 다릅니다. 현재는 사주 재분석 150엽전, AI 도사 상담 첫 질문 10엽전, 궁합 분석 50엽전처럼 단순한 가격 체계로 운영되고 있으며, 가입 시 100엽전 보너스가 지급됩니다.'
    },
    {
        q: '태어난 시간을 모르면 어떻게 하나요?',
        a: '시간을 모르면 [시주]에 해당하는 말년운과 자녀운 분석의 정확도가 다소 떨어질 수 있습니다. 시간을 모를 경우 "모름" 또는 정오(12:00)로 입력하시되, 결과 해석 시 시주와 관련된 부분은 참고만 해주세요.'
    },
    {
        q: '양력/음력 중 무엇을 입력해야 하나요?',
        a: '주민등록상의 날짜가 아닌, 실제 태어난 날짜를 입력해야 합니다. 요즘은 대부분 양력을 사용하지만, 어르신들의 경우 음력인 경우가 많으니 확인이 필요합니다. 입력 폼에서 양력/음력을 선택하실 수 있습니다.'
    }
];

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: '자주 묻는 질문', item: `${siteUrl}/faq` },
    ],
};

const faqPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: {
            '@type': 'Answer',
            text: faq.a,
        },
    })),
};

export default function FAQPage() {
    return (
        <>
            <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd)}</script>
            <script type="application/ld+json">{JSON.stringify(faqPageJsonLd)}</script>
            <main className={styles.container}>
                <Link href="/" className={styles.backLink}>← 홈으로</Link>
                <article className={styles.article}>
                    <h1>자주 묻는 질문 (FAQ)</h1>
                    <p className={legalStyles.faqSubtitle}>
                        서비스 이용과 관련하여 가장 많이 주시는 질문들을 모았습니다.
                    </p>
                    {faqs.map((faq) => (
                        <section key={faq.q} className={styles.faqItem}>
                            <h2 className={legalStyles.faqQuestion}>{faq.q}</h2>
                            <p className={legalStyles.faqAnswer}>{faq.a}</p>
                        </section>
                    ))}
                </article>
                <nav className={styles.nav}>
                    <Link href="/about">서비스 소개 →</Link>
                    <Link href="/how-it-works">사용 가이드 →</Link>
                </nav>
            </main>
        </>
    );
}
