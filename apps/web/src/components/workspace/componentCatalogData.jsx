// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/componentCatalogData.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/components/ui
// EnumType:    ConfigDoc
// EnumEdges:   VALIDATES apps/web/src/components/ui; CONSUMES apps/web/src/components/ui
// Intent:      One registry entry per UI primitive module so a contributor can see what already exists.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { ChevronDown, Mail, Search, Star, Terminal, User } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button as UiButton } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { Calendar } from '@/components/ui/calendar';
import { Card as UiCard, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, navigationMenuTriggerStyle } from '@/components/ui/navigation-menu';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Catalogue categories, in the order they are presented.
 *
 * The split is by what a contributor is trying to do, not by which npm package
 * a primitive wraps — six buckets is about as many as anyone will scan.
 */
export const CATALOG_CATEGORIES = [
    {
        id: 'inputs',
        label: 'Inputs',
        description: 'Anything that collects a value or triggers an action.',
    },
    {
        id: 'feedback',
        label: 'Feedback',
        description: 'Loading, progress, emptiness, and things that went wrong.',
    },
    {
        id: 'navigation',
        label: 'Navigation',
        description: 'Moving between views, and menus that offer a choice of action.',
    },
    {
        id: 'layout',
        label: 'Layout',
        description: 'Containers, dividers, and structures that arrange other components.',
    },
    {
        id: 'data',
        label: 'Data display',
        description: 'Presenting values that already exist. None of these invent data.',
    },
    {
        id: 'overlay',
        label: 'Overlay',
        description: 'Surfaces that sit above the page and take focus.',
    },
];

/**
 * One entry per module in `apps/web/src/components/ui/`.
 *
 * `preview` is a function so previews mount only for the category currently on
 * screen. An entry with `previewNote` instead of `preview` cannot be rendered
 * standalone — it needs a provider or an app-level mount — and says which,
 * rather than showing a hollow box that implies the component is broken.
 */
