'use client';

import { useRef } from 'react';
import { Share2, Download } from 'lucide-react';
import styles from './CharacterCard.module.css';
import { SajuCharacter } from '@/types';
import { CharacterShareCard, exportCharacterCard } from '@/components/CharacterShareCard';

interface CharacterCardProps {
    character: SajuCharacter;
    onShare?: () => void;
}

const elementGradients: Record<string, string> = {
    '목': styles.wood,
    '화': styles.fire,
    '토': styles.earth,
    '금': styles.metal,
    '수': styles.water,
};

const elementBadgeColors: Record<string, string> = {
    '목': styles.badgeWood,
    '화': styles.badgeFire,
    '토': styles.badgeEarth,
    '금': styles.badgeMetal,
    '수': styles.badgeWater,
};

export default function CharacterCard({ character, onShare }: CharacterCardProps) {
    const shareCardRef = useRef<HTMLDivElement>(null);
    const gradientClass = elementGradients[character.element] || styles.wood;
    const badgeClass = elementBadgeColors[character.element] || styles.badgeWood;

    const handleShare = async () => {
        try {
            await exportCharacterCard(shareCardRef, 'share');
        } catch (err) {
            const msg = err instanceof Error ? err.message : '알 수 없는 오류';
            console.error(msg);
        }
    };

    const handleDownload = async () => {
        try {
            await exportCharacterCard(shareCardRef, 'download');
        } catch (err) {
            const msg = err instanceof Error ? err.message : '알 수 없는 오류';
            console.error(msg);
        }
    };

    return (
        <>
            <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, pointerEvents: 'none' }}>
                <CharacterShareCard ref={shareCardRef} character={character} />
            </div>
            <div className={`${styles.card} ${gradientClass}`}>
                {character.icon_path ? (
                    <img src={character.icon_path} alt={character.name} className={styles.emoji} loading="eager" />
                ) : (
                    <img
                        src="/icons/emoji-replacements/misc/sparkle.png"
                        alt="캐릭터 기본 아이콘"
                        className={styles.emoji}
                        loading="eager"
                    />
                )}
                <div className={styles.type}>{character.type}</div>
                <h3 className={styles.name}>{character.name}</h3>
                <span className={`${styles.elementBadge} ${badgeClass}`}>
                    {character.element}의 기운
                </span>
                <p className={styles.description}>{character.description}</p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {onShare && (
                        <button type="button" className={styles.shareButton} onClick={handleShare}>
                            <Share2 size={16} />
                            공유하기
                        </button>
                    )}
                    <button type="button" className={styles.shareButton} onClick={handleDownload}>
                        <Download size={16} />
                        카드 저장
                    </button>
                </div>
            </div>
        </>
    );
}
