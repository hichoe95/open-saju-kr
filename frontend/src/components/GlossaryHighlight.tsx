'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY_MAP, GLOSSARY_TERMS_SET } from '@/data/sajuGlossary';
import styles from './GlossaryHighlight.module.css';

// 긴 용어부터 매칭하기 위해 정렬 (성능 최적화)
const SORTED_TERMS = Array.from(GLOSSARY_TERMS_SET).sort((a, b) => b.length - a.length);

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface GlossaryHighlightProps {
    text: string;
}

interface TooltipState {
    visible: boolean;
    text: string;
    targetRect: DOMRect | null;
}

const PortalTooltip = ({ text, targetRect, visible }: TooltipState) => {
    if (!visible || !targetRect) return null;

    // 화면 포탈에 렌더링 (body)
    if (typeof document === 'undefined') return null;

    // 위치 계산 (글자 바로 위 중앙)
    // 툴팁 예상 높이(약 40px) 고려
    const top = targetRect.top - 10; // 10px 여백
    const left = targetRect.left + (targetRect.width / 2);

    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        transform: 'translate(-50%, -100%)', // 위로 100% 이동 (기준점이 하단)
        zIndex: 9999,
        pointerEvents: 'none', // 툴팁이 마우스 이벤트 방해하지 않도록
    };

    return createPortal(
        <div style={style} className={styles.portalTooltip}>
            {text}
            <div className={styles.portalArrow} />
        </div>,
        document.body
    );
};

export default function GlossaryHighlight({ text }: GlossaryHighlightProps) {
    const [tooltip, setTooltip] = useState<TooltipState>({
        visible: false,
        text: '',
        targetRect: null
    });

    // 핸들러는 useCallback으로 메모이제이션
    const handleMouseEnter = React.useCallback((e: React.MouseEvent<HTMLSpanElement>, content: string) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltip({
            visible: true,
            text: content,
            targetRect: rect
        });
    }, []);

    const handleMouseLeave = React.useCallback(() => {
        setTooltip(prev => ({ ...prev, visible: false }));
    }, []);

    // 파싱 로직을 useMemo로 감싸고 안정적인/고유한 키 생성
    const parsedContent = React.useMemo(() => {
        if (!text) return null;

        const boldRegex = /\*\*(.+?)\*\*/;
        const termRegexKoreanFirst = /([가-힣]+)\(([\u4e00-\u9fff]+[^)]*)\)/;
        const termRegexHanjaFirst = /([\u4e00-\u9fff]+)\(([가-힣][^)]*)\)/;

        // 재귀 호출을 위한 내부 함수
        const parseTextInternal = (inputText: string, depthPrefix: string): (string | React.ReactNode)[] => {
            const parts: (string | React.ReactNode)[] = [];
            let remaining = inputText;
            let idx = 0;

            while (remaining.length > 0) {
                idx++;
                const currentKey = `${depthPrefix}-${idx}`;
                const matchBold = boldRegex.exec(remaining);

                if (matchBold) {
                    if (matchBold.index > 0) {
                        parts.push(...parseTermsInternal(remaining.slice(0, matchBold.index), `${currentKey}-pre`));
                    }

                    const content = matchBold[1];
                    parts.push(
                        <strong key={`${currentKey}-bold`}>
                            {parseTextInternal(content, `${currentKey}-bold-inner`)}
                        </strong>
                    );

                    remaining = remaining.slice(matchBold.index + matchBold[0].length);
                } else {
                    parts.push(...parseTermsInternal(remaining, `${currentKey}-rest`));
                    break;
                }
            }
            return parts;
        };

        // 단순 한글 용어를 하이라이트하는 함수
        const highlightPlainTerms = (inputText: string, prefix: string): (string | React.ReactNode)[] => {
            const parts: (string | React.ReactNode)[] = [];
            let lastIndex = 0;
            let termIdx = 0;

            // 새로운 정규식 인스턴스 생성 (lastIndex 리셋 효과)
            const regex = new RegExp(
                `(?<![가-힣])(${SORTED_TERMS.filter(t => t.length >= 2).map(escapeRegex).join('|')})(?![가-힣])`,
                'gu'
            );

            let match;
            while ((match = regex.exec(inputText)) !== null) {
                termIdx++;
                const termKey = `${prefix}-plain-${termIdx}`;

                // 매치 전 텍스트 추가
                if (match.index > lastIndex) {
                    parts.push(inputText.slice(lastIndex, match.index));
                }

                const term = match[1];
                const definition = GLOSSARY_MAP.get(term);

                if (definition) {
                    parts.push(
                        <span
                            key={termKey}
                            className={styles.term}
                            onMouseEnter={(e) => handleMouseEnter(e, definition)}
                            onMouseLeave={handleMouseLeave}
                        >
                            {term}
                        </span>
                    );
                } else {
                    parts.push(term);
                }

                lastIndex = regex.lastIndex;
            }

            // 남은 텍스트 추가
            if (lastIndex < inputText.length) {
                parts.push(inputText.slice(lastIndex));
            }

            return parts.length > 0 ? parts : [inputText];
        };

        const parseTermsInternal = (inputText: string, prefix: string): (string | React.ReactNode)[] => {
            const parts: (string | React.ReactNode)[] = [];
            let remaining = inputText;
            let termIdx = 0;

            while (remaining.length > 0) {
                termIdx++;
                const termKey = `${prefix}-term-${termIdx}`;

                const matchA = termRegexKoreanFirst.exec(remaining);
                const matchB = termRegexHanjaFirst.exec(remaining);

                let firstMatch: RegExpExecArray | null = null;
                let matchType: 'termA' | 'termB' | null = null;

                if (matchA && matchB) {
                    if (matchA.index <= matchB.index) {
                        firstMatch = matchA;
                        matchType = 'termA';
                    } else {
                        firstMatch = matchB;
                        matchType = 'termB';
                    }
                } else if (matchA) {
                    firstMatch = matchA;
                    matchType = 'termA';
                } else if (matchB) {
                    firstMatch = matchB;
                    matchType = 'termB';
                }

                if (!firstMatch) {
                    // 남은 텍스트에서 단순 용어 하이라이트
                    parts.push(...highlightPlainTerms(remaining, `${termKey}-plain`));
                    break;
                }

                if (firstMatch.index > 0) {
                    // 매치 전 텍스트에서도 단순 용어 하이라이트
                    parts.push(...highlightPlainTerms(remaining.slice(0, firstMatch.index), `${termKey}-pre`));
                }

                const fullMatch = firstMatch[0];
                const koreanPart = matchType === 'termA'
                    ? firstMatch[1]
                    : firstMatch[2].split(':')[0].trim();

                let definition = GLOSSARY_MAP.get(koreanPart);

                // 정의가 없을 경우 괄호 안 설명을 툴팁으로 사용
                if (!definition && firstMatch[2].includes(':')) {
                    definition = firstMatch[2].split(':').slice(1).join(':').trim();
                }

                const tooltipText = definition || koreanPart;

                parts.push(
                    <span
                        key={termKey}
                        className={styles.term}
                        onMouseEnter={(e) => handleMouseEnter(e, tooltipText)}
                        onMouseLeave={handleMouseLeave}
                    >
                        {fullMatch}
                    </span>
                );

                remaining = remaining.slice(firstMatch.index + firstMatch[0].length);
            }

            return parts;
        };

        return parseTextInternal(text, 'root');
    }, [text, handleMouseEnter, handleMouseLeave]);

    return (
        <>
            {parsedContent}
            <PortalTooltip {...tooltip} />
        </>
    );
}
