import AppLayout from '@/layouts/app-layout';
import { cn, resolveEventPhaseFromDates } from '@/lib/utils';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Armchair,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsUpDown,
    Plus,
    Printer,
    Search,
    Table as TableIcon,
    Users2,
    Wand2,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type Country = {
    id: number;
    code: string;
    name: string;
    flag_url?: string | null;
};

type UserType = {
    id: number;
    name: string;
    slug: string;
};

type Participant = {
    id: number;
    full_name: string;
    position_title?: string | null;
    country?: Country | null;
    user_type?: UserType | null;
    has_food_restrictions?: boolean;
    food_restrictions?: string[];
    dietary_allergies?: string | null;
    dietary_other?: string | null;
    accessibility_needs?: string[];
    accessibility_other?: string | null;
};

type TableAssignment = {
    id: number;
    seat_number: number;
    assigned_at?: string | null;
    participant?: Participant | null;
};

type TableRow = {
    id: number;
    table_number: string;
    capacity: number;
    assigned_count: number;
    assignments: TableAssignment[];
};

type EventRow = {
    id: number;
    title: string;
    starts_at?: string | null;
    ends_at?: string | null;
    is_active: boolean;
};

type PageProps = {
    tables?: TableRow[];
    participants?: Participant[];
    events?: EventRow[];
    selected_event_id?: number | null;
    view?: 'create' | 'assignment' | null;
};

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Table Assignment', href: '/table-assignment' },
];

const ENDPOINTS = {
    tables: {
        store: '/table-assignment/tables',
        update: (id: number) => `/table-assignment/tables/${id}`,
        destroy: (id: number) => `/table-assignment/tables/${id}`,
    },
    assignments: {
        store: '/table-assignment/assignments',
        update: (id: number) => `/table-assignment/assignments/${id}`,
        destroy: (id: number) => `/table-assignment/assignments/${id}`,
    },
};

const PRIMARY_BTN =
    'bg-[#00359c] text-white hover:bg-[#00359c]/90 focus-visible:ring-[#00359c]/30 dark:bg-[#00359c] dark:hover:bg-[#00359c]/90';

const FOOD_RESTRICTION_OPTIONS = [
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
    { value: 'halal', label: 'Halal' },
    { value: 'kosher', label: 'Kosher' },
    { value: 'gluten_free', label: 'Gluten-free' },
    { value: 'lactose_intolerant', label: 'Lactose intolerant' },
    { value: 'nut_allergy', label: 'Nut allergy' },
    { value: 'seafood_allergy', label: 'Seafood allergy' },
    { value: 'allergies', label: 'Allergies' },
    { value: 'other', label: 'Other' },
] as const;

const ACCESSIBILITY_NEEDS_OPTIONS = [
    { value: 'wheelchair_access', label: 'Wheelchair access' },
    { value: 'sign_language_interpreter', label: 'Sign language interpreter' },
    {
        value: 'assistive_technology_support',
        label: 'Assistive technology support',
    },
    { value: 'other', label: 'Other accommodations' },
] as const;

function formatDateTime(value?: string | null) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

type EventPhase = 'ongoing' | 'upcoming' | 'closed';

function resolveEventPhase(event: EventRow, now: number): EventPhase {
    return resolveEventPhaseFromDates(
        event.starts_at,
        event.ends_at,
        now,
        event.is_active,
    );
}

function phaseLabel(phase: EventPhase) {
    return phase === 'ongoing'
        ? 'Ongoing'
        : phase === 'upcoming'
          ? 'Upcoming'
          : 'Closed';
}

function phaseBadgeClass(phase: EventPhase) {
    switch (phase) {
        case 'ongoing':
            return 'bg-emerald-100 text-emerald-700';
        case 'upcoming':
            return 'bg-amber-100 text-amber-700';
        default:
            return 'bg-slate-200 text-slate-600';
    }
}

function participantPositionLabel(participant?: Participant | null) {
    return participant?.position_title?.trim() || 'Position unavailable';
}

type SearchItem = {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
};

