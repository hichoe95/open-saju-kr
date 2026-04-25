'use client';

import { useMemo, useState } from 'react';
import styles from '../ResultTabs.module.css';
import { Calendar, Lightbulb, Heart, Coins, AlertTriangle, Clock, Zap, Target, Utensils, Scroll, Sparkles, Palette, Hash, MapPin, Clover, Briefcase, Activity } from 'lucide-react';
import GlossaryHighlight from '@/components/GlossaryHighlight';
import DailyFortuneButton from '@/components/DailyFortuneButton';
import PushOptInPrompt from '@/components/PushOptInPrompt';
import DailyGuideCard from '@/components/result/DailyGuideCard';
import { generateLuckyData } from '@/utils/luckyLogic';
import { ReadingResponse } from '@/types';
import { useDailyFortune } from '../hooks/useDailyFortune';
import FlowCalendar from '../FlowCalendar';

interface LuckyTabProps {
    data: ReadingResponse;
    profileId?: string;
    birthDate?: string;
    featureFlowCalendarEnabled?: boolean;
    featureDailyGuideEnabled?: boolean;
}

export default function LuckyTab({
    data,
    profileId,
    birthDate,
    featureFlowCalendarEnabled = true,
    featureDailyGuideEnabled = true,
}: LuckyTabProps) {
    const { dailyFortune, dailyFortuneDate, handleDailyFortuneUpdate } = useDailyFortune();
    const [pushPromptNonce, setPushPromptNonce] = useState(0);

    const luckyData = useMemo(() => {
        return generateLuckyData(data.card.stats, data.pillars.day);
    }, [data.card.stats, data.pillars.day]);

    if (!luckyData) return null;

    return (
        <div className={styles.luckyTab}>
            {featureDailyGuideEnabled !== false && data.tabs.lucky && (
                <DailyGuideCard
                    luckyData={data.tabs.lucky}
                />
            )}

            <div className={styles.todayFortune}>
                <h3 className={styles.sectionHeading}><Calendar size={20} /> 오늘의 운세</h3>
                
                {profileId && (
                    <DailyFortuneButton
                        profileId={profileId}
                        onFortuneGenerated={handleDailyFortuneUpdate}
                        onFortuneLoaded={handleDailyFortuneUpdate}
                        onPromptEligible={() => setPushPromptNonce(prev => prev + 1)}
                    />
                )}
                
                {dailyFortune ? (
                    <>
                        <div className={styles.todayCard}>
                            {dailyFortuneDate && (
                                <div className={styles.fortuneDateBadge}>{dailyFortuneDate}</div>
                            )}
                            {dailyFortune.overall_score && (
                                <div className={styles.scoreGauge}>
                                    <div className={styles.scoreLabel}>오늘의 총운</div>
                                    <div className={styles.scoreBar}>
                                        <div
                                            className={styles.scoreFill}
                                            style={{ width: `${dailyFortune.overall_score}%` }}
                                        />
                                    </div>
                                    <div className={styles.scoreValue}>{dailyFortune.overall_score}점</div>
                                </div>
                            )}
                            <p className={styles.todayOverview}>
                                <GlossaryHighlight text={dailyFortune.today_message} />
                            </p>
                            <div className={styles.todayDetails}>
                                {dailyFortune.today_love && (
                                    <div className={styles.todayItem}>
                                        <span><Heart size={14} /> 연애</span>
                                        <p><GlossaryHighlight text={dailyFortune.today_love} /></p>
                                    </div>
                                )}
                                {dailyFortune.today_money && (
                                    <div className={styles.todayItem}>
                                        <span><Coins size={14} /> 금전</span>
                                        <p><GlossaryHighlight text={dailyFortune.today_money} /></p>
                                    </div>
                                )}
                                {dailyFortune.today_work && (
                                    <div className={styles.todayItem}>
                                        <span><Briefcase size={14} /> 업무</span>
                                        <p><GlossaryHighlight text={dailyFortune.today_work} /></p>
                                    </div>
                                )}
                                {dailyFortune.today_health && (
                                    <div className={styles.todayItem}>
                                        <span><Activity size={14} /> 건강</span>
                                        <p><GlossaryHighlight text={dailyFortune.today_health} /></p>
                                    </div>
                                )}
                            </div>
                            {dailyFortune.today_warning && (
                                <div className={styles.todayWarning}>
                                    <AlertTriangle size={14} color="#EF4444" />
                                    <GlossaryHighlight text={dailyFortune.today_warning} />
                                </div>
                            )}
                            <div className={styles.todayAdvice}>
                                <strong><Lightbulb size={16} color="#F59E0B" className={styles.inlineIcon} /> 오늘의 조언:</strong> <GlossaryHighlight text={dailyFortune.today_advice} />
                            </div>
                        </div>
                        {pushPromptNonce > 0 && (
                            <PushOptInPrompt
                                key={`daily-fortune-${pushPromptNonce}`}
                                trigger="daily_fortune"
                            />
                        )}
                    </>
                ) : data.tabs.lucky?.today_overview ? (
                    <div className={styles.todayCard}>
                        <p className={styles.todayOverview}>
                            <GlossaryHighlight text={data.tabs.lucky.today_overview} />
                        </p>
                        <div className={styles.todayDetails}>
                            <div className={styles.todayItem}>
                                <span><Heart size={14} /> 연애</span>
                                <p><GlossaryHighlight text={data.tabs.lucky.today_love} /></p>
                            </div>
                            <div className={styles.todayItem}>
                                <span><Coins size={14} /> 금전</span>
                                <p><GlossaryHighlight text={data.tabs.lucky.today_money} /></p>
                            </div>
                            {data.tabs.lucky.today_work && (
                                <div className={styles.todayItem}>
                                    <span><Briefcase size={14} /> 업무</span>
                                    <p><GlossaryHighlight text={data.tabs.lucky.today_work} /></p>
                                </div>
                            )}
                            {data.tabs.lucky.today_health && (
                                <div className={styles.todayItem}>
                                    <span><Activity size={14} /> 건강</span>
                                    <p><GlossaryHighlight text={data.tabs.lucky.today_health} /></p>
                                </div>
                            )}
                        </div>
                        <div className={styles.todayAdvice}>
                            <strong><Lightbulb size={16} color="#F59E0B" className={styles.inlineIcon} /> 오늘의 조언:</strong> <GlossaryHighlight text={data.tabs.lucky.today_advice} />
                        </div>
                    </div>
                ) : (
                    <div className={styles.todayCard}>
                        <p className={`${styles.todayOverview} ${styles.todayOverviewPlaceholder}`}>
                            {profileId
                                ? '위의 버튼을 눌러 AI가 분석한 오늘의 운세를 받아보세요'
                                : '프로필을 저장하면 AI가 분석한 오늘의 운세를 받아볼 수 있습니다'}
                        </p>
                    </div>
                )}
            </div>

            {(dailyFortune?.golden_time || dailyFortune?.avoid_time || data.tabs.lucky?.golden_time || data.tabs.lucky?.dead_time) && (
                <div className={styles.luckyTimeCard}>
                    <div className={styles.luckyTimeHeader}>
                        <Clock size={18} color="#D97706" />
                        <span className={styles.luckyTimeTitle}>오늘의 시간대</span>
                    </div>
                    <div className={styles.luckyTimeGrid}>
                        {(dailyFortune?.golden_time || data.tabs.lucky?.golden_time) && (
                            <div className={`${styles.luckyTimeItem} ${styles.goldenTime}`}>
                                <div className={styles.luckyTimeLabel}>골든 타임</div>
                                <div className={styles.luckyTimeValue}>{dailyFortune?.golden_time || data.tabs.lucky?.golden_time}</div>
                            </div>
                        )}
                        {(dailyFortune?.avoid_time || data.tabs.lucky?.dead_time) && (
                            <div className={`${styles.luckyTimeItem} ${styles.deadTime}`}>
                                <div className={styles.luckyTimeLabel}>피해야 할 시간</div>
                                <div className={styles.luckyTimeValue}>{dailyFortune?.avoid_time || data.tabs.lucky?.dead_time}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {(dailyFortune?.power_hour || data.tabs.lucky?.power_hour) && (
                <div className={styles.powerHourCard}>
                    <div className={styles.powerHourTitle}>
                        <Zap size={18} color="#EA580C" />
                        <span>파워 아워</span>
                    </div>
                    <div className={styles.powerHourContent}>
                        {dailyFortune?.power_hour || data.tabs.lucky?.power_hour}
                    </div>
                </div>
            )}

            {(dailyFortune?.mission_of_day || data.tabs.lucky?.mission_of_day) && (
                <div className={styles.luckyMissionCard}>
                    <div className={styles.luckyMissionTitle}>
                        <Target size={18} color="#7C3AED" />
                        <span>오늘의 미션</span>
                    </div>
                    <div className={styles.luckyMissionContent}>
                        <GlossaryHighlight text={dailyFortune?.mission_of_day || data.tabs.lucky?.mission_of_day || ''} />
                    </div>
                </div>
            )}

            {(dailyFortune?.lucky_food || data.tabs.lucky?.food_recommendation) && (
                <div className={styles.luckyFoodCard}>
                    <div className={styles.luckyFoodTitle}>
                        <Utensils size={18} color="#059669" />
                        <span>오늘의 점메추</span>
                    </div>
                    <div className={styles.luckyFoodContent}>
                        {dailyFortune?.lucky_food ? (
                            <div>
                                <strong>{dailyFortune.lucky_food.name}</strong>
                                {dailyFortune.lucky_food.description && (
                                    <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{dailyFortune.lucky_food.description}</p>
                                )}
                            </div>
                        ) : (
                            data.tabs.lucky?.food_recommendation
                        )}
                    </div>
                </div>
            )}

            {(dailyFortune?.talisman_phrase || data.tabs.lucky?.talisman_phrase) && (
                <div className={styles.luckyTalismanCard}>
                    <div className={styles.luckyTalismanTitle}>
                        <Scroll size={18} color="#BE185D" />
                        <span>오늘의 부적 문구</span>
                    </div>
                    <div className={styles.luckyTalismanContent}>
                        <GlossaryHighlight text={dailyFortune?.talisman_phrase || data.tabs.lucky?.talisman_phrase || ''} />
                    </div>
                </div>
            )}

            {dailyFortune && (
                <>
                    <h3 className={styles.sectionHeading}><Sparkles size={20} /> 오늘의 행운 아이템</h3>
                    <div className={styles.luckyGrid} style={{ marginBottom: '24px' }}>
                        <div className={styles.luckyCard}>
                            <div className={styles.luckyTitle}><Palette size={16} color="#EC4899" /> 행운 컬러</div>
                            <div style={{ fontWeight: 600 }}>{dailyFortune.lucky_color.name}</div>
                            {dailyFortune.lucky_color.description && (
                                <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{dailyFortune.lucky_color.description}</p>
                            )}
                        </div>

                        <div className={styles.luckyCard}>
                            <div className={styles.luckyTitle}><Hash size={16} color="#3B82F6" /> 행운 숫자</div>
                            <div style={{ fontWeight: 600 }}>{dailyFortune.lucky_number.name}</div>
                            {dailyFortune.lucky_number.description && (
                                <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{dailyFortune.lucky_number.description}</p>
                            )}
                        </div>

                        <div className={styles.luckyCard}>
                            <div className={styles.luckyTitle}><MapPin size={16} color="#10B981" /> 행운 방향</div>
                            <div style={{ fontWeight: 600 }}>{dailyFortune.lucky_direction.name}</div>
                            {dailyFortune.lucky_direction.description && (
                                <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{dailyFortune.lucky_direction.description}</p>
                            )}
                        </div>

                        <div className={styles.luckyCard}>
                            <div className={styles.luckyTitle}><Target size={16} color="#F59E0B" /> 행운 활동</div>
                            <div style={{ fontWeight: 600 }}>{dailyFortune.lucky_activity.name}</div>
                            {dailyFortune.lucky_activity.description && (
                                <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{dailyFortune.lucky_activity.description}</p>
                            )}
                        </div>
                    </div>
                </>
            )}

            <h3 className={styles.sectionHeading}><Clover size={20} /> 행운 키트</h3>
            <div className={styles.luckyContainer}>
                <div className={styles.luckyGrid}>
                    <div className={styles.luckyCard} style={{ gridColumn: 'span 2' }}>
                        <div className={styles.luckyTitle}><Hash size={16} color="#3B82F6" /> 행운 숫자 (로또)</div>
                        <div className={styles.lottoGrid}>
                            {luckyData.numbers.map((num) => (
                                <span key={num} className={styles.numberBall}>{num.toString()}</span>
                            ))}
                        </div>
                    </div>

                    <div className={styles.luckyCard} style={{ borderColor: '#FECACA', background: '#FEF2F2', gridColumn: 'span 2' }}>
                        <div className={styles.luckyTitle} style={{ color: '#B91C1C' }}><AlertTriangle size={16} color="#DC2626" /> 피하면 좋은 것</div>
                        <ul style={{ paddingLeft: '20px', margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                            {luckyData.avoid.map((item) => (
                                <li key={item} style={{ fontSize: '14px', color: '#991B1B', marginBottom: '4px' }}>{item}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {featureFlowCalendarEnabled !== false && profileId && birthDate && (
                <FlowCalendar
                    profileId={profileId}
                    birthDate={birthDate}
                />
            )}
        </div>
    );
}
