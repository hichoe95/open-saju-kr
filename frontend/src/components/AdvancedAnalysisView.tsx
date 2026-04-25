'use client';

import { AdvancedAnalysis, ElementStats } from '@/types';
import { CheckCircleIcon as PhosphorCheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import GlossaryHighlight from './GlossaryHighlight';
import SinsalIcon from './SinsalIcon';
import styles from './AdvancedAnalysisView.module.css';
import { ScrollText, Sparkles, Scale, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Circle, Clock, Briefcase, Coins, Users, Activity, Calendar, Dumbbell, Sprout, GitCompare, BookOpen } from 'lucide-react';

interface Props {
    data: AdvancedAnalysis;
    elementStats: ElementStats;  // card.stats에서 직접 받음
}

// 십신군 설명
const SIPSIN_GROUP_DESC: Record<string, string> = {
    '비겁': '비견+겁재. 자아, 독립심, 형제/친구 관계',
    '식상': '식신+상관. 표현력, 창의성, 자녀/제자 관계',
    '재성': '편재+정재. 재물, 현실감각, 아버지/부인 관계',
    '관성': '편관+정관. 명예, 직장, 남편/권위 관계',
    '인성': '편인+정인. 학문, 사고력, 어머니/스승 관계',
};

// 설명 데이터 상수
const DESC_WONGOOK = {
    title: '사주 원국 분석이란?',
    content: '태어난 순간의 우주적 기운(음양오행)의 균형과 강약을 분석합니다. 신강/신약은 좋고 나쁨이 아닌 기질의 차이를 의미합니다.',
    items: [
        { label: '음양', desc: '발산(양)과 수렴(음) 에너지의 조화' },
        { label: '신강', desc: '주관이 뚜렷하고 밀고 나가는 힘이 강함' },
        { label: '신약', desc: '환경에 순응하며 실리를 챙기는 유연함' },
    ]
};

const DESC_SIPSIN = {
    title: '십신(十神)이란?',
    content: '나(일간)를 기준으로 다른 글자와의 관계를 사회적 역할(가족, 재물, 직업 등)로 해석한 것입니다.',
    items: [
        { label: '비겁', desc: '나 자신, 형제, 경쟁자, 주체성' },
        { label: '식상', desc: '표현, 창작, 자녀, 말과 행동' },
        { label: '재성', desc: '결과물, 재물, 아버지, 현실감각' },
        { label: '관성', desc: '조직, 규율, 명예, 직장, 인내심' },
        { label: '인성', desc: '문서, 학문, 어머니, 생각, 아이디어' },
    ]
};

const DESC_GEOKGUK = {
    title: '격국과 용신이란?',
    content: '사주 그릇의 형태와 핵심 열쇠를 의미합니다.',
    items: [
        { label: '격국', desc: '타고난 사회적 쓰임새와 대표적 스타일' },
        { label: '용신', desc: '사주의 불균형을 해결해주는 가장 필요한 기운' },
    ]
};

const DESC_INTERACTION = {
    title: '합·충·형·파·해란?',
    content: '글자들이 서로 만나 일으키는 다양한 화학 반응입니다.',
    items: [
        { label: '합(合)', desc: '서로 끌리고 묶여서 변하는 관계 (조화/답답)' },
        { label: '충(沖)', desc: '서로 부딪혀서 깨지거나 움직이는 관계 (변화/충돌)' },
        { label: '형(刑)', desc: '조정하고 깎아내며 맞춰가는 관계 (수술/가공/형벌)' },
        { label: '파(破)', desc: '서로 깨뜨리고 방해하는 관계 (차질/중단/균열)' },
        { label: '해(害)', desc: '육합을 방해하며 갈등을 일으키는 관계 (배신/측면공격)' },
    ]
};

const DESC_SINSAL = {
    title: '신살(神殺)이란?',
    content: '사주에 깃든 특별한 별의 기운으로, 삶에 독특한 색채를 더해줍니다.',
    items: [
        { label: '노랑 (귀인)', desc: '나를 돕고 보호해주는 귀한 별 (천을귀인 등)' },
        { label: '분홍 (도화)', desc: '매력, 인기, 예술성을 상징하는 별 (홍염살, 연살 등)' },
        { label: '초록 (역마)', desc: '이동, 변화, 활동성을 상징하는 별 (지살, 역마살 등)' },
        { label: '파랑 (살/기운)', desc: '강력한 프로페셔널 에너지 (백호살, 괴강살, 양인살)' },
        { label: '회색 (일반)', desc: '삶의 주기와 흐름을 나타내는 일반적인 신살' },
    ]
};

const DESC_SEUN = {
    title: '세운(歲運)이란?',
    content: '매년 들어오는 운의 흐름을 나타내며, 그 해의 전반적인 분위기와 사건을 예측합니다.',
    items: [
        { label: '세운', desc: '1년 단위로 들어오는 운 (예: 갑진년)' },
        { label: '대운', desc: '10년 단위로 들어오는 운의 큰 배경' },
    ]
};

// 신살 type → CSS class 매핑 (백엔드 type 문자열 정규화)
// 캐시된 데이터("12신살(연지)")와 신규 데이터 양쪽 모두 처리
const SINSAL_TYPE_CLASS: Record<string, string> = {
    '귀인': 'sinsal귀인',
    '도화': 'sinsal도화',
    '역마': 'sinsal역마',
    '살': 'sinsal살',
    '12신살_도화': 'sinsal12신살_도화',
    '12신살_역마': 'sinsal12신살_역마',
    '12신살_일반': 'sinsal12신살_일반',
    '12신살(연지)': 'sinsal12신살_일반', // 연지 기준 → 일반 스타일로 폴백
    '12신살_연지': 'sinsal12신살_일반',  // 향후 정규화된 값 대비
};

function getSinsalTypeClass(type: string): string {
    return SINSAL_TYPE_CLASS[type] ?? '';
}

function makeUniqueKeys(items: string[], prefix: string): string[] {
    const counts = new Map<string, number>();
    return items.map(item => {
        const n = counts.get(item) ?? 0;
        counts.set(item, n + 1);
        return n === 0 ? `${prefix}-${item}` : `${prefix}-${item}-${n}`;
    });
}

export default function AdvancedAnalysisView({ data }: Props) {
    // 음양 데이터 (백엔드에서 직접 계산됨)
    const yinyang = {
        양: data.yinyang_ratio?.yang ?? 4,
        음: data.yinyang_ratio?.yin ?? 4,
    };

    // 신강/신약 데이터 (백엔드에서 직접 계산됨)
    const strength = data.strength || '판단불가';

    const sipsin = {
        distribution: Array.isArray(data.sipsin?.distribution) ? data.sipsin.distribution : [],
        dominant: data.sipsin?.dominant || '',
        weak: data.sipsin?.weak || '',
        core_trait: data.sipsin?.core_trait || '',
        strengths: Array.isArray(data.sipsin?.strengths) ? data.sipsin.strengths : [],
        risks: Array.isArray(data.sipsin?.risks) ? data.sipsin.risks : [],
    };

    const geokgukYongsin = {
        geokguk: data.geokguk_yongsin?.geokguk || '',
        geokguk_basis: data.geokguk_yongsin?.geokguk_basis || '',
        yongsin: data.geokguk_yongsin?.yongsin || '',
        yongsin_basis: data.geokguk_yongsin?.yongsin_basis || '',
        heesin: data.geokguk_yongsin?.heesin || '',
        gisin: data.geokguk_yongsin?.gisin || '',
        confidence: data.geokguk_yongsin?.confidence || '',
    };

    const interactions = {
        items: Array.isArray(data.interactions?.items) ? data.interactions.items : [],
        gongmang: Array.isArray(data.interactions?.gongmang) ? data.interactions.gongmang : [],
        gongmang_meaning: data.interactions?.gongmang_meaning || '',
    };

    const sinsal = {
        items: Array.isArray(data.sinsal?.items) ? data.sinsal.items : [],
        summary: data.sinsal?.summary || '',
    };

    const seun = Array.isArray(data.seun) ? data.seun : [];
    const timeUncertaintyNote = data.time_uncertainty_note || '';

    return (
        <div className={styles.container}>
            {/* 1. 사주 원국 분석 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}><ScrollText size={18} /> 사주 원국 분석</h3>
                <div className={styles.card}>
                    {/* 음양/신강신약 */}
                    <div className={styles.balanceRow}>
                        <div className={styles.balanceItem}>
                            <span className={styles.balanceLabel}>음양 균형</span>
                            <div className={styles.balanceBar}>
                                <div
                                    className={styles.yangBar}
                                    style={{ width: `${(yinyang.양 / 8) * 100}%` }}
                                >
                                    陽 {yinyang.양}
                                </div>
                                <div
                                    className={styles.yinBar}
                                    style={{ width: `${(yinyang.음 / 8) * 100}%` }}
                                >
                                    陰 {yinyang.음}
                                </div>
                            </div>
                        </div>
                        <div className={styles.strengthBadge} data-strength={strength}>
                            {strength === '신강' && <Dumbbell size={16} />}
                            {strength === '신약' && <Sprout size={16} />}
                            {strength === '중화' && <Scale size={16} />}
                            {strength}
                        </div>
                    </div>
                    {/* 사주 원국 설명 */}
                    <details className={styles.descriptionBox}>
                        <summary className={styles.descSummary}>
                            <BookOpen size={14} />
                            <span>{DESC_WONGOOK.title}</span>
                        </summary>
                        <p>{DESC_WONGOOK.content}</p>
                        <div className={styles.descGrid}>
                            {DESC_WONGOOK.items.map((item) => (
                                <div key={item.label} className={styles.descItem}>
                                    <span className={styles.descLabel}>{item.label}</span>
                                    <span className={styles.descText}>{item.desc}</span>
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            </section>

            {/* 2. 십신 구조 분석 - 개선된 버전 */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}><Sparkles size={18} /> 십신 구조 분석</h3>
                <div className={styles.card}>
                    {/* 십신 배치도 */}
                    {sipsin.distribution.length > 0 && (
                        <div className={styles.sipsinGrid}>
                            {sipsin.distribution.map((item, i) => (
                                <div key={`sipsin-${item.name}-${item.count}-${i}`} className={styles.sipsinItem}>
                                    <div className={styles.sipsinName}>
                                        <GlossaryHighlight text={item.name} />
                                    </div>
                                    <div className={styles.sipsinCount}>{item.count}개</div>
                                    <div className={styles.sipsinPositions}>
                                        {(Array.isArray(item.positions) ? item.positions : []).map((pos) => (
                                            <span key={`${item.name}-${pos}`} className={styles.sipsinPos}>{pos}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 십신군 분석 */}
                    <div className={styles.sipsinGroupSection}>
                        <h4 className={styles.subTitle}>십신군 분석</h4>
                        <div className={styles.sipsinGroupGrid}>
                            <div className={`${styles.sipsinGroupCard} ${styles.groupStrong}`}>
                                <div className={styles.groupHeader}>
                                    <span className={styles.groupIcon}><TrendingUp size={16} /></span>
                                    <span className={styles.groupLabel}>강한 기운</span>
                                </div>
                                <div className={styles.groupName}>{sipsin.dominant}</div>
                                <div className={styles.groupDesc}>
                                    {SIPSIN_GROUP_DESC[sipsin.dominant] || ''}
                                </div>
                            </div>
                            <div className={`${styles.sipsinGroupCard} ${styles.groupWeak}`}>
                                <div className={styles.groupHeader}>
                                    <span className={styles.groupIcon}><TrendingDown size={16} /></span>
                                    <span className={styles.groupLabel}>약한 기운</span>
                                </div>
                                <div className={styles.groupName}>{sipsin.weak}</div>
                                <div className={styles.groupDesc}>
                                    {SIPSIN_GROUP_DESC[sipsin.weak] || ''}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 핵심 성향 */}
                    {sipsin.core_trait && (
                        <div className={styles.coreTrait}>
                            <h4 className={styles.subTitle}>핵심 성향</h4>
                            <p><GlossaryHighlight text={sipsin.core_trait} /></p>
                        </div>
                    )}

                    {/* 강점/리스크 */}
                    {(sipsin.strengths.length > 0 || sipsin.risks.length > 0) && (
                        <div className={styles.strengthRisk}>
                            {sipsin.strengths.length > 0 && (
                                <div className={styles.listGroup}>
                                    <h4><PhosphorCheckCircleIcon size={16} /> 강점</h4>
                                    <ul>
                                        {makeUniqueKeys(sipsin.strengths, 'strength').map((key, i) => (
                                            <li key={key}><GlossaryHighlight text={sipsin.strengths[i]} /></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {sipsin.risks.length > 0 && (
                                <div className={styles.listGroup}>
                                    <h4><AlertTriangle size={16} /> 주의점</h4>
                                    <ul>
                                        {makeUniqueKeys(sipsin.risks, 'risk').map((key, i) => (
                                            <li key={key}><GlossaryHighlight text={sipsin.risks[i]} /></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 십신 설명 */}
                    <details className={styles.descriptionBox}>
                        <summary className={styles.descSummary}>
                            <BookOpen size={14} />
                            <span>{DESC_SIPSIN.title}</span>
                        </summary>
                        <p>{DESC_SIPSIN.content}</p>
                        <div className={styles.descGrid}>
                            {DESC_SIPSIN.items.map((item) => (
                                <div key={item.label} className={styles.descItem}>
                                    <span className={styles.descLabel}>{item.label}</span>
                                    <span className={styles.descText}>{item.desc}</span>
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            </section>

            {/* 3. 격국/용신 - 존재할 때만 */}
            {(geokgukYongsin.geokguk || geokgukYongsin.yongsin) && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}><Scale size={18} /> 격국 & 용신</h3>
                    <div className={styles.card}>
                        <div className={styles.geokgukGrid}>
                            {geokgukYongsin.geokguk && (
                                <div className={styles.geokgukItem}>
                                    <span className={styles.geokgukLabel}>격국</span>
                                    <span className={styles.geokgukValue}>
                                        <GlossaryHighlight text={geokgukYongsin.geokguk} />
                                    </span>
                                    {geokgukYongsin.geokguk_basis && (
                                        <p className={styles.geokgukBasis}>{geokgukYongsin.geokguk_basis}</p>
                                    )}
                                </div>
                            )}
                            {geokgukYongsin.yongsin && (
                                <div className={styles.geokgukItem}>
                                    <span className={styles.geokgukLabel}>용신</span>
                                    <span className={styles.geokgukValue}>{geokgukYongsin.yongsin}</span>
                                    {geokgukYongsin.yongsin_basis && (
                                        <p className={styles.geokgukBasis}>{geokgukYongsin.yongsin_basis}</p>
                                    )}
                                </div>
                            )}
                        </div>
                        {(geokgukYongsin.heesin || geokgukYongsin.gisin) && (
                            <div className={styles.yongshinTags}>
                                {geokgukYongsin.heesin && (
                                    <span className={styles.tagGood}>희신: {geokgukYongsin.heesin}</span>
                                )}
                                {geokgukYongsin.gisin && (
                                    <span className={styles.tagBad}>기신: {geokgukYongsin.gisin}</span>
                                )}
                                {geokgukYongsin.confidence && (
                                    <span className={styles.tagConfidence}>확신도: {geokgukYongsin.confidence}</span>
                                )}
                            </div>
                        )}

                        {/* 격국 설명 */}
                        <details className={styles.descriptionBox}>
                            <summary className={styles.descSummary}>
                                <BookOpen size={14} />
                                <span>{DESC_GEOKGUK.title}</span>
                            </summary>
                            <p>{DESC_GEOKGUK.content}</p>
                            <div className={styles.descGrid}>
                                {DESC_GEOKGUK.items.map((item) => (
                                    <div key={item.label} className={styles.descItem}>
                                        <span className={styles.descLabel}>{item.label}</span>
                                        <span className={styles.descText}>{item.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </details>
                    </div>
                </section>
            )}

            {/* 4. 합충형파해/공망 - 개선된 버전 */}
            {(interactions.items.length > 0 || interactions.gongmang.length > 0) && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}><GitCompare size={18} /> 합·충·형·파·해 / 공망</h3>
                    <div className={styles.card}>
                        {interactions.items.length > 0 && (
                            <div className={styles.interactionsGrid}>
                                {interactions.items.map((item, i) => (
                                    <div key={`interaction-${item.type}-${item.pillars}-${item.chars}-${i}`} className={`${styles.interactionCard} ${styles[`interaction${item.type}`]}`}>
                                        <div className={styles.interactionHeader}>
                                            <span className={styles.interactionType}>
                                                {item.type_detail || item.type}
                                            </span>
                                            <span className={styles.interactionPillars}>{item.pillars}</span>
                                        </div>
                                        <div className={styles.interactionChars}>
                                            <GlossaryHighlight text={item.chars} />
                                        </div>
                                        <div className={styles.interactionMeaning}>
                                            <GlossaryHighlight text={item.meaning} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {interactions.gongmang.length > 0 && (
                            <div className={styles.gongmang}>
                                <div className={styles.gongmangHeader}>
                                    <span className={styles.gongmangIcon}><Circle size={16} /></span>
                                    <span className={styles.gongmangTitle}>공망 (空亡)</span>
                                </div>
                                <div className={styles.gongmangChars}>
                                    {interactions.gongmang.map((g) => (
                                        <span key={g} className={styles.gongmangChar}>{g}</span>
                                    ))}
                                </div>
                                {interactions.gongmang_meaning && (
                                    <p className={styles.gongmangMeaning}>{interactions.gongmang_meaning}</p>
                                )}
                            </div>
                        )}

                        {/* 합충 설명 */}
                        <details className={styles.descriptionBox}>
                            <summary className={styles.descSummary}>
                                <BookOpen size={14} />
                                <span>{DESC_INTERACTION.title}</span>
                            </summary>
                            <p>{DESC_INTERACTION.content}</p>
                            <div className={styles.descGrid}>
                                {DESC_INTERACTION.items.map((item) => (
                                    <div key={item.label} className={styles.descItem}>
                                        <span className={styles.descLabel}>{item.label}</span>
                                        <span className={styles.descText}>{item.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </details>
                    </div>
                </section>
            )}

            {/* 5. 신살 분석 - 개선된 버전 */}
            {sinsal.items.length > 0 && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}><Sparkles size={18} /> 신살 분석</h3>
                    <div className={styles.card}>
                        <div className={styles.sinsalGrid}>
                            {sinsal.items.map((item, i) => {
                                const displayName = item.name || item.type || '신살';
                                return (
                                <div key={`${displayName}-${item.position}-${item.type}-${i}`} className={`${styles.sinsalCard} ${styles[getSinsalTypeClass(item.type)] ?? ''}`}>
                                    <div className={styles.sinsalHeader}>
                                        <span className={styles.sinsalIcon}>
                                            <SinsalIcon name={displayName} size={40} />
                                        </span>
                                        <div className={styles.sinsalInfo}>
                                            <span className={styles.sinsalName}>{displayName}</span>
                                            <span className={styles.sinsalPosition}>{item.position}</span>
                                        </div>
                                    </div>
                                    <div className={styles.sinsalConditions}>
                                        <div className={styles.conditionGood}>
                                            <span className={styles.conditionIcon}><CheckCircle size={14} /></span>
                                            <span>{item.condition_good}</span>
                                        </div>
                                        <div className={styles.conditionBad}>
                                            <span className={styles.conditionIcon}><AlertTriangle size={14} /></span>
                                            <span>{item.condition_bad}</span>
                                        </div>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                        {sinsal.summary && (
                            <div className={styles.sinsalSummary}>
                                <GlossaryHighlight text={sinsal.summary} />
                            </div>
                        )}

                        {/* 신살 설명 */}
                        <details className={styles.descriptionBox}>
                            <summary className={styles.descSummary}>
                                <BookOpen size={14} />
                                <span>{DESC_SINSAL.title}</span>
                            </summary>
                            <p>{DESC_SINSAL.content}</p>
                            <div className={styles.descGrid}>
                                {DESC_SINSAL.items.map((item) => (
                                    <div key={item.label} className={styles.descItem}>
                                        <span className={styles.descLabel}>{item.label}</span>
                                        <span className={styles.descText}>{item.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </details>
                    </div>
                </section>
            )}

            {/* 6. 세운 분석 (있을 때만) */}
            {seun.length > 0 && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}><Calendar size={18} /> 세운 분석</h3>
                    <div className={styles.seunGrid}>
                        {seun.map((item) => (
                            <div key={`${item.year}-${item.ganji}`} className={styles.seunCard}>
                                <div className={styles.seunHeader}>
                                    <span className={styles.seunYear}>{item.year}년</span>
                                    <span className={styles.seunGanji}>
                                        <GlossaryHighlight text={item.ganji} />
                                    </span>
                                </div>
                                <div className={styles.seunDetails}>
                                    <div><Briefcase size={14} /> {item.career}</div>
                                    <div><Coins size={14} /> {item.money}</div>
                                    <div><Users size={14} /> {item.relationship}</div>
                                    <div><Activity size={14} /> {item.health}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 세운 설명 */}
                    <details className={styles.descriptionBox}>
                        <summary className={styles.descSummary}>
                            <BookOpen size={14} />
                            <span>{DESC_SEUN.title}</span>
                        </summary>
                        <p>{DESC_SEUN.content}</p>
                        <div className={styles.descGrid}>
                            {DESC_SEUN.items.map((item) => (
                                <div key={item.label} className={styles.descItem}>
                                    <span className={styles.descLabel}>{item.label}</span>
                                    <span className={styles.descText}>{item.desc}</span>
                                </div>
                            ))}
                        </div>
                    </details>
                </section>
            )}

            {/* 시간 불확실성 노트 */}
            {timeUncertaintyNote && (
                <div className={styles.uncertaintyNote}>
                    <span className={styles.uncertaintyIcon}><Clock size={16} /></span>
                    <div>
                        <strong>시간 불확실성 참고</strong>
                        <p>{timeUncertaintyNote}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
