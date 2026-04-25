import { useState, useRef, useEffect, type ReactNode, startTransition } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
// TODO FRONT-11: html2canvas는 HTML 입력 처리 특성상 XSS 위험이 있어 대체 렌더링 방안 검토 필요
import html2canvas from 'html2canvas';
import { BirthInput, ReadingResponse } from '@/types';
import ElementalRadar from './ElementalRadar';
import SigilCanvas from './SigilCanvas';
import { generateLuckyData } from '@/utils/luckyLogic';
import styles from './PresentationView.module.css';
import GlossaryHighlight from './GlossaryHighlight';
import { Download, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
    data: ReadingResponse;
    onClose: () => void;
    birthInput?: BirthInput | null;
}

const ANIMALS: Record<string, string> = {
    '자': '子', '축': '丑', '인': '寅', '묘': '卯', '진': '辰', '사': '巳',
    '오': '午', '미': '未', '신': '申', '유': '酉', '술': '戌', '해': '亥'
};

export default function PresentationView({ data, onClose, birthInput }: Props) {
    const [page, setPage] = useState(0);
    const [mounted, setMounted] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const luckyData = generateLuckyData(data.card.stats, data.pillars.day);

    // 클라이언트 사이드에서만 portal 렌더링
    useEffect(() => {
        startTransition(() => {
            setMounted(true);
        });
        return () => setMounted(false);
    }, []);

    const getAnimal = (ganji: string) => {
        if (!ganji) return '?';
        const korean = ganji.match(/[가-힣]+/g)?.join('') || '';
        const ji = korean.slice(-1);
        return ANIMALS[ji] || '?';
    };

    const handleSave = async () => {
        if (!cardRef.current) return;
        try {
            // 렌더링 완료 대기
            await new Promise(resolve => setTimeout(resolve, 300));

            // 부적 페이지(page === 3)는 html2canvas 사용 (Canvas 요소 지원)
            if (page === 3) {
                const canvas = await html2canvas(cardRef.current, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                });
                const dataUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `saju_sigil_${Date.now()}.png`;
                link.href = dataUrl;
                link.click();
            } else {
                // 다른 페이지는 html-to-image 사용
                const dataUrl = await toPng(cardRef.current, {
                    cacheBust: true,
                    pixelRatio: 2,
                    backgroundColor: '#ffffff',
                });
                const link = document.createElement('a');
                link.download = `saju_card_${page + 1}.png`;
                link.href = dataUrl;
                link.click();
            }
        } catch (err) {
            console.error('이미지 저장 오류:', err);
            alert('이미지 저장에 실패했습니다. 다시 시도해주세요.');
        }
    };

    // 0. Saju Image Page
    const imagePage = data.saju_image_base64 ? (
        <div className={styles.card} style={{ padding: 0, overflow: 'hidden', background: '#111827' }}>
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <Image
                    src={`data:image/png;base64,${data.saju_image_base64}`}
                    alt="사주 이미지"
                    fill
                    unoptimized
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: 'block'
                    }}
                />
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '20px 20px 24px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'center'
                }}>
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                        opacity: 0.9
                    }}>
                        나의 사주 이미지
                    </h3>
                </div>
            </div>
        </div>
    ) : null;

    const rawPages: Array<{ key: string; node: ReactNode }> = [
        ...(imagePage ? [{ key: 'image', node: imagePage }] : []),
        // 1. Cover
        {
            key: 'cover',
            node: (
                <div className={styles.card}>
                    <div className={styles.cardHeader} style={{ marginTop: 'auto' }}>
                        <span className={styles.animalIcon}>{getAnimal(data.pillars.year)}</span>
                        <h1 className={styles.mainTitle}>
                            {data.pillars.year} {data.pillars.month} {data.pillars.day}
                        </h1>
                        <p className={styles.subTitle}><GlossaryHighlight text={data.one_liner} /></p>
                    </div>
                    <div className={styles.keywords} style={{ marginBottom: 'auto' }}>
                        {data.card.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className={styles.tag}><GlossaryHighlight text={tag} /></span>
                        ))}
                    </div>
                    <div className={styles.footer}>AI SAJU REPORT</div>
                </div>
            ),
        },
        // 2. Elements
        {
            key: 'elements',
            node: (
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.mainTitle} style={{ fontSize: '20px' }}>오행 분석</h2>
                        <p className={styles.subTitle}>나의 에너지 분포</p>
                    </div>
                    <div className={styles.radarContainer}>
                        <ElementalRadar stats={data.card.stats} size={260} />
                    </div>
                    <div className={styles.footer}>AI SAJU REPORT</div>
                </div>
            ),
        },
        // 3. Sigil
        {
            key: 'sigil',
            node: (
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.mainTitle} style={{ fontSize: '20px' }}>수호 부적</h2>
                        <p className={styles.subTitle}>Guardian Sigil</p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', margin: 'auto' }}>
                        <div style={{ borderRadius: '50%', overflow: 'hidden', border: '4px solid #F3F4F6' }}>
                            <SigilCanvas
                                width={220}
                                height={220}
                                seed={data.pillars.day}
                                element={luckyData.lacking}
                                name={(birthInput?.name || '나').slice(0, 1)}
                            />
                        </div>
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '14px', color: '#4B5563', margin: '20px 0' }}>
                        부족한 <strong>{luckyData.lacking.toUpperCase()}</strong> 기운을 보완합니다.<br />
                        이 부적을 저장하여 지니고 다니세요.
                    </p>
                    <div className={styles.footer}>AI SAJU REPORT</div>
                </div>
            ),
        },
    ];

    const pages = rawPages;

    const handlePrev = () => setPage(p => Math.max(0, p - 1));
    const handleNext = () => setPage(p => Math.min(pages.length - 1, p + 1));

    const content = (
        <div className={styles.overlay}>
            <div className={styles.header}>
                <h2>카드 보기 ({page + 1}/{pages.length})</h2>
                <div className={styles.actions}>
                    <button type="button" className={styles.actionButton} onClick={handleSave}>
                        <Download size={16} /> 저장
                    </button>
                    <button type="button" className={`${styles.actionButton} ${styles.closeButton}`} onClick={onClose}>
                        <X size={18} /> 닫기
                    </button>
                </div>
            </div>

            <div className={styles.container}>
                <button
                    type="button"
                    className={`${styles.navButton} ${styles.prev}`}
                    onClick={handlePrev}
                    disabled={page === 0}
                    style={{ opacity: page === 0 ? 0 : 1 }}
                >
                    <ChevronLeft size={24} />
                </button>

                <div className={styles.slideContainer}>
                    <div ref={cardRef} style={{ width: '100%', height: '100%' }}>
                        {pages[page].node}
                    </div>
                </div>

                <button
                    type="button"
                    className={`${styles.navButton} ${styles.next}`}
                    onClick={handleNext}
                    disabled={page === pages.length - 1}
                    style={{ opacity: page === pages.length - 1 ? 0 : 1 }}
                >
                    <ChevronRight size={24} />
                </button>

                <div className={styles.indicators}>
                    {pages.map((item, i) => (
                        <button
                            type="button"
                            key={item.key}
                            className={`${styles.dot} ${i === page ? styles.active : ''}`}
                            onClick={() => setPage(i)}
                            aria-label={`페이지 ${i + 1}로 이동`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );

    // createPortal을 사용하여 document.body에 직접 렌더링
    // 이를 통해 부모의 stacking context를 벗어나 z-index가 정상 작동
    if (!mounted) return null;
    return createPortal(content, document.body);
}
