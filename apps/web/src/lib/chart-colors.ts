/** Categorical chart slots in fixed order (CSS tokens in index.css, validated light and dark). Never cycle them. */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)']
/** Neutral color for the folded «Другое» bucket. */
export const SERIES_OTHER = 'var(--series-other)'

/** Work types get fixed categorical slots (color follows the type, never its rank); the rest fold into «Другое». */
export const TYPE_SLOTS = ['call', 'meeting', 'task', 'email', 'visit']
export const typeColor = (type: string) => (TYPE_SLOTS.includes(type) ? SERIES[TYPE_SLOTS.indexOf(type)] : SERIES_OTHER)
