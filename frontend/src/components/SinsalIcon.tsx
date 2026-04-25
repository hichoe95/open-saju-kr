'use client';

import React from 'react';

// 신살별 SVG 아이콘 컴포넌트
const SINSAL_ICONS: Record<string, React.FC<{ size: number; color?: string }>> = {
    // ============ 12신살 ============
    '겁살': ({ size, color = '#EF4444' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 8L28 20H40L30 28L34 40L24 32L14 40L18 28L8 20H20L24 8Z" fill={color} />
            <path d="M24 16V28M18 22H30" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
    ),
    '재살': ({ size, color = '#F59E0B' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <circle cx="24" cy="24" r="12" fill={color} />
            <text x="24" y="28" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">$</text>
        </svg>
    ),
    '천살': ({ size, color = '#3B82F6' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M12 28C12 28 16 20 24 20C32 20 36 28 36 28" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="16" r="4" fill={color} />
            <path d="M20 36L24 32L28 36" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
    ),
    '지살': ({ size, color = '#10B981' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 12L32 24L28 24L28 36H20L20 24L16 24L24 12Z" fill={color} />
            <path d="M12 36H36" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </svg>
    ),
    '연살': ({ size, color = '#EC4899' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 8C24 8 32 16 32 24C32 32 24 40 24 40C24 40 16 32 16 24C16 16 24 8 24 8Z" fill={color} />
            <circle cx="24" cy="24" r="4" fill="white" />
        </svg>
    ),
    '월살': ({ size, color = '#8B5CF6' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M28 12C28 12 20 16 20 24C20 32 28 36 28 36C28 36 16 34 16 24C16 14 28 12 28 12Z" fill={color} />
            <circle cx="30" cy="16" r="2" fill={color} />
        </svg>
    ),
    '망신살': ({ size, color = '#6366F1' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <circle cx="24" cy="20" r="10" stroke={color} strokeWidth="3" fill="none" />
            <circle cx="21" cy="18" r="2" fill={color} />
            <circle cx="27" cy="18" r="2" fill={color} />
            <path d="M20 24Q24 28 28 24" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <path d="M24 30V38" stroke={color} strokeWidth="3" />
        </svg>
    ),
    '장성살': ({ size, color = '#F59E0B' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M12 32L16 20L24 12L32 20L36 32H12Z" fill={color} />
            <circle cx="24" cy="22" r="4" fill="white" />
        </svg>
    ),
    '반안살': ({ size, color = '#A78BFA' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <rect x="12" y="20" rx="4" width="24" height="16" fill={color} />
            <rect x="16" y="24" rx="2" width="16" height="8" fill="white" fillOpacity="0.5" />
        </svg>
    ),
    '역마살': ({ size, color = '#10B981' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M12 32L20 16L28 24L36 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M30 12H36V18" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    '육해살': ({ size, color = '#EC4899' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <circle cx="24" cy="16" r="6" fill={color} />
            <circle cx="16" cy="28" r="4" fill={color} fillOpacity="0.7" />
            <circle cx="32" cy="28" r="4" fill={color} fillOpacity="0.7" />
            <path d="M24 22V40" stroke={color} strokeWidth="2" />
            <path d="M16 32L24 28L32 32" stroke={color} strokeWidth="2" />
        </svg>
    ),
    '화개살': ({ size, color = '#8B5CF6' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 8L28 16L36 18L30 26L32 34L24 30L16 34L18 26L12 18L20 16L24 8Z" fill={color} />
            <circle cx="24" cy="22" r="4" fill="white" />
        </svg>
    ),

    // ============ 귀인류 ============
    '천을귀인': ({ size, color = '#F59E0B' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 6L28 18H40L30 26L34 38L24 30L14 38L18 26L8 18H20L24 6Z" fill={color} />
            <circle cx="24" cy="22" r="6" fill="white" />
            <path d="M24 16V20M22 18H26" stroke={color} strokeWidth="2" />
        </svg>
    ),
    '태극귀인': ({ size, color = '#3B82F6' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <circle cx="24" cy="24" r="14" stroke={color} strokeWidth="2" />
            <path d="M24 10A14 14 0 0 1 24 38A7 7 0 0 1 24 24A7 7 0 0 0 24 10Z" fill={color} />
            <circle cx="24" cy="17" r="2" fill="white" />
            <circle cx="24" cy="31" r="2" fill={color} />
        </svg>
    ),
    '문창귀인': ({ size, color = '#3B82F6' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <rect x="14" y="10" width="20" height="28" rx="2" fill={color} />
            <rect x="18" y="14" width="12" height="2" fill="white" />
            <rect x="18" y="20" width="12" height="2" fill="white" />
            <rect x="18" y="26" width="8" height="2" fill="white" />
            <circle cx="36" cy="12" r="4" fill="#F59E0B" />
        </svg>
    ),
    '학당귀인': ({ size, color = '#10B981' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 8L40 18L24 28L8 18L24 8Z" fill={color} />
            <path d="M14 20V32L24 38L34 32V20" stroke={color} strokeWidth="2" />
            <path d="M40 18V30" stroke={color} strokeWidth="2" />
            <circle cx="40" cy="32" r="2" fill={color} />
        </svg>
    ),

    // ============ 살류 ============
    '양인살': ({ size, color = '#EF4444' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 8V32" stroke={color} strokeWidth="4" strokeLinecap="round" />
            <path d="M18 14L24 8L30 14" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 36H32" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </svg>
    ),
    '도화살': ({ size, color = '#EC4899' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 10C26 14 30 18 30 24C30 30 24 38 24 38C24 38 18 30 18 24C18 18 22 14 24 10Z" fill={color} />
            <circle cx="24" cy="22" r="4" fill="white" fillOpacity="0.6" />
            <path d="M20 28Q24 32 28 28" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    ),
    '홍염살': ({ size, color = '#EC4899' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M24 36C24 36 12 28 12 20C12 14 16 10 20 10C22 10 24 12 24 12C24 12 26 10 28 10C32 10 36 14 36 20C36 28 24 36 24 36Z" fill={color} />
            <circle cx="20" cy="20" r="2" fill="white" fillOpacity="0.6" />
        </svg>
    ),
    '홍염살(약함)': ({ size, color = '#EC4899' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.1" />
            <path d="M24 36C24 36 12 28 12 20C12 14 16 10 20 10C22 10 24 12 24 12C24 12 26 10 28 10C32 10 36 14 36 20C36 28 24 36 24 36Z" fill={color} fillOpacity="0.6" />
            <circle cx="20" cy="20" r="2" fill="white" fillOpacity="0.6" />
        </svg>
    ),
    '백호살': ({ size, color = '#DC2626' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M14 14L24 24L34 14" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <path d="M14 24L24 34L34 24" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <path d="M24 8V40" stroke={color} strokeWidth="2" strokeOpacity="0.5" />
        </svg>
    ),
    '괴강살': ({ size, color = '#7C3AED' }) => (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" fill={color} fillOpacity="0.15" />
            <path d="M12 30L18 14L24 26L30 14L36 30H12Z" fill={color} />
            <path d="M12 30H36" stroke="white" strokeWidth="2" />
        </svg>
    ),
};

// 기본 아이콘 (매핑 안된 신살용)
const DefaultIcon: React.FC<{ size: number }> = ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" fill="#9CA3AF" fillOpacity="0.15" />
        <circle cx="24" cy="24" r="12" stroke="#9CA3AF" strokeWidth="3" />
        <circle cx="24" cy="24" r="4" fill="#9CA3AF" />
    </svg>
);

interface SinsalIconProps {
    name: string;
    size?: number;
    className?: string;
}

export default function SinsalIcon({ name, size = 40, className }: SinsalIconProps) {
    const IconComponent = SINSAL_ICONS[name];

    if (IconComponent) {
        return (
            <span className={className} style={{ display: 'inline-flex' }}>
                <IconComponent size={size} />
            </span>
        );
    }

    return (
        <span className={className} style={{ display: 'inline-flex' }}>
            <DefaultIcon size={size} />
        </span>
    );
}
