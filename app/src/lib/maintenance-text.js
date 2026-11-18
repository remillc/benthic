// @ts-check
// Words of the maintenance screens that more than one place needs.
import { t } from './i18n.js';

/** The name of a reminder's task: the diver's own words for a custom one. @param {{ task: string, label?: string }} item */
export const taskLabel = (item) => (item.task === 'custom' ? (item.label ?? '') : t(`maintenance.task.${item.task}`));

/** Sentence-case text in the middle of a line (« Apeks XTX50 · entretien »). @param {{ task: string, label?: string }} item */
export const taskInline = (item) => {
  const s = taskLabel(item);
  return item.task === 'custom' ? s : s.charAt(0).toLocaleLowerCase() + s.slice(1);
};

/**
 * « Tous les 2 ans ou toutes les 100 plongées ».
 * @param {{ intervalMonths: number|null, intervalDives: number|null }} rule
 */
export function ruleText(rule) {
  const { intervalMonths: m, intervalDives: d } = rule;
  const time = m == null ? '' : m % 12 === 0 ? t('maintenance.rule.every.years', { n: m / 12 }) : t('maintenance.rule.every.months', { n: m });
  const dives = d == null ? '' : t('maintenance.rule.every.dives', { n: d });
  if (time && dives) return t('maintenance.rule.every.or', { time, dives: dives.charAt(0).toLocaleLowerCase() + dives.slice(1) });
  return time || dives;
}

/**
 * The tag of an evaluated reminder: « En retard de 46 jours », « Dans 25 jours », « Dans 5 mois ».
 * @param {import('./maintenance.js').Evaluation} e
 */
export function tagText(e) {
  if (e.status === 'overdue') {
    if (e.timeReached && e.daysLeft != null) return t('maintenance.tag.lateDays', { n: -e.daysLeft });
    return (e.divesLeft ?? 0) < 0 ? t('maintenance.tag.lateDives', { n: -(e.divesLeft ?? 0) }) : t('maintenance.tag.dueNow');
  }
  // The nearer trigger names the time left.
  if (e.first === 'dives' && e.divesLeft != null) return t('maintenance.tag.inDives', { n: e.divesLeft });
  const days = e.daysLeft ?? 0;
  if (days === 0) return t('maintenance.tag.today');
  if (days <= 60) return t('maintenance.tag.inDays', { n: days });
  return t('maintenance.tag.inMonths', { n: Math.round(days / 30.4) });
}

/**
 * The line under a reminder in the list: the date, the dives, or both.
 * @param {import('./maintenance.js').Evaluation} e
 * @param {(iso: string) => string} formatDate
 */
export function lineText(e, formatDate) {
  const date = e.dueDate ? formatDate(e.dueDate) : '';
  if (e.status === 'overdue') {
    if (e.timeReached && date) return t('maintenance.line.overdueOn', { date });
    return t('maintenance.line.overdueDives', { n: e.item.intervalDives ?? 0 });
  }
  if (date && e.divesLeft != null) return t('maintenance.line.onOrDives', { date, n: e.divesLeft });
  if (date) return t('maintenance.line.on', { date });
  return t('maintenance.line.divesLeft', { n: e.divesLeft ?? 0 });
}
