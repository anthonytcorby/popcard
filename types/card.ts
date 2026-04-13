export type CardType =
  | 'KEY_INSIGHT'
  | 'ACTIONABLE_TIP'
  | 'STAT_OR_DATA'
  | 'QUOTE'
  | 'WATCH_OUT'
  | 'TOOL_MENTIONED'
  | 'RESOURCE_LINK'
  | 'KEY_THEME'
  | 'TLDR'
  | 'SECTION_HEADER';

export interface PopCard {
  id: string;
  type: CardType;
  headline: string;
  body: string;
  boldPhrase?: string;
  timestamp?: string;
  warning?: string;  // subtle note for potentially misleading content
  url?: string;      // for TOOL_MENTIONED / RESOURCE_LINK
  references?: string[]; // books, papers, URLs, people mentioned in context of this card
}

export const CARD_COLORS: Record<CardType, { bg: string; text: string; pill: string }> = {
  KEY_INSIGHT:    { bg: '#4A90D9', text: 'white',   pill: 'rgba(255,255,255,0.25)' },
  ACTIONABLE_TIP: { bg: '#4ECDC4', text: 'white',   pill: 'rgba(255,255,255,0.25)' },
  STAT_OR_DATA:   { bg: '#6C63FF', text: 'white',   pill: 'rgba(255,255,255,0.25)' },
  QUOTE:          { bg: '#FFD93D', text: '#1a1a1a', pill: 'rgba(0,0,0,0.12)'       },
  WATCH_OUT:      { bg: '#FF9A3C', text: 'white',   pill: 'rgba(255,255,255,0.25)' },
  TOOL_MENTIONED: { bg: '#A78BFA', text: 'white',   pill: 'rgba(255,255,255,0.25)' },
  RESOURCE_LINK:  { bg: '#34D399', text: 'white',   pill: 'rgba(255,255,255,0.25)' },
  KEY_THEME:      { bg: '#3B82F6', text: 'white',   pill: 'rgba(255,255,255,0.25)' },
  TLDR:           { bg: '#1a1a2e', text: 'white',   pill: 'rgba(255,255,255,0.15)' },
  SECTION_HEADER: { bg: 'transparent', text: '#6B7280', pill: 'transparent'         },
};

export const CARD_LABELS: Record<CardType, string> = {
  KEY_INSIGHT:    'Key Insight',
  ACTIONABLE_TIP: 'Actionable Tip',
  STAT_OR_DATA:   'Stat / Data',
  QUOTE:          'Quote',
  WATCH_OUT:      'Watch Out',
  TOOL_MENTIONED: 'Tool',
  RESOURCE_LINK:  'Resource',
  KEY_THEME:      'Key Theme',
  TLDR:           'TL;DR',
  SECTION_HEADER: '',
};

/** Types that appear in the filter bar (excludes meta-types) */
export const FILTERABLE_TYPES: CardType[] = [
  'KEY_INSIGHT', 'ACTIONABLE_TIP', 'STAT_OR_DATA', 'QUOTE',
  'WATCH_OUT', 'TOOL_MENTIONED', 'RESOURCE_LINK', 'KEY_THEME',
];

export const FILTER_OPTIONS: Array<{ label: string; value: CardType | 'ALL' }> = [
  { label: 'All',         value: 'ALL'           },
  { label: 'Insights',   value: 'KEY_INSIGHT'    },
  { label: 'Tips',       value: 'ACTIONABLE_TIP' },
  { label: 'Stats',      value: 'STAT_OR_DATA'   },
  { label: 'Quotes',     value: 'QUOTE'          },
  { label: 'Watch Out',  value: 'WATCH_OUT'      },
  { label: 'Tools',      value: 'TOOL_MENTIONED' },
  { label: 'Resources',  value: 'RESOURCE_LINK'  },
  { label: 'Themes',     value: 'KEY_THEME'      },
];
