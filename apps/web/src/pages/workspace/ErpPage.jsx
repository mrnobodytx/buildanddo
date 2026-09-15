import React, { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { DemoModeBanner, DegradedNotice, ListSkeleton } from '@/components/workspace/WorkspaceNotices';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { dateInput, localDay, overdue, retainedFields, selectTasks, TASK_STATUSES, OBJECTIVE_STATUSES, PRIORITIES } from '@/lib/businessPlanning';
import pb from '@/lib/pocketbaseClient';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm';
const definitions = {
    objectives: { singular: 'objective', collection: 'erp_objectives', fields: [
        ['title', 'Objective', 'text', 200], ['description', 'Description', 'textarea', 1000],
        ['success_metric', 'Success measure', 'textarea', 600], ['due_date', 'Review due date', 'date'],
    ], statuses: OBJECTIVE_STATUSES, defaults: { title: '', description: '', success_metric: '', due_date: '', status: 'active' } },
    tasks: { singular: 'task', collection: 'erp_tasks', fields: [
        ['title', 'Task', 'text', 200], ['description', 'Task details', 'textarea', 2000], ['due_date', 'Due date', 'date'],
    ], statuses: TASK_STATUSES, defaults: { title: '', description: '', due_date: '', status: 'todo', priority: 'normal', objective: '', contact: '' } },
    contacts: { singular: 'contact', collection: 'erp_contacts', fields: [
        ['name', 'Name', 'text', 160], ['role', 'Role', 'text', 120], ['email', 'Email', 'email'], ['notes', 'Notes', 'textarea', 1000],
    ], defaults: { name: '', role: '', email: '', notes: '' } },
};

function ErpDesk({ accountId, demo }) {
    const objectives = useWorkspaceRecords('erp_objectives');
    const tasks = useWorkspaceRecords('erp_tasks');
    const contacts = useWorkspaceRecords('erp_contacts');
    const sources = { objectives, tasks, contacts };
    const [tab, setTab] = useState('objectives');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const [priority, setPriority] = useState('all');
    const [editor, setEditor] = useState(null);
    const [draft, setDraft] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');
    const alive = useRef(true);
    const lock = useRef(false);
    const opener = useRef(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const today = localDay();
    const knownTasks = !tasks.loading && !tasks.degraded;
    const knownObjectives = !objectives.loading && !objectives.degraded;
    const begin = (kind, record, target) => {
        const definition = definitions[kind];
        sources[kind].clearWriteError();
        opener.current = target;
        setDraft(Object.fromEntries(Object.entries(definition.defaults).map(([key, fallback]) => [key,
            key === 'due_date' ? dateInput(record?.[key]) : record?.[key] || fallback])));
        setEditor({ kind, id: record?.id || '' }); setError(''); setSaved('');
    };
    const save = async (event) => {
        event.preventDefault();
        if (lock.current || demo || !editor || pb.authStore.record?.id !== accountId) return;
        const definition = definitions[editor.kind];
        if (!(draft.title || draft.name || '').trim()) { setError('A name is required.'); return; }
        lock.current = true; setBusy(true); setError('');
        const values = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key,
            key === 'due_date' ? (value ? `${value} 12:00:00.000Z` : '') : value.trim()]));
        const source = sources[editor.kind];
        const result = editor.id ? await source.update(editor.id, values) : await source.create(values);
        if (alive.current && pb.authStore.record?.id === accountId) {
            if (result.ok && !retainedFields(result.record, values)) {
                setEditor((before) => ({ ...before, id: result.record.id }));
                setError('A record was saved, but the backend did not retain every field. Apply the ERP migration before updating this saved record. Your entered values are still here.');
            } else if (result.ok) { setEditor(null); setSaved(`${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} saved.`); }
            else setError(result.error || 'Could not save this record. Your form is still available.');
            setBusy(false);
        }
        lock.current = false;
    };
    const definition = editor && definitions[editor.kind];
    const source = sources[tab];
    const search = query.trim().toLowerCase();
    const visible = tab === 'tasks' ? selectTasks(tasks.records, { query, status, priority, today }) : source.records.filter((record) =>
        `${record.title || record.name || ''} ${record.description || record.role || ''} ${record.email || ''} ${record.notes || ''}`.toLowerCase().includes(search) &&
        (status === 'all' || record.status === status));
    const relationSelect = (name, label, records, unavailable, titleField) => <div className="space-y-1">
        <Label htmlFor={`erp-${name}`}>{label}</Label>
        <select id={`erp-${name}`} className={selectClass} value={draft[name]} disabled={unavailable} onChange={(event) => setDraft((before) => ({ ...before, [name]: event.target.value }))}>
            <option value="">No link</option>{records.map((record) => <option key={record.id} value={record.id}>{record[titleField]}</option>)}
            {draft[name] && !records.some((record) => record.id === draft[name]) && <option value={draft[name]}>Current link unavailable</option>}
        </select>
        {unavailable && <p className="text-xs text-muted-foreground">Related records are unavailable; retry their list before changing this link.</p>}
    </div>;
    return <div className="ph-no-capture space-y-6" data-dd-privacy="mask">
        {demo && <DemoModeBanner />}
        <div className="grid gap-3 sm:grid-cols-3">{[
            ['Active objectives', knownObjectives ? objectives.records.filter((record) => record.status === 'active').length : 'Unavailable'],
            ['Open tasks', knownTasks ? tasks.records.filter((record) => record.status !== 'done').length : 'Unavailable'],
            ['Overdue tasks', knownTasks ? tasks.records.filter((record) => overdue(record, today)).length : 'Unavailable'],
        ].map(([label, value]) => <Card key={label} className="space-y-2 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="font-display text-2xl">{value}</p></Card>)}</div>
        {saved && <p role="status" className="text-sm text-success">{saved}</p>}
        <Tabs value={tab} onValueChange={(next) => { setTab(next); setStatus('all'); setQuery(''); setPriority('all'); }}>
            <TabsList className="h-auto flex-wrap justify-start">{Object.keys(definitions).map((name) => <TabsTrigger key={name} value={name}>{name[0].toUpperCase() + name.slice(1)}</TabsTrigger>)}</TabsList>
            {Object.entries(definitions).map(([kind, config]) => <TabsContent key={kind} value={kind} className="space-y-4 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">{kind[0].toUpperCase() + kind.slice(1)}</h2><div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={source.loading || busy} onClick={source.refresh}>Refresh {kind}</Button>
                    <Button size="sm" disabled={demo || source.loading || source.degraded} onClick={(event) => begin(kind, null, event.currentTarget)}>Add {config.singular}</Button>
                </div></div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1"><Label htmlFor={`erp-search-${kind}`}>Search {kind}</Label><Input id={`erp-search-${kind}`} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
                    {config.statuses && <div className="space-y-1"><Label htmlFor={`erp-filter-${kind}`}>Filter by status</Label><select id={`erp-filter-${kind}`} className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All states</option>{Object.entries(config.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}{kind === 'tasks' && <option value="overdue">Overdue</option>}</select></div>}
                    {kind === 'tasks' && <div className="space-y-1"><Label htmlFor="erp-priority-filter">Filter by priority</Label><select id="erp-priority-filter" className={selectClass} value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option>{Object.entries(PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
                </div>
                {source.degraded ? <DegradedNotice message={`The ${kind} list is unavailable.`} onRetry={source.refresh} /> : source.loading ? <ListSkeleton label={`Loading ${kind}…`} /> : !visible.length ? <p className="text-sm text-muted-foreground">{query || status !== 'all' || priority !== 'all' ? 'No records match these filters.' : `No ${kind} yet. Add a record to begin.`}</p> : <ul className="grid gap-3 md:grid-cols-2">
                    {visible.map((record) => <li key={record.id} className="min-w-0"><Card className="h-full space-y-3 break-words p-4">
                        <div className="flex items-start justify-between gap-3"><h3 className="font-display text-lg font-semibold">{record.title || record.name}</h3><Button size="sm" variant="ghost" disabled={demo} aria-label={`Edit ${record.title || record.name}`} onClick={(event) => begin(kind, record, event.currentTarget)}>Edit</Button></div>
                        {record.status && <p className="text-xs font-semibold text-primary">{config.statuses?.[record.status] || record.status}{kind === 'tasks' ? ` · ${PRIORITIES[record.priority] || 'Normal'} priority` : ''}</p>}
                        {(record.description || record.role) && <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{record.description || record.role}</p>}
                        {kind === 'objectives' && <><p className="text-sm leading-6">Success measure: {record.success_metric || 'Not recorded yet.'}</p><p className="text-xs text-muted-foreground">{knownTasks ? `${tasks.records.filter((task) => task.objective === record.id && task.status === 'done').length} of ${tasks.records.filter((task) => task.objective === record.id).length} linked tasks done` : 'Linked task counts unavailable'}</p></>}
                        {kind === 'tasks' && <><p className="text-xs text-muted-foreground">Objective: {record.objective ? objectives.records.find((item) => item.id === record.objective)?.title || 'Current link unavailable' : 'Not linked'}</p><p className="text-xs text-muted-foreground">Contact: {record.contact ? contacts.records.find((item) => item.id === record.contact)?.name || 'Current link unavailable' : 'Not linked'}</p></>}
                        {dateInput(record.due_date) && <p className={`text-xs ${overdue(record, today) && kind === 'tasks' ? 'text-destructive' : 'text-muted-foreground'}`}>Due: {dateInput(record.due_date)}{kind === 'tasks' && overdue(record, today) ? ' · Overdue' : ''}</p>}
                        {record.email && <p className="break-all text-sm">{record.email}</p>}{record.notes && <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{record.notes}</p>}
                    </Card></li>)}
                </ul>}
            </TabsContent>)}
        </Tabs>
        {editor && <Dialog open onOpenChange={(open) => { if (!open && !busy) setEditor(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto" data-dd-privacy="mask" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
            <div className="ph-no-capture space-y-4"><DialogHeader><DialogTitle>{editor.id ? 'Edit' : 'Add'} {definition.singular}</DialogTitle><DialogDescription>Save real planning information for this workspace. Contact links do not send notifications or grant access.</DialogDescription></DialogHeader>
                <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="min-w-0 space-y-4">
                    {definition.fields.map(([name, label, type, maximum]) => <div key={name} className="space-y-1"><Label htmlFor={`erp-edit-${name}`}>{label}</Label>{type === 'textarea' ? <Textarea id={`erp-edit-${name}`} rows={3} maxLength={maximum} value={draft[name]} onChange={(event) => setDraft((before) => ({ ...before, [name]: event.target.value }))} /> : <Input id={`erp-edit-${name}`} type={type} maxLength={maximum} required={['title', 'name'].includes(name)} value={draft[name]} onChange={(event) => setDraft((before) => ({ ...before, [name]: event.target.value }))} />}</div>)}
                    {definition.statuses && <div className="space-y-1"><Label htmlFor="erp-edit-status">Status</Label><select id="erp-edit-status" className={selectClass} value={draft.status} onChange={(event) => setDraft((before) => ({ ...before, status: event.target.value }))}>{Object.entries(definition.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
                    {editor.kind === 'tasks' && <>
                        <div className="space-y-1"><Label htmlFor="erp-edit-priority">Priority</Label><select id="erp-edit-priority" className={selectClass} value={draft.priority} onChange={(event) => setDraft((before) => ({ ...before, priority: event.target.value }))}>{Object.entries(PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                        {relationSelect('objective', 'Linked objective', objectives.records, objectives.loading || objectives.degraded, 'title')}
                        {relationSelect('contact', 'Point of contact', contacts.records, contacts.loading || contacts.degraded, 'name')}
                    </>}
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" size="sm">{busy ? 'Saving…' : 'Save'}</Button></div>
                </fieldset></form>
            </div>
        </DialogContent></Dialog>}
        <p className="text-xs leading-6 text-muted-foreground">Task completion records an action. Review the objective’s success measure separately. Contact records do not send messages or establish consent.</p>
    </div>;
}

export default function ErpPage() {
    const { active } = useWorkspace();
    const { user } = useAuth();
    const { demo } = useDemoMode();
    return <div className="space-y-6"><PageHeader title="ERP workspace" description="Plan measurable objectives, link tasks and contacts, and review the next action using saved workspace records." />
        {active && user?.id ? <ErpDesk key={`${user.id}:${active.id}:${demo}`} accountId={user.id} demo={demo} /> : <p>Select a workspace to manage its records.</p>}
    </div>;
}
