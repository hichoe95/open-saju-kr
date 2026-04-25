import type { CampaignConfig } from './types';
import { publicSiteUrl } from '@/lib/publicConfig';

const SITE_URL = publicSiteUrl;

/**
 * Campaign registry — add new campaigns here.
 * Each entry powers an entire landing page at /lp/[slug].
 */
const campaigns: Record<string, CampaignConfig> = {
  '2026-love': {
    slug: '2026-love',
    metadata: {
      title: '2026 연애운 지금 확인하기 | 사주 리포트',
      description:
        'AI와 전통 명리학으로 읽는 2026 연애운. 생년월일만 입력하면 내 연애 흐름을 카드처럼 확인할 수 있어요.',
      canonical: `${SITE_URL}/lp/2026-love`,
      ogImage: `${SITE_URL}/icons/persona/dosa_classic_with_bg.png`,
    },
    primaryCta: '2026 연애운 지금 확인하기',
    ctaHref: '/?utm_source=instagram&utm_medium=paid&utm_campaign=2026-love&lp=2026-love',

    hero: {
      badge: '2026 LOVE FORTUNE',
      eyebrow: 'AI가 해석하는 나만의 사주 카드',
      headline: '2026년, 내 연애운은\n어떻게 풀릴까?',
      subhead:
        '전통 명리학과 AI를 결합해, 당신의 연애 흐름을 카드처럼 읽어드려요.',
      supportingLine:
        '생년월일만 입력하면 연애운부터 커리어운, 궁합 포인트까지 한 번에 확인할 수 있어요.',
      characterImage: '/icons/persona/dosa_classic.png',
      characterAlt: 'AI 도사 캐릭터',
    },

    storyTeaser: {
      label: '왜 2026 연애운일까',
      headline: '사람의 흐름은,\n생각보다 먼저 바뀌어요',
      body: '새로운 인연, 감정의 변화, 관계의 타이밍.\n2026년의 연애운은 지금부터 미리 읽어볼 수 있어요.',
      microCta: '내 흐름 미리 보기',
    },

    howItWorks: {
      headline: '사주 리포트는 이렇게 읽어요',
      steps: [
        {
          number: 1,
          label: '생년월일 입력',
          description: '양력 또는 음력, 태어난 시간까지',
        },
        {
          number: 2,
          label: 'AI 11개 동시 분석',
          description: '전통 명리학 기반으로 깊이 있게',
        },
        {
          number: 3,
          label: '카드형 결과 확인',
          description: '연애운·커리어운·궁합까지 한눈에',
        },
      ],
      supportingLine: '복잡한 명리학은 쉽게, 결과는 깊이 있게.',
    },

    previewCards: {
      headline: '이런 카드가 열려요',
      body: '연애운, 커리어운, 궁합 흐름까지 지금의 고민과 연결되는 카드로 보여드려요.',
      cards: [
        {
          title: '2026 연애운',
          description: '인연이 들어오는 시기와 감정의 흐름',
          accentVar: '--color-fire',
        },
        {
          title: '커리어운',
          description: '일과 관계가 함께 움직이는 타이밍',
          accentVar: '--primary',
        },
        {
          title: '궁합 포인트',
          description: '지금 만나는 사람과의 결',
          accentVar: '--accent',
        },
      ],
      ctaText: '내 카드 열어보기',
    },

    trust: {
      headline: '신비롭지만, 근거 있게',
      bullets: [
        {
          title: 'AI 11개 동시 분석',
          description: '하나의 사주를 11가지 관점에서 동시에 읽어요',
        },
        {
          title: '전통 명리학 기반 해석',
          description: '천간·지지·오행·십신, 정통 이론 위의 AI 해석',
        },
        {
          title: '개인정보 보호 적용',
          description: '입력한 생년월일은 AES-256 암호화로 안전하게 보호돼요',
        },
      ],
      supportingLine:
        '재미로 시작해도, 해석은 디테일하게 받아볼 수 있어요.',
    },

    persona: {
      headline: '정통 도사가 읽어드려요',
      body: '사주 리포트의 AI 도사는 전통 명리학의 틀 위에서, 지금의 고민을 모바일에 맞게 쉽게 풀어줘요.',
      quote:
        '"복잡한 운의 흐름도, 지금의 말로 쉽게 풀어드리겠습니다."',
      personaImage: '/icons/persona/dosa_classic_with_bg.png',
      personaAlt: '정통 AI 도사',
    },

    finalCta: {
      headline: '내 2026 연애운,\n지금 바로 확인하기',
      body: '2026년 연애운, 더 늦기 전에 지금 확인해보세요.',
      reassurance: '가입 시 100엽전을 받고, 더 깊은 해석은 원하는 만큼 이어갈 수 있어요.',
    },

    disclaimer:
      '사주 리포트는 전통 명리학 기반의 엔터테인먼트 서비스입니다.',
  },

  'free-saju': {
    slug: 'free-saju',
    metadata: {
      title: '무료 사주풀이 - AI가 분석하는 내 사주 | 사주 리포트',
      description:
        '생년월일만 입력하면 AI가 사주팔자를 즉시 분석합니다. 연애운, 금전운, 대운까지 무료로 확인하세요.',
      canonical: `${SITE_URL}/lp/free-saju`,
      ogImage: `${SITE_URL}/icons/persona/dosa_classic_with_bg.png`,
    },
    primaryCta: '무료로 내 사주 보기',
    ctaHref: '/?utm_source=organic&utm_medium=seo&utm_campaign=free-saju&lp=free-saju',

    hero: {
      badge: 'FREE SAJU ANALYSIS',
      eyebrow: '가입 없이 바로 시작',
      headline: '내 사주,\n3분이면 충분합니다',
      subhead:
        '생년월일시만 입력하면 AI가 천간·지지·오행을 분석하여 당신만의 사주 리포트를 즉시 제공합니다.',
      supportingLine:
        '회원가입 없이 무료로 사주 카드를 확인하고, 마음에 들면 더 깊은 해석을 이어가세요.',
      characterImage: '/icons/persona/dosa_classic.png',
      characterAlt: 'AI 도사 캐릭터',
    },

    storyTeaser: {
      label: '왜 사주를 볼까',
      headline: '운명을 바꾸는 건 아니지만,\n흐름을 읽으면 선택이 달라져요',
      body: '사주는 미래를 맞추는 게 아니라, 타고난 기질과 시기를 이해하는 도구입니다.\n나를 더 잘 알면, 더 나은 선택을 할 수 있어요.',
      microCta: '내 사주 무료로 확인하기',
    },

    howItWorks: {
      headline: '이렇게 간단해요',
      steps: [
        {
          number: 1,
          label: '생년월일 입력',
          description: '양력 또는 음력, 태어난 시간까지',
        },
        {
          number: 2,
          label: 'AI가 즉시 분석',
          description: '만세력 엔진 + AI 해석 동시 가동',
        },
        {
          number: 3,
          label: '카드형 결과 확인',
          description: '성격, 재물운, 건강운, 대운까지 한눈에',
        },
      ],
      supportingLine: '복잡한 사주를 카드 한 장으로 쉽게 읽어드려요.',
    },

    previewCards: {
      headline: '무료로 이만큼 볼 수 있어요',
      body: '사주 카드, 오행 분석, 커리어운까지 무료 리포트만으로도 충분히 의미 있는 결과를 확인할 수 있어요.',
      cards: [
        {
          title: '사주 카드',
          description: '오행 균형과 나만의 캐릭터 유형',
          accentVar: '--primary',
        },
        {
          title: '커리어운',
          description: '타고난 적성과 일의 흐름',
          accentVar: '--color-fire',
        },
        {
          title: '인생 흐름',
          description: '대운으로 보는 10년 주기 변화',
          accentVar: '--accent',
        },
      ],
      ctaText: '무료 카드 열어보기',
    },

    trust: {
      headline: '무료라고 대충이 아니에요',
      bullets: [
        {
          title: '한국천문연구원 데이터 기반',
          description: '정밀 만세력 엔진으로 사주 명식을 정확하게 산출해요',
        },
        {
          title: 'AI 다중 분석',
          description: '하나의 사주를 여러 관점에서 동시에 읽어요',
        },
        {
          title: 'AES-256 암호화',
          description: '입력한 생년월일은 안전하게 보호돼요',
        },
      ],
      supportingLine:
        '무료로 시작하고, 궁금하면 더 깊이 들어가세요.',
    },

    persona: {
      headline: 'AI 도사가 직접 읽어드려요',
      body: '전통 명리학의 이론 위에서, 지금 시대의 고민을 쉽고 따뜻하게 풀어드려요.',
      quote:
        '"어려운 사주 용어도, 지금의 말로 쉽게 읽어드리겠습니다."',
      personaImage: '/icons/persona/dosa_classic_with_bg.png',
      personaAlt: '정통 AI 도사',
    },

    finalCta: {
      headline: '내 사주,\n지금 무료로 확인하기',
      body: '3분이면 나의 타고난 기질과 운의 흐름을 확인할 수 있어요.',
      reassurance: '가입 시 100엽전 보너스. 더 깊은 해석도 원하는 만큼 이어갈 수 있어요.',
    },

    disclaimer:
      '사주 리포트는 전통 명리학 기반의 엔터테인먼트 서비스입니다.',
  },

  'compatibility': {
    slug: 'compatibility',
    metadata: {
      title: '사주 궁합 테스트 - AI 궁합 분석 | 사주 리포트',
      description:
        '두 사람의 사주로 궁합을 AI가 정밀 분석합니다. 연인·부부·친구 궁합을 확인해 보세요.',
      canonical: `${SITE_URL}/lp/compatibility`,
      ogImage: `${SITE_URL}/icons/persona/dosa_classic_with_bg.png`,
    },
    primaryCta: '우리 궁합 확인하기',
    ctaHref: '/?utm_source=organic&utm_medium=seo&utm_campaign=compatibility&lp=compatibility',

    hero: {
      badge: 'COMPATIBILITY TEST',
      eyebrow: '사주로 보는 두 사람의 케미',
      headline: '우리 둘, 사주로 보면\n얼마나 잘 맞을까?',
      subhead:
        '두 사람의 오행 조화와 일간 관계를 분석하여 관계의 강점과 주의할 점을 알려드립니다.',
      supportingLine:
        '연인, 부부, 친구, 비즈니스 파트너까지. 궁금한 그 사람과의 궁합을 확인해보세요.',
      characterImage: '/icons/persona/dosa_classic.png',
      characterAlt: 'AI 도사 캐릭터',
    },

    storyTeaser: {
      label: '왜 사주 궁합일까',
      headline: '좋은 관계에도\n타이밍과 결이 있어요',
      body: '성격이 맞아도 시기가 어긋나면 힘들고, 달라도 기운이 보완되면 좋은 관계가 되죠.\n사주 궁합은 그 결을 읽어주는 도구예요.',
      microCta: '우리 궁합 미리 보기',
    },

    howItWorks: {
      headline: '궁합 분석은 이렇게',
      steps: [
        {
          number: 1,
          label: '두 사람의 생년월일 입력',
          description: '나와 상대방의 생년월일시',
        },
        {
          number: 2,
          label: 'AI 궁합 분석',
          description: '오행 균형, 일간 상생상극, 합충 관계 종합',
        },
        {
          number: 3,
          label: '궁합 리포트 확인',
          description: '점수, 강점, 주의점, 소통 조언까지',
        },
      ],
      supportingLine: '두 사람의 사주를 겹쳐보면 보이는 것들이 있어요.',
    },

    previewCards: {
      headline: '이런 분석을 받아볼 수 있어요',
      body: '단순한 점수가 아닌, 두 사람의 관계를 다각도로 분석한 리포트를 제공해요.',
      cards: [
        {
          title: '오행 밸런스',
          description: '두 사람의 기운이 어떻게 보완되는지',
          accentVar: '--color-fire',
        },
        {
          title: '관계 역학',
          description: '일간 상생상극으로 보는 케미',
          accentVar: '--primary',
        },
        {
          title: '소통 가이드',
          description: '더 좋은 관계를 위한 실전 조언',
          accentVar: '--accent',
        },
      ],
      ctaText: '궁합 카드 열어보기',
    },

    trust: {
      headline: '정확하고 따뜻하게',
      bullets: [
        {
          title: '다각도 궁합 분석',
          description: '오행 균형, 합충 관계, 십신 상호작용까지 종합 판단',
        },
        {
          title: '관계별 맞춤 해석',
          description: '연인, 부부, 친구, 동료 등 관계 유형에 맞는 분석',
        },
        {
          title: '실전 소통 조언',
          description: '분석에서 끝나지 않고 실생활에 적용할 수 있는 팁 제공',
        },
      ],
      supportingLine:
        '궁합 결과를 카카오톡으로 공유하고 함께 확인해보세요.',
    },

    persona: {
      headline: 'AI 도사가 두 사람의 결을 읽어요',
      body: '수만 건의 궁합 데이터를 학습한 AI가, 두 사람의 관계를 깊이 있게 해석해드려요.',
      quote:
        '"인연의 깊이는 만남이 아니라, 서로를 이해하는 데서 시작됩니다."',
      personaImage: '/icons/persona/dosa_classic_with_bg.png',
      personaAlt: '정통 AI 도사',
    },

    finalCta: {
      headline: '우리 궁합,\n지금 바로 확인하기',
      body: '그 사람과 나, 사주로 보면 어떤 관계일까요?',
      reassurance: '결과를 카카오톡으로 공유하면 함께 확인할 수 있어요.',
    },

    disclaimer:
      '사주 리포트는 전통 명리학 기반의 엔터테인먼트 서비스입니다.',
  },

  'ai-saju': {
    slug: 'ai-saju',
    metadata: {
      title: 'AI 사주 상담 - GPT 기반 사주 분석 | 사주 리포트',
      description:
        'GPT·Gemini·Claude가 분석하는 새로운 사주 상담. AI 도사에게 내 사주를 물어보세요.',
      canonical: `${SITE_URL}/lp/ai-saju`,
      ogImage: `${SITE_URL}/icons/persona/dosa_classic_with_bg.png`,
    },
    primaryCta: 'AI 도사에게 물어보기',
    ctaHref: '/?utm_source=organic&utm_medium=seo&utm_campaign=ai-saju&lp=ai-saju',

    hero: {
      badge: 'AI SAJU ANALYSIS',
      eyebrow: '전통 명리학 x 인공지능',
      headline: '역학 지식을 학습한 AI 도사가\n당신의 사주를 읽습니다',
      subhead:
        '만세력 계산의 정확성과 AI의 해석력을 결합한 차세대 사주 분석 서비스.',
      supportingLine:
        'GPT, Gemini, Claude. 3개 AI 엔진이 동시에 분석하는 건 사주 리포트뿐이에요.',
      characterImage: '/icons/persona/dosa_classic.png',
      characterAlt: 'AI 도사 캐릭터',
    },

    storyTeaser: {
      label: '왜 AI 사주인가',
      headline: '사주 보는 방식이\n달라지고 있어요',
      body: '예약하고, 기다리고, 대면으로 들어야 했던 사주.\nAI 도사에게는 24시간 언제든, 궁금한 걸 바로 물어볼 수 있어요.',
      microCta: 'AI 사주 체험하기',
    },

    howItWorks: {
      headline: 'AI 사주, 이렇게 다릅니다',
      steps: [
        {
          number: 1,
          label: '생년월일 입력',
          description: '정밀 만세력 엔진이 사주 명식을 산출',
        },
        {
          number: 2,
          label: '멀티 AI 동시 분석',
          description: 'GPT·Gemini·Claude가 교차 해석',
        },
        {
          number: 3,
          label: 'AI 채팅 상담',
          description: '궁금한 점을 자유롭게 질문',
        },
      ],
      supportingLine: '분석 결과를 보고 끝이 아니라, 대화로 이어가세요.',
    },

    previewCards: {
      headline: 'AI만의 분석이 달라요',
      body: '기존 사주 풀이와는 차원이 다른, AI가 제공하는 다각도 분석을 확인해보세요.',
      cards: [
        {
          title: '멀티 AI 교차 분석',
          description: '3개 엔진이 동시에 읽는 깊이 있는 해석',
          accentVar: '--primary',
        },
        {
          title: 'AI 채팅 상담',
          description: '연애, 진로, 금전 고민을 자유롭게 질문',
          accentVar: '--color-fire',
        },
        {
          title: '실시간 맞춤 조언',
          description: '내 사주에 기반한 개인화된 답변',
          accentVar: '--accent',
        },
      ],
      ctaText: 'AI 분석 체험하기',
    },

    trust: {
      headline: '기술은 새롭고, 이론은 전통적이에요',
      bullets: [
        {
          title: '3개 AI 엔진 교차 분석',
          description: 'GPT, Gemini, Claude가 동시에 사주를 읽어 편향을 줄여요',
        },
        {
          title: '24시간 즉시 상담',
          description: '예약 없이, 대기 없이, 지금 바로 사주를 물어볼 수 있어요',
        },
        {
          title: '정통 명리학 이론 기반',
          description: '천간·지지·오행·십신, 검증된 이론 위의 AI 해석',
        },
      ],
      supportingLine:
        '전통의 깊이와 기술의 편리함, 둘 다 놓치지 않아요.',
    },

    persona: {
      headline: '세 명의 AI 도사가 함께 읽어요',
      body: '각기 다른 AI가 같은 사주를 해석하면, 더 균형 잡힌 시각을 얻을 수 있어요.',
      quote:
        '"하나의 사주, 세 가지 시선. 더 넓은 해석을 드리겠습니다."',
      personaImage: '/icons/persona/dosa_classic_with_bg.png',
      personaAlt: 'AI 도사',
    },

    finalCta: {
      headline: 'AI 도사에게\n내 사주 물어보기',
      body: '궁금했던 사주, 이제 AI에게 편하게 물어보세요.',
      reassurance: '가입 시 100엽전 보너스. 첫 분석은 무료로 시작할 수 있어요.',
    },

    disclaimer:
      '사주 리포트는 전통 명리학 기반의 엔터테인먼트 서비스입니다.',
  },

  'career-fortune': {
    slug: 'career-fortune',
    metadata: {
      title: '사주 직업운 - 나에게 맞는 커리어 찾기 | 사주 리포트',
      description:
        '사주팔자로 알아보는 나의 적성과 직업운. AI가 분석하는 최적의 커리어 방향을 확인하세요.',
      canonical: `${SITE_URL}/lp/career-fortune`,
      ogImage: `${SITE_URL}/icons/persona/dosa_classic_with_bg.png`,
    },
    primaryCta: '내 직업운 분석받기',
    ctaHref: '/?utm_source=organic&utm_medium=seo&utm_campaign=career-fortune&lp=career-fortune',

    hero: {
      badge: 'CAREER FORTUNE',
      eyebrow: '사주로 보는 나의 커리어',
      headline: '내 사주에 맞는 일,\n하고 계신가요?',
      subhead:
        '일간과 십신 구조로 타고난 적성을 파악하고, 대운 흐름에 따른 커리어 전략을 제안합니다.',
      supportingLine:
        '이직 고민, 창업 시기, 적성 찾기. 사주에서 힌트를 얻어보세요.',
      characterImage: '/icons/persona/dosa_classic.png',
      characterAlt: 'AI 도사 캐릭터',
    },

    storyTeaser: {
      label: '왜 사주로 직업운을 볼까',
      headline: '맞는 일을 하면,\n같은 노력도 다른 결과를 만들어요',
      body: '타고난 기질에 맞는 일을 할 때 성과가 나고,\n대운의 흐름에 맞춰 움직일 때 기회가 열려요.',
      microCta: '내 적성 확인하기',
    },

    howItWorks: {
      headline: '직업운 분석 과정',
      steps: [
        {
          number: 1,
          label: '생년월일 입력',
          description: '사주 명식으로 일간과 오행 파악',
        },
        {
          number: 2,
          label: '적성 분석',
          description: '십신 구조로 타고난 직업 성향 진단',
        },
        {
          number: 3,
          label: '커리어 전략 제안',
          description: '대운 흐름에 맞춘 이직·성장 타이밍',
        },
      ],
      supportingLine: '타고난 기질과 시기를 함께 읽어야 커리어가 보여요.',
    },

    previewCards: {
      headline: '이런 분석을 받아볼 수 있어요',
      body: '단순한 직업 추천이 아닌, 사주 구조에 기반한 깊이 있는 커리어 분석이에요.',
      cards: [
        {
          title: '타고난 적성',
          description: '오행·십신으로 보는 직업 성향',
          accentVar: '--primary',
        },
        {
          title: '이직·창업 타이밍',
          description: '대운 흐름에서 읽는 최적 시기',
          accentVar: '--color-fire',
        },
        {
          title: '성장 전략',
          description: '현재 위치에서 다음 스텝 조언',
          accentVar: '--accent',
        },
      ],
      ctaText: '내 커리어 카드 열기',
    },

    trust: {
      headline: '근거 있는 커리어 조언',
      bullets: [
        {
          title: '십신 구조 분석',
          description: '편관·정관·식신·상관 등 직업 관련 십신을 정밀 분석',
        },
        {
          title: '대운 기반 타이밍',
          description: '10년 주기 대운과 세운으로 이직·성장 최적 시기 파악',
        },
        {
          title: 'AI 맞춤 상담',
          description: '구체적인 커리어 고민을 AI 도사에게 직접 질문 가능',
        },
      ],
      supportingLine:
        '사주는 정답이 아니라 방향입니다. 선택은 항상 당신의 것이에요.',
    },

    persona: {
      headline: 'AI 도사의 커리어 상담',
      body: '수만 건의 사주 데이터를 학습한 AI가 당신의 직업 적성과 타이밍을 읽어드려요.',
      quote:
        '"타고난 그릇을 알면, 어디에 물을 담을지 보이기 시작합니다."',
      personaImage: '/icons/persona/dosa_classic_with_bg.png',
      personaAlt: '정통 AI 도사',
    },

    finalCta: {
      headline: '내 사주에 맞는 커리어,\n지금 확인하기',
      body: '이직할까, 버틸까, 창업할까. 사주에서 힌트를 찾아보세요.',
      reassurance: '가입 시 100엽전 보너스. 커리어운 분석은 무료로 제공돼요.',
    },

    disclaimer:
      '사주 리포트는 전통 명리학 기반의 엔터테인먼트 서비스입니다.',
  },
};

/**
 * Get campaign config by slug. Returns undefined for unknown campaigns.
 */
export function getCampaign(slug: string): CampaignConfig | undefined {
  return campaigns[slug];
}

/**
 * Get all campaign slugs (for static generation if needed).
 */
export function getAllCampaignSlugs(): string[] {
  return Object.keys(campaigns);
}