export const CATALOG_ENTRIES = [
    /* ---- inputs ---------------------------------------------------------- */
    {
        id: 'button',
        name: 'Button',
        module: '@/components/ui/button',
        category: 'inputs',
        exports: ['Button', 'buttonVariants'],
        summary:
            'The shadcn button. Workspace pages use the editorial Button from @/components/site/ui instead — check which one the surrounding file imports before adding either.',
        props: [
            { name: 'variant', type: "'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'" },
            { name: 'size', type: "'default' | 'sm' | 'lg' | 'icon'" },
            { name: 'asChild', type: 'boolean' },
        ],
        preview: () => (
            <div className="flex flex-wrap items-center gap-2">
                <UiButton size="sm">Default</UiButton>
                <UiButton size="sm" variant="secondary">Secondary</UiButton>
                <UiButton size="sm" variant="outline">Outline</UiButton>
                <UiButton size="sm" variant="ghost">Ghost</UiButton>
                <UiButton size="sm" variant="destructive">Destructive</UiButton>
            </div>
        ),
    },
    {
        id: 'button-group',
        name: 'ButtonGroup',
        module: '@/components/ui/button-group',
        category: 'inputs',
        exports: ['ButtonGroup', 'ButtonGroupSeparator', 'ButtonGroupText', 'buttonGroupVariants'],
        summary: 'Joins related buttons into one control so they read as a single choice.',
        props: [{ name: 'orientation', type: "'horizontal' | 'vertical'" }],
        preview: () => (
            <ButtonGroup>
                <UiButton size="sm" variant="outline">Day</UiButton>
                <ButtonGroupSeparator />
                <UiButton size="sm" variant="outline">Week</UiButton>
            </ButtonGroup>
        ),
    },
    {
        id: 'input',
        name: 'Input',
        module: '@/components/ui/input',
        category: 'inputs',
        exports: ['Input'],
        summary: 'Single-line text field. The most used primitive in this repository.',
        props: [
            { name: 'type', type: 'string' },
            { name: 'className', type: 'string' },
        ],
        preview: () => <Input placeholder="reminder-texts" />,
    },
    {
        id: 'textarea',
        name: 'Textarea',
        module: '@/components/ui/textarea',
        category: 'inputs',
        exports: ['Textarea'],
        summary: 'Multi-line text field. Pair with rows rather than a fixed height class.',
        props: [{ name: 'rows', type: 'number' }],
        preview: () => <Textarea rows={2} placeholder="What is in scope, and how success is verified" />,
    },
    {
        id: 'label',
        name: 'Label',
        module: '@/components/ui/label',
        category: 'inputs',
        exports: ['Label'],
        summary: 'Accessible label. Always set htmlFor to the input id — every form in this repo does.',
        props: [{ name: 'htmlFor', type: 'string' }],
        preview: () => (
            <div className="grid gap-2">
                <Label htmlFor="catalog-label-demo">Mission goal</Label>
                <Input id="catalog-label-demo" placeholder="Reduce no-shows" />
            </div>
        ),
    },
    {
        id: 'checkbox',
        name: 'Checkbox',
        module: '@/components/ui/checkbox',
        category: 'inputs',
        exports: ['Checkbox'],
        summary: 'Boolean control for independent choices.',
        props: [
            { name: 'checked', type: 'boolean' },
            { name: 'onCheckedChange', type: '(checked: boolean) => void' },
        ],
        preview: () => (
            <div className="flex items-center gap-2">
                <Checkbox id="catalog-checkbox-demo" defaultChecked />
                <Label htmlFor="catalog-checkbox-demo">Acceptance criteria met</Label>
            </div>
        ),
    },
    {
        id: 'radio-group',
        name: 'RadioGroup',
        module: '@/components/ui/radio-group',
        category: 'inputs',
        exports: ['RadioGroup', 'RadioGroupItem'],
        summary: 'Exactly one choice from a small, visible set.',
        props: [
            { name: 'defaultValue', type: 'string' },
            { name: 'onValueChange', type: '(value: string) => void' },
        ],
        preview: () => (
            <RadioGroup defaultValue="human" className="flex gap-4">
                <div className="flex items-center gap-2">
                    <RadioGroupItem value="human" id="catalog-radio-human" />
                    <Label htmlFor="catalog-radio-human">Human</Label>
                </div>
                <div className="flex items-center gap-2">
                    <RadioGroupItem value="agent" id="catalog-radio-agent" />
                    <Label htmlFor="catalog-radio-agent">Agent</Label>
                </div>
            </RadioGroup>
        ),
    },
    {
        id: 'switch',
        name: 'Switch',
        module: '@/components/ui/switch',
        category: 'inputs',
        exports: ['Switch'],
        summary: 'A setting that takes effect immediately. Use a Checkbox when the value is submitted with a form.',
        props: [
            { name: 'checked', type: 'boolean' },
            { name: 'onCheckedChange', type: '(checked: boolean) => void' },
        ],
        preview: () => (
            <div className="flex items-center gap-2">
                <Switch id="catalog-switch-demo" defaultChecked />
                <Label htmlFor="catalog-switch-demo">Realtime seat feed</Label>
            </div>
        ),
    },
    {
        id: 'slider',
        name: 'Slider',
        module: '@/components/ui/slider',
        category: 'inputs',
        exports: ['Slider'],
        summary: 'Bounded numeric input where the precise value matters less than the range.',
        props: [
            { name: 'defaultValue', type: 'number[]' },
            { name: 'min / max / step', type: 'number' },
        ],
        preview: () => <Slider defaultValue={[60]} max={100} step={5} />,
    },
    {
        id: 'select',
        name: 'Select',
        module: '@/components/ui/select',
        category: 'inputs',
        exports: ['Select', 'SelectGroup', 'SelectValue', 'SelectTrigger', 'SelectContent', 'SelectLabel', 'SelectItem', 'SelectSeparator', 'SelectScrollUpButton', 'SelectScrollDownButton'],
        summary: 'Styled dropdown. Some existing pages use a native select element instead; prefer this one in new code.',
        props: [
            { name: 'defaultValue / value', type: 'string' },
            { name: 'onValueChange', type: '(value: string) => void' },
            { name: 'SelectContent position', type: "'popper' | 'item-aligned'" },
        ],
        preview: () => (
            <Select defaultValue="a1">
                <SelectTrigger className="w-48">
                    <SelectValue placeholder="Risk tier" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="a0">A0 — docs only</SelectItem>
                    <SelectItem value="a1">A1 — app code</SelectItem>
                    <SelectItem value="a2">A2 — schema or CI</SelectItem>
                </SelectContent>
            </Select>
        ),
    },
    {
        id: 'input-otp',
        name: 'InputOTP',
        module: '@/components/ui/input-otp',
        category: 'inputs',
        exports: ['InputOTP', 'InputOTPGroup', 'InputOTPSlot', 'InputOTPSeparator'],
        summary: 'Fixed-length code entry, one character per slot.',
        props: [
            { name: 'maxLength', type: 'number' },
            { name: 'InputOTPSlot index', type: 'number' },
        ],
        preview: () => (
            <InputOTP maxLength={4}>
                <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                </InputOTPGroup>
            </InputOTP>
        ),
    },
    {
        id: 'form',
        name: 'Form',
        module: '@/components/ui/form',
        category: 'inputs',
        exports: ['Form', 'FormItem', 'FormLabel', 'FormControl', 'FormDescription', 'FormMessage', 'FormField', 'useFormField'],
        summary:
            'react-hook-form bindings. No page in this repository uses it yet — existing forms hold state in useState and validate on submit. Match the page you are editing rather than introducing a second form strategy.',
        props: [
            { name: 'Form', type: 'FormProvider from react-hook-form' },
            { name: 'FormField name / control', type: 'react-hook-form field API' },
        ],
        previewNote:
            'Needs a useForm() instance from react-hook-form; there is nothing meaningful to render without one.',
    },
    {
        id: 'field',
        name: 'Field',
        module: '@/components/ui/field',
        category: 'inputs',
        exports: ['Field', 'FieldLabel', 'FieldDescription', 'FieldError', 'FieldGroup', 'FieldLegend', 'FieldSet', 'FieldSeparator', 'FieldContent', 'FieldTitle'],
        summary: 'Label, control, description and error as one composed block.',
        props: [{ name: 'orientation', type: "'vertical' | 'horizontal' | 'responsive'" }],
        preview: () => (
            <Field>
                <FieldLabel htmlFor="catalog-field-demo">Branch</FieldLabel>
                <Input id="catalog-field-demo" placeholder="bits/SRS-...-slug" />
                <FieldDescription>One branch, one SRS code.</FieldDescription>
            </Field>
        ),
    },
    {
        id: 'input-group',
        name: 'InputGroup',
        module: '@/components/ui/input-group',
        category: 'inputs',
        exports: ['InputGroup', 'InputGroupAddon', 'InputGroupButton', 'InputGroupText', 'InputGroupInput', 'InputGroupTextarea'],
        summary: 'An input with an icon, prefix, or button attached inside its border.',
        props: [
            { name: 'InputGroupAddon align', type: "'inline-start' | 'inline-end' | 'block-start' | 'block-end'" },
            { name: 'InputGroupButton variant / size', type: 'button variants' },
        ],
        preview: () => (
            <InputGroup>
                <InputGroupAddon>
                    <Search className="h-4 w-4" />
                </InputGroupAddon>
                <InputGroupInput placeholder="Search components" />
            </InputGroup>
        ),
    },
    {
        id: 'toggle',
        name: 'Toggle',
        module: '@/components/ui/toggle',
        category: 'inputs',
        exports: ['Toggle', 'toggleVariants'],
        summary: 'A two-state button. Use for a mode, not for a form value.',
        props: [
            { name: 'variant', type: "'default' | 'outline'" },
            { name: 'pressed / onPressedChange', type: 'boolean / (pressed) => void' },
        ],
        preview: () => (
            <Toggle variant="outline" aria-label="Toggle starred">
                <Star className="h-4 w-4" />
            </Toggle>
        ),
    },
    {
        id: 'toggle-group',
        name: 'ToggleGroup',
        module: '@/components/ui/toggle-group',
        category: 'inputs',
        exports: ['ToggleGroup', 'ToggleGroupItem'],
        summary: 'A row of toggles behaving as one single- or multi-select control.',
        props: [
            { name: 'type', type: "'single' | 'multiple'" },
            { name: 'variant / size', type: 'toggle variants' },
        ],
        preview: () => (
            <ToggleGroup type="single" defaultValue="agent" variant="outline">
                <ToggleGroupItem value="human">Human</ToggleGroupItem>
                <ToggleGroupItem value="agent">Agent</ToggleGroupItem>
                <ToggleGroupItem value="mixed">Mixed</ToggleGroupItem>
            </ToggleGroup>
        ),
    },
    {
        id: 'calendar',
        name: 'Calendar',
        module: '@/components/ui/calendar',
        category: 'inputs',
        exports: ['Calendar', 'CalendarDayButton'],
        summary: 'Month grid date picker built on react-day-picker.',
        props: [
            { name: 'mode', type: "'single' | 'multiple' | 'range'" },
            { name: 'selected / onSelect', type: 'Date / (date) => void' },
        ],
        preview: () => <Calendar mode="single" className="rounded-none border border-border" />,
    },

    /* ---- feedback -------------------------------------------------------- */
    {
        id: 'alert',
        name: 'Alert',
        module: '@/components/ui/alert',
        category: 'feedback',
        exports: ['Alert', 'AlertTitle', 'AlertDescription'],
        summary: 'Inline message attached to the region it concerns.',
        props: [{ name: 'variant', type: "'default' | 'destructive'" }],
        preview: () => (
            <Alert>
                <Terminal className="h-4 w-4" />
                <AlertTitle>Boundary scan passed</AlertTitle>
                <AlertDescription>No forbidden paths and no secret-like literals.</AlertDescription>
            </Alert>
        ),
    },
    {
        id: 'skeleton',
        name: 'Skeleton',
        module: '@/components/ui/skeleton',
        category: 'feedback',
        exports: ['Skeleton'],
        summary: 'Shape placeholder while content loads. Workspace pages mostly use a spinner card instead.',
        props: [{ name: 'className', type: 'string — set the width and height here' }],
        preview: () => (
            <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
            </div>
        ),
    },
    {
        id: 'spinner',
        name: 'Spinner',
        module: '@/components/ui/spinner',
        category: 'feedback',
        exports: ['Spinner'],
        summary: 'Indeterminate loading indicator, already labelled for screen readers.',
        props: [{ name: 'className', type: 'string' }],
        preview: () => <Spinner />,
    },
    {
        id: 'progress',
        name: 'Progress',
        module: '@/components/ui/progress',
        category: 'feedback',
        exports: ['Progress'],
        summary: 'Determinate progress. Only use it when the total is genuinely known.',
        props: [{ name: 'value', type: 'number (0-100)' }],
        preview: () => <Progress value={40} />,
    },
    {
        id: 'empty',
        name: 'Empty',
        module: '@/components/ui/empty',
        category: 'feedback',
        exports: ['Empty', 'EmptyHeader', 'EmptyTitle', 'EmptyDescription', 'EmptyContent', 'EmptyMedia'],
        summary:
            'Empty-state block. Workspace pages use @/components/workspace/EmptyState instead, which carries the house dashed border and action slot.',
        props: [{ name: 'EmptyMedia variant', type: "'default' | 'icon'" }],
        preview: () => (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <Search className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyTitle>Nothing here yet</EmptyTitle>
                    <EmptyDescription>Empty states are intentional for a new account.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        ),
    },
    {
        id: 'toast',
        name: 'Toast',
        module: '@/components/ui/toast',
        category: 'feedback',
        exports: ['ToastProvider', 'ToastViewport', 'Toast', 'ToastTitle', 'ToastDescription', 'ToastClose', 'ToastAction'],
        summary: 'Radix toast primitives. Driven by useToast() from @/hooks/use-toast.',
        props: [
            { name: 'open / onOpenChange', type: 'boolean / (open) => void' },
            { name: 'variant', type: "'default' | 'destructive'" },
        ],
        previewNote:
            'Requires a ToastProvider and a ToastViewport mounted above it; a standalone Toast has nowhere to render.',
    },
    {
        id: 'toaster',
        name: 'Toaster',
        module: '@/components/ui/toaster',
        category: 'feedback',
        exports: ['Toaster'],
        summary: 'The provider plus viewport wired to useToast(). Mount once near the app root.',
        props: [{ name: '—', type: 'takes no props; reads the toast queue from the hook' }],
        previewNote:
            'App-level mount. It is not currently mounted in App.jsx, so calling useToast() today displays nothing.',
    },
    {
        id: 'sonner',
        name: 'Toaster (sonner)',
        module: '@/components/ui/sonner',
        category: 'feedback',
        exports: ['Toaster'],
        summary:
            'A second, independent toast system built on sonner. Two toast stacks in one codebase is a decision, not a default — pick one before adding notifications.',
        props: [{ name: '...props', type: 'forwarded to the sonner Toaster' }],
        previewNote: 'App-level mount, and it exports the same name as toaster.jsx — import it aliased.',
    },

    /* ---- navigation ------------------------------------------------------ */
    {
        id: 'tabs',
        name: 'Tabs',
        module: '@/components/ui/tabs',
        category: 'navigation',
        exports: ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'],
        summary: 'Sibling views in one region. ErpPage is the reference usage.',
        props: [
            { name: 'defaultValue / value', type: 'string' },
            { name: 'onValueChange', type: '(value: string) => void' },
        ],
        preview: () => (
            <Tabs defaultValue="one">
                <TabsList>
                    <TabsTrigger value="one">Objectives</TabsTrigger>
                    <TabsTrigger value="two">Tasks</TabsTrigger>
                </TabsList>
                <TabsContent value="one" className="mt-3 text-sm text-muted-foreground">
                    First panel.
                </TabsContent>
                <TabsContent value="two" className="mt-3 text-sm text-muted-foreground">
                    Second panel.
                </TabsContent>
            </Tabs>
        ),
    },
    {
        id: 'breadcrumb',
        name: 'Breadcrumb',
        module: '@/components/ui/breadcrumb',
        category: 'navigation',
        exports: ['Breadcrumb', 'BreadcrumbList', 'BreadcrumbItem', 'BreadcrumbLink', 'BreadcrumbPage', 'BreadcrumbSeparator', 'BreadcrumbEllipsis'],
        summary: 'Ancestor trail. Use BreadcrumbLink asChild with a router Link.',
        props: [{ name: 'BreadcrumbLink asChild', type: 'boolean' }],
        preview: () => (
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="#">Workspace</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>Field Manual</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
        ),
    },
    {
        id: 'pagination',
        name: 'Pagination',
        module: '@/components/ui/pagination',
        category: 'navigation',
        exports: ['Pagination', 'PaginationContent', 'PaginationLink', 'PaginationItem', 'PaginationPrevious', 'PaginationNext', 'PaginationEllipsis'],
        summary: 'Page-by-page navigation over a long list.',
        props: [{ name: 'PaginationLink isActive', type: 'boolean' }],
        preview: () => (
            <Pagination>
                <PaginationContent>
                    <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
                    <PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem>
                    <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
                    <PaginationItem><PaginationNext href="#" /></PaginationItem>
                </PaginationContent>
            </Pagination>
        ),
    },
    {
        id: 'navigation-menu',
        name: 'NavigationMenu',
        module: '@/components/ui/navigation-menu',
        category: 'navigation',
        exports: ['NavigationMenu', 'NavigationMenuList', 'NavigationMenuItem', 'NavigationMenuContent', 'NavigationMenuTrigger', 'NavigationMenuLink', 'NavigationMenuIndicator', 'NavigationMenuViewport', 'navigationMenuTriggerStyle'],
        summary: 'Top-level site navigation with optional flyout panels.',
        props: [{ name: 'navigationMenuTriggerStyle()', type: 'className helper for plain links' }],
        preview: () => (
            <NavigationMenu>
                <NavigationMenuList>
                    <NavigationMenuItem>
                        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
                            Front Page
                        </NavigationMenuLink>
                    </NavigationMenuItem>
                    <NavigationMenuItem>
                        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
                            Evidence
                        </NavigationMenuLink>
                    </NavigationMenuItem>
                </NavigationMenuList>
            </NavigationMenu>
        ),
    },
    {
        id: 'menubar',
        name: 'Menubar',
        module: '@/components/ui/menubar',
        category: 'navigation',
        exports: ['Menubar', 'MenubarMenu', 'MenubarTrigger', 'MenubarContent', 'MenubarItem', 'MenubarSeparator', 'MenubarLabel', 'MenubarCheckboxItem', 'MenubarRadioGroup', 'MenubarRadioItem', 'MenubarSub', 'MenubarSubTrigger', 'MenubarSubContent', 'MenubarGroup', 'MenubarPortal', 'MenubarShortcut'],
        summary: 'Desktop-application menu bar.',
        props: [{ name: 'MenubarMenu', type: 'one per top-level menu' }],
        preview: () => (
            <Menubar>
                <MenubarMenu>
                    <MenubarTrigger>Mission</MenubarTrigger>
                    <MenubarContent>
                        <MenubarItem>Propose</MenubarItem>
                        <MenubarItem>Approve</MenubarItem>
                    </MenubarContent>
                </MenubarMenu>
            </Menubar>
        ),
    },
    {
        id: 'dropdown-menu',
        name: 'DropdownMenu',
        module: '@/components/ui/dropdown-menu',
        category: 'navigation',
        exports: ['DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuCheckboxItem', 'DropdownMenuRadioItem', 'DropdownMenuLabel', 'DropdownMenuSeparator', 'DropdownMenuShortcut', 'DropdownMenuGroup', 'DropdownMenuSub', 'DropdownMenuSubTrigger', 'DropdownMenuSubContent', 'DropdownMenuRadioGroup', 'DropdownMenuPortal'],
        summary: 'Actions revealed by an explicit trigger.',
        props: [
            { name: 'DropdownMenuContent sideOffset', type: 'number (default 4)' },
            { name: 'DropdownMenuItem inset', type: 'boolean' },
        ],
        preview: () => (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <UiButton size="sm" variant="outline">
                        Actions <ChevronDown className="h-4 w-4" />
                    </UiButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Mission</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Advance stage</DropdownMenuItem>
                    <DropdownMenuItem>Add evidence</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        ),
    },
    {
        id: 'context-menu',
        name: 'ContextMenu',
        module: '@/components/ui/context-menu',
        category: 'navigation',
        exports: ['ContextMenu', 'ContextMenuTrigger', 'ContextMenuContent', 'ContextMenuItem', 'ContextMenuCheckboxItem', 'ContextMenuRadioItem', 'ContextMenuLabel', 'ContextMenuSeparator', 'ContextMenuShortcut', 'ContextMenuGroup', 'ContextMenuSub', 'ContextMenuSubTrigger', 'ContextMenuSubContent', 'ContextMenuRadioGroup', 'ContextMenuPortal'],
        summary: 'Right-click menu. Keyboard users need the same actions somewhere else too.',
        props: [{ name: 'ContextMenuTrigger', type: 'wraps the right-clickable region' }],
        preview: () => (
            <ContextMenu>
                <ContextMenuTrigger className="flex h-16 items-center justify-center border border-dashed border-border text-xs text-muted-foreground">
                    Right-click this area
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem>Copy record id</ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        ),
    },
    {
        id: 'command',
        name: 'Command',
        module: '@/components/ui/command',
        category: 'navigation',
        exports: ['Command', 'CommandDialog', 'CommandInput', 'CommandList', 'CommandEmpty', 'CommandGroup', 'CommandItem', 'CommandShortcut', 'CommandSeparator'],
        summary: 'Filterable command palette built on cmdk.',
        props: [{ name: 'CommandDialog open / onOpenChange', type: 'boolean / (open) => void' }],
        preview: () => (
            <Command className="border border-border">
                <CommandInput placeholder="Type a command" />
                <CommandList>
                    <CommandEmpty>No results.</CommandEmpty>
                    <CommandGroup heading="Workspace">
                        <CommandItem>Start a mission</CommandItem>
                        <CommandItem>Open evidence ledger</CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>
        ),
    },
    {
        id: 'sidebar',
        name: 'Sidebar',
        module: '@/components/ui/sidebar',
        category: 'navigation',
        exports: ['SidebarProvider', 'Sidebar', 'SidebarHeader', 'SidebarContent', 'SidebarFooter', 'SidebarGroup', 'SidebarGroupLabel', 'SidebarGroupContent', 'SidebarGroupAction', 'SidebarMenu', 'SidebarMenuItem', 'SidebarMenuButton', 'SidebarMenuAction', 'SidebarMenuBadge', 'SidebarMenuSkeleton', 'SidebarMenuSub', 'SidebarMenuSubItem', 'SidebarMenuSubButton', 'SidebarInput', 'SidebarInset', 'SidebarRail', 'SidebarSeparator', 'SidebarTrigger', 'useSidebar'],
        summary:
            'The largest module in the directory and entirely unused: WorkspaceLayout.jsx hand-rolls its own sidebar with a Sheet for mobile. Replacing that is a real refactor, not a first issue.',
        props: [
            { name: 'SidebarProvider defaultOpen', type: 'boolean' },
            { name: 'Sidebar side / variant / collapsible', type: 'layout variants' },
        ],
        previewNote:
            'Needs SidebarProvider and a full-height layout slot; it cannot render meaningfully inside a card.',
    },

    /* ---- layout ---------------------------------------------------------- */
    {
        id: 'card',
        name: 'Card',
        module: '@/components/ui/card',
        category: 'layout',
        exports: ['Card', 'CardHeader', 'CardFooter', 'CardTitle', 'CardDescription', 'CardContent'],
        summary:
            'Rounded shadcn card. Workspace pages import the square editorial Card from @/components/site/ui instead — mixing the two in one view is visible.',
        props: [{ name: 'className', type: 'string' }],
        preview: () => (
            <UiCard>
                <CardHeader>
                    <CardTitle>Verified outcome</CardTitle>
                    <CardDescription>Checked against evidence.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">Card body.</CardContent>
            </UiCard>
        ),
    },
    {
        id: 'separator',
        name: 'Separator',
        module: '@/components/ui/separator',
        category: 'layout',
        exports: ['Separator'],
        summary: 'Thin divider. The editorial Rule in site/ui is the broadsheet equivalent.',
        props: [
            { name: 'orientation', type: "'horizontal' | 'vertical'" },
            { name: 'decorative', type: 'boolean (default true)' },
        ],
        preview: () => (
            <div className="space-y-2 text-sm text-muted-foreground">
                <p>Above</p>
                <Separator />
                <p>Below</p>
            </div>
        ),
    },
    {
        id: 'scroll-area',
        name: 'ScrollArea',
        module: '@/components/ui/scroll-area',
        category: 'layout',
        exports: ['ScrollArea', 'ScrollBar'],
        summary: 'Bounded scrolling region with a styled scrollbar.',
        props: [{ name: 'ScrollBar orientation', type: "'vertical' | 'horizontal'" }],
        preview: () => (
            <ScrollArea className="h-20 border border-border p-3">
                <div className="space-y-1 text-sm text-muted-foreground">
                    {['Idea', 'Issue', 'Branch', 'Code', 'Test', 'Pull request'].map((s) => (
                        <p key={s}>{s}</p>
                    ))}
                </div>
            </ScrollArea>
        ),
    },
    {
        id: 'resizable',
        name: 'Resizable',
        module: '@/components/ui/resizable',
        category: 'layout',
        exports: ['ResizablePanelGroup', 'ResizablePanel', 'ResizableHandle'],
        summary: 'User-adjustable split panes.',
        props: [
            { name: 'ResizablePanelGroup direction', type: "'horizontal' | 'vertical'" },
            { name: 'ResizableHandle withHandle', type: 'boolean' },
        ],
        preview: () => (
            <ResizablePanelGroup direction="horizontal" className="h-20 border border-border">
                <ResizablePanel defaultSize={50}>
                    <div className="p-3 text-xs text-muted-foreground">Left</div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50}>
                    <div className="p-3 text-xs text-muted-foreground">Right</div>
                </ResizablePanel>
            </ResizablePanelGroup>
        ),
    },
    {
        id: 'aspect-ratio',
        name: 'AspectRatio',
        module: '@/components/ui/aspect-ratio',
        category: 'layout',
        exports: ['AspectRatio'],
        summary: 'Holds a fixed ratio so media does not shift layout while loading.',
        props: [{ name: 'ratio', type: 'number, for example 16 / 9' }],
        preview: () => (
            <AspectRatio ratio={16 / 9} className="border border-border bg-secondary/40">
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    16 / 9
                </div>
            </AspectRatio>
        ),
    },
    {
        id: 'accordion',
        name: 'Accordion',
        module: '@/components/ui/accordion',
        category: 'layout',
        exports: ['Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent'],
        summary: 'Stacked disclosure sections.',
        props: [
            { name: 'type', type: "'single' | 'multiple'" },
            { name: 'collapsible', type: 'boolean' },
        ],
        preview: () => (
            <Accordion type="single" collapsible>
                <AccordionItem value="one">
                    <AccordionTrigger>What is a mission</AccordionTrigger>
                    <AccordionContent>A bounded, approved task with a clear goal and scope.</AccordionContent>
                </AccordionItem>
            </Accordion>
        ),
    },
    {
        id: 'collapsible',
        name: 'Collapsible',
        module: '@/components/ui/collapsible',
        category: 'layout',
        exports: ['Collapsible', 'CollapsibleTrigger', 'CollapsibleContent'],
        summary: 'A single show-and-hide region. Accordion is several of these.',
        props: [{ name: 'open / onOpenChange', type: 'boolean / (open) => void' }],
        preview: () => (
            <Collapsible>
                <CollapsibleTrigger className="text-sm underline">Show detail</CollapsibleTrigger>
                <CollapsibleContent className="mt-2 text-sm text-muted-foreground">
                    Hidden until asked for.
                </CollapsibleContent>
            </Collapsible>
        ),
    },
    {
        id: 'item',
        name: 'Item',
        module: '@/components/ui/item',
        category: 'layout',
        exports: ['Item', 'ItemMedia', 'ItemContent', 'ItemActions', 'ItemGroup', 'ItemSeparator', 'ItemTitle', 'ItemDescription', 'ItemHeader', 'ItemFooter'],
        summary: 'A media-plus-text row, for lists where every entry has the same shape.',
        props: [
            { name: 'variant', type: "'default' | 'outline' | 'muted'" },
            { name: 'size', type: "'default' | 'sm'" },
        ],
        preview: () => (
            <Item variant="outline">
                <ItemMedia>
                    <User className="h-4 w-4" />
                </ItemMedia>
                <ItemContent>
                    <ItemTitle>BITS-CODEGEN</ItemTitle>
                    <ItemDescription>Agent seat</ItemDescription>
                </ItemContent>
            </Item>
        ),
    },
    {
        id: 'carousel',
        name: 'Carousel',
        module: '@/components/ui/carousel',
        category: 'layout',
        exports: ['Carousel', 'CarouselContent', 'CarouselItem', 'CarouselPrevious', 'CarouselNext'],
        summary: 'Horizontal slide region built on embla.',
        props: [
            { name: 'orientation', type: "'horizontal' | 'vertical'" },
            { name: 'opts', type: 'embla options' },
        ],
        preview: () => (
            <Carousel className="mx-8">
                <CarouselContent>
                    {['One', 'Two', 'Three'].map((s) => (
                        <CarouselItem key={s} className="basis-1/2">
                            <div className="border border-border p-4 text-center text-sm text-muted-foreground">
                                {s}
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
            </Carousel>
        ),
    },

    /* ---- data display ---------------------------------------------------- */
    {
        id: 'table',
        name: 'Table',
        module: '@/components/ui/table',
        category: 'data',
        exports: ['Table', 'TableHeader', 'TableBody', 'TableFooter', 'TableHead', 'TableRow', 'TableCell', 'TableCaption'],
        summary: 'Semantic table wrappers. No sorting or paging — compose those yourself.',
        props: [{ name: 'className', type: 'string on every part' }],
        preview: () => (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Step</TableHead>
                        <TableHead>Actor</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow>
                        <TableCell>Governance check</TableCell>
                        <TableCell>CI</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell>Review</TableCell>
                        <TableCell>Human</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        ),
    },
    {
        id: 'chart',
        name: 'Chart',
        module: '@/components/ui/chart',
        category: 'data',
        exports: ['ChartContainer', 'ChartTooltip', 'ChartTooltipContent', 'ChartLegend', 'ChartLegendContent', 'ChartStyle'],
        summary: 'recharts wrapper that maps a config object to CSS variables for series colours.',
        props: [
            { name: 'ChartContainer config', type: 'Record<string, { label, color | theme }>' },
            { name: 'children', type: 'a single recharts chart element' },
        ],
        previewNote:
            'Needs a recharts chart plus real series data. Rendering it with invented numbers is exactly what this product refuses to do, so the catalogue links to the source instead.',
    },
    {
        id: 'badge',
        name: 'Badge',
        module: '@/components/ui/badge',
        category: 'data',
        exports: ['Badge', 'badgeVariants'],
        summary:
            'Small status label. Workspace pages use StatusBadge from workspaceHelpers or StatePill from site/ui, both of which carry the house tone vocabulary.',
        props: [{ name: 'variant', type: "'default' | 'secondary' | 'destructive' | 'outline'" }],
        preview: () => (
            <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
            </div>
        ),
    },
    {
        id: 'avatar',
        name: 'Avatar',
        module: '@/components/ui/avatar',
        category: 'data',
        exports: ['Avatar', 'AvatarImage', 'AvatarFallback'],
        summary: 'Round identity image with a text fallback for when the image fails.',
        props: [
            { name: 'AvatarImage src / alt', type: 'string' },
            { name: 'AvatarFallback', type: 'shown while loading and on error' },
        ],
        preview: () => (
            <Avatar>
                <AvatarFallback>BC</AvatarFallback>
            </Avatar>
        ),
    },
    {
        id: 'kbd',
        name: 'Kbd',
        module: '@/components/ui/kbd',
        category: 'data',
        exports: ['Kbd', 'KbdGroup'],
        summary: 'Renders a keyboard key or a chord.',
        props: [{ name: 'className', type: 'string' }],
        preview: () => (
            <KbdGroup>
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
            </KbdGroup>
        ),
    },

    /* ---- overlay --------------------------------------------------------- */
    {
        id: 'dialog',
        name: 'Dialog',
        module: '@/components/ui/dialog',
        category: 'overlay',
        exports: ['Dialog', 'DialogTrigger', 'DialogContent', 'DialogHeader', 'DialogFooter', 'DialogTitle', 'DialogDescription', 'DialogClose', 'DialogOverlay', 'DialogPortal'],
        summary: 'Modal used by every create form in the workspace. MissionsPage is the reference usage.',
        props: [
            { name: 'open / onOpenChange', type: 'boolean / (open) => void' },
            { name: 'DialogTrigger asChild', type: 'boolean' },
        ],
        preview: () => (
            <Dialog>
                <DialogTrigger asChild>
                    <UiButton size="sm" variant="outline">Open dialog</UiButton>
                </DialogTrigger>
                <DialogContent className="border-border bg-card">
                    <DialogHeader>
                        <DialogTitle>Start a mission</DialogTitle>
                        <DialogDescription>Nothing runs until you approve it.</DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        ),
    },
    {
        id: 'alert-dialog',
        name: 'AlertDialog',
        module: '@/components/ui/alert-dialog',
        category: 'overlay',
        exports: ['AlertDialog', 'AlertDialogTrigger', 'AlertDialogContent', 'AlertDialogHeader', 'AlertDialogFooter', 'AlertDialogTitle', 'AlertDialogDescription', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogOverlay', 'AlertDialogPortal'],
        summary: 'Modal that requires a decision. It cannot be dismissed by clicking away.',
        props: [{ name: 'AlertDialogAction / AlertDialogCancel', type: 'the two required outcomes' }],
        preview: () => (
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <UiButton size="sm" variant="outline">Confirm something</UiButton>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Mark this mission failed?</AlertDialogTitle>
                        <AlertDialogDescription>This is recorded in the evidence ledger.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        ),
    },
    {
        id: 'sheet',
        name: 'Sheet',
        module: '@/components/ui/sheet',
        category: 'overlay',
        exports: ['Sheet', 'SheetTrigger', 'SheetContent', 'SheetHeader', 'SheetFooter', 'SheetTitle', 'SheetDescription', 'SheetClose', 'SheetOverlay', 'SheetPortal'],
        summary: 'Edge-anchored panel. WorkspaceLayout uses it for the mobile navigation drawer.',
        props: [{ name: 'SheetContent side', type: "'top' | 'right' | 'bottom' | 'left'" }],
        preview: () => (
            <Sheet>
                <SheetTrigger asChild>
                    <UiButton size="sm" variant="outline">Open sheet</UiButton>
                </SheetTrigger>
                <SheetContent side="right">
                    <SheetHeader>
                        <SheetTitle>Navigation</SheetTitle>
                        <SheetDescription>Anchored to an edge of the viewport.</SheetDescription>
                    </SheetHeader>
                </SheetContent>
            </Sheet>
        ),
    },
    {
        id: 'drawer',
        name: 'Drawer',
        module: '@/components/ui/drawer',
        category: 'overlay',
        exports: ['Drawer', 'DrawerTrigger', 'DrawerContent', 'DrawerHeader', 'DrawerFooter', 'DrawerTitle', 'DrawerDescription', 'DrawerClose', 'DrawerOverlay', 'DrawerPortal'],
        summary: 'Draggable bottom sheet built on vaul. Overlaps with Sheet — pick one per surface.',
        props: [{ name: 'shouldScaleBackground', type: 'boolean' }],
        preview: () => (
            <Drawer>
                <DrawerTrigger asChild>
                    <UiButton size="sm" variant="outline">Open drawer</UiButton>
                </DrawerTrigger>
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle>Drag to dismiss</DrawerTitle>
                        <DrawerDescription>Bottom-anchored and gesture driven.</DrawerDescription>
                    </DrawerHeader>
                </DrawerContent>
            </Drawer>
        ),
    },
    {
        id: 'popover',
        name: 'Popover',
        module: '@/components/ui/popover',
        category: 'overlay',
        exports: ['Popover', 'PopoverTrigger', 'PopoverContent', 'PopoverAnchor'],
        summary: 'Anchored panel that can hold interactive content, unlike a tooltip.',
        props: [
            { name: 'PopoverContent align', type: "'start' | 'center' | 'end'" },
            { name: 'PopoverContent sideOffset', type: 'number (default 4)' },
        ],
        preview: () => (
            <Popover>
                <PopoverTrigger asChild>
                    <UiButton size="sm" variant="outline">Open popover</UiButton>
                </PopoverTrigger>
                <PopoverContent className="text-sm text-muted-foreground">
                    Interactive content lives here.
                </PopoverContent>
            </Popover>
        ),
    },
    {
        id: 'hover-card',
        name: 'HoverCard',
        module: '@/components/ui/hover-card',
        category: 'overlay',
        exports: ['HoverCard', 'HoverCardTrigger', 'HoverCardContent'],
        summary: 'Preview on hover. Pointer only, so never put required information here.',
        props: [{ name: 'openDelay / closeDelay', type: 'number' }],
        preview: () => (
            <HoverCard>
                <HoverCardTrigger className="text-sm underline">Hover for detail</HoverCardTrigger>
                <HoverCardContent className="text-sm text-muted-foreground">
                    Supplementary, never essential.
                </HoverCardContent>
            </HoverCard>
        ),
    },
    {
        id: 'tooltip',
        name: 'Tooltip',
        module: '@/components/ui/tooltip',
        category: 'overlay',
        exports: ['Tooltip', 'TooltipTrigger', 'TooltipContent', 'TooltipProvider'],
        summary: 'Short label for an icon-only control. Needs a TooltipProvider above it.',
        props: [{ name: 'TooltipContent sideOffset', type: 'number (default 4)' }],
        preview: () => (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <UiButton size="icon" variant="outline">
                            <Mail className="h-4 w-4" />
                        </UiButton>
                    </TooltipTrigger>
                    <TooltipContent>Send the digest</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ),
    },
];

/**
 * Groups the catalogue by category, preserving `CATALOG_CATEGORIES` order.
 *
 * @returns {object[]} Categories, each with its `entries` array.
 */
export function catalogByCategory() {
    return CATALOG_CATEGORIES.map((category) => ({
        ...category,
        entries: CATALOG_ENTRIES.filter((entry) => entry.category === category.id),
    }));
}

/** Number of primitive modules described. Compare against the directory listing. */
export const CATALOG_ENTRY_COUNT = CATALOG_ENTRIES.length;
