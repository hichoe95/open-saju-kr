import { ElementStats } from '@/types';

interface ElementalRadarProps {
    stats: ElementStats;
    stats2?: ElementStats;
    size?: number;
    color1?: string;
    color2?: string;
}

// 오행별 색상
const ELEMENT_COLORS: Record<string, string> = {
    wood: '#22C55E',  // 초록
    fire: '#EF4444',  // 빨강
    earth: '#F59E0B', // 황색
    metal: '#A855F7', // 보라
    water: '#3B82F6', // 파랑
};

export default function ElementalRadar({
    stats,
    stats2,
    size = 200,
    color1 = '#6366F1', // Indigo
    color2 = '#EF4444'  // Red
}: ElementalRadarProps) {
    const padding = 40;
    const radius = (size - padding * 2) / 2;
    const cx = size / 2;
    const cy = size / 2;

    const keys: (keyof ElementStats)[] = ['wood', 'fire', 'earth', 'metal', 'water'];
    const labels = ['목(木)', '화(火)', '토(土)', '금(金)', '수(水)'];

    // 최대값 고정: 5 (오행 분포 최대값)
    const maxVal = 5;

    const getPoints = (s: ElementStats) => {
        return keys.map((key, i) => {
            const val = Math.min(s[key], maxVal); // 최대값 초과 방지
            const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2; // -90도 부터 시작 (12시 방향)
            const r = (val / maxVal) * radius;
            return {
                x: cx + Math.cos(angle) * r,
                y: cy + Math.sin(angle) * r,
                val: s[key]
            };
        });
    };

    const points1 = getPoints(stats);
    const path1 = points1.map(p => `${p.x},${p.y}`).join(' ');

    const points2 = stats2 ? getPoints(stats2) : null;
    const path2 = points2 ? points2.map(p => `${p.x},${p.y}`).join(' ') : null;

    // 배경 오각형 (5단계)
    const webs = [0.2, 0.4, 0.6, 0.8, 1.0].map(scale => {
        const pts = keys.map((_, i) => {
            const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
            const r = radius * scale;
            return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
        }).join(' ');
        return <polygon key={scale} points={pts} fill="none" stroke="#E5E7EB" strokeWidth="1" />;
    });

    // 축 라인 + 라벨 (오행별 색상 적용)
    const axes = keys.map((key, i) => {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const x2 = cx + Math.cos(angle) * radius;
        const y2 = cy + Math.sin(angle) * radius;

        // 라벨 위치 (조금 더 바깥)
        const lx = cx + Math.cos(angle) * (radius + 20);
        const ly = cy + Math.sin(angle) * (radius + 20);

        return (
            <g key={key}>
                <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#E5E7EB" strokeWidth="1" />
                <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    fill={ELEMENT_COLORS[key]}
                    fontWeight="600"
                >
                    {labels[i]}
                </text>
            </g>
        );
    });

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* 배경 */}
            <circle cx={cx} cy={cy} r={radius} fill="#F9FAFB" stroke="none" opacity="0.5" />
            {webs}
            {axes}

            {/* 데이터 2 (뒤에 그림) */}
            {path2 && (
                <>
                    <polygon points={path2} fill={color2} fillOpacity="0.2" stroke={color2} strokeWidth="2" />
                    {points2?.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color2} />
                    ))}
                </>
            )}

            {/* 데이터 1 */}
            <polygon points={path1} fill={color1} fillOpacity={stats2 ? "0.3" : "0.5"} stroke={color1} strokeWidth="2" />

            {points1.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r="4" fill={color1} />
                </g>
            ))}
        </svg>
    );
}
