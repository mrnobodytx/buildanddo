// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/AdminPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceControl.js, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceControl.js; CONSUMES apps/web/src/components/workspace/ControlPrimitives.jsx
// DAG Node:    none
// Intent:      Let authorized workspace administrators manage profile, members and community settings with visible audit and conflict recovery.
// ───────────────────────────────────────────────────────────────

import { MotionList } from '@/components/motion/MotionPrimitives';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { ControlState, ControlFeedback, PageControls, controlInput, dateLabel, focusPendingRetry } from '@/components/workspace/ControlPrimitives';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';

const roleNames = { owner: 'Owner', admin: 'Administrator', editor: 'Editor', viewer: 'Viewer' };
const actionNames = { 'settings.save': 'Settings saved', 'member.set': 'Member role saved', 'member.remove': 'Member removed',
    'integration.save': 'Integration change requested', 'integration.check': 'Health check requested', 'wiki.save': 'Wiki draft saved',
    'wiki.transition': 'Wiki publication changed', 'forum.create': 'Topic submitted', 'forum.reply': 'Reply submitted', 'forum.moderate': 'Discussion moderated' };

function SettingsForm({ control }) {
    const { data } = control; const { refresh } = useWorkspace(); const access = useWorkspaceAccess();
    const [form, setForm] = useState({ name: data.name, description: data.settings.description,
        wiki_enabled: data.settings.wiki_enabled, forum_enabled: data.settings.forum_enabled, forum_moderation: data.settings.forum_moderation });
    const change = (name, value) => setForm((before) => ({ ...before, [name]: value }));
    const submit = async (event) => {
        event.preventDefault();
        const result = await control.mutate('settings.save', form, data.settings.revision);
        if (result.ok) { await access.refresh(); await refresh(); }
    };
    const disabled = control.saving || control.uncertain;
    return <form className="space-y-5" onSubmit={submit}>
        <fieldset disabled={disabled} className="space-y-4">
            <legend className="sr-only">Workspace settings</legend>
            <div><label htmlFor="admin-name" className="mb-1 block text-sm font-medium">Workspace name</label>
                <input id="admin-name" required maxLength={120} className={controlInput} value={form.name} onChange={(e) => change('name', e.target.value)} /></div>
            <div><label htmlFor="admin-description" className="mb-1 block text-sm font-medium">Description</label>
                <textarea id="admin-description" rows={3} maxLength={800} className={controlInput} value={form.description} onChange={(e) => change('description', e.target.value)} /></div>
            {[['wiki_enabled', 'Enable workspace wiki'], ['forum_enabled', 'Enable workspace forum'], ['forum_moderation', 'Review editor topics and replies before members can read them']].map(([name, label]) =>
                <label key={name} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={form[name]} onChange={(e) => change(name, e.target.checked)} />{label}</label>)}
        </fieldset>
        <p className="text-sm text-muted-foreground">These settings apply to this workspace. Owners and administrators publish wiki pages and moderate discussions. Viewers have read access.</p>
        <Button type="submit" disabled={disabled}>Save workspace settings</Button>
    </form>;
}

function MemberRow({ member, control, onRemove, account }) {
    const [role, setRole] = useState(member.role === 'owner' ? 'admin' : member.role);
    const owner = control.data.role === 'owner';
    const protectedMember = member.user === account || (!owner && ['owner', 'admin'].includes(member.role));
    const disabled = protectedMember || control.saving || control.uncertain;
    return <li className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><p className="break-all font-evidence text-sm">{member.user}{member.user === account ? ' (you)' : ''}</p>
            <p className="text-xs text-muted-foreground">{roleNames[member.role === 'owner' ? 'admin' : member.role]} · Added {dateLabel(member.created)}</p></div>
        <div className="flex flex-wrap items-center gap-2 sm:max-w-md">
            <select aria-label={`Role for ${member.user}`} className={`${controlInput} sm:w-36`} value={role} disabled={disabled} onChange={(e) => setRole(e.target.value)}>
                {(owner || member.role === 'admin' || member.role === 'owner') && <option value="admin">Administrator</option>}
                <option value="editor">Editor</option><option value="viewer">Viewer</option>
            </select>
            <Button size="sm" variant="secondary" disabled={disabled || role === member.role || (member.role === 'owner' && role === 'admin')}
                onClick={() => control.mutate('member.set', { user: member.user, role }, control.data.settings.revision)}>Save role</Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove(member)}>Remove</Button>
        </div>
    </li>;
}

