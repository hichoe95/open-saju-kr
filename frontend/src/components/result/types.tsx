import { Heart, Coins, Briefcase, BookOpen, Activity, Users } from 'lucide-react';

export type TabKey = 'summary' | 'lucky' | 'love' | 'money' | 'career' | 'study' | 'health' | 'compatibility' | 'life' | 'daeun';

export const PRIMARY_TABS: TabKey[] = ['summary', 'lucky', 'daeun', 'life'];

export const SECONDARY_TAB_CONFIG: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'love', label: '연애', icon: <Heart size={16} color="#EC4899" /> },
    { key: 'money', label: '금전', icon: <Coins size={16} color="#F59E0B" /> },
    { key: 'career', label: '직장', icon: <Briefcase size={16} color="#3B82F6" /> },
    { key: 'study', label: '학업', icon: <BookOpen size={16} color="#8B5CF6" /> },
    { key: 'health', label: '건강', icon: <Activity size={16} color="#10B981" /> },
    { key: 'compatibility', label: '관계', icon: <Users size={16} color="#F97316" /> },
];

export const TAB_DESCRIPTIONS: Record<TabKey, string> = {
  summary: '태어난 순간의 우주 기운으로 나의 핵심 성격과 잠재력을 분석해요. 음양 균형, 십신 구조, 격국과 용신부터 신살까지 — 사주 DNA, 숨겨진 성격, 초능력까지 나도 몰랐던 진짜 나를 만나보세요. 올해 세운과의 관계까지 한 번에 정리해드려요.',
  lucky: '매일 바뀌는 나만의 행운 키트예요. 럭키 컬러·넘버·방향·아이템과 파워스팟, 골든타임·데드타임, 오늘의 미션까지 실용적인 정보를 담았어요. 오늘 하루를 내 편으로 만드는 가장 빠른 방법이에요.',
  daeun: '인생은 10년 단위로 큰 파도가 바뀌어요. 지금 어떤 대운의 흐름 위에 있는지, 앞으로 어떤 변화가 기다리는지 미리 알면 준비가 달라져요. 현재 대운의 특징과 다가올 대운의 방향을 함께 보여드려요.',
  life: '내 인생의 타임라인을 연도별로 펼쳐봐요. 과거의 중요한 전환점이 왜 그 시기에 왔는지 이해하고, 앞으로 기운이 어떻게 흘러갈지 주요 이벤트와 함께 정리해드려요. 지나온 길을 알면 앞으로 가야 할 방향이 보여요.',
  love: '타고난 연애 스타일과 이상형의 특성을 분석해요. 언제 인연이 들어오는 시기인지, 올해 연애 흐름이 상승인지 점검인지 짚어드려요. 나의 사랑 방식을 알면 관계가 훨씬 자연스러워져요.',
  money: '돈을 끌어당기는 나만의 패턴이 있어요. 재물을 모으는 성향, 재테크에 어울리는 방식, 올해 금전 흐름의 기회와 주의 시기를 알려드려요. 내 사주에 맞는 재물 전략을 세우는 데 도움이 돼요.',
  career: '직업 적성부터 직장에서의 강점까지 꼼꼼하게 짚어줘요. 올해 커리어 흐름이 어떻게 움직이는지, 승진이나 이직의 적절한 타이밍은 언제인지 분석해드려요. 나에게 맞는 일을 찾으면 에너지 소비가 확실히 달라져요.',
  study: '타고난 학습 스타일과 집중이 잘 되는 시간대를 알려드려요. 올해 학업 흐름과 시험 운세, 내 사주에 맞는 효과적인 공부 방법을 함께 정리해드려요. 노력의 방향을 맞추면 같은 시간으로 더 좋은 결과를 낼 수 있어요.',
  health: '오행 체질에 따라 약한 장기와 계절별 주의 사항이 달라요. 내 체질의 특성과 올해 특별히 챙겨야 할 건강 포인트를 짚어드려요. 미리 알고 관리하면 작은 습관으로도 큰 차이를 만들 수 있어요.',
  compatibility: '사람들과 어울리는 나만의 스타일과 사회적 궁합을 분석해요. 잘 맞는 유형과 에너지를 소모하게 하는 유형, 관계에서의 강점과 보완할 점을 알려드려요. 관계의 패턴을 이해하면 더 편안한 인간관계를 만들어갈 수 있어요.',
};