function SearchableDropdown({
    value,
    onValueChange,
    items,
    placeholder = 'Select...',
    searchPlaceholder = 'Search...',
    emptyText = 'No results found.',
    disabled = false,
    buttonClassName,
}: {
    value: string;
    onValueChange: (next: string) => void;
    items: SearchItem[];
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    disabled?: boolean;
    buttonClassName?: string;
}) {
    const [open, setOpen] = React.useState(false);

    const selected = React.useMemo(
        () => items.find((i) => i.value === value) ?? null,
        [items, value],
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'w-full justify-between gap-2',
                        buttonClassName,
                    )}
                >
                    <span
                        className={cn(
                            'min-w-0 truncate',
                            !selected ? 'text-slate-500' : undefined,
                        )}
                    >
                        {selected ? selected.label : placeholder}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="start"
                className="w-[--radix-popover-trigger-width] p-0"
            >
                <Command>
                    <CommandInput placeholder={searchPlaceholder} />
                    <CommandEmpty>{emptyText}</CommandEmpty>

                    <CommandList>
                        <CommandGroup>
                            {items.map((item) => (
                                <CommandItem
                                    key={item.value}
                                    value={`${item.label} ${item.description ?? ''}`.trim()}
                                    disabled={item.disabled}
                                    onSelect={() => {
                                        onValueChange(item.value);
                                        setOpen(false);
                                    }}
                                    className="gap-2"
                                >
                                    <Check
                                        className={cn(
                                            'h-4 w-4',
                                            value === item.value
                                                ? 'opacity-100'
                                                : 'opacity-0',
                                        )}
                                    />
                                    <div className="min-w-0">
                                        <div className="truncate">
                                            {item.label}
                                        </div>
                                        {item.description ? (
                                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                {item.description}
                                            </div>
                                        ) : null}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export default function TableAssignmenyPage(props: PageProps) {
    const { auth } = usePage<SharedData>().props;
    const userType = auth.user?.user_type ?? auth.user?.userType;
    const roleName = (userType?.name ?? '').toUpperCase();
    const roleSlug = (userType?.slug ?? '').toUpperCase();
    const roleValue = `${roleSlug || roleName}`.replace(/[_-]+/g, ' ').trim();
    const isAdminRole = roleValue === 'ADMIN';
    const isChedAdmin = isAdminRole || roleValue.startsWith('CHED ');
    const chedView = props.view === 'assignment' ? 'assignment' : 'create';
    const tables = props.tables ?? [];
    const participants = props.participants ?? [];
    const events = props.events ?? [];

    const initialEventId = props.selected_event_id
        ? String(props.selected_event_id)
        : '';

    const tableForm = useForm({
        programme_id: initialEventId,
        table_number: '',
        capacity: '',
    });

    const [selectedEventId, setSelectedEventId] =
        React.useState<string>(initialEventId);
    const [capacityDrafts, setCapacityDrafts] = React.useState<
        Record<number, string>
    >({});
    const [tableNumberDrafts, setTableNumberDrafts] = React.useState<
        Record<number, string>
    >({});
    const [expandedRowIds, setExpandedRowIds] = React.useState<Set<string>>(
        new Set(),
    );
    const [removingAssignmentIds, setRemovingAssignmentIds] = React.useState<
        number[]
    >([]);
    const [printingSeatPlan, setPrintingSeatPlan] = React.useState(false);
    const [currentTimestamp] = React.useState(() => Date.now());
    const hasHydrated = React.useRef(false);
    const selectedEvent = selectedEventId
        ? events.find((event) => String(event.id) === selectedEventId)
        : null;
    const selectedEventPhase = selectedEvent
        ? resolveEventPhase(selectedEvent, currentTimestamp)
        : null;
    const isEventClosed = selectedEventPhase === 'closed';

    React.useEffect(() => {
        const nextDrafts: Record<number, string> = {};
        const nextNumberDrafts: Record<number, string> = {};
        tables.forEach((table) => {
            nextDrafts[table.id] = String(table.capacity ?? '');
            nextNumberDrafts[table.id] = table.table_number ?? '';
        });
        setCapacityDrafts(nextDrafts);
        setTableNumberDrafts(nextNumberDrafts);
    }, [tables]);

    const chedBasePath =
        chedView === 'assignment'
            ? '/table-assignment/assignment'
            : '/table-assignment/create';

    React.useEffect(() => {
        if (!hasHydrated.current) {
            hasHydrated.current = true;
            return;
        }

        tableForm.reset('table_number', 'capacity');
        tableForm.clearErrors();
        const destination = isChedAdmin ? chedBasePath : '/table-assignment';
        router.get(
            destination,
            { event_id: selectedEventId || undefined },
            { preserveScroll: true, preserveState: true, replace: true },
        );
    }, [selectedEventId]);

    function submitTable(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedEventId) {
            toast.error('Select an event before creating a table.');
            return;
        }

        tableForm.transform((data) => ({
            ...data,
            programme_id: selectedEventId,
        }));
        tableForm.post(ENDPOINTS.tables.store, {
            preserveScroll: true,
            onSuccess: () => {
                toast.success('Table added.');
                tableForm.reset();
            },
            onError: () => toast.error('Unable to add table.'),
        });
    }

    function updateTableInfo(tableId: number) {
        const capacity = Number(capacityDrafts[tableId]);
        const tableNumber = tableNumberDrafts[tableId]?.trim();

        if (!tableNumber) {
            toast.error('Enter a table name.');
            return;
        }
        if (
            !Number.isFinite(capacity) ||
            (isAdminRole ? capacity < 0 : capacity <= 0)
        ) {
            toast.error('Enter a valid capacity.');
            return;
        }

        router.patch(
            ENDPOINTS.tables.update(tableId),
            { table_number: tableNumber, capacity },
            {
                preserveScroll: true,
                onSuccess: () => toast.success('Table updated.'),
                onError: () => toast.error('Unable to update table.'),
            },
        );
    }

    function removeTable(tableId: number) {
        router.delete(ENDPOINTS.tables.destroy(tableId), {
            preserveScroll: true,
            onSuccess: () => toast.success('Table deleted.'),
            onError: () => toast.error('Unable to delete table.'),
        });
    }

    function removeAssignment(id: number) {
        if (removingAssignmentIds.includes(id)) {
            return;
        }

        setRemovingAssignmentIds((prev) => [...prev, id]);

        router.delete(ENDPOINTS.assignments.destroy(id), {
            preserveScroll: true,
            onSuccess: () => toast.success('Participant removed from table.'),
            onError: () => toast.error('Unable to remove participant.'),
            onFinish: () => {
                setRemovingAssignmentIds((prev) =>
                    prev.filter((assignmentId) => assignmentId !== id),
                );
            },
        });
    }

    const eventContextCard = (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Event Filter</CardTitle>
                <CardDescription></CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[260px,1fr] md:items-center">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Event{' '}
                            <span className="text-[11px] font-semibold text-red-600">
                                {' '}
                                *
                            </span>
                        </label>
                        <SearchableDropdown
                            value={selectedEventId}
                            onValueChange={(v) =>
                                setSelectedEventId(v === 'none' ? '' : v)
                            }
                            placeholder="Select event"
                            searchPlaceholder="Search events..."
                            emptyText="No events found."
                            disabled={events.length === 0}
                            items={
                                events.length === 0
                                    ? [
                                          {
                                              value: 'none',
                                              label: 'No events available',
                                              disabled: true,
                                          },
                                      ]
                                    : [
                                          {
                                              value: '',
                                              label: 'Clear selection',
                                          },
                                          ...events.map((event) => {
                                              const phase = resolveEventPhase(
                                                  event,
                                                  currentTimestamp,
                                              );
                                              const when = event.starts_at
                                                  ? formatDateTime(
                                                        event.starts_at,
                                                    )
                                                  : 'Schedule TBA';
                                              return {
                                                  value: String(event.id),
                                                  label: event.title,
                                                  description: `${phaseLabel(phase)} • ${when}`,
                                              };
                                          }),
                                      ]
                            }
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        {selectedEventId ? (
                            (() => {
                                if (!selectedEvent)
                                    return (
                                        <span className="text-slate-500">
                                            Event details unavailable.
                                        </span>
                                    );
                                const phase = selectedEventPhase ?? 'closed';
                                return (
                                    <>
                                        <Badge
                                            className={phaseBadgeClass(phase)}
                                        >
                                            {phaseLabel(phase)}
                                        </Badge>
                                        <span className="text-slate-500">
                                            {selectedEvent.starts_at
                                                ? formatDateTime(
                                                      selectedEvent.starts_at,
                                                  )
                                                : 'Schedule TBA'}
                                        </span>
                                    </>
                                );
                            })()
                        ) : (
                            <span className="text-slate-500">
                                Choose an event to load tables and participants.
                            </span>
                        )}
                    </div>
                </div>
                {isEventClosed ? (
                    <p className="text-sm text-rose-600">
                        Table assignments are locked because this event is
                        closed.
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );

    const createTableCard = (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Create Table</CardTitle>
                <CardDescription>
                    Set up a new table with a number, capacity, and seat
                    arrangement support.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={submitTable} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Table name{' '}
                            <span className="text-[11px] font-semibold text-red-600">
                                {' '}
                                *
                            </span>
                        </label>
                        <Input
                            type="text"
                            value={tableForm.data.table_number}
                            onChange={(e) =>
                                tableForm.setData(
                                    'table_number',
                                    e.target.value,
                                )
                            }
                            placeholder="e.g. Table 1"
                        />
                        {tableForm.errors.table_number ? (
                            <p className="text-xs text-rose-500">
                                {tableForm.errors.table_number}
                            </p>
                        ) : null}
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Capacity{' '}
                            <span className="text-[11px] font-semibold text-red-600">
                                {' '}
                                *
                            </span>
                        </label>
                        <Input
                            type="number"
                            min={isAdminRole ? 0 : 1}
                            value={tableForm.data.capacity}
                            onChange={(e) =>
                                tableForm.setData('capacity', e.target.value)
                            }
                            placeholder="e.g. 8"
                        />
                        {tableForm.errors.capacity ? (
                            <p className="text-xs text-rose-500">
                                {tableForm.errors.capacity}
                            </p>
                        ) : null}
                    </div>
                    <Button
                        type="submit"
                        disabled={tableForm.processing}
                        className={cn('w-full sm:w-auto', PRIMARY_BTN)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Add table
                    </Button>
                </form>
            </CardContent>
        </Card>
    );

    // Flatten all assignments across all tables for the unified view
    const allAssignments = React.useMemo(() => {
        const result: Array<
            TableAssignment & { table_number: string; table_id: number }
        > = [];
        tables.forEach((table) => {
            table.assignments.forEach((assignment) => {
                result.push({
                    ...assignment,
                    table_number: table.table_number,
                    table_id: table.id,
                });
            });
        });
        return result;
    }, [tables]);

    const tableById = React.useMemo(() => {
        return new Map(tables.map((table) => [table.id, table]));
    }, [tables]);

    const assignmentsByTableId = React.useMemo(() => {
        const next = new Map<number, Map<number, TableAssignment>>();

        tables.forEach((table) => {
            const seats = new Map<number, TableAssignment>();
            table.assignments.forEach((assignment) => {
                seats.set(assignment.seat_number, assignment);
            });
            next.set(table.id, seats);
        });

        return next;
    }, [tables]);

    // Track inline table reassignment drafts
    const [tableDrafts, setTableDrafts] = React.useState<
        Record<number, string>
    >({});
    const [seatDrafts, setSeatDrafts] = React.useState<Record<number, string>>(
        {},
    );
    const [participantAssignmentDrafts, setParticipantAssignmentDrafts] =
        React.useState<Record<number, { tableId: string; seatNumber: string }>>(
            {},
        );

    React.useEffect(() => {
        const next: Record<number, string> = {};
        const nextSeatDrafts: Record<number, string> = {};
        allAssignments.forEach((a) => {
            next[a.id] = String(a.table_id);
            nextSeatDrafts[a.id] = String(a.seat_number);
        });
        setTableDrafts(next);
        setSeatDrafts(nextSeatDrafts);
    }, [allAssignments]);

    // Helper: get CSRF token for fetch calls
    function getCsrfToken() {
        return (
            document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content') ?? ''
        );
    }

    // Auto-unassign: batch-remove all excess assignments in one go when capacity is reduced
    const isAutoUnassigning = React.useRef(false);

    React.useEffect(() => {
        if (isAutoUnassigning.current) return;
        if (!selectedEventId || tables.length === 0) return;

        // Collect ALL excess assignment IDs across all over-capacity tables
        const excessIds: number[] = [];
        tables.forEach((t) => {
            if (t.assigned_count > t.capacity) {
                t.assignments
                    .slice(t.capacity)
                    .forEach((a) => excessIds.push(a.id));
            }
        });
        if (excessIds.length === 0) return;

        isAutoUnassigning.current = true;
        const csrf = getCsrfToken();

        // Delete all excess assignments in parallel, then reload once
        Promise.all(
            excessIds.map((id) =>
                fetch(ENDPOINTS.assignments.destroy(id), {
                    method: 'DELETE',
                    headers: {
                        'X-CSRF-TOKEN': csrf,
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                }),
            ),
        )
            .then(() => {
                router.visit(window.location.href, {
                    preserveScroll: true,
                    preserveState: true,
                    onFinish: () => {
                        isAutoUnassigning.current = false;
                    },
                });
            })
            .catch(() => {
                toast.error('Unable to remove excess assignments.');
                isAutoUnassigning.current = false;
            });
    }, [selectedEventId, tables]);

    // Manual auto-assign: admin clicks a button to distribute all unassigned participants in one go
    const [autoAssignRunning, setAutoAssignRunning] = React.useState(false);

    function triggerAutoAssign() {
        if (autoAssignRunning) return;
        if (
            !selectedEventId ||
            isEventClosed ||
            participants.length === 0 ||
            tables.length === 0
        ) {
            toast.error('No unassigned participants or no tables available.');
            return;
        }

        // Build assignment plan: distribute participants across tables
        const plan: Array<{ tableId: number; participantIds: number[] }> = [];
        const remaining = [...participants];

        for (const table of tables) {
            if (remaining.length === 0) break;
            const available = table.capacity - table.assigned_count;
            if (available <= 0) continue;
            const batch = remaining.splice(0, available);
            plan.push({
                tableId: table.id,
                participantIds: batch.map((p) => p.id),
            });
        }

        if (plan.length === 0) {
            toast.error(
                'All tables are full. Increase capacity or add a new table.',
            );
            return;
        }

        setAutoAssignRunning(true);
        const csrf = getCsrfToken();

        // Execute all assignments in parallel, then reload once
        Promise.all(
            plan.map(({ tableId, participantIds }) =>
                fetch(ENDPOINTS.assignments.store, {
                    method: 'POST',
                    headers: {
                        'X-CSRF-TOKEN': csrf,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({
                        programme_id: selectedEventId,
                        participant_table_id: String(tableId),
                        participant_ids: participantIds,
                    }),
                }),
            ),
        )
            .then((responses) => {
                const allOk = responses.every((r) => r.ok);
                if (allOk) {
                    toast.success(
                        remaining.length > 0
                            ? `Assigned ${participants.length - remaining.length} participants. ${remaining.length} remain (tables full).`
                            : 'All participants have been assigned.',
                    );
                } else {
                    toast.error('Some assignments failed.');
                }
                router.visit(window.location.href, {
                    preserveScroll: true,
                    preserveState: true,
                    onFinish: () => setAutoAssignRunning(false),
                });
            })
            .catch(() => {
                toast.error('Auto-assignment failed.');
                setAutoAssignRunning(false);
            });
    }

    function assignParticipantToTable(
        participantId: number,
        tableId: string,
        seatNumber?: string,
    ) {
        if (!selectedEventId || isEventClosed) return;

        const targetTable = tables.find((t) => String(t.id) === tableId);
        if (!targetTable) return;
        const manualSeatNumber = seatNumber ? Number(seatNumber) : null;

        if (
            !manualSeatNumber &&
            targetTable.assigned_count >= targetTable.capacity
        ) {
            toast.error(
                `${targetTable.table_number} is full (${targetTable.assigned_count}/${targetTable.capacity}).`,
            );
            return;
        }

        if (manualSeatNumber) {
            const occupiedSeats = assignmentsByTableId.get(targetTable.id);

            if (
                !Number.isInteger(manualSeatNumber) ||
                manualSeatNumber < 1 ||
                manualSeatNumber > targetTable.capacity
            ) {
                toast.error('Select a valid seat for this table.');
                return;
            }

            if (occupiedSeats?.has(manualSeatNumber)) {
                toast.error('Seat is already occupied.');
                return;
            }
        }

        router.post(
            ENDPOINTS.assignments.store,
            {
                programme_id: selectedEventId,
                participant_table_id: tableId,
                ...(manualSeatNumber ? { seat_number: manualSeatNumber } : {}),
                participant_ids: [participantId],
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setParticipantAssignmentDrafts((prev) => {
                        const next = { ...prev };
                        delete next[participantId];

                        return next;
                    });
                    toast.success('Participant assigned to table.');
                },
                onError: () => toast.error('Unable to assign participant.'),
            },
        );
    }

    function reassignToTable(assignmentId: number, newTableId: string) {
        const current = allAssignments.find((a) => a.id === assignmentId);
        if (!current || String(current.table_id) === newTableId) return;

        const participantId = current.participant?.id;
        if (!participantId) return;

        // Check if the target table is full
        const targetTable = tables.find((t) => String(t.id) === newTableId);
        if (!targetTable) return;

        if (targetTable.assigned_count >= targetTable.capacity) {
            toast.error(
                `${targetTable.table_number} is full (${targetTable.assigned_count}/${targetTable.capacity}). Remove a participant first to free a seat.`,
            );
            // Revert the dropdown
            setTableDrafts((prev) => ({
                ...prev,
                [assignmentId]: String(current.table_id),
            }));
            return;
        }

        router.delete(ENDPOINTS.assignments.destroy(assignmentId), {
            preserveScroll: true,
            onSuccess: () => {
                router.post(
                    ENDPOINTS.assignments.store,
                    {
                        programme_id: selectedEventId,
                        participant_table_id: newTableId,
                        participant_ids: [participantId],
                    },
                    {
                        preserveScroll: true,
                        onSuccess: () =>
                            toast.success(
                                'Participant reassigned to new table.',
                            ),
                        onError: () =>
                            toast.error('Unable to reassign participant.'),
                    },
                );
            },
            onError: () => toast.error('Unable to reassign participant.'),
        });
    }

    // Check if any table still has room — used to label unassigned rows
    function seatItemsForTable(tableId: number, currentAssignmentId?: number) {
        const table = tableById.get(tableId);
        const occupiedSeats = assignmentsByTableId.get(tableId);

        if (!table || table.capacity <= 0) return [];

        return Array.from({ length: table.capacity }, (_, index) => {
            const seatNumber = index + 1;
            const occupant = occupiedSeats?.get(seatNumber);
            const isCurrent = occupant?.id === currentAssignmentId;

            return {
                value: String(seatNumber),
                label: `Seat ${seatNumber}`,
                description: isCurrent
                    ? 'Current seat'
                    : occupant?.participant?.full_name
                      ? occupant.participant.full_name
                      : 'Empty',
            };
        });
    }

    function updateAssignmentSeat(assignmentId: number, nextSeat: string) {
        const current = allAssignments.find((a) => a.id === assignmentId);
        const table = current ? tableById.get(current.table_id) : null;
        const seatNumber = Number(nextSeat);

        if (!current || !table) return;

        if (
            !Number.isInteger(seatNumber) ||
            seatNumber < 1 ||
            seatNumber > table.capacity
        ) {
            toast.error('Select a valid seat for this table.');
            setSeatDrafts((prev) => ({
                ...prev,
                [assignmentId]: String(current.seat_number),
            }));
            return;
        }

        if (seatNumber === current.seat_number) return;

        router.patch(
            ENDPOINTS.assignments.update(assignmentId),
            { seat_number: seatNumber },
            {
                preserveScroll: true,
                onSuccess: () => toast.success('Seat updated.'),
                onError: () => {
                    toast.error('Unable to update seat.');
                    setSeatDrafts((prev) => ({
                        ...prev,
                        [assignmentId]: String(current.seat_number),
                    }));
                },
            },
        );
    }

    const hasAvailableCapacity = tables.some(
        (t) => t.capacity - t.assigned_count > 0,
    );

    // Total counts for display
    const totalParticipants = allAssignments.length + participants.length;
    const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
    const openSeatCount = Math.max(totalCapacity - allAssignments.length, 0);

    // Search, filter & pagination state
    const [searchQuery, setSearchQuery] = React.useState('');
    const [tableFilter, setTableFilter] = React.useState<string>('all'); // 'all' | 'not_assigned' | table id
    const [currentPage, setCurrentPage] = React.useState(1);
    const [perPage, setPerPage] = React.useState(10);

    // Reset to page 1 when search or filter changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, tableFilter]);

    // Seat plan pagination state (mirrors the participants table pattern above)
    const [seatPlanSearch, setSeatPlanSearch] = React.useState('');
    const [seatPlanPage, setSeatPlanPage] = React.useState(1);
    const [seatPlanPerPage, setSeatPlanPerPage] = React.useState(3);

    React.useEffect(() => {
        setSeatPlanPage(1);
    }, [seatPlanSearch, seatPlanPerPage]);

    const filteredTables = React.useMemo(() => {
        const q = seatPlanSearch.trim().toLowerCase();
        if (!q) return tables;
        return tables.filter((t) =>
            t.table_number.toLowerCase().includes(q),
        );
    }, [tables, seatPlanSearch]);

    const seatPlanTotalPages = Math.max(
        1,
        Math.ceil(filteredTables.length / seatPlanPerPage),
    );
    const seatPlanSafePage = Math.min(seatPlanPage, seatPlanTotalPages);

    const pagedTables = React.useMemo(() => {
        const start = (seatPlanSafePage - 1) * seatPlanPerPage;
        return filteredTables.slice(start, start + seatPlanPerPage);
    }, [filteredTables, seatPlanSafePage, seatPlanPerPage]);

    const filteredAssignments = React.useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return allAssignments.filter((a) => {
            // Table filter
            if (tableFilter !== 'all' && tableFilter !== 'not_assigned') {
                if (String(a.table_id) !== tableFilter) return false;
            }
            if (tableFilter === 'not_assigned') return false; // hide assigned when filtering "Not Assigned"
            // Search query
            if (!q) return true;
            const name = (a.participant?.full_name ?? '').toLowerCase();
            const position = (
                a.participant?.position_title ?? ''
            ).toLowerCase();
            const role = (a.participant?.user_type?.name ?? '').toLowerCase();
            const table = a.table_number.toLowerCase();
            const seat = `seat ${a.seat_number}`;
            return (
                name.includes(q) ||
                position.includes(q) ||
                role.includes(q) ||
                table.includes(q) ||
                seat.includes(q)
            );
        });
    }, [allAssignments, searchQuery, tableFilter]);

    const filteredParticipants = React.useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return participants.filter((p) => {
            // Table filter — show unassigned only when 'all' or 'not_assigned'
            if (tableFilter !== 'all' && tableFilter !== 'not_assigned')
                return false;
            // Search query
            if (!q) return true;
            const name = p.full_name.toLowerCase();
            const position = (p.position_title ?? '').toLowerCase();
            const role = (p.user_type?.name ?? '').toLowerCase();
            return name.includes(q) || position.includes(q) || role.includes(q);
        });
    }, [participants, searchQuery, tableFilter]);

    // Pagination: combine filtered assigned + unassigned into one virtual list, then slice
    const totalFilteredRows =
        filteredAssignments.length + filteredParticipants.length;
    const totalPages = Math.max(1, Math.ceil(totalFilteredRows / perPage));
    const safePage = Math.min(currentPage, totalPages);

    const paginatedData = React.useMemo(() => {
        const start = (safePage - 1) * perPage;
        const end = start + perPage;

        // Slice from assigned first, then unassigned
        const assignedSliceStart = Math.min(start, filteredAssignments.length);
        const assignedSliceEnd = Math.min(end, filteredAssignments.length);
        const pagedAssigned = filteredAssignments.slice(
            assignedSliceStart,
            assignedSliceEnd,
        );

        const unassignedNeeded = perPage - pagedAssigned.length;
        const unassignedOffset = Math.max(
            0,
            start - filteredAssignments.length,
        );
        const pagedUnassigned =
            unassignedNeeded > 0
                ? filteredParticipants.slice(
                      unassignedOffset,
                      unassignedOffset + unassignedNeeded,
                  )
                : [];

        return { pagedAssigned, pagedUnassigned };
    }, [filteredAssignments, filteredParticipants, safePage, perPage]);

    const toggleRowExpand = React.useCallback((key: string) => {
        setExpandedRowIds((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    React.useEffect(() => {
        if (!printingSeatPlan) return;

        const resetPrinting = () => setPrintingSeatPlan(false);
        window.addEventListener('afterprint', resetPrinting);

        return () => window.removeEventListener('afterprint', resetPrinting);
    }, [printingSeatPlan]);

    function printSeatPlan() {
        if (tables.length === 0) return;

        setPrintingSeatPlan(true);
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => window.print());
        });
    }

    function renderParticipantDetailsPanel(p: Participant) {
        return (
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <div className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                        Food Restrictions
                    </div>
                    {(p.food_restrictions ?? []).length > 0 ? (
                        <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                                {(p.food_restrictions ?? []).map((r) => {
                                    const label =
                                        FOOD_RESTRICTION_OPTIONS.find(
                                            (o) => o.value === r,
                                        )?.label ?? r;
                                    return (
                                        <Badge
                                            key={r}
                                            variant="secondary"
                                            className="text-xs"
                                        >
                                            {label}
                                        </Badge>
                                    );
                                })}
                            </div>
                            {p.dietary_allergies && (
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">
                                        Allergies:
                                    </span>{' '}
                                    {p.dietary_allergies}
                                </div>
                            )}
                            {p.dietary_other && (
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">Other:</span>{' '}
                                    {p.dietary_other}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400">
                            None specified
                        </div>
                    )}
                </div>
                <div>
                    <div className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                        Accessibility Needs
                    </div>
                    {(p.accessibility_needs ?? []).length > 0 ? (
                        <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                                {(p.accessibility_needs ?? []).map((n) => {
                                    const label =
                                        ACCESSIBILITY_NEEDS_OPTIONS.find(
                                            (o) => o.value === n,
                                        )?.label ?? n;
                                    return (
                                        <Badge
                                            key={n}
                                            variant="secondary"
                                            className="text-xs"
                                        >
                                            {label}
                                        </Badge>
                                    );
                                })}
                            </div>
                            {p.accessibility_other && (
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">Other:</span>{' '}
                                    {p.accessibility_other}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400">
                            None specified
                        </div>
                    )}
                </div>
            </div>
        );
    }

    function renderExpandedDetail(p: Participant) {
        return (
            <TableRow className="border-b bg-slate-50/50 dark:bg-slate-900/20">
                <TableCell colSpan={6} className="px-6 py-3">
                    {renderParticipantDetailsPanel(p)}
                </TableCell>
            </TableRow>
        );
    }

    function renderSeatingPlan(printMode = false) {
        if (tables.length === 0) return null;

        // Print always shows every table; screen shows the paged subset
        const tablesToRender = printMode ? tables : pagedTables;
        const seatPlanRangeStart = filteredTables.length === 0
            ? 0
            : (seatPlanSafePage - 1) * seatPlanPerPage + 1;
        const seatPlanRangeEnd = Math.min(
            seatPlanSafePage * seatPlanPerPage,
            filteredTables.length,
        );

        const printedAt = new Intl.DateTimeFormat('en-PH', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date(currentTimestamp));

        return (
            <div className="space-y-3">
                {printMode ? (
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                        <div>
                            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                                CHED Events Registration System
                            </div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                Seat Plan
                            </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                            <div className="font-semibold uppercase">
                                Printed
                            </div>
                            <div>{printedAt}</div>
                        </div>
                    </div>
                ) : null}
                <div
                    className={cn(
                        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
                        printMode && 'sm:flex-row',
                    )}
                >
                    <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                            <Armchair className="h-4 w-4 text-[#00359c]" />
                            Seating plan
                        </div>
                        {printMode ? (
                            <div className="mt-1 space-y-1 text-xs text-slate-500">
                                <div>
                                    {selectedEvent?.title ??
                                        'Selected event unavailable'}
                                </div>
                                <div>
                                    {allAssignments.length} assigned,{' '}
                                    {openSeatCount} open seats of{' '}
                                    {totalCapacity}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    {!printMode ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-2 text-xs"
                            onClick={printSeatPlan}
                        >
                            <Printer className="h-4 w-4" />
                            Print seat plan
                        </Button>
                    ) : null}
                </div>
                {!printMode ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>Show</span>
                            <Select
                                value={String(seatPlanPerPage)}
                                onValueChange={(v) => {
                                    setSeatPlanPerPage(Number(v));
                                    setSeatPlanPage(1);
                                }}
                            >
                                <SelectTrigger className="h-8 w-[72px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[3, 6, 12, 1000].map((n) => (
                                        <SelectItem
                                            key={n}
                                            value={String(n)}
                                        >
                                            {n === 1000 ? 'All' : n}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span>tables</span>
                        </div>
                        {filteredTables.length > 0 ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Showing {seatPlanRangeStart} to{' '}
                                {seatPlanRangeEnd} of{' '}
                                {filteredTables.length} tables
                            </span>
                        ) : null}
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                type="text"
                                placeholder="Search table number..."
                                value={seatPlanSearch}
                                onChange={(e) =>
                                    setSeatPlanSearch(e.target.value)
                                }
                                className="pl-9"
                            />
                        </div>
                    </div>
                ) : null}
                {!printMode && filteredTables.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        No tables match &ldquo;{seatPlanSearch}&rdquo;.{' '}
                        <button
                            type="button"
                            onClick={() => setSeatPlanSearch('')}
                            className="font-medium text-[#00359c] underline underline-offset-2 hover:text-[#00359c]/80"
                        >
                            Clear search
                        </button>
                    </div>
                ) : null}
                <div
                    className={cn(
                        'grid gap-3 grid-cols-1 print:grid-cols-2',
                        !printMode &&
                            filteredTables.length === 0 &&
                            'hidden',
                    )}
                >
                    {tablesToRender.map((table) => {
                        const occupiedSeats =
                            assignmentsByTableId.get(table.id) ??
                            new Map<number, TableAssignment>();

                        return (
                            <div
                                key={table.id}
                                className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                            >
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            {table.table_number}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {table.assigned_count}/
                                            {table.capacity} occupied
                                        </div>
                                    </div>
                                    <Badge
                                        className={
                                            table.assigned_count >=
                                            table.capacity
                                                ? 'bg-slate-200 text-slate-700'
                                                : 'bg-emerald-100 text-emerald-700'
                                        }
                                    >
                                        {Math.max(
                                            table.capacity -
                                                table.assigned_count,
                                            0,
                                        )}{' '}
                                        open
                                    </Badge>
                                </div>
                                {table.capacity > 0 ? (
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2 print:grid-cols-[repeat(auto-fit,minmax(95px,1fr))]">
                                        {Array.from(
                                            { length: table.capacity },
                                            (_, index) => {
                                                const seatNumber = index + 1;
                                                const occupant =
                                                    occupiedSeats.get(
                                                        seatNumber,
                                                    );

                                                return (
                                                    <div
                                                        key={seatNumber}
                                                        title={
                                                            occupant
                                                                ?.participant
                                                                ?.full_name ??
                                                            'Empty'
                                                        }
                                                        className={cn(
                                                            'min-h-14 rounded-md border px-2 py-1.5',
                                                            occupant
                                                                ? 'border-[#00359c]/30 bg-[#00359c]/5 text-slate-900 dark:bg-[#00359c]/20 dark:text-slate-100'
                                                                : 'border-dashed border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40',
                                                        )}
                                                    >
                                                        <div className="text-[11px] font-semibold">
                                                            Seat {seatNumber}
                                                        </div>
                                                        <div className="text-xs break-words">
                                                            {occupant
                                                                ?.participant
                                                                ?.full_name ??
                                                                'Empty'}
                                                        </div>
                                                    </div>
                                                );
                                            },
                                        )}
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700">
                                        No seats configured
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {!printMode && filteredTables.length > seatPlanPerPage ? (
                    <div className="flex items-center gap-1 pt-1">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={seatPlanSafePage <= 1}
                            onClick={() =>
                                setSeatPlanPage((p) => Math.max(1, p - 1))
                            }
                            className="h-8 gap-1 px-2.5 text-xs"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Previous
                        </Button>
                        {Array.from(
                            { length: seatPlanTotalPages },
                            (_, i) => i + 1,
                        )
                            .filter((p) => {
                                if (seatPlanTotalPages <= 5) return true;
                                return (
                                    p === 1 ||
                                    p === seatPlanTotalPages ||
                                    Math.abs(p - seatPlanSafePage) <= 1
                                );
                            })
                            .reduce<(number | 'ellipsis')[]>(
                                (acc, p, idx, arr) => {
                                    if (
                                        idx > 0 &&
                                        p - (arr[idx - 1] as number) > 1
                                    )
                                        acc.push('ellipsis');
                                    acc.push(p);
                                    return acc;
                                },
                                [],
                            )
                            .map((item, idx) =>
                                item === 'ellipsis' ? (
                                    <span
                                        key={`seat-plan-ellipsis-${idx}`}
                                        className="px-1.5 text-xs text-slate-400"
                                    >
                                        ...
                                    </span>
                                ) : (
                                    <Button
                                        key={item}
                                        type="button"
                                        variant={
                                            item === seatPlanSafePage
                                                ? 'default'
                                                : 'outline'
                                        }
                                        size="sm"
                                        onClick={() => setSeatPlanPage(item)}
                                        className={cn(
                                            'h-8 min-w-[32px] px-2.5 text-xs',
                                            item === seatPlanSafePage &&
                                                PRIMARY_BTN,
                                        )}
                                    >
                                        {item}
                                    </Button>
                                ),
                            )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={seatPlanSafePage >= seatPlanTotalPages}
                            onClick={() =>
                                setSeatPlanPage((p) =>
                                    Math.min(seatPlanTotalPages, p + 1),
                                )
                            }
                            className="h-8 gap-1 px-2.5 text-xs"
                        >
                            Next
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ) : null}
                {printMode ? (
                    <div
                        id="seat-plan-print-footer"
                        className="border-t border-slate-200 pt-3 text-center text-[11px] font-semibold tracking-wide text-slate-500 uppercase"
                    >
                        CHED Events Registration System
                    </div>
                ) : null}
            </div>
        );
    }

    const assignParticipantsCard = (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="text-base">
                            Assign Participants
                        </CardTitle>
                        <CardDescription>
                            Manage table assignments, seat numbers, and track
                            seating.
                        </CardDescription>
                    </div>
                    {participants.length > 0 && !isEventClosed ? (
                        <Button
                            type="button"
                            size="sm"
                            className={cn(PRIMARY_BTN)}
                            onClick={triggerAutoAssign}
                            disabled={
                                autoAssignRunning || !hasAvailableCapacity
                            }
                        >
                            <Wand2 className="mr-2 h-4 w-4" />
                            {autoAssignRunning ? 'Assigning...' : 'Auto-assign'}
                        </Button>
                    ) : null}
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                            <Users2 className="h-4 w-4" />
                            Total
                        </div>
                        <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                            {totalParticipants}
                        </div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/70 dark:bg-emerald-950/30">
                        <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            Assigned
                        </div>
                        <div className="mt-1 text-xl font-semibold text-emerald-800 dark:text-emerald-200">
                            {allAssignments.length}
                        </div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/70 dark:bg-amber-950/30">
                        <div className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            Not assigned
                        </div>
                        <div className="mt-1 text-xl font-semibold text-amber-800 dark:text-amber-200">
                            {participants.length}
                        </div>
                    </div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 dark:border-sky-900/70 dark:bg-sky-950/30">
                        <div className="text-xs font-medium text-sky-700 dark:text-sky-300">
                            Open seats
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                            <span className="text-xl font-semibold text-sky-800 dark:text-sky-200">
                                {openSeatCount}
                            </span>
                            <span className="text-xs text-sky-700 dark:text-sky-300">
                                of {totalCapacity}
                            </span>
                        </div>
                    </div>
                </div>

                {renderSeatingPlan()}

                {/* Pagination controls & Search bar */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span>Show</span>
                            <Select
                                value={String(perPage)}
                                onValueChange={(v) => {
                                    setPerPage(Number(v));
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="h-8 w-[60px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[10, 20, 50, 100, 1000].map((n) => (
                                        <SelectItem key={n} value={String(n)}>
                                            {n}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span>entries</span>
                        </div>
                        {totalFilteredRows > 0 && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Showing{' '}
                                {Math.min(
                                    (safePage - 1) * perPage + 1,
                                    totalFilteredRows,
                                )}{' '}
                                to{' '}
                                {Math.min(
                                    safePage * perPage,
                                    totalFilteredRows,
                                )}{' '}
                                of {totalFilteredRows} entries
                            </span>
                        )}
                        {totalFilteredRows > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 text-xs"
                                onClick={() => {
                                    if (expandedRowIds.size > 0) {
                                        setExpandedRowIds(new Set());
                                    } else {
                                        const allKeys = new Set<string>();
                                        paginatedData.pagedAssigned.forEach(
                                            (a) =>
                                                allKeys.add(`assigned-${a.id}`),
                                        );
                                        paginatedData.pagedUnassigned.forEach(
                                            (p) =>
                                                allKeys.add(
                                                    `unassigned-${p.id}`,
                                                ),
                                        );
                                        setExpandedRowIds(allKeys);
                                    }
                                }}
                            >
                                {expandedRowIds.size > 0
                                    ? 'Collapse All'
                                    : 'View All'}
                            </Button>
                        )}
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                type="text"
                                placeholder="Search by name, position, role, or table..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <div className="w-full sm:w-[200px]">
                            <SearchableDropdown
                                value={tableFilter}
                                onValueChange={setTableFilter}
                                placeholder="Filter by table"
                                searchPlaceholder="Search tables..."
                                emptyText="No tables."
                                buttonClassName="h-9"
                                items={[
                                    { value: 'all', label: 'All tables' },
                                    {
                                        value: 'not_assigned',
                                        label: 'Not Assigned',
                                    },
                                    ...tables.map((t) => ({
                                        value: String(t.id),
                                        label: t.table_number,
                                        description: `${t.assigned_count}/${t.capacity} seats`,
                                    })),
                                ]}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-3 lg:hidden">
                    {totalFilteredRows === 0 ? (
                        <div className="rounded-lg border border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800">
                            {searchQuery || tableFilter !== 'all'
                                ? 'No participants match your search or filter.'
                                : 'No participants for this event.'}
                        </div>
                    ) : (
                        <>
                            {paginatedData.pagedAssigned.map((assignment) => {
                                const rowKey = `assigned-${assignment.id}`;
                                const isExpanded = expandedRowIds.has(rowKey);

                                return (
                                    <div
                                        key={rowKey}
                                        className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <button
                                                type="button"
                                                className="flex min-w-0 flex-1 items-start gap-2 text-left"
                                                onClick={() =>
                                                    toggleRowExpand(rowKey)
                                                }
                                            >
                                                <ChevronDown
                                                    className={cn(
                                                        'mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                                                        isExpanded &&
                                                            'rotate-180',
                                                    )}
                                                />
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                                        {assignment.participant
                                                            ?.full_name ??
                                                            'Participant removed'}
                                                    </span>
                                                    <span className="block text-xs text-slate-500">
                                                        {participantPositionLabel(
                                                            assignment.participant,
                                                        )}
                                                    </span>
                                                </span>
                                            </button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                    removeAssignment(
                                                        assignment.id,
                                                    )
                                                }
                                                aria-label="Remove participant"
                                                disabled={
                                                    isEventClosed ||
                                                    removingAssignmentIds.includes(
                                                        assignment.id,
                                                    )
                                                }
                                                className="h-8 w-8 p-0"
                                            >
                                                <XCircle className="h-4 w-4 text-rose-500" />
                                            </Button>
                                        </div>

                                        <div className="mt-3 grid gap-3">
                                            <div>
                                                <div className="mb-1 text-xs font-medium text-slate-500">
                                                    Table
                                                </div>
                                                <SearchableDropdown
                                                    value={
                                                        tableDrafts[
                                                            assignment.id
                                                        ] ??
                                                        String(
                                                            assignment.table_id,
                                                        )
                                                    }
                                                    onValueChange={(v) => {
                                                        setTableDrafts(
                                                            (prev) => ({
                                                                ...prev,
                                                                [assignment.id]:
                                                                    v,
                                                            }),
                                                        );
                                                        reassignToTable(
                                                            assignment.id,
                                                            v,
                                                        );
                                                    }}
                                                    placeholder="Table"
                                                    searchPlaceholder="Search tables..."
                                                    emptyText="No tables."
                                                    disabled={isEventClosed}
                                                    buttonClassName="h-9 text-xs"
                                                    items={tables.map(
                                                        (table) => {
                                                            const left =
                                                                table.capacity -
                                                                table.assigned_count;
                                                            return {
                                                                value: String(
                                                                    table.id,
                                                                ),
                                                                label: table.table_number,
                                                                description:
                                                                    left > 0
                                                                        ? `${left} seats left`
                                                                        : 'Full',
                                                            };
                                                        },
                                                    )}
                                                />
                                            </div>
                                            <div>
                                                <div className="mb-1 text-xs font-medium text-slate-500">
                                                    Seat
                                                </div>
                                                <SearchableDropdown
                                                    value={
                                                        seatDrafts[
                                                            assignment.id
                                                        ] ??
                                                        String(
                                                            assignment.seat_number,
                                                        )
                                                    }
                                                    onValueChange={(v) => {
                                                        setSeatDrafts(
                                                            (prev) => ({
                                                                ...prev,
                                                                [assignment.id]:
                                                                    v,
                                                            }),
                                                        );
                                                        updateAssignmentSeat(
                                                            assignment.id,
                                                            v,
                                                        );
                                                    }}
                                                    placeholder="Seat"
                                                    searchPlaceholder="Search seats..."
                                                    emptyText="No seats."
                                                    disabled={isEventClosed}
                                                    buttonClassName="h-9 text-xs"
                                                    items={seatItemsForTable(
                                                        assignment.table_id,
                                                        assignment.id,
                                                    )}
                                                />
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="secondary">
                                                    {assignment.participant
                                                        ?.user_type?.name ??
                                                        'Unassigned role'}
                                                </Badge>
                                                <span className="text-xs text-slate-500">
                                                    {formatDateTime(
                                                        assignment.assigned_at,
                                                    )}
                                                </span>
                                            </div>
                                            {isExpanded &&
                                                assignment.participant && (
                                                    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/50">
                                                        {renderParticipantDetailsPanel(
                                                            assignment.participant,
                                                        )}
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                );
                            })}

                            {paginatedData.pagedUnassigned.map(
                                (participant) => {
                                    const rowKey = `unassigned-${participant.id}`;
                                    const isExpanded =
                                        expandedRowIds.has(rowKey);
                                    const assignmentDraft =
                                        participantAssignmentDrafts[
                                            participant.id
                                        ] ?? {
                                            tableId: '',
                                            seatNumber: '',
                                        };
                                    const draftTable = assignmentDraft.tableId
                                        ? tableById.get(
                                              Number(assignmentDraft.tableId),
                                          )
                                        : null;
                                    const draftOccupiedSeats = draftTable
                                        ? assignmentsByTableId.get(
                                              draftTable.id,
                                          )
                                        : null;

                                    return (
                                        <div
                                            key={rowKey}
                                            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                                        >
                                            <button
                                                type="button"
                                                className="flex w-full min-w-0 items-start gap-2 text-left"
                                                onClick={() =>
                                                    toggleRowExpand(rowKey)
                                                }
                                            >
                                                <ChevronDown
                                                    className={cn(
                                                        'mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                                                        isExpanded &&
                                                            'rotate-180',
                                                    )}
                                                />
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                                        {participant.full_name}
                                                    </span>
                                                    <span className="block text-xs text-slate-500">
                                                        {participantPositionLabel(
                                                            participant,
                                                        )}
                                                    </span>
                                                </span>
                                            </button>

                                            <div className="mt-3 grid gap-3">
                                                <div>
                                                    <div className="mb-1 text-xs font-medium text-slate-500">
                                                        Table
                                                    </div>
                                                    <SearchableDropdown
                                                        value={
                                                            assignmentDraft.tableId
                                                        }
                                                        onValueChange={(v) => {
                                                            setParticipantAssignmentDrafts(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [participant.id]:
                                                                        {
                                                                            tableId:
                                                                                v,
                                                                            seatNumber:
                                                                                '',
                                                                        },
                                                                }),
                                                            );
                                                        }}
                                                        placeholder="Select table"
                                                        searchPlaceholder="Search tables..."
                                                        emptyText="No tables."
                                                        disabled={isEventClosed}
                                                        buttonClassName="h-9 text-xs"
                                                        items={tables.map(
                                                            (table) => {
                                                                const left =
                                                                    table.capacity -
                                                                    table.assigned_count;
                                                                return {
                                                                    value: String(
                                                                        table.id,
                                                                    ),
                                                                    label: table.table_number,
                                                                    description:
                                                                        left > 0
                                                                            ? `${left} seats left`
                                                                            : 'Full',
                                                                    disabled:
                                                                        left <=
                                                                        0,
                                                                };
                                                            },
                                                        )}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="mb-1 text-xs font-medium text-slate-500">
                                                        Seat
                                                    </div>
                                                    <SearchableDropdown
                                                        value={
                                                            assignmentDraft.seatNumber
                                                        }
                                                        onValueChange={(v) =>
                                                            setParticipantAssignmentDrafts(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [participant.id]:
                                                                        {
                                                                            tableId:
                                                                                assignmentDraft.tableId,
                                                                            seatNumber:
                                                                                v,
                                                                        },
                                                                }),
                                                            )
                                                        }
                                                        placeholder="Auto"
                                                        searchPlaceholder="Search seats..."
                                                        emptyText="No seats."
                                                        disabled={
                                                            isEventClosed ||
                                                            !draftTable
                                                        }
                                                        buttonClassName="h-9 text-xs"
                                                        items={
                                                            draftTable
                                                                ? [
                                                                      {
                                                                          value: '',
                                                                          label: 'Auto',
                                                                          description:
                                                                              'Next open seat',
                                                                      },
                                                                      ...Array.from(
                                                                          {
                                                                              length: draftTable.capacity,
                                                                          },
                                                                          (
                                                                              _,
                                                                              index,
                                                                          ) => {
                                                                              const seatNumber =
                                                                                  index +
                                                                                  1;
                                                                              const occupant =
                                                                                  draftOccupiedSeats?.get(
                                                                                      seatNumber,
                                                                                  );

                                                                              return {
                                                                                  value: String(
                                                                                      seatNumber,
                                                                                  ),
                                                                                  label: `Seat ${seatNumber}`,
                                                                                  description:
                                                                                      occupant
                                                                                          ?.participant
                                                                                          ?.full_name ??
                                                                                      'Empty',
                                                                                  disabled:
                                                                                      Boolean(
                                                                                          occupant,
                                                                                      ),
                                                                              };
                                                                          },
                                                                      ),
                                                                  ]
                                                                : []
                                                        }
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <Badge variant="secondary">
                                                        {participant.user_type
                                                            ?.name ??
                                                            'Unassigned role'}
                                                    </Badge>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={
                                                            isEventClosed ||
                                                            !assignmentDraft.tableId
                                                        }
                                                        onClick={() =>
                                                            assignParticipantToTable(
                                                                participant.id,
                                                                assignmentDraft.tableId,
                                                                assignmentDraft.seatNumber,
                                                            )
                                                        }
                                                    >
                                                        Assign
                                                    </Button>
                                                </div>
                                                {isExpanded && (
                                                    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/50">
                                                        {renderParticipantDetailsPanel(
                                                            participant,
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                },
                            )}
                        </>
                    )}
                </div>

                {/* All assignments table */}
                <div className="hidden overflow-x-auto rounded-lg border border-slate-200 lg:block dark:border-slate-800">
                    <Table className="min-w-[900px]">
                        <TableHeader>
                            <TableRow className="bg-slate-50 dark:bg-slate-900/40">
                                <TableHead>Participant</TableHead>
                                <TableHead className="w-[180px]">
                                    Table
                                </TableHead>
                                <TableHead className="w-[140px]">
                                    Seat
                                </TableHead>
                                <TableHead className="w-[140px]">
                                    Role
                                </TableHead>
                                <TableHead className="w-[180px]">
                                    Assigned at
                                </TableHead>
                                <TableHead className="w-[110px] text-right">
                                    Action
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {totalFilteredRows === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="py-6 text-center text-sm text-slate-500"
                                    >
                                        {searchQuery || tableFilter !== 'all'
                                            ? 'No participants match your search or filter.'
                                            : 'No participants for this event.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                <>
                                    {/* Assigned participants */}
                                    {paginatedData.pagedAssigned.map(
                                        (assignment) => {
                                            const rowKey = `assigned-${assignment.id}`;
                                            const isExpanded =
                                                expandedRowIds.has(rowKey);
                                            return (
                                                <React.Fragment key={rowKey}>
                                                    <TableRow
                                                        className={cn(
                                                            'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40',
                                                            isExpanded &&
                                                                'border-b-0',
                                                        )}
                                                        onClick={() =>
                                                            toggleRowExpand(
                                                                rowKey,
                                                            )
                                                        }
                                                    >
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <ChevronDown
                                                                    className={cn(
                                                                        'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                                                                        isExpanded &&
                                                                            'rotate-180',
                                                                    )}
                                                                />
                                                                <div className="min-w-0">
                                                                    <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                                                                        {assignment
                                                                            .participant
                                                                            ?.full_name ??
                                                                            'Participant removed'}
                                                                    </div>
                                                                    <div className="text-xs text-slate-500">
                                                                        {participantPositionLabel(
                                                                            assignment.participant,
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            <SearchableDropdown
                                                                value={
                                                                    tableDrafts[
                                                                        assignment
                                                                            .id
                                                                    ] ??
                                                                    String(
                                                                        assignment.table_id,
                                                                    )
                                                                }
                                                                onValueChange={(
                                                                    v,
                                                                ) => {
                                                                    setTableDrafts(
                                                                        (
                                                                            prev,
                                                                        ) => ({
                                                                            ...prev,
                                                                            [assignment.id]:
                                                                                v,
                                                                        }),
                                                                    );
                                                                    reassignToTable(
                                                                        assignment.id,
                                                                        v,
                                                                    );
                                                                }}
                                                                placeholder="Table"
                                                                searchPlaceholder="Search tables..."
                                                                emptyText="No tables."
                                                                disabled={
                                                                    isEventClosed
                                                                }
                                                                buttonClassName="h-8 text-xs"
                                                                items={tables.map(
                                                                    (table) => {
                                                                        const left =
                                                                            table.capacity -
                                                                            table.assigned_count;
                                                                        return {
                                                                            value: String(
                                                                                table.id,
                                                                            ),
                                                                            label: table.table_number,
                                                                            description:
                                                                                left >
                                                                                0
                                                                                    ? `${left} seats left`
                                                                                    : 'Full',
                                                                        };
                                                                    },
                                                                )}
                                                            />
                                                        </TableCell>
                                                        <TableCell
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            <SearchableDropdown
                                                                value={
                                                                    seatDrafts[
                                                                        assignment
                                                                            .id
                                                                    ] ??
                                                                    String(
                                                                        assignment.seat_number,
                                                                    )
                                                                }
                                                                onValueChange={(
                                                                    v,
                                                                ) => {
                                                                    setSeatDrafts(
                                                                        (
                                                                            prev,
                                                                        ) => ({
                                                                            ...prev,
                                                                            [assignment.id]:
                                                                                v,
                                                                        }),
                                                                    );
                                                                    updateAssignmentSeat(
                                                                        assignment.id,
                                                                        v,
                                                                    );
                                                                }}
                                                                placeholder="Seat"
                                                                searchPlaceholder="Search seats..."
                                                                emptyText="No seats."
                                                                disabled={
                                                                    isEventClosed
                                                                }
                                                                buttonClassName="h-8 text-xs"
                                                                items={seatItemsForTable(
                                                                    assignment.table_id,
                                                                    assignment.id,
                                                                )}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="secondary">
                                                                {assignment
                                                                    .participant
                                                                    ?.user_type
                                                                    ?.name ??
                                                                    'Unassigned role'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-slate-700 dark:text-slate-300">
                                                            {formatDateTime(
                                                                assignment.assigned_at,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={(
                                                                    e,
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    removeAssignment(
                                                                        assignment.id,
                                                                    );
                                                                }}
                                                                aria-label="Remove participant"
                                                                disabled={
                                                                    isEventClosed ||
                                                                    removingAssignmentIds.includes(
                                                                        assignment.id,
                                                                    )
                                                                }
                                                            >
                                                                <XCircle className="h-4 w-4 text-rose-500" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                    {isExpanded &&
                                                        assignment.participant &&
                                                        renderExpandedDetail(
                                                            assignment.participant,
                                                        )}
                                                </React.Fragment>
                                            );
                                        },
                                    )}

                                    {/* Unassigned participants */}
                                    {paginatedData.pagedUnassigned.map(
                                        (participant) => {
                                            const rowKey = `unassigned-${participant.id}`;
                                            const isExpanded =
                                                expandedRowIds.has(rowKey);
                                            const assignmentDraft =
                                                participantAssignmentDrafts[
                                                    participant.id
                                                ] ?? {
                                                    tableId: '',
                                                    seatNumber: '',
                                                };
                                            const draftTable =
                                                assignmentDraft.tableId
                                                    ? tableById.get(
                                                          Number(
                                                              assignmentDraft.tableId,
                                                          ),
                                                      )
                                                    : null;
                                            const draftOccupiedSeats =
                                                draftTable
                                                    ? assignmentsByTableId.get(
                                                          draftTable.id,
                                                      )
                                                    : null;
                                            return (
                                                <React.Fragment key={rowKey}>
                                                    <TableRow
                                                        className={cn(
                                                            'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40',
                                                            isExpanded &&
                                                                'border-b-0',
                                                        )}
                                                        onClick={() =>
                                                            toggleRowExpand(
                                                                rowKey,
                                                            )
                                                        }
                                                    >
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <ChevronDown
                                                                    className={cn(
                                                                        'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                                                                        isExpanded &&
                                                                            'rotate-180',
                                                                    )}
                                                                />
                                                                <div className="min-w-0">
                                                                    <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                                                                        {
                                                                            participant.full_name
                                                                        }
                                                                    </div>
                                                                    <div className="text-xs text-slate-500">
                                                                        {participantPositionLabel(
                                                                            participant,
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            <SearchableDropdown
                                                                value={
                                                                    assignmentDraft.tableId
                                                                }
                                                                onValueChange={(
                                                                    v,
                                                                ) => {
                                                                    setParticipantAssignmentDrafts(
                                                                        (
                                                                            prev,
                                                                        ) => ({
                                                                            ...prev,
                                                                            [participant.id]:
                                                                                {
                                                                                    tableId:
                                                                                        v,
                                                                                    seatNumber:
                                                                                        '',
                                                                                },
                                                                        }),
                                                                    );
                                                                }}
                                                                placeholder="Select table"
                                                                searchPlaceholder="Search tables..."
                                                                emptyText="No tables."
                                                                disabled={
                                                                    isEventClosed
                                                                }
                                                                buttonClassName="h-8 text-xs"
                                                                items={tables.map(
                                                                    (table) => {
                                                                        const left =
                                                                            table.capacity -
                                                                            table.assigned_count;
                                                                        return {
                                                                            value: String(
                                                                                table.id,
                                                                            ),
                                                                            label: table.table_number,
                                                                            description:
                                                                                left >
                                                                                0
                                                                                    ? `${left} seats left`
                                                                                    : 'Full',
                                                                            disabled:
                                                                                left <=
                                                                                0,
                                                                        };
                                                                    },
                                                                )}
                                                            />
                                                        </TableCell>
                                                        <TableCell
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            <SearchableDropdown
                                                                value={
                                                                    assignmentDraft.seatNumber
                                                                }
                                                                onValueChange={(
                                                                    v,
                                                                ) =>
                                                                    setParticipantAssignmentDrafts(
                                                                        (
                                                                            prev,
                                                                        ) => ({
                                                                            ...prev,
                                                                            [participant.id]:
                                                                                {
                                                                                    tableId:
                                                                                        assignmentDraft.tableId,
                                                                                    seatNumber:
                                                                                        v,
                                                                                },
                                                                        }),
                                                                    )
                                                                }
                                                                placeholder="Auto"
                                                                searchPlaceholder="Search seats..."
                                                                emptyText="No seats."
                                                                disabled={
                                                                    isEventClosed ||
                                                                    !draftTable
                                                                }
                                                                buttonClassName="h-8 text-xs"
                                                                items={
                                                                    draftTable
                                                                        ? [
                                                                              {
                                                                                  value: '',
                                                                                  label: 'Auto',
                                                                                  description:
                                                                                      'Next open seat',
                                                                              },
                                                                              ...Array.from(
                                                                                  {
                                                                                      length: draftTable.capacity,
                                                                                  },
                                                                                  (
                                                                                      _,
                                                                                      index,
                                                                                  ) => {
                                                                                      const seatNumber =
                                                                                          index +
                                                                                          1;
                                                                                      const occupant =
                                                                                          draftOccupiedSeats?.get(
                                                                                              seatNumber,
                                                                                          );

                                                                                      return {
                                                                                          value: String(
                                                                                              seatNumber,
                                                                                          ),
                                                                                          label: `Seat ${seatNumber}`,
                                                                                          description:
                                                                                              occupant
                                                                                                  ?.participant
                                                                                                  ?.full_name ??
                                                                                              'Empty',
                                                                                          disabled:
                                                                                              Boolean(
                                                                                                  occupant,
                                                                                              ),
                                                                                      };
                                                                                  },
                                                                              ),
                                                                          ]
                                                                        : []
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="secondary">
                                                                {participant
                                                                    .user_type
                                                                    ?.name ??
                                                                    'Unassigned role'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="text-xs text-slate-400">
                                                                —
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={
                                                                    isEventClosed ||
                                                                    !assignmentDraft.tableId
                                                                }
                                                                onClick={(
                                                                    e,
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    assignParticipantToTable(
                                                                        participant.id,
                                                                        assignmentDraft.tableId,
                                                                        assignmentDraft.seatNumber,
                                                                    );
                                                                }}
                                                            >
                                                                Assign
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                    {isExpanded &&
                                                        renderExpandedDetail(
                                                            participant,
                                                        )}
                                                </React.Fragment>
                                            );
                                        },
                                    )}
                                </>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Page navigation */}
                {totalFilteredRows > 0 && (
                    <div className="flex items-center gap-1 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={safePage <= 1}
                            onClick={() =>
                                setCurrentPage((p) => Math.max(1, p - 1))
                            }
                            className="h-8 gap-1 px-2.5 text-xs"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Previous
                        </Button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter((p) => {
                                if (totalPages <= 5) return true;
                                return (
                                    p === 1 ||
                                    p === totalPages ||
                                    Math.abs(p - safePage) <= 1
                                );
                            })
                            .reduce<(number | 'ellipsis')[]>(
                                (acc, p, idx, arr) => {
                                    if (
                                        idx > 0 &&
                                        p - (arr[idx - 1] as number) > 1
                                    )
                                        acc.push('ellipsis');
                                    acc.push(p);
                                    return acc;
                                },
                                [],
                            )
                            .map((item, idx) =>
                                item === 'ellipsis' ? (
                                    <span
                                        key={`ellipsis-${idx}`}
                                        className="px-1.5 text-xs text-slate-400"
                                    >
                                        ...
                                    </span>
                                ) : (
                                    <Button
                                        key={item}
                                        type="button"
                                        variant={
                                            item === safePage
                                                ? 'default'
                                                : 'outline'
                                        }
                                        size="sm"
                                        onClick={() => setCurrentPage(item)}
                                        className={cn(
                                            'h-8 min-w-[32px] px-2.5 text-xs',
                                            item === safePage && PRIMARY_BTN,
                                        )}
                                    >
                                        {item}
                                    </Button>
                                ),
                            )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={safePage >= totalPages}
                            onClick={() =>
                                setCurrentPage((p) =>
                                    Math.min(totalPages, p + 1),
                                )
                            }
                            className="h-8 gap-1 px-2.5 text-xs"
                        >
                            Next
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Table Assignment" />
            {printingSeatPlan ? (
                <>
                    <style>{`
                        @media print {
                            @page { size: A4 landscape; margin: 12mm; }
                            body * { visibility: hidden !important; }
                            #seat-plan-print-root,
                            #seat-plan-print-root * {
                                visibility: visible !important;
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                            #seat-plan-print-root {
                                display: block !important;
                                position: absolute !important;
                                inset: 0 !important;
                                width: 100% !important;
                                min-height: 100% !important;
                                padding: 0 0 10mm !important;
                                background: white !important;
                                color: #0f172a !important;
                            }
                            #seat-plan-print-root .dark\\:text-slate-100,
                            #seat-plan-print-root .dark\\:text-slate-200,
                            #seat-plan-print-root .dark\\:text-slate-400 {
                                color: inherit !important;
                            }
                            #seat-plan-print-root .dark\\:border-slate-800 {
                                border-color: #e2e8f0 !important;
                            }
                            #seat-plan-print-root .dark\\:bg-slate-900\\/40,
                            #seat-plan-print-root .dark\\:bg-slate-950 {
                                background: white !important;
                            }
                            #seat-plan-print-root > div {
                                break-inside: avoid;
                                page-break-inside: avoid;
                            }
                            #seat-plan-print-footer {
                                break-inside: avoid;
                                page-break-inside: avoid;
                            }
                            #seat-plan-print-root .min-h-14 {
                                break-inside: avoid;
                                page-break-inside: avoid;
                            }
                        }
                    `}</style>
                    <div
                        id="seat-plan-print-root"
                        className="hidden bg-white text-slate-900"
                    >
                        {renderSeatingPlan(true)}
                    </div>
                </>
            ) : null}

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-hidden rounded-xl p-4">
                <div className="space-y-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <TableIcon className="h-5 w-5 text-[#00359c]" />
                                <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                    {isChedAdmin && chedView === 'create'
                                        ? 'Table Management'
                                        : 'Table Assignment'}
                                </h1>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {isChedAdmin && chedView === 'create'
                                    ? 'Create tables, set capacities, and review seating plans.'
                                    : 'Assign participants to tables, manage capacities, and track seating.'}
                            </p>
                        </div>
                    </div>
                </div>

                {isChedAdmin ? (
                    chedView === 'assignment' ? (
                        <>
                            <div className="grid gap-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">
                                            Event Filter
                                        </CardTitle>
                                        <CardDescription>
                                            Filter assignments by event.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="grid gap-3 md:grid-cols-[260px,1fr] md:items-center">
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    Event{' '}
                                                    <span className="text-[11px] font-semibold text-red-600">
                                                        {' '}
                                                        *
                                                    </span>
                                                </label>
                                                <SearchableDropdown
                                                    value={selectedEventId}
                                                    onValueChange={(v) =>
                                                        setSelectedEventId(
                                                            v === 'none'
                                                                ? ''
                                                                : v,
                                                        )
                                                    }
                                                    placeholder="Select event"
                                                    searchPlaceholder="Search events..."
                                                    emptyText="No events found."
                                                    disabled={
                                                        events.length === 0
                                                    }
                                                    items={
                                                        events.length === 0
                                                            ? [
                                                                  {
                                                                      value: 'none',
                                                                      label: 'No events available',
                                                                      disabled: true,
                                                                  },
                                                              ]
                                                            : [
                                                                  {
                                                                      value: '',
                                                                      label: 'Clear selection',
                                                                  },
                                                                  ...events.map(
                                                                      (
                                                                          event,
                                                                      ) => {
                                                                          const phase =
                                                                              resolveEventPhase(
                                                                                  event,
                                                                                  currentTimestamp,
                                                                              );
                                                                          const when =
                                                                              event.starts_at
                                                                                  ? formatDateTime(
                                                                                        event.starts_at,
                                                                                    )
                                                                                  : 'Schedule TBA';
                                                                          return {
                                                                              value: String(
                                                                                  event.id,
                                                                              ),
                                                                              label: event.title,
                                                                              description: `${phaseLabel(phase)} • ${when}`,
                                                                          };
                                                                      },
                                                                  ),
                                                              ]
                                                    }
                                                />
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                                {selectedEventId ? (
                                                    (() => {
                                                        if (!selectedEvent) {
                                                            return (
                                                                <span className="text-slate-500">
                                                                    Event
                                                                    details
                                                                    unavailable.
                                                                </span>
                                                            );
                                                        }
                                                        const phase =
                                                            selectedEventPhase ??
                                                            'closed';
                                                        return (
                                                            <>
                                                                <Badge
                                                                    className={phaseBadgeClass(
                                                                        phase,
                                                                    )}
                                                                >
                                                                    {phaseLabel(
                                                                        phase,
                                                                    )}
                                                                </Badge>
                                                                <span className="text-slate-500">
                                                                    {selectedEvent.starts_at
                                                                        ? formatDateTime(
                                                                              selectedEvent.starts_at,
                                                                          )
                                                                        : 'Schedule TBA'}
                                                                </span>
                                                            </>
                                                        );
                                                    })()
                                                ) : (
                                                    <span className="text-slate-500">
                                                        Choose an event to load
                                                        tables and participants.
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isEventClosed ? (
                                            <p className="text-sm text-rose-600">
                                                Table assignments are locked
                                                because this event is closed.
                                            </p>
                                        ) : null}
                                    </CardContent>
                                </Card>
                                {assignParticipantsCard}
                            </div>
                        </>
                    ) : (
                        <div className="grid gap-6">
                            {eventContextCard}
                            {createTableCard}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">
                                        Created tables
                                    </CardTitle>
                                    <CardDescription>
                                        Review existing tables for the selected
                                        event.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3 md:hidden">
                                        {tables.length === 0 ? (
                                            <div className="rounded-lg border border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800">
                                                No tables created yet.
                                            </div>
                                        ) : (
                                            tables.map((table) => (
                                                <div
                                                    key={table.id}
                                                    className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                                                >
                                                    <div className="grid gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-medium text-slate-500">
                                                                Table name
                                                            </label>
                                                            <Input
                                                                value={
                                                                    tableNumberDrafts[
                                                                        table.id
                                                                    ] ?? ''
                                                                }
                                                                onChange={(e) =>
                                                                    setTableNumberDrafts(
                                                                        (
                                                                            prev,
                                                                        ) => ({
                                                                            ...prev,
                                                                            [table.id]:
                                                                                e
                                                                                    .target
                                                                                    .value,
                                                                        }),
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-medium text-slate-500">
                                                                Capacity
                                                            </label>
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                value={
                                                                    capacityDrafts[
                                                                        table.id
                                                                    ] ?? ''
                                                                }
                                                                onChange={(e) =>
                                                                    setCapacityDrafts(
                                                                        (
                                                                            prev,
                                                                        ) => ({
                                                                            ...prev,
                                                                            [table.id]:
                                                                                e
                                                                                    .target
                                                                                    .value,
                                                                        }),
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                onClick={() =>
                                                                    updateTableInfo(
                                                                        table.id,
                                                                    )
                                                                }
                                                            >
                                                                Update
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                className="text-rose-600 hover:text-rose-700"
                                                                onClick={() =>
                                                                    removeTable(
                                                                        table.id,
                                                                    )
                                                                }
                                                            >
                                                                Delete
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block dark:border-slate-800">
                                        <Table className="min-w-[620px]">
                                            <TableHeader>
                                                <TableRow className="bg-slate-50 dark:bg-slate-900/40">
                                                    <TableHead>
                                                        Table name
                                                    </TableHead>
                                                    <TableHead className="w-[160px]">
                                                        Capacity
                                                    </TableHead>
                                                    <TableHead className="w-[220px] text-right">
                                                        Actions
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {tables.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell
                                                            colSpan={3}
                                                            className="py-6 text-center text-sm text-slate-500"
                                                        >
                                                            No tables created
                                                            yet.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    tables.map((table) => (
                                                        <TableRow
                                                            key={table.id}
                                                        >
                                                            <TableCell>
                                                                <Input
                                                                    value={
                                                                        tableNumberDrafts[
                                                                            table
                                                                                .id
                                                                        ] ?? ''
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        setTableNumberDrafts(
                                                                            (
                                                                                prev,
                                                                            ) => ({
                                                                                ...prev,
                                                                                [table.id]:
                                                                                    e
                                                                                        .target
                                                                                        .value,
                                                                            }),
                                                                        )
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Input
                                                                    type="number"
                                                                    min={1}
                                                                    value={
                                                                        capacityDrafts[
                                                                            table
                                                                                .id
                                                                        ] ?? ''
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        setCapacityDrafts(
                                                                            (
                                                                                prev,
                                                                            ) => ({
                                                                                ...prev,
                                                                                [table.id]:
                                                                                    e
                                                                                        .target
                                                                                        .value,
                                                                            }),
                                                                        )
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex flex-wrap justify-end gap-2">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        onClick={() =>
                                                                            updateTableInfo(
                                                                                table.id,
                                                                            )
                                                                        }
                                                                    >
                                                                        Update
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        className="text-rose-600 hover:text-rose-700"
                                                                        onClick={() =>
                                                                            removeTable(
                                                                                table.id,
                                                                            )
                                                                        }
                                                                    >
                                                                        Delete
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )
                ) : (
                    <>
                        <div className="grid gap-6">
                            {eventContextCard}
                            {createTableCard}
                            {assignParticipantsCard}
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
