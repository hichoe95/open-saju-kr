
import React from 'react';
import { CompatibilityResponse } from '@/types';
import { Heart, AlertTriangle, MessageCircle, Zap } from 'lucide-react';
import GlossaryHighlight from './GlossaryHighlight';
import ReferralCTA from './ReferralCTA';

interface Props {
    data: CompatibilityResponse;
}

export default function CompatibilityResult({ data }: Props) {
    return (
        <div style={{ marginTop: '40px', background: '#fff', borderRadius: '24px', padding: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                    display: 'inline-block', padding: '8px 16px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)', color: 'white',
                    fontWeight: 'bold', fontSize: '14px', marginBottom: '12px'
                }}>
                    AI 정밀 궁합 분석
                </div>
                <h3 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1F2937', marginBottom: '8px' }}>
                    {data.summary}
                </h3>
                <div style={{ fontSize: '16px', color: '#6B7280' }}>
                    {data.keyword}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg aria-hidden="true" focusable="false" viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#EC4899" strokeWidth="3" strokeDasharray={`${data.score}, 100`} />
                    </svg>
                    <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#BE185D' }}>{data.score}</span>
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>점</span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <Section icon={<Heart size={20} color="#EC4899" />} title="성격 조화" content={data.personality_fit} color="#FCE7F3" />
                <Section icon={<Zap size={20} color="#F59E0B" />} title="오행 균형" content={data.element_balance} color="#FEF3C7" />
                <Section icon={<AlertTriangle size={20} color="#F87171" />} title="갈등 포인트" content={data.conflict_points} color="#FEE2E2" />
                <Section icon={<MessageCircle size={20} color="#3B82F6" />} title="AI 도사의 조언" content={data.advice} color="#DBEAFE" />
            </div>

            {data.full_text && (
                <div style={{ marginTop: '24px', padding: '16px', background: '#F9FAFB', borderRadius: '12px', fontSize: '14px', lineHeight: '1.6', color: '#4B5563' }}>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{data.full_text}</p>
                </div>
            )}

            <ReferralCTA variant="inline" surface="compatibility_result" />
        </div>
    );
}

interface SectionProps {
    icon: React.ReactNode;
    title: string;
    content: string;
    color: string;
}

function Section({ icon, title, content, color }: SectionProps) {
    return (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <div style={{
                minWidth: '40px', height: '40px', borderRadius: '12px',
                background: color, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                {icon}
            </div>
            <div>
                <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#374151', marginBottom: '4px' }}>{title}</h4>
                <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#6B7280' }}>
                    <GlossaryHighlight text={content} />
                </p>
            </div>
        </div>
    );
}
