export const formatCurrency = (amount, { currency = 'USD', locale, ...options } = {}) =>
	Number(amount || 0).toLocaleString(locale, { style: 'currency', currency, ...options });

export const formatNumber = (value, { locale, ...options } = {}) =>
	Number(value || 0).toLocaleString(locale, options);

export const formatDate = (date, { locale, ...options } = {}) => {
	if (!date) return '';

	const parsed = new Date(date);

	if (Number.isNaN(parsed.getTime())) return '';

	return parsed.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', ...options });
};

/**
 * Renders an ISO timestamp as a short relative age.
 *
 * Deliberately coarse: the workspace shows when something happened, and a
 * second-accurate age on a record from last Tuesday is noise, not precision.
 *
 * @param {string} iso ISO-8601 timestamp.
 * @returns {string} Relative age such as `4h ago`, or an em dash when unknown.
 */
export const timeAgo = (iso) => {
	if (!iso) return '—';

	const parsed = new Date(iso);

	if (Number.isNaN(parsed.getTime())) return '—';

	const minutes = Math.floor((Date.now() - parsed.getTime()) / 60000);

	if (minutes < 0) return 'scheduled';
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);

	if (hours < 24) return `${hours}h ago`;

	return `${Math.floor(hours / 24)}d ago`;
};

/**
 * Renders an ISO timestamp as a due date, signalling how urgent it is.
 *
 * @param {string} iso ISO-8601 timestamp.
 * @returns {{label: string, overdue: boolean, soon: boolean}} Due-date summary.
 */
export const describeDueDate = (iso) => {
	if (!iso) return { label: '', overdue: false, soon: false };

	const parsed = new Date(iso);

	if (Number.isNaN(parsed.getTime())) return { label: '', overdue: false, soon: false };

	const days = Math.ceil((parsed.getTime() - Date.now()) / 86400000);

	if (days < 0) return { label: `${Math.abs(days)}d overdue`, overdue: true, soon: false };
	if (days === 0) return { label: 'due today', overdue: false, soon: true };
	if (days === 1) return { label: 'due tomorrow', overdue: false, soon: true };

	return { label: `due in ${days}d`, overdue: false, soon: days <= 3 };
};

export const truncate = (text, max = 120) => {
	if (!text) return '';

	return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
};

export const slugify = (text) =>
	String(text || '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s_-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
