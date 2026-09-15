// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/businessPlanning.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js
// DAG Node:    none
// Intent:      Derive ERP planning and editable content outlines from saved records and explicit operator input.
// ───────────────────────────────────────────────────────────────

export const TASK_STATUSES = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
export const OBJECTIVE_STATUSES = { active: 'Active', achieved: 'Achieved', archived: 'Archived' };
export const PRIORITIES = { high: 'High', normal: 'Normal', low: 'Low' };
export const CONTENT_FORMATS = { blog: 'Blog article', tutorial: 'Tutorial', social: 'Social post' };
export const CONTENT_STATUSES = {
    draft: 'Draft', awaiting_approval: 'Awaiting review', approved: 'Approved',
    scheduled: 'Planned', published: 'Publication recorded', failed: 'Failed',
};

/** @param {unknown} value Stored date. @returns {string} Valid calendar date or empty. */
export function dateInput(value) {
    if (typeof value !== 'string') return '';
    const date = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : '';
}

/** @param {Date} now Local clock. @returns {string} Today's local calendar date. */
export function localDay(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** @param {{status?: string, due_date?: string}} task Saved task. @param {string} today Local date. @returns {boolean} Whether unfinished work is overdue. */
export function overdue(task, today = localDay()) {
    const date = dateInput(task.due_date);
    return task.status !== 'done' && Boolean(date) && date < today;
}

/** @param {Array<{title?: string, description?: string, status?: string, priority?: string, due_date?: string}>} records Tasks. @param {{query?: string, status?: string, priority?: string, today?: string}} filters Selection. @returns {Array<object>} Matching tasks, most urgent first. */
export function selectTasks(records, { query = '', status = 'all', priority = 'all', today = localDay() } = {}) {
    const search = query.trim().toLowerCase();
    return records.filter((record) =>
        `${record.title || ''} ${record.description || ''}`.toLowerCase().includes(search) &&
        (status === 'all' || (status === 'overdue' ? overdue(record, today) : record.status === status)) &&
        (priority === 'all' || (record.priority || 'normal') === priority),
    ).sort((a, b) => Number(overdue(b, today)) - Number(overdue(a, today)) ||
        ['high', 'normal', 'low'].indexOf(a.priority || 'normal') - ['high', 'normal', 'low'].indexOf(b.priority || 'normal') ||
        (dateInput(a.due_date) || '9999').localeCompare(dateInput(b.due_date) || '9999') ||
        (a.title || '').localeCompare(b.title || ''));
}

/** @param {{format?: string, title?: string, audience?: string, brief?: string, call_to_action?: string}} input Author's brief. @returns {string} Editable outline; never a generated factual claim. */
export function contentOutline({ format = 'blog', title = '', audience = '', brief = '', call_to_action = '' }) {
    const start = `# ${title.trim() || 'Working title'}\n\nAudience: ${audience.trim() || '[Describe the reader]'}\n\n${brief.trim() || '[State the problem and facts you can support]'}`;
    const bodies = {
        blog: '\n\n## The reader’s problem\n[Describe one specific problem.]\n\n## What to do\n- [Explain the first action.]\n- [Explain how to check the result.]\n\n## Evidence and limits\n[Add sources, dates and remaining uncertainty.]',
        tutorial: '\n\n## Outcome and preparation\n[Name the result and what the learner needs.]\n\n## Steps\n1. [Give an action the learner can perform.]\n2. [Describe the expected observable result.]\n\n## Worked example\n[Label illustrative data clearly.]\n\n## Check your work\n[Add an exercise and an answer explanation.]',
        social: '\n\n## Hook\n[Name a useful, supported observation.]\n\n## Takeaway\n[Explain one action in the reader’s language.]\n\n## Source\n[Add the source and any relevant limits.]',
    };
    return `${start}${bodies[format] || bodies.blog}\n\n## Next step\n${call_to_action.trim() || '[Give one clear, optional next action.]'}`;
}

/** @param {string} body Plain text with headings and lists. @returns {Array<{kind: string, text?: string, items?: string[]}>} Non-executable preview blocks. */
export function draftBlocks(body) {
    const blocks = [];
    for (const chunk of String(body || '').replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
        const lines = chunk.trim().split('\n');
        if (!chunk.trim()) continue;
        if (lines.every((line) => /^[-*] /.test(line)))
            blocks.push({ kind: 'unordered', items: lines.map((line) => line.slice(2)) });
        else if (lines.every((line) => /^\d+\. /.test(line)))
            blocks.push({ kind: 'ordered', items: lines.map((line) => line.replace(/^\d+\. /, '')) });
        else if (lines.length === 1 && /^#{1,3} /.test(lines[0]))
            blocks.push({ kind: 'heading', text: lines[0].replace(/^#{1,3} /, '') });
        else blocks.push({ kind: 'paragraph', text: lines.join('\n') });
    }
    return blocks;
}

/** @param {unknown} value User-entered publication link. @returns {string} HTTPS link without embedded credentials, or empty. */
export function publicationUrl(value) {
    if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) return '';
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

/** @param {object} record Backend response. @param {Record<string, string>} fields Submitted form. @returns {boolean} Whether saved fields survived schema filtering and date normalization. */
export function retainedFields(record, fields) {
    return Boolean(record?.id) && Object.entries(fields).every(([name, value]) =>
        ['due_date', 'scheduled_for'].includes(name) ?
            typeof record[name] === 'string' && dateInput(record[name]) === dateInput(value) : record[name] === value);
}
