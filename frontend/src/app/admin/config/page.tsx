'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, Save, Check, AlertCircle, RefreshCw, Bell, ChevronDown, DollarSign, Flag, Cpu, CreditCard } from 'lucide-react';
import { 
    getConfig, 
    updateConfig, 
    ConfigItem,
    getAlertConfig,
    updateAlertConfig,
    testAlert,
    sendDailyReport,
    AlertConfig,
    getPaymentMode,
    setPaymentMode,
    PaymentModeStatus,
} from '@/lib/adminApi';
import { useToast } from '@/components/admin/Toast';
import styles from './page.module.css';

const CONFIG_LABELS: Record<string, string> = {
    default_persona: '기본 페르소나',
    model_main: '결과보기(메인) 모델',
    model_compatibility: '궁합 분석 모델',
    model_decision: 'AI에게 질문하기 모델',
    model_flow: '운세 흐름 모델',
    model_daily_fortune: '오늘의 운세 모델',
    model_seun: '세운 분석 모델',
    reasoning_effort_main: '결과보기(메인) 추론 강도',
    reasoning_effort_compatibility: '궁합 분석 추론 강도',
    reasoning_effort_decision: 'AI에게 질문하기 추론 강도',
    reasoning_effort_flow: '운세 흐름 추론 강도',
    reasoning_effort_daily_fortune: '오늘의 운세 추론 강도',
    reasoning_effort_seun: '세운 분석 추론 강도',
    reading_reanalyze: '사주 재분석 가격 (엽전)',
    ai_chat: 'AI 도사 상담 첫 질문 가격 (엽전)',
    ai_chat_followup: 'AI 도사 상담 후속 질문 가격 (엽전)',
    flow_ai_advice: 'AI 조언 가격 (엽전)',
    compatibility: '궁합 분석 가격 (엽전)',
    saju_image: '나의 사주 이미지 생성 가격 (엽전)',
    daily_fortune_price: '오늘의 운세 가격 (엽전)',
    free_analysis_count: '무료 분석 횟수',
    signup_bonus_coins: '가입 보너스 엽전',
    maintenance_mode: '점검 모드',
    announcement: '공지사항',
    review_login_enabled: '심사용 로그인',
    review_login_code: '심사 코드',
};

type ModelOption = { label: string; value: string };
type ModelGroup = { label: string; options: ModelOption[] };

