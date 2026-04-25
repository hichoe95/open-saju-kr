'use client';

import React from 'react';
import { BriefcaseIcon } from '@phosphor-icons/react/dist/csr/Briefcase';
import { HeartIcon } from '@phosphor-icons/react/dist/csr/Heart';
import { TargetIcon } from '@phosphor-icons/react/dist/csr/Target';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import styles from './ScenarioSelector.module.css';

export type CompatibilityScenario = 'lover' | 'crush' | 'friend' | 'family' | 'business';

export interface ScenarioSelectorProps {
  selected: CompatibilityScenario;
  onSelect: (scenario: CompatibilityScenario) => void;
  disabled?: boolean;
}

interface ScenarioData {
  id: CompatibilityScenario;
  icon: React.ReactNode;
  label: string;
  desc: string;
}

const SCENARIOS: ScenarioData[] = [
  { 
    id: 'lover', 
    icon: <HeartIcon size={24} weight="fill" />, 
    label: '연인', 
    desc: '장기적 관계와 결혼 궁합' 
  },
  { 
    id: 'crush', 
    icon: <TargetIcon size={24} weight="fill" />, 
    label: '썸/관심', 
    desc: '상대 마음과 발전 가능성' 
  },
  { 
    id: 'friend', 
    icon: <UsersIcon size={24} weight="fill" />, 
    label: '친구', 
    desc: '우정의 깊이와 지속성' 
  },
  { 
    id: 'family', 
    icon: <UsersIcon size={24} />, 
    label: '가족', 
    desc: '세대 간 이해와 화합' 
  },
  { 
    id: 'business', 
    icon: <BriefcaseIcon size={24} weight="fill" />, 
    label: '비즈니스', 
    desc: '업무 스타일과 협업' 
  },
];

export default function ScenarioSelector({
  selected,
  onSelect,
  disabled = false
}: ScenarioSelectorProps) {
  const selectedScenario = SCENARIOS.find(s => s.id === selected);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>어떤 관계의 궁합을 볼까요?</h3>
      
      <div className={styles.grid} role="radiogroup" aria-label="궁합 시나리오 선택">
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={`${styles.card} ${selected === scenario.id ? styles.selected : ''}`}
            onClick={() => !disabled && onSelect(scenario.id)}
            disabled={disabled}
            role="radio"
            aria-checked={selected === scenario.id}
            aria-label={`${scenario.label} 궁합`}
          >
            <span className={styles.icon} aria-hidden="true">{scenario.icon}</span>
            <span className={styles.label}>{scenario.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.descriptionBox}>
        선택: <span className={styles.highlight}>[{selectedScenario?.label}]</span> - &quot;{selectedScenario?.desc}을(를) 중심으로 분석합니다&quot;
      </div>
    </div>
  );
}
