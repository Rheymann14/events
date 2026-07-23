import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import {
    AlignLeft,
    ArrowDown,
    ArrowUp,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronsUpDown,
    CircleDot,
    Eye,
    FileText,
    Heading2,
    ListChecks,
    ListFilter,
    Mail,
    Phone,
    Plus,
    Save,
    TextCursorInput,
    Trash2,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

type FieldType =
    | 'section'
    | 'text'
    | 'textarea'
    | 'email'
    | 'tel'
    | 'date'
    | 'radio'
    | 'checkbox'
    | 'select';

type RegistrationField = {
    id?: number;
    field_key?: string | null;
    label: string;
    field_type: FieldType;
    options: string[];
    option_routes?: (string | null)[];
    placeholder?: string | null;
    help_text?: string | null;
    is_required: boolean;
    sort_order: number;
};

type PageProps = {
    programme: {
        id: number;
        title: string;
        registration_fields: RegistrationField[];
    };
};

const FIELD_TYPES: {
    value: FieldType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}[] = [
    { value: 'section', label: 'Section header', icon: Heading2 },
    { value: 'text', label: 'Short text', icon: TextCursorInput },
    { value: 'textarea', label: 'Long text', icon: AlignLeft },
    { value: 'email', label: 'Email address', icon: Mail },
    { value: 'tel', label: 'Phone number', icon: Phone },
    { value: 'date', label: 'Date picker', icon: CalendarDays },
    { value: 'radio', label: 'Single choice (radio)', icon: CircleDot },
    {
        value: 'checkbox',
        label: 'Multiple choice (checkboxes)',
        icon: ListChecks,
    },
    { value: 'select', label: 'Dropdown list', icon: ListFilter },
];

function FieldTypeDisplay({ fieldType }: { fieldType: FieldType }) {
    const type =
        FIELD_TYPES.find((option) => option.value === fieldType) ??
        FIELD_TYPES[0];
    const Icon = type.icon;

    return (
        <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
            <span className="truncate">{type.label}</span>
        </span>
    );
}

const PRIMARY_BUTTON =
    'bg-[#00359c] text-white hover:bg-[#00359c]/90 focus-visible:ring-[#00359c]/30';

function BranchDestinationPicker({
    value,
    onValueChange,
    targets,
    optionNumber,
}: {
    value: string | null;
    onValueChange: (value: string | null) => void;
    targets: RegistrationField[];
    optionNumber: number;
}) {
    const [open, setOpen] = React.useState(false);
    const selected = targets.find((target) => target.field_key === value);
    const selectedLabel = selected
        ? `${selected.field_type === 'section' ? 'Section' : 'Question'}: ${
              selected.label.trim() || 'Untitled field'
          }`
        : 'Continue normally';

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={`Destination for option ${optionNumber}`}
                    className="h-9 w-full min-w-0 justify-between overflow-hidden px-3 font-normal"
                    title={selectedLabel}
                >
                    <span className="min-w-0 flex-1 truncate text-left">
                        {selectedLabel}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] min-w-0 p-0"
            >
                <Command className="min-w-0">
                    <CommandInput placeholder="Search destinations..." />
                    <CommandEmpty>No destination found.</CommandEmpty>
                    <CommandList className="max-h-72 min-w-0">
                        <CommandGroup>
                            <CommandItem
                                value="Continue normally"
                                onSelect={() => {
                                    onValueChange(null);
                                    setOpen(false);
                                }}
                                className="min-w-0 items-start"
                            >
                                <Check
                                    className={cn(
                                        'mt-0.5 h-4 w-4 shrink-0',
                                        value === null
                                            ? 'opacity-100'
                                            : 'opacity-0',
                                    )}
                                />
                                <span className="min-w-0 break-words whitespace-normal">
                                    Continue normally
                                </span>
                            </CommandItem>
                            {targets.map((target) => {
                                const typeLabel =
                                    target.field_type === 'section'
                                        ? 'Section'
                                        : 'Question';
                                const label =
                                    target.label.trim() || 'Untitled field';

                                return (
                                    <CommandItem
                                        key={target.field_key}
                                        value={`${typeLabel}: ${label} ${target.field_key}`}
                                        onSelect={() => {
                                            onValueChange(target.field_key!);
                                            setOpen(false);
                                        }}
                                        className="min-w-0 items-start"
                                    >
                                        <Check
                                            className={cn(
                                                'mt-0.5 h-4 w-4 shrink-0',
                                                value === target.field_key
                                                    ? 'opacity-100'
                                                    : 'opacity-0',
                                            )}
                                        />
                                        <span className="min-w-0 break-words whitespace-normal">
                                            <span className="font-medium">
                                                {typeLabel}:
                                            </span>{' '}
                                            {label}
                                        </span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function normalize(fields: RegistrationField[]) {
    return fields.map((field, index) => ({
        ...field,
        options: Array.isArray(field.options) ? field.options : [],
        option_routes: Array.isArray(field.option_routes)
            ? field.options.map(
                  (_, optionIndex) =>
                      field.option_routes?.[optionIndex] ?? null,
              )
            : field.options.map(() => null),
        is_required:
            field.field_type === 'section' ? false : Boolean(field.is_required),
        sort_order: index,
    }));
}

function isAsemme10Title(title: string) {
    const value = title.trim().toLowerCase();

    return (
        value.includes('asemme10') ||
        value.includes('asemme 10') ||
        value.includes('asia-europe meeting of ministers for education') ||
        value.includes('10th asia-europe meeting')
    );
}

function createFieldKey() {
    return `field_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function FieldPreview({ field }: { field: RegistrationField }) {
    const label = field.label.trim() || 'Your question will appear here';
    const placeholder = field.placeholder?.trim() || 'Participant response';
    const options = field.options.length ? field.options : ['Option 1'];

    if (field.field_type === 'section') {
        return (
            <div className="border-b border-slate-200 pb-2 text-lg font-semibold break-words whitespace-pre-wrap text-slate-900 dark:border-slate-700 dark:text-slate-100">
                {field.label.trim() || 'Section title'}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="text-sm font-medium break-words whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                {label}
                {field.is_required ? (
                    <span className="ml-1 text-red-600">*</span>
                ) : null}
            </div>

            {field.field_type === 'textarea' ? (
                <Textarea
                    disabled
                    placeholder={placeholder}
                    className="min-h-24"
                />
            ) : ['radio', 'checkbox'].includes(field.field_type) ? (
                <div className="space-y-2.5">
                    {options.map((option, optionIndex) => (
                        <label
                            key={optionIndex}
                            className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300"
                        >
                            <input
                                type={field.field_type}
                                disabled
                                name={`preview-${field.id ?? label}`}
                                className="h-4 w-4"
                            />
                            {option.trim() || `Option ${optionIndex + 1}`}
                        </label>
                    ))}
                </div>
            ) : field.field_type === 'select' ? (
                <select
                    disabled
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-xs dark:border-slate-700 dark:bg-slate-950"
                >
                    <option>{placeholder}</option>
                    {options.map((option, optionIndex) => (
                        <option key={optionIndex}>
                            {option.trim() || `Option ${optionIndex + 1}`}
                        </option>
                    ))}
                </select>
            ) : (
                <Input
                    disabled
                    type={field.field_type}
                    placeholder={placeholder}
                />
            )}

            {field.help_text?.trim() ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {field.help_text}
                </p>
            ) : null}
        </div>
    );
}

export default function EventManagementRegistrationFields({
    programme,
}: PageProps) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Event Management', href: '/event-management' },
        { title: 'Registration fields', href: '#' },
    ];
    const form = useForm<{ registration_fields: RegistrationField[] }>({
        registration_fields: normalize(programme.registration_fields ?? []),
    });
    const [previewOpen, setPreviewOpen] = React.useState(false);
    const previewSteps = isAsemme10Title(programme.title)
        ? [
              {
                  title: 'Event details',
                  description: 'ASEMME10 registration details.',
              },
          ]
        : [
              {
                  title: 'Personal details',
                  description: 'Personal details.',
              },
              {
                  title: 'Contact & role',
                  description: 'Organization, contact, and registrant type.',
              },
              {
                  title: 'Event details',
                  description: 'Questions configured for the selected event.',
              },
          ];
    const previewStepIndex = previewSteps.length - 1;
    const newFieldCount = form.data.registration_fields.filter(
        (field) => !field.id,
    ).length;

    function setFields(fields: RegistrationField[]) {
        form.setData('registration_fields', normalize(fields));
    }

    function addField(fieldType: FieldType = 'text') {
        setFields([
            ...form.data.registration_fields,
            {
                field_key: createFieldKey(),
                label: '',
                field_type: fieldType,
                options: [],
                option_routes: [],
                placeholder: '',
                help_text: '',
                is_required: false,
                sort_order: form.data.registration_fields.length,
            },
        ]);
    }

    function updateField(index: number, patch: Partial<RegistrationField>) {
        setFields(
            form.data.registration_fields.map((field, fieldIndex) =>
                fieldIndex === index ? { ...field, ...patch } : field,
            ),
        );
    }

    function moveField(index: number, direction: -1 | 1) {
        const fields = [...form.data.registration_fields];
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= fields.length) return;
        [fields[index], fields[nextIndex]] = [fields[nextIndex], fields[index]];
        setFields(fields);
    }

    function removeField(index: number) {
        const removedKey = form.data.registration_fields[index].field_key;
        setFields(
            form.data.registration_fields
                .filter((_, fieldIndex) => fieldIndex !== index)
                .map((field) => ({
                    ...field,
                    option_routes: (field.option_routes ?? []).map((target) =>
                        target === removedKey ? null : target,
                    ),
                })),
        );
    }

    function addOption(fieldIndex: number) {
        const field = form.data.registration_fields[fieldIndex];
        updateField(fieldIndex, {
            options: [...field.options, ''],
            option_routes: [...(field.option_routes ?? []), null],
        });
    }

    function updateOption(
        fieldIndex: number,
        optionIndex: number,
        value: string,
    ) {
        const options = [...form.data.registration_fields[fieldIndex].options];
        options[optionIndex] = value;
        updateField(fieldIndex, { options });
    }

    function removeOption(fieldIndex: number, optionIndex: number) {
        const field = form.data.registration_fields[fieldIndex];
        updateField(fieldIndex, {
            options: field.options.filter((_, index) => index !== optionIndex),
            option_routes: (field.option_routes ?? []).filter(
                (_, index) => index !== optionIndex,
            ),
        });
    }

    function updateOptionRoute(
        fieldIndex: number,
        optionIndex: number,
        targetFieldKey: string | null,
    ) {
        const routes = [
            ...(form.data.registration_fields[fieldIndex].option_routes ?? []),
        ];
        routes[optionIndex] = targetFieldKey;
        updateField(fieldIndex, { option_routes: routes });
    }

    function submit(event: React.FormEvent) {
        event.preventDefault();
        form.transform((data) => ({
            registration_fields: normalize(data.registration_fields).map(
                (field) => {
                    const choices = field.options
                        .map((option, optionIndex) => ({
                            option: option.trim(),
                            route: field.option_routes?.[optionIndex] ?? null,
                        }))
                        .filter((choice) => choice.option !== '');

                    return {
                        ...field,
                        label: field.label.trim(),
                        field_key: field.field_key?.trim() || null,
                        placeholder: field.placeholder?.trim() || null,
                        help_text: field.help_text?.trim() || null,
                        options: choices.map((choice) => choice.option),
                        option_routes: choices.map((choice) => choice.route),
                    };
                },
            ),
        }));
        form.patch(`/programmes/${programme.id}/registration-fields`, {
            preserveScroll: true,
            onSuccess: (page) => {
                const updatedProgramme = (page.props as unknown as PageProps)
                    .programme;
                form.setData(
                    'registration_fields',
                    normalize(updatedProgramme.registration_fields ?? []),
                );
                toast.success('Registration fields saved.');
            },
            onError: () =>
                toast.error(
                    'Please review the highlighted registration fields.',
                ),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Registration fields · ${programme.title}`} />

            <form onSubmit={submit} className="flex min-h-full flex-col">
                <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <Button
                                type="button"
                                variant="ghost"
                                className="mb-2 -ml-3"
                                onClick={() => router.get('/event-management')}
                            >
                                <ChevronLeft className="mr-1 h-4 w-4" />
                                Back to events
                            </Button>
                            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                                Registration fields
                            </h1>
                            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                                Configure the event-specific questions shown
                                after a participant selects{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                    {programme.title}
                                </span>
                                .
                            </p>
                        </div>
                    </div>
                </div>

                <main className="flex-1 bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 dark:bg-slate-900/40">
                    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <section className="min-w-0 space-y-4">
                            {form.errors.registration_fields ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                                    {form.errors.registration_fields}
                                </div>
                            ) : null}

                            {form.data.registration_fields.length ? (
                                form.data.registration_fields.map(
                                    (field, index) => {
                                        const needsOptions = [
                                            'radio',
                                            'checkbox',
                                            'select',
                                        ].includes(field.field_type);

                                        return (
                                            <article
                                                key={`${field.id ?? 'new'}-${index}`}
                                                className={`rounded-xl border bg-white p-4 shadow-sm sm:p-5 dark:bg-slate-950 ${
                                                    field.id
                                                        ? 'border-slate-200 dark:border-slate-800'
                                                        : 'border-amber-300 bg-amber-50/30 ring-1 ring-amber-100 dark:border-amber-800 dark:bg-amber-950/10 dark:ring-amber-900/50'
                                                }`}
                                            >
                                                <div className="mb-4 flex items-center justify-between gap-3">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                                                            Field {index + 1}
                                                        </span>
                                                        {field.id ? (
                                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
                                                                Saved
                                                            </span>
                                                        ) : (
                                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900">
                                                                New · unsaved
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Move field up"
                                                            disabled={
                                                                index === 0
                                                            }
                                                            onClick={() =>
                                                                moveField(
                                                                    index,
                                                                    -1,
                                                                )
                                                            }
                                                        >
                                                            <ArrowUp className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Move field down"
                                                            disabled={
                                                                index ===
                                                                form.data
                                                                    .registration_fields
                                                                    .length -
                                                                    1
                                                            }
                                                            onClick={() =>
                                                                moveField(
                                                                    index,
                                                                    1,
                                                                )
                                                            }
                                                        >
                                                            <ArrowDown className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Remove field"
                                                            className="text-red-600 hover:text-red-700"
                                                            onClick={() =>
                                                                removeField(
                                                                    index,
                                                                )
                                                            }
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                                                    <label className="space-y-1.5 text-sm font-medium">
                                                        <span>
                                                            {field.field_type ===
                                                            'section'
                                                                ? 'Section title'
                                                                : 'Question label'}
                                                        </span>
                                                        <Textarea
                                                            value={field.label}
                                                            onChange={(event) =>
                                                                updateField(
                                                                    index,
                                                                    {
                                                                        label: event
                                                                            .target
                                                                            .value,
                                                                    },
                                                                )
                                                            }
                                                            placeholder={
                                                                field.field_type ===
                                                                'section'
                                                                    ? 'e.g. Travel information'
                                                                    : 'e.g. Dietary requirements'
                                                            }
                                                            className="min-h-20 resize-y"
                                                        />
                                                    </label>
                                                    <div className="space-y-1.5 text-sm font-medium">
                                                        <span>Answer type</span>
                                                        <Select
                                                            value={
                                                                field.field_type
                                                            }
                                                            onValueChange={(
                                                                value,
                                                            ) =>
                                                                updateField(
                                                                    index,
                                                                    {
                                                                        field_type:
                                                                            value as FieldType,
                                                                        is_required:
                                                                            value ===
                                                                            'section'
                                                                                ? false
                                                                                : field.is_required,
                                                                        options:
                                                                            [
                                                                                'radio',
                                                                                'checkbox',
                                                                                'select',
                                                                            ].includes(
                                                                                value,
                                                                            )
                                                                                ? field
                                                                                      .options
                                                                                      .length
                                                                                    ? field.options
                                                                                    : [
                                                                                          '',
                                                                                      ]
                                                                                : [],
                                                                        option_routes:
                                                                            [
                                                                                'radio',
                                                                                'checkbox',
                                                                                'select',
                                                                            ].includes(
                                                                                value,
                                                                            )
                                                                                ? field
                                                                                      .options
                                                                                      .length
                                                                                    ? field.option_routes
                                                                                    : [
                                                                                          null,
                                                                                      ]
                                                                                : [],
                                                                    },
                                                                )
                                                            }
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue>
                                                                    <FieldTypeDisplay
                                                                        fieldType={
                                                                            field.field_type
                                                                        }
                                                                    />
                                                                </SelectValue>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {FIELD_TYPES.map(
                                                                    (type) => (
                                                                        <SelectItem
                                                                            key={
                                                                                type.value
                                                                            }
                                                                            value={
                                                                                type.value
                                                                            }
                                                                        >
                                                                            <FieldTypeDisplay
                                                                                fieldType={
                                                                                    type.value
                                                                                }
                                                                            />
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {field.field_type !==
                                                'section' ? (
                                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                                        <label className="space-y-1.5 text-sm font-medium">
                                                            <span>
                                                                Placeholder text{' '}
                                                                <span className="font-normal text-slate-400">
                                                                    (optional)
                                                                </span>
                                                            </span>
                                                            <Input
                                                                value={
                                                                    field.placeholder ??
                                                                    ''
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    updateField(
                                                                        index,
                                                                        {
                                                                            placeholder:
                                                                                event
                                                                                    .target
                                                                                    .value,
                                                                        },
                                                                    )
                                                                }
                                                                placeholder="Optional"
                                                            />
                                                        </label>
                                                        <label className="space-y-1.5 text-sm font-medium">
                                                            <span>
                                                                Help text{' '}
                                                                <span className="font-normal text-slate-400">
                                                                    (optional)
                                                                </span>
                                                            </span>
                                                            <Input
                                                                value={
                                                                    field.help_text ??
                                                                    ''
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    updateField(
                                                                        index,
                                                                        {
                                                                            help_text:
                                                                                event
                                                                                    .target
                                                                                    .value,
                                                                        },
                                                                    )
                                                                }
                                                                placeholder="Optional note shown below the field"
                                                            />
                                                        </label>
                                                    </div>
                                                ) : null}

                                                {needsOptions ? (
                                                    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/40">
                                                        <div className="mb-3">
                                                            <div className="text-sm font-medium">
                                                                Answer choices
                                                            </div>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                Add each choice
                                                                and optionally
                                                                send it to a
                                                                later question
                                                                or section.
                                                            </p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {field.options.map(
                                                                (
                                                                    option,
                                                                    optionIndex,
                                                                ) => (
                                                                    <div
                                                                        key={
                                                                            optionIndex
                                                                        }
                                                                        className="flex items-start gap-2"
                                                                    >
                                                                        {field.field_type ===
                                                                        'radio' ? (
                                                                            <input
                                                                                type="radio"
                                                                                disabled
                                                                                className="h-4 w-4 shrink-0"
                                                                            />
                                                                        ) : field.field_type ===
                                                                          'checkbox' ? (
                                                                            <input
                                                                                type="checkbox"
                                                                                disabled
                                                                                className="h-4 w-4 shrink-0"
                                                                            />
                                                                        ) : (
                                                                            <span className="w-4 shrink-0 text-center text-xs font-medium text-slate-400">
                                                                                {optionIndex +
                                                                                    1}
                                                                            </span>
                                                                        )}
                                                                        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_240px]">
                                                                            <Input
                                                                                value={
                                                                                    option
                                                                                }
                                                                                onChange={(
                                                                                    event,
                                                                                ) =>
                                                                                    updateOption(
                                                                                        index,
                                                                                        optionIndex,
                                                                                        event
                                                                                            .target
                                                                                            .value,
                                                                                    )
                                                                                }
                                                                                placeholder={`Option ${optionIndex + 1}`}
                                                                                aria-label={`Option ${optionIndex + 1}`}
                                                                            />
                                                                            <BranchDestinationPicker
                                                                                value={
                                                                                    field
                                                                                        .option_routes?.[
                                                                                        optionIndex
                                                                                    ] ??
                                                                                    null
                                                                                }
                                                                                onValueChange={(
                                                                                    value,
                                                                                ) =>
                                                                                    updateOptionRoute(
                                                                                        index,
                                                                                        optionIndex,
                                                                                        value,
                                                                                    )
                                                                                }
                                                                                targets={form.data.registration_fields
                                                                                    .slice(
                                                                                        index +
                                                                                            1,
                                                                                    )
                                                                                    .filter(
                                                                                        (
                                                                                            target,
                                                                                        ) =>
                                                                                            Boolean(
                                                                                                target.field_key,
                                                                                            ),
                                                                                    )}
                                                                                optionNumber={
                                                                                    optionIndex +
                                                                                    1
                                                                                }
                                                                            />
                                                                        </div>
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="shrink-0 text-slate-400 hover:text-red-600"
                                                                            aria-label={`Remove option ${optionIndex + 1}`}
                                                                            onClick={() =>
                                                                                removeOption(
                                                                                    index,
                                                                                    optionIndex,
                                                                                )
                                                                            }
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                ),
                                                            )}
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="mt-3"
                                                            onClick={() =>
                                                                addOption(index)
                                                            }
                                                        >
                                                            <Plus className="mr-2 h-4 w-4" />
                                                            Add option
                                                        </Button>
                                                    </div>
                                                ) : null}

                                                {field.field_type !==
                                                'section' ? (
                                                    <label className="mt-4 flex w-fit items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                field.is_required
                                                            }
                                                            onChange={(event) =>
                                                                updateField(
                                                                    index,
                                                                    {
                                                                        is_required:
                                                                            event
                                                                                .target
                                                                                .checked,
                                                                    },
                                                                )
                                                            }
                                                        />
                                                        Required field
                                                    </label>
                                                ) : null}
                                            </article>
                                        );
                                    },
                                )
                            ) : (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-950">
                                    <FileText className="mx-auto h-8 w-8 text-slate-400" />
                                    <h2 className="mt-3 font-semibold">
                                        No custom fields yet
                                    </h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Start by adding a question or a section
                                        header.
                                    </p>
                                    <Button
                                        type="button"
                                        className={`mt-4 ${PRIMARY_BUTTON}`}
                                        onClick={() => addField()}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add field
                                    </Button>
                                </div>
                            )}
                        </section>

                        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 dark:border-slate-800 dark:bg-slate-950">
                            <h2 className="font-semibold">
                                Add registration fields
                            </h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Core identity, account, virtual ID, and QR
                                fields remain part of the participant profile.
                            </p>
                            <div className="mt-4 grid gap-2">
                                <Button
                                    type="button"
                                    className={PRIMARY_BUTTON}
                                    onClick={() => addField()}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add question
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => addField('section')}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add section header
                                </Button>
                            </div>
                            <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                                <div>
                                    <span className="font-medium">
                                        {form.data.registration_fields.length}
                                    </span>{' '}
                                    {form.data.registration_fields.length === 1
                                        ? 'field'
                                        : 'fields'}{' '}
                                    configured
                                    {newFieldCount > 0 ? (
                                        <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                                            {newFieldCount} new unsaved{' '}
                                            {newFieldCount === 1
                                                ? 'field'
                                                : 'fields'}
                                        </div>
                                    ) : null}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPreviewOpen(true)}
                                >
                                    <Eye className="mr-1.5 h-4 w-4" />
                                    Preview
                                </Button>
                            </div>
                        </aside>
                    </div>
                </main>

                <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-950/95">
                    <div className="mx-auto flex max-w-6xl justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.get('/event-management')}
                            disabled={form.processing}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className={PRIMARY_BUTTON}
                            disabled={form.processing}
                        >
                            <Save className="mr-2 h-4 w-4" />
                            {form.processing ? 'Saving…' : 'Save fields'}
                        </Button>
                    </div>
                </div>
            </form>

            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
                    <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <DialogTitle>Registration form preview</DialogTitle>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                Preview only
                            </span>
                        </div>
                        <DialogDescription className="break-words">
                            This shows the Event details step for{' '}
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                                {programme.title}
                            </span>{' '}
                            will appear to participants.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6 dark:bg-slate-900/60">
                        <div className="sticky top-0 z-10 -mx-1 mb-5 rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                                        Step {previewStepIndex + 1} of{' '}
                                        {previewSteps.length}
                                    </p>
                                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                                        {previewSteps[previewStepIndex].title}
                                    </h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {
                                            previewSteps[previewStepIndex]
                                                .description
                                        }
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {previewSteps.map((step, index) => (
                                        <span
                                            key={step.title}
                                            title={step.title}
                                            className={
                                                index === previewStepIndex
                                                    ? 'rounded-full bg-[#0033A0] px-3 py-1 text-xs font-medium text-white'
                                                    : 'rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400'
                                            }
                                        >
                                            {index + 1}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950">
                            <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
                                <p className="text-xs font-semibold tracking-wide break-words text-slate-700 uppercase dark:text-slate-300">
                                    {programme.title}
                                </p>
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                    Event-specific registration details.
                                </p>
                            </div>

                            {form.data.registration_fields.length ? (
                                <div className="mt-5 space-y-6">
                                    {form.data.registration_fields.map(
                                        (field, index) => (
                                            <FieldPreview
                                                key={`${field.id ?? 'new'}-preview-${index}`}
                                                field={field}
                                            />
                                        ),
                                    )}
                                </div>
                            ) : (
                                <div className="px-6 py-12 text-center">
                                    <FileText className="mx-auto h-8 w-8 text-slate-400" />
                                    <p className="mt-3 text-sm text-slate-500">
                                        Add a registration field to see the form
                                        preview.
                                    </p>
                                </div>
                            )}

                            <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled
                                >
                                    Back
                                </Button>
                                <Button
                                    type="button"
                                    className={PRIMARY_BUTTON}
                                    disabled
                                >
                                    Register
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="border-t border-slate-200 px-5 py-3 dark:border-slate-800">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPreviewOpen(false)}
                        >
                            Close preview
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