function Members({ control, onPage }) {
    const { user: account } = useAuth(); const { data } = control;
    const [user, setUser] = useState(''); const [role, setRole] = useState('viewer'); const [removing, setRemoving] = useState(null);
    const disabled = control.saving || control.uncertain;
    return <div className="space-y-5">
        <p className="text-sm text-muted-foreground">The owner controls administrator grants. Administrators manage editors and viewers. Every change takes effect on the next backend request.</p>
        <Card className="space-y-1 p-4"><p className="text-sm font-semibold">Workspace owner</p><p className="break-all font-evidence text-sm">{data.owner}</p>
            <p className="text-xs text-muted-foreground">Ownership stays fixed. Workspace roles do not grant access to other workspaces or site infrastructure.</p></Card>
        <form className="space-y-3 rounded-md border border-border p-4" onSubmit={(event) => { event.preventDefault(); control.mutate('member.set', { user: user.trim(), role }, data.settings.revision); }}>
            <h3 className="font-display text-lg font-semibold">Grant workspace access</h3>
            <label htmlFor="member-account" className="block text-sm">Existing account ID</label>
            <input id="member-account" required pattern="[A-Za-z0-9_-]{1,64}" maxLength={64} className={controlInput} value={user} disabled={disabled} onChange={(e) => setUser(e.target.value)} aria-describedby="member-help" />
            <p id="member-help" className="text-xs text-muted-foreground">Ask the person for their account ID from Settings. This grants access immediately; it sends no invitation email.</p>
            <label htmlFor="member-role" className="block text-sm">New member role</label>
            <select id="member-role" value={role} disabled={disabled} className={controlInput} onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">Viewer — read workspace records</option><option value="editor">Editor — contribute workspace records</option>
                {data.role === 'owner' && <option value="admin">Administrator — manage settings, integrations and moderation</option>}
            </select>
            <Button type="submit" size="sm" disabled={disabled}>Grant access</Button>
        </form>
        <ul className="space-y-3" aria-label="Workspace members">{data.members.items.map((member) => <MemberRow key={member.id} member={member} account={account?.id} control={control} onRemove={setRemoving} />)}</ul>
        {!data.members.items.length && <p className="text-sm text-muted-foreground">No additional members on this page.</p>}
        <PageControls label="Members" page={data.members.page} hasMore={data.members.has_more} onPage={onPage} disabled={disabled} />
        <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !control.saving) setRemoving(null); }}>
            <DialogContent onCloseAutoFocus={(event) => { if (control.uncertain) focusPendingRetry(event); }}><DialogHeader><DialogTitle>Remove workspace access</DialogTitle></DialogHeader>
                <p className="break-words text-sm">Remove access for {removing?.user}? Their existing contributions remain in the workspace.</p>
                <ControlFeedback control={control} />
                <DialogFooter><Button variant="secondary" disabled={control.saving} onClick={() => setRemoving(null)}>Cancel</Button>
                    <Button disabled={disabled} onClick={() => control.mutate('member.remove', { user: removing.user }, data.settings.revision)}>Remove access</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    </div>;
}

function AdminDesk({ control, membersPage, auditPage, tab, setTab }) {
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Your role: <strong>{roleNames[control.data.role]}</strong></p>
            <Link to="/app/integrations" className="text-sm underline underline-offset-4">Manage sinks and extensions</Link></div>
        <ControlFeedback control={control} />
        <Tabs value={tab} onValueChange={setTab}><TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="profile">Profile & features</TabsTrigger><TabsTrigger value="members">Members & roles</TabsTrigger><TabsTrigger value="audit">Audit history</TabsTrigger>
        </TabsList>
            <TabsContent value="profile" className="mt-5"><SettingsForm control={control} /></TabsContent>
            <TabsContent value="members" className="mt-5"><Members control={control} onPage={membersPage} /></TabsContent>
            <TabsContent value="audit" className="mt-5 space-y-4">
                <p className="text-sm text-muted-foreground">Saved settings, permission changes, integration requests and community decisions. Entries cannot be edited from BuildAndDo.</p>
                <MotionList as="ol" category="community" itemsKey={control.data.audit.items.map((item) => item.id).join(':')} className="space-y-3">{control.data.audit.items.map((item) => <li key={item.id} data-motion-key={item.id} className="space-y-1 rounded-md border border-border p-4">
                    <p className="text-sm font-semibold">{actionNames[item.action] || 'Workspace change'}</p>
                    <p className="break-all text-xs text-muted-foreground">Account {item.actor} · {dateLabel(item.created)}</p>
                    <p className="break-all text-xs text-muted-foreground">Record {item.target} · revision {item.revision}</p>
                </li>)}</MotionList>
                {!control.data.audit.items.length && <p className="text-sm text-muted-foreground">No audit entries on this page.</p>}
                <PageControls label="Audit" page={control.data.audit.page} hasMore={control.data.audit.has_more} onPage={auditPage} disabled={control.saving || control.uncertain} />
            </TabsContent>
        </Tabs>
    </div>;
}

export default function AdminPage() {
    const [membersPage, setMembersPage] = useState(1); const [auditPage, setAuditPage] = useState(1); const [tab, setTab] = useState('profile');
    const control = useWorkspaceControl('admin', { members_page: membersPage, audit_page: auditPage });
    return <div className="ph-no-capture space-y-6" data-dd-privacy="mask">
        <PageHeader title="Administration" description="Manage this workspace, its team and its community features." />
        <ControlState control={control}>{control.data && <AdminDesk key={control.scope} control={control} tab={tab} setTab={setTab} membersPage={setMembersPage} auditPage={setAuditPage} />}</ControlState>
    </div>;
}