const FEATURE_MODEL_OPTIONS: ModelGroup[] = [
    {
        label: 'OpenAI',
        options: [
            { label: 'GPT-5.4', value: 'gpt-5.4' },
            { label: 'GPT-5.4 Mini', value: 'gpt-5.4-mini' },
            { label: 'GPT-5.4 Nano', value: 'gpt-5.4-nano' },
            { label: 'GPT-5.2', value: 'gpt-5.2' },
            { label: 'GPT-5.1', value: 'gpt-5.1' },
            { label: 'GPT-5', value: 'gpt-5' },
            { label: 'GPT-5 Mini', value: 'gpt-5-mini' },
            { label: 'GPT-5 Nano', value: 'gpt-5-nano' },
            { label: 'GPT-4.1', value: 'gpt-4.1' },
            { label: 'GPT-4.1 Mini', value: 'gpt-4.1-mini' },
            { label: 'GPT-4.1 Nano', value: 'gpt-4.1-nano' },
            { label: 'GPT-4o', value: 'gpt-4o' },
            { label: 'Saju Quick', value: 'saju-quick' },
            { label: 'Saju Deep', value: 'saju-deep' },
            { label: 'Saju Pro', value: 'saju-pro' },
        ],
    },
    {
        label: 'Google',
        options: [
            { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
            { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
            { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
            { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
        ],
    },
    {
        label: 'Anthropic',
        options: [
            { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
            { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
        ],
    },
];

const CONFIG_OPTIONS: Record<string, { label: string; value: string }[]> = {
    default_persona: [
        { label: 'MZ 도사', value: 'mz' },
        { label: '정통 도사', value: 'classic' },
        { label: '따뜻한 도사', value: 'warm' },
        { label: '위트있는 도사', value: 'witty' },
    ],
    review_login_enabled: [
        { label: '활성화', value: 'true' },
        { label: '비활성화', value: 'false' },
    ],
};

interface EditState {
    [key: string]: {
        value: string;
        saving: boolean;
        saved: boolean;
        error: string | null;
    };
}

type ConfigCategory = 'aiModels' | 'system' | 'pricing' | 'featureFlags';

const CONFIG_CATEGORY_ORDER: ConfigCategory[] = ['aiModels', 'system', 'pricing', 'featureFlags'];

const CONFIG_CATEGORY_META: Record<ConfigCategory, { title: string; icon: typeof Settings }> = {
    aiModels: { title: 'AI 모델 설정', icon: Cpu },
    system: { title: '시스템 설정', icon: Settings },
    pricing: { title: '가격 설정', icon: DollarSign },
    featureFlags: { title: 'Feature Flags', icon: Flag },
};

const DIRECT_PRICING_KEYS = new Set([
    'reading_reanalyze',
    'ai_chat',
    'ai_chat_followup',
    'flow_ai_advice',
    'compatibility',
    'saju_image',
    'daily_fortune_price',
]);

const REMOVED_CONFIG_KEYS = new Set([
    'tab_love',
    'tab_money',
    'tab_compatibility',
    'tab_career',
    'tab_flow_calendar',
]);

const HIDDEN_CONFIG_KEYS = new Set([
    'ai_advice_price',
    'compatibility_price',
    'decision_price',
]);

const isFeatureFlagConfig = (key: string) => /^feature_.*_enabled$/.test(key);

const isPricingConfig = (key: string) =>
    DIRECT_PRICING_KEYS.has(key) ||
    key.endsWith('_price') ||
    key.endsWith('_bonus') ||
    key.includes('_bonus') ||
    key === 'free_analysis_count';

const GPT5_MODEL_PREFIX = 'gpt-5';

const NON_NEGATIVE_INTEGER_CONFIG_KEYS = new Set([
    'reading_reanalyze',
    'ai_chat',
    'ai_chat_followup',
    'compatibility',
    'flow_ai_advice',
    'saju_image',
    'daily_fortune_price',
    'free_analysis_count',
    'signup_bonus_coins',
]);

const isSupportedReasoningModel = (modelId: string) => modelId.startsWith(GPT5_MODEL_PREFIX);

const validateConfigInput = (key: string, value: string): string | null => {
    if (!NON_NEGATIVE_INTEGER_CONFIG_KEYS.has(key)) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return `설정 '${CONFIG_LABELS[key] || key}'는 0 이상의 정수여야 합니다`;
    }

    const numeric = Number(trimmed);
    if (!Number.isInteger(numeric) || numeric < 0) {
        return `설정 '${CONFIG_LABELS[key] || key}'는 0 이상의 정수여야 합니다`;
    }

    return null;
};

const REASONING_EFFORT_OPTIONS = [
    { label: '없음 (None)', value: 'none' },
    { label: '낮음 (Low)', value: 'low' },
    { label: '중간 (Medium)', value: 'medium' },
    { label: '높음 (High)', value: 'high' },
];

const isModelConfig = (key: string) => key.startsWith('model_');
const isReasoningEffortConfig = (key: string) => key.startsWith('reasoning_effort_');

const getConfigCategory = (key: string): ConfigCategory => {
    if (isFeatureFlagConfig(key)) return 'featureFlags';
    if (isPricingConfig(key)) return 'pricing';
    if (isModelConfig(key) || isReasoningEffortConfig(key)) return 'aiModels';
    return 'system';
};

export default function AdminConfigPage() {
    const { showToast } = useToast();
    const [configs, setConfigs] = useState<ConfigItem[]>([]);
    const [editState, setEditState] = useState<EditState>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
    const [alertSaving, setAlertSaving] = useState(false);
    const [alertSaved, setAlertSaved] = useState(false);
    const [clearSlackWebhookRequested, setClearSlackWebhookRequested] = useState(false);
    const [paymentMode, setPaymentModeState] = useState<PaymentModeStatus | null>(null);
    const [paymentModeError, setPaymentModeError] = useState<string | null>(null);
    const [paymentModeSwitching, setPaymentModeSwitching] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<ConfigCategory, boolean>>({
        aiModels: true,
        system: true,
        pricing: true,
        featureFlags: true,
    });

    const groupedConfigs = useMemo(() => {
        const grouped: Record<ConfigCategory, ConfigItem[]> = {
            aiModels: [],
            system: [],
            pricing: [],
            featureFlags: [],
        };

        configs
            .filter((config) => !HIDDEN_CONFIG_KEYS.has(config.key) && !REMOVED_CONFIG_KEYS.has(config.key))
            .forEach((config) => {
            grouped[getConfigCategory(config.key)].push(config);
        });

        return grouped;
    }, [configs]);

    const fetchConfigs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setPaymentModeError(null);
        try {
            const [configData, alertData, paymentModeResult] = await Promise.all([
                getConfig(),
                getAlertConfig().catch(() => null),
                getPaymentMode()
                    .then((data) => ({ data, error: null as string | null }))
                    .catch((err: unknown) => ({
                        data: null,
                        error: err instanceof Error ? err.message : '결제 모드 조회 실패',
                    })),
            ]);
            
            setConfigs(configData);
            if (alertData) {
                setAlertConfig(alertData);
                setClearSlackWebhookRequested(false);
            }
            setPaymentModeState(paymentModeResult.data);
            setPaymentModeError(paymentModeResult.error);
            
            const initialEditState: EditState = {};
            configData.forEach((config) => {
                initialEditState[config.key] = {
                    value: String(config.value ?? ''),
                    saving: false,
                    saved: false,
                    error: null,
                };
            });
            setEditState(initialEditState);
        } catch (err) {
            setError(err instanceof Error ? err.message : '설정을 불러오지 못했습니다');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfigs();
    }, [fetchConfigs]);

    const handleValueChange = (key: string, value: string) => {
        setEditState((prev) => ({
            ...prev,
            [key]: {
                ...prev[key],
                value,
                saved: false,
                error: null,
            },
        }));
    };

    const handleSave = async (key: string) => {
        const currentState = editState[key];
        if (!currentState) return;

        const validationError = validateConfigInput(key, currentState.value);
        if (validationError) {
            setEditState((prev) => ({
                ...prev,
                [key]: { ...prev[key], error: validationError, saved: false },
            }));
            return;
        }

        setEditState((prev) => ({
            ...prev,
            [key]: { ...prev[key], saving: true, error: null },
        }));

        try {
            await updateConfig(key, currentState.value);
            setEditState((prev) => ({
                ...prev,
                [key]: { ...prev[key], saving: false, saved: true },
            }));
            
            setTimeout(() => {
                setEditState((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], saved: false },
                }));
            }, 2000);
        } catch (err) {
            setEditState((prev) => ({
                ...prev,
                [key]: {
                    ...prev[key],
                    saving: false,
                    error: err instanceof Error ? err.message : '저장 실패',
                },
            }));
        }
    };

    const handleAlertConfigChange = (key: keyof AlertConfig, value: string | number) => {
        if (!alertConfig) return;
        if (key === 'slack_webhook_url') {
            setClearSlackWebhookRequested(false);
        }
        setAlertConfig({
            ...alertConfig,
            [key]: value
        });
        setAlertSaved(false);
    };

    const saveAlertConfig = async () => {
        if (!alertConfig) return;
        setAlertSaving(true);
        try {
            const slackWebhookUrl = alertConfig.slack_webhook_url.trim();
            const payload = {
                error_rate_threshold: alertConfig.error_rate_threshold,
                payment_failure_threshold: alertConfig.payment_failure_threshold,
                refund_spike_threshold: alertConfig.refund_spike_threshold,
                ...(clearSlackWebhookRequested
                    ? { slack_webhook_url: '' }
                    : slackWebhookUrl
                    ? { slack_webhook_url: slackWebhookUrl }
                    : {}),
            };

            await updateAlertConfig(payload);
            setAlertSaved(true);
            await fetchConfigs();
            setTimeout(() => setAlertSaved(false), 2000);
        } catch (err) {
            showToast('알림 설정 저장 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'), 'error');
        } finally {
            setAlertSaving(false);
        }
    };

    const testAlertSend = async () => {
        try {
            await testAlert();
            showToast('테스트 알림이 발송되었습니다.', 'success');
        } catch {
            showToast('테스트 알림 발송 실패', 'error');
        }
    };

    const handlePaymentModeChange = async (newMode: 'test' | 'live') => {
        if (!paymentMode || paymentMode.mode === newMode) return;

        const confirmMsg = newMode === 'live'
            ? '라이브 모드로 전환하면 실제 결제가 진행됩니다.\n정말 전환하시겠습니까?'
            : '테스트 모드로 전환하시겠습니까?';
        if (!confirm(confirmMsg)) return;

        setPaymentModeSwitching(true);
        try {
            const result = await setPaymentMode(newMode);
            setPaymentModeState(prev => prev ? { ...prev, mode: result.mode as 'test' | 'live' } : prev);
            await fetchConfigs();
            showToast(`결제 모드가 ${result.mode === 'live' ? '라이브' : '테스트'}로 변경되었습니다.`, 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : '결제 모드 변경 실패', 'error');
        } finally {
            setPaymentModeSwitching(false);
        }
    };

    const sendDailyReportNow = async () => {
        if (!confirm('일일 리포트를 지금 발송하시겠습니까?')) return;
        try {
            await sendDailyReport();
            showToast('일일 리포트가 발송되었습니다.', 'success');
        } catch {
            showToast('일일 리포트 발송 실패', 'error');
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const hasChanged = (key: string) => {
        const config = configs.find((c) => c.key === key);
        return config && editState[key]?.value !== config.value;
    };

    const toggleSection = (category: ConfigCategory) => {
        setExpandedSections((prev) => ({
            ...prev,
            [category]: !prev[category],
        }));
    };

    const handleFeatureToggleChange = (key: string, checked: boolean) => {
        const currentValue = editState[key]?.value || 'false';
        const isCurrentlyEnabled = currentValue === 'true';

        if (!isCurrentlyEnabled && checked) {
            const confirmed = confirm('이 기능을 활성화하시겠습니까? 사용자에게 즉시 노출될 수 있습니다.');
            if (!confirmed) {
                return;
            }
        }

        handleValueChange(key, checked ? 'true' : 'false');
    };

    const renderConfigControl = (config: ConfigItem, state: EditState[string] | undefined) => {
        if (isReasoningEffortConfig(config.key)) {
            return null;
        }

        if (config.key.startsWith('model_')) {
            const effortKey = config.key.replace('model_', 'reasoning_effort_');
            const currentModel = state?.value || '';
            const supportsReasoning = isSupportedReasoningModel(currentModel);
            const effortState = editState[effortKey];

            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                    <select
                        className={styles.select}
                        value={currentModel}
                        onChange={(e) => handleValueChange(config.key, e.target.value)}
                    >
                        <option value="">-- 모델 선택 --</option>
                        {FEATURE_MODEL_OPTIONS.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                                {group.options.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    {supportsReasoning && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>추론 강도</span>
                            <select
                                className={styles.select}
                                value={effortState?.value || 'none'}
                                onChange={(e) => handleValueChange(effortKey, e.target.value)}
                                style={{ flex: 1 }}
                            >
                                {REASONING_EFFORT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            {effortState && hasChanged(effortKey) && (
                                <button
                                    type="button"
                                    className={`${styles.saveButton} ${effortState.saved ? styles.saved : ''}`}
                                    onClick={() => handleSave(effortKey)}
                                    disabled={effortState.saving}
                                    style={{ flexShrink: 0 }}
                                >
                                    {effortState.saving ? (
                                        <div className={styles.buttonSpinner} />
                                    ) : effortState.saved ? (
                                        <><Check size={14} />저장됨</>
                                    ) : (
                                        <><Save size={14} />저장</>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        if (isFeatureFlagConfig(config.key)) {
            const enabled = (state?.value || 'false') === 'true';

            return (
                <div className={styles.featureToggleControl}>
                    <label className={styles.toggleSwitch}>
                        <input
                            type="checkbox"
                            className={styles.toggleInput}
                            checked={enabled}
                            onChange={(e) => handleFeatureToggleChange(config.key, e.target.checked)}
                            aria-label={`${CONFIG_LABELS[config.key] || config.key} 토글`}
                        />
                        <span className={styles.toggleTrack}>
                            <span className={styles.toggleThumb} />
                        </span>
                    </label>
                    <span className={styles.toggleState}>{enabled ? 'ON' : 'OFF'}</span>
                </div>
            );
        }

        if (config.key === 'maintenance_mode') {
            return (
                <select
                    className={styles.select}
                    value={state?.value || 'false'}
                    onChange={(e) => handleValueChange(config.key, e.target.value)}
                >
                    <option value="false">정상 운영</option>
                    <option value="true">점검 모드</option>
                </select>
            );
        }

        if (config.key === 'announcement') {
            return (
                <textarea
                    className={styles.textarea}
                    value={state?.value || ''}
                    onChange={(e) => handleValueChange(config.key, e.target.value)}
                    rows={3}
                    placeholder="공지사항 내용을 입력하세요..."
                />
            );
        }

        if (CONFIG_OPTIONS[config.key]) {
            return (
                <select
                    className={styles.select}
                    value={state?.value || ''}
                    onChange={(e) => handleValueChange(config.key, e.target.value)}
                >
                    {CONFIG_OPTIONS[config.key].map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            );
        }

        return (
            <input
                type={isPricingConfig(config.key) ? 'number' : 'text'}
                className={styles.input}
                value={state?.value || ''}
                onChange={(e) => handleValueChange(config.key, e.target.value)}
                min={isPricingConfig(config.key) ? 0 : undefined}
                step={isPricingConfig(config.key) ? 1 : undefined}
                inputMode={isPricingConfig(config.key) ? 'numeric' : undefined}
            />
        );
    };

    if (isLoading) {
        return (
            <div className={styles.container} data-testid="admin-config-page">
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>설정 로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container} data-testid="admin-config-page">
                <div className={styles.errorState}>
                    <AlertCircle size={48} />
                    <p>{error}</p>
                    <button type="button" onClick={fetchConfigs} className={styles.retryButton}>
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container} data-testid="admin-config-page">
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title} data-testid="admin-config-ready">
                        <Settings size={28} />
                        시스템 설정
                    </h1>
                    <p className={styles.subtitle}>서비스 운영에 필요한 설정을 관리합니다</p>
                </div>
                <button type="button" className={styles.refreshButton} onClick={fetchConfigs} aria-label="새로고침">
                    <RefreshCw size={18} />
                    새로고침
                </button>
            </header>

            <div className={styles.configSections}>
                {CONFIG_CATEGORY_ORDER.map((category) => {
                    const sectionConfigs = groupedConfigs[category];
                    const sectionMeta = CONFIG_CATEGORY_META[category];
                    const SectionIcon = sectionMeta.icon;
                    const isExpanded = expandedSections[category];

                    if (sectionConfigs.length === 0) {
                        return null;
                    }

                    return (
                        <section key={category} className={styles.configSection}>
                            <button
                                type="button"
                                className={styles.sectionHeader}
                                onClick={() => toggleSection(category)}
                                aria-expanded={isExpanded}
                                aria-controls={`config-section-${category}`}
                            >
                                <span className={styles.sectionHeaderLeft}>
                                    <SectionIcon size={18} />
                                    <span className={styles.sectionHeaderTitle}>{sectionMeta.title}</span>
                                    <span className={styles.sectionCount}>{sectionConfigs.length}</span>
                                </span>
                                <ChevronDown
                                    size={18}
                                    className={`${styles.sectionChevron} ${isExpanded ? styles.sectionChevronOpen : ''}`}
                                />
                            </button>

                            {isExpanded && (
                                <div id={`config-section-${category}`} className={styles.sectionContent}>
                                    <div className={styles.configList}>
                                        {sectionConfigs.map((config) => {
                                            if (isReasoningEffortConfig(config.key)) return null;
                                            const state = editState[config.key];
                                            const changed = hasChanged(config.key);

                                            return (
                                                <div key={config.key} className={styles.configItem}>
                                                    <div className={styles.configInfo}>
                                                        <span className={styles.configLabel}>
                                                            {CONFIG_LABELS[config.key] || config.key}
                                                        </span>
                                                        <span className={styles.configDescription}>
                                                            {config.description}
                                                        </span>
                                                        <span className={styles.configMeta}>
                                                            마지막 수정: {formatDate(config.updated_at)}
                                                        </span>
                                                    </div>

                                                    <div className={styles.configControl}>
                                                        {renderConfigControl(config, state)}

                                                        <button
                                                            type="button"
                                                            className={`${styles.saveButton} ${
                                                                state?.saved ? styles.saved : ''
                                                            } ${changed ? styles.changed : ''}`}
                                                            onClick={() => handleSave(config.key)}
                                                            disabled={state?.saving || !changed}
                                                        >
                                                            {state?.saving ? (
                                                                <div className={styles.buttonSpinner} />
                                                            ) : state?.saved ? (
                                                                <>
                                                                    <Check size={16} />
                                                                    저장됨
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Save size={16} />
                                                                    저장
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>

                                                    {state?.error && (
                                                        <div className={styles.configError}>
                                                            <AlertCircle size={14} />
                                                            {state.error}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {paymentMode && (
                <section className={styles.alertSection}>
                    <h2 className={styles.sectionTitle}>
                        <CreditCard size={20} />
                        결제 모드
                    </h2>
                    <div className={styles.paymentModeCard}>
                        <div className={styles.paymentModeStatus}>
                            <span className={`${styles.modeBadge} ${paymentMode.mode === 'live' ? styles.modeLive : styles.modeTest}`}>
                                {paymentMode.mode === 'live' ? 'LIVE' : 'TEST'}
                            </span>
                            <span className={styles.modeDescription}>
                                {paymentMode.mode === 'live'
                                    ? '실제 결제가 진행됩니다'
                                    : '테스트 환경 — 실제 결제 없음'}
                            </span>
                        </div>
                        {!paymentMode.has_live_keys && (
                            <div className={styles.configError}>
                                <AlertCircle size={14} />
                                라이브 키가 설정되지 않았습니다. Railway 환경변수에 TOSS_LIVE_SECRET_KEY, TOSS_LIVE_CLIENT_KEY를 추가하세요.
                            </div>
                        )}
                        {paymentModeError && (
                            <div className={styles.configError}>
                                <AlertCircle size={14} />
                                {paymentModeError}
                            </div>
                        )}
                        <div className={styles.paymentModeActions}>
                            <button
                                type="button"
                                className={`${styles.modeButton} ${paymentMode.mode === 'test' ? styles.modeButtonActive : ''}`}
                                onClick={() => handlePaymentModeChange('test')}
                                disabled={paymentModeSwitching || paymentMode.mode === 'test'}
                                title={paymentMode.mode === 'test' ? '이미 테스트 모드입니다' : '테스트 모드로 전환'}
                            >
                                테스트 모드
                            </button>
                            <button
                                type="button"
                                className={`${styles.modeButton} ${styles.modeButtonLive} ${paymentMode.mode === 'live' ? styles.modeButtonActive : ''}`}
                                onClick={() => handlePaymentModeChange('live')}
                                disabled={paymentModeSwitching || paymentMode.mode === 'live' || !paymentMode.has_live_keys}
                                title={!paymentMode.has_live_keys ? '라이브 키가 설정되지 않았습니다' : paymentMode.mode === 'live' ? '이미 라이브 모드입니다' : '라이브 모드로 전환'}
                            >
                                {paymentModeSwitching ? '전환 중...' : '라이브 모드'}
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {!paymentMode && paymentModeError && (
                <section className={styles.alertSection}>
                    <div className={styles.configError}>
                        <AlertCircle size={14} />
                        {paymentModeError}
                    </div>
                    <button type="button" className={styles.actionButton} onClick={fetchConfigs}>
                        결제 모드 다시 불러오기
                    </button>
                </section>
            )}

            {alertConfig && (
                <section className={styles.alertSection}>
                    <h2 className={styles.sectionTitle}>
                        <Bell size={20} />
                        알림 설정
                    </h2>
                    <div className={styles.alertConfigGrid}>
                        <div className={styles.alertConfigItem}>
                            <label htmlFor="slack_webhook_url">Slack Webhook URL</label>
                            {alertConfig.slack_webhook_configured && alertConfig.slack_webhook_masked && (
                                <p className={styles.helperText}>현재 설정됨: {alertConfig.slack_webhook_masked}</p>
                            )}
                            {clearSlackWebhookRequested && (
                                <p className={styles.helperText}>저장하면 현재 Slack Webhook 설정이 제거됩니다.</p>
                            )}
                            <input 
                                id="slack_webhook_url"
                                type="url" 
                                placeholder={alertConfig.slack_webhook_configured ? '새 Webhook URL을 입력하면 교체됩니다' : 'https://hooks.slack.com/services/...'} 
                                className={styles.input}
                                value={alertConfig.slack_webhook_url}
                                onChange={(e) => handleAlertConfigChange('slack_webhook_url', e.target.value)}
                            />
                            {alertConfig.slack_webhook_configured && (
                                <button
                                    type="button"
                                    className={styles.actionButton}
                                    onClick={() => {
                                        setAlertConfig({ ...alertConfig, slack_webhook_url: '' });
                                        setClearSlackWebhookRequested(true);
                                        setAlertSaved(false);
                                    }}
                                >
                                    현재 Webhook 제거
                                </button>
                            )}
                        </div>
                        <div className={styles.alertConfigItem}>
                            <label htmlFor="error_rate_threshold">에러율 임계치 (%)</label>
                            <input 
                                id="error_rate_threshold"
                                type="number" 
                                step="0.1" 
                                min="0"
                                className={styles.input}
                                value={alertConfig.error_rate_threshold}
                                onChange={(e) => handleAlertConfigChange('error_rate_threshold', Number.isFinite(Number.parseFloat(e.target.value)) ? Number.parseFloat(e.target.value) : 0)}
                            />
                        </div>
                        <div className={styles.alertConfigItem}>
                            <label htmlFor="payment_failure_threshold">연속 결제 실패 임계치 (건)</label>
                            <input 
                                id="payment_failure_threshold"
                                type="number" 
                                min="1"
                                className={styles.input}
                                value={alertConfig.payment_failure_threshold}
                                onChange={(e) => handleAlertConfigChange('payment_failure_threshold', Number.isFinite(Number.parseInt(e.target.value, 10)) ? Number.parseInt(e.target.value, 10) : 1)}
                            />
                        </div>
                        <div className={styles.alertConfigItem}>
                            <label htmlFor="refund_spike_threshold">환불 급증 임계치 (%)</label>
                            <input 
                                id="refund_spike_threshold"
                                type="number" 
                                step="1" 
                                min="0"
                                className={styles.input}
                                value={alertConfig.refund_spike_threshold}
                                onChange={(e) => handleAlertConfigChange('refund_spike_threshold', Number.isFinite(Number.parseInt(e.target.value, 10)) ? Number.parseInt(e.target.value, 10) : 0)}
                            />
                        </div>
                    </div>
                    <div className={styles.alertActions}>
                        <button 
                            type="button"
                            className={`${styles.saveButton} ${alertSaved ? styles.saved : ''}`}
                            onClick={saveAlertConfig}
                            disabled={alertSaving}
                        >
                            {alertSaving ? '저장 중...' : alertSaved ? '저장됨' : '설정 저장'}
                        </button>
                        <button type="button" className={styles.actionButton} onClick={testAlertSend}>
                            테스트 알림 발송
                        </button>
                        <button type="button" className={styles.actionButton} onClick={sendDailyReportNow}>
                            일일 리포트 발송
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}
