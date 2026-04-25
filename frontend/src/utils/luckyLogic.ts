import { ElementStats } from '@/types';

interface LuckyData {
    dominant: string;
    lacking: string;
    color: { name: string; hex: string; reason: string };
    items: string[];
    numbers: number[];
    amulet_text: string;
    avoid: string[];
}

const ELEMENT_KOREAN: Record<string, string> = {
    wood: '목(木)',
    fire: '화(火)',
    earth: '토(土)',
    metal: '금(金)',
    water: '수(水)',
};

const LUCKY_COLORS: Record<string, { name: string; hex: string; reason: string }[]> = {
    wood: [
        { name: '포레스트 그린', hex: '#228B22', reason: '싱그러운 나무의 기운이 성장을 돕습니다.' },
        { name: '민트', hex: '#98FF98', reason: '새로운 시작과 활력을 줍니다.' }
    ],
    fire: [
        { name: '코랄 레드', hex: '#FF7F50', reason: '열정과 에너지를 북돋아줍니다.' },
        { name: '선셋 오렌지', hex: '#FD5E53', reason: '자신감과 매력을 발산하게 합니다.' }
    ],
    earth: [
        { name: '샌드 베이지', hex: '#F4A460', reason: '안정감과 포용력을 줍니다.' },
        { name: '테라코타', hex: '#E2725B', reason: '단단한 기반을 다져줍니다.' }
    ],
    metal: [
        { name: '퓨어 화이트', hex: '#FFFFFF', reason: '결단력과 순수함을 상징합니다.' },
        { name: '실버 그레이', hex: '#C0C0C0', reason: '냉철한 이성과 세련미를 줍니다.' }
    ],
    water: [
        { name: '오션 블루', hex: '#0077BE', reason: '깊은 지혜와 유연함을 줍니다.' },
        { name: '차콜 블랙', hex: '#36454F', reason: '차분한 내면의 힘을 기르게 합니다.' }
    ],
};

const LUCKY_ITEMS: Record<string, string[]> = {
    wood: ['나무 빗', '식물 화분', '초록색 노트', '나무 향수', '꽃무늬 손수건'],
    fire: ['캔들', '붉은 립스틱', '태양 무늬 액세서리', '조명', '핫팩'],
    earth: ['도자기 머그', '체크무늬 담요', '가죽 지갑', '노란색 양말', '원석 팔찌'],
    metal: ['금속 시계', '화이트 셔츠', '은반지', '만년필', '메탈 안경'],
    water: ['텀블러', '검은색 우산', '어항/수족관', '진주 귀걸이', '물결무늬 스카프'],
};



const STATS_KEYS: (keyof ElementStats)[] = ['wood', 'fire', 'earth', 'metal', 'water'];

export function generateLuckyData(stats: ElementStats, dayGanji: string = ''): LuckyData {
    // 1. 부족한 오행 (Lacking) -> 보완해주어야 할 행운의 포인트
    // 점수가 가장 낮은 것을 찾음 (동점이면 랜덤)
    let minVal = 999;
    let lackingArr: string[] = [];

    STATS_KEYS.forEach(key => {
        if (stats[key] < minVal) {
            minVal = stats[key];
            lackingArr = [key];
        } else if (stats[key] === minVal) {
            lackingArr.push(key);
        }
    });
    // 시드: dayGanji + 오행 점수 + 오늘 날짜 (KST) → 매일 다른 결과
    const todayKST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const dateSeed = todayKST.split('-').reduce((acc, part) => acc + parseInt(part, 10), 0);
    const seed = dayGanji.length + minVal + dateSeed;
    const lacking = lackingArr[seed % lackingArr.length];

    // 2. 강한 오행 (Dominant)
    let maxVal = -1;
    let dominantArr: string[] = [];
    STATS_KEYS.forEach(key => {
        if (stats[key] > maxVal) {
            maxVal = stats[key];
            dominantArr = [key];
        } else if (stats[key] === maxVal) {
            dominantArr.push(key);
        }
    });
    const dominant = dominantArr[(seed + 1) % dominantArr.length];

    // 3. 행운 데이터 생성 (부족한 기운을 채워주는 것이 기본 원리)
    // 부족한 기운(Lacking)을 채워주는 아이템/장소를 추천
    const targetElement = lacking;

    const colors = LUCKY_COLORS[targetElement];
    const color = colors[seed % colors.length];

    const allItems = LUCKY_ITEMS[targetElement];
    // 랜덤 하게 3개 뽑기 (shuffling simulate)
    const items = [
        allItems[seed % allItems.length],
        allItems[(seed + 2) % allItems.length],
        allItems[(seed + 4) % allItems.length],
    ].filter((v, i, a) => a.indexOf(v) === i); // 중복 제거

    // 행운 번호 (1~45 중 6개)
    const nums = new Set<number>();
    let s = seed;
    // 시드 기반으로 6개 난수 생성 (중복 제거)
    while (nums.size < 6) {
        s = (s * 1664525 + 1013904223) % 4294967296;
        const n = (Math.abs(s) % 45) + 1;
        nums.add(n);
    }
    const numbers = Array.from(nums).sort((a, b) => a - b);

    // 오늘의 부적 문구
    const AMULETS = [
        "오늘은 당신의 날입니다. 자신감을 가지세요!",
        "작은 행운들이 모여 큰 기적을 만듭니다.",
        "잠시 쉬어가도 괜찮습니다. 여유를 가지세요.",
        "뜻밖의 기쁜 소식이 찾아올 거예요.",
        "당신의 직감을 믿으세요. 올바른 길입니다.",
        "웃으면 복이 옵니다. 한 번 크게 웃어보세요!",
    ];
    const amulet_text = AMULETS[seed % AMULETS.length];

    // 피해야 할 것 (과한 오행을 더 부추기는 것들)
    const avoidElement = dominant; // 강한 기운은 설기하거나 조절해야 함
    const avoid = [
        `너무 과한 ${ELEMENT_KOREAN[avoidElement]} 기운`,
        "충동적인 결정",
        "무절제한 소비"
    ];

    return {
        dominant,
        lacking,
        color,
        items,
        numbers,
        amulet_text,
        avoid
    };
}
