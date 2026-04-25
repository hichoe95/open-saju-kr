export interface TriviaItem {
    id: number;
    icon: string;
    title: string;
    description: string;
    color: string;
}

export const SAJU_TRIVIA: TriviaItem[] = [
    {
        id: 1,
        icon: "/icons/emoji-replacements/misc/art.png",
        title: "당신의 사주에도 '색깔'이 있다는 사실!",
        description: "목(초록), 화(빨강), 토(황색), 금(흰색), 수(검정). 이 다섯 가지 오행의 색깔 중 내 사주팔자에 가장 많이 포함된 색이, 나를 가장 잘 나타내는 '퍼스널 컬러'가 되기도 합니다. 부족한 색의 옷을 입어 기운을 보완하는 것도 좋은 개운법이죠.",
        color: "bg-blue-500"
    },
    {
        id: 2,
        icon: "/icons/emoji-replacements/misc/peach.png",
        title: "도화살은 사실 '핵인싸'의 상징?",
        description: "과거에는 '복숭아 꽃의 향기에 벌레가 꼬인다' 하여 좋지 않게 보았지만, 현대 사회에서는 다릅니다. 사람들의 시선을 사로잡는 강력한 매력과 스타성을 의미하며, 연예인이나 인플루언서에게는 필수적인 '대박 성공 인자'로 꼽힙니다.",
        color: "bg-pink-500"
    },
    {
        id: 3,
        icon: "/icons/emoji-replacements/misc/horse.png",
        title: "역마살은 '글로벌 인재'의 증거",
        description: "한곳에 정착하지 못한다고 걱정하셨나요? 현대의 역마살은 활동 범위가 넓고, 여행, 출장, 해외 비즈니스 등에서 큰 성과를 내는 '디지털 노마드'의 기질입니다. 책상 앞보다는 현장이 더 잘 맞는 활동가 타입이죠.",
        color: "bg-purple-500"
    },
    {
        id: 4,
        icon: "/icons/emoji-replacements/misc/clock.png",
        title: "태어난 시간이 말년을 결정한다?",
        description: "사주에서 년(조상/초년), 월(부모/청년), 일(자신/중년), 시(자식/말년)를 의미합니다. 같은 날 태어났어도 태어난 시가 다르면 인생의 마무리가 완전히 달라집니다. '시'는 나의 은밀한 내면과 자식 복을 보여주는 중요한 열쇠입니다.",
        color: "bg-indigo-500"
    },
    {
        id: 5,
        icon: "/icons/emoji-replacements/misc/chart.png",
        title: "사주는 통계가 아니라 '계절학'",
        description: "사주는 단순히 생년월일을 맞추는 통계가 아닙니다. 내가 태어난 순간의 계절적 온도와 습도(조후)가 내 기질에 어떤 영향을 미쳤는지를 분석하는 '자연 인문학'입니다. 여름에 태어난 나무와 겨울에 태어난 나무가 다르게 자라는 것과 같죠.",
        color: "bg-teal-500"
    },
    {
        id: 6,
        icon: "/icons/emoji-replacements/misc/crown.png",
        title: "내 사주의 진짜 주인공은 '일간'",
        description: "사주 여덟 글자 중 가장 중요한 글자는 태어난 '일(Day)'의 천간(하늘 글자)입니다. 이를 '일간'이라 하며, 이것이 곧 '나' 자신을 상징합니다. 내가 큰 산인지, 흐르는 강물인지, 타오르는 촛불인지에 따라 삶을 대하는 태도가 결정됩니다.",
        color: "bg-orange-500"
    },
    {
        id: 7,
        icon: "/icons/emoji-replacements/misc/knife.png",
        title: "양인살, 프로페셔널의 상징",
        description: "칼을 쥐고 있다는 무시무시한 이름이지만, 현대에는 의사, 요리사, 디자이너, 엔지니어 등 도구를 정밀하게 다루는 최고의 기술직 전문가들에게서 자주 발견됩니다. 강한 승부욕과 프로 의식의 원천이기도 합니다.",
        color: "bg-red-500"
    },
    {
        id: 8,
        icon: "/icons/emoji-replacements/misc/graduation.png",
        title: "화개살, 고독하지만 화려한 예술가",
        description: "화려함을 덮는다는 뜻의 화개살은 내면의 세계가 깊고 철학적임을 의미합니다. 예술, 종교, 학문 분야에서 탁월한 두각을 나타내며, 혼자 있을 때 엄청난 창의력이 발휘되는 천재형 아티스트들이 많습니다.",
        color: "bg-yellow-500"
    },
    {
        id: 9,
        icon: "/icons/emoji-replacements/misc/handshake.png",
        title: "천을귀인, 최고의 수호천사",
        description: "사주에 천을귀인이 있다면 인생의 결정적인 위기마다 나를 돕는 귀인이 나타납니다. 내가 베풀지 않아도 주변에서 도움을 주려 하는 인복의 끝판왕이죠. 하지만 귀인만 믿고 게으르면 오히려 독이 될 수 있습니다.",
        color: "bg-green-500"
    },
    {
        id: 10,
        icon: "/icons/emoji-replacements/misc/money.png",
        title: "재고귀인, 창고에 돈을 쌓는다",
        description: "재물을 뜻하는 글자가 창고(진술축미)에 들어있는 경우입니다. 겉으로는 티가 안 나도 알짜배기 부자일 확률이 높습니다. 다만 창고 문이 열리는 시기(형충파해)가 와야 비로소 그 돈을 크게 쓸 수 있다는 조건이 있죠.",
        color: "bg-amber-500"
    },
    {
        id: 11,
        icon: "/icons/emoji-replacements/misc/justice.png",
        title: "대운은 10년마다 바뀌는 계절",
        description: "'대운이 들었다'고 할 때 대(大)는 좋다는 뜻이 아니라 '큰 변화'를 의미합니다. 10년마다 내 인생의 배경(계절)이 바뀌는 것이죠. 겨울 대운엔 준비하고, 봄 대운엔 씨를 뿌려야 합니다. 내 계절을 아는 것이 성공의 지름길입니다.",
        color: "bg-cyan-500"
    },
    {
        id: 12,
        icon: "/icons/emoji-replacements/misc/love.png",
        title: "궁합, 좋고 나쁨이 있을까?",
        description: "완벽하게 좋은 궁합도, 무조건 나쁜 궁합도 없습니다. 서로에게 없는 오행을 채워주면 좋은 궁합이지만, 너무 달라서 싸우기도 하죠. 궁합은 점수를 매기는 것이 아니라 '우리가 어디서 부딪히고 어떻게 맞춰갈지'를 아는 매뉴얼입니다.",
        color: "bg-rose-500"
    },
    {
        id: 13,
        icon: "/icons/emoji-replacements/misc/tree.png",
        title: "갑목(甲木), 뚫고 나가는 리더",
        description: "갑목 일주로 태어난 사람은 큰 나무처럼 곧게 뻗어나가려는 성질이 있습니다. 굽히기 싫어하고 자존심이 세지만, 그만큼 추진력과 리더십이 탁월합니다. 1등을 해야 직성이 풀리는 대장부 스타일이죠.",
        color: "bg-emerald-500"
    },
    {
        id: 14,
        icon: "/icons/emoji-replacements/misc/water.png",
        title: "임수(壬水), 지혜로운 전략가",
        description: "임수 일주는 드넓은 바다와 같습니다. 속을 알 수 없을 정도로 깊고, 상황에 따라 모양을 바꾸는 유연함을 가졌습니다. 지혜롭고 정보 수집 능력이 뛰어나며, 큰 그림을 그리는 기획자나 사상가가 많습니다.",
        color: "bg-sky-500"
    },
    {
        id: 15,
        icon: "/icons/emoji-replacements/misc/fire.png",
        title: "병화(丙火), 세상을 비추는 태양",
        description: "병화는 하늘에 뜬 태양입니다. 숨김없이 밝고 정열적이며, 만인에게 공평하게 빛을 비춥니다. 예의가 바르고 화끈한 성격으로, 어디서나 주목받는 분위기 메이커 역할을 합니다.",
        color: "bg-orange-600"
    }
];
