import { ReadingResponse } from '@/types';

import { TabKey } from './types';

export interface SummaryHubCard {
  key: TabKey;
  title: string;
  summary: string;
  priority: number;
}

export function getSummaryHubCards(data: ReadingResponse): SummaryHubCard[] {
  const cards: SummaryHubCard[] = [];

  if (data.tabs.love?.summary) {
    cards.push({ key: 'love', title: '연애운', summary: data.tabs.love.summary, priority: 1 });
  }

  if (data.tabs.money?.summary) {
    cards.push({ key: 'money', title: '금전운', summary: data.tabs.money.summary, priority: 2 });
  }

  if (data.tabs.career?.summary) {
    cards.push({ key: 'career', title: '커리어', summary: data.tabs.career.summary, priority: 3 });
  }

  if (data.tabs.study?.summary) {
    cards.push({ key: 'study', title: '학업운', summary: data.tabs.study.summary, priority: 4 });
  }

  if (data.tabs.health?.summary) {
    cards.push({ key: 'health', title: '건강운', summary: data.tabs.health.summary, priority: 5 });
  }

  if (data.tabs.compatibility?.summary) {
    cards.push({ key: 'compatibility', title: '관계', summary: data.tabs.compatibility.summary, priority: 6 });
  }

  if (data.tabs.lucky?.today_overview) {
    cards.push({ key: 'lucky', title: '오늘의 운세', summary: data.tabs.lucky.today_overview, priority: 7 });
  }

  if (data.tabs.daeun?.summary) {
    cards.push({ key: 'daeun', title: '대운', summary: data.tabs.daeun.summary, priority: 8 });
  }

  if (data.tabs.life_flow?.mechanism?.[0]) {
    cards.push({ key: 'life', title: '인생 흐름', summary: data.tabs.life_flow.mechanism[0], priority: 9 });
  }

  return cards.sort((a, b) => a.priority - b.priority);
}
