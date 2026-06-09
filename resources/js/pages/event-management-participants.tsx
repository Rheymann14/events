import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/layouts/app-layout';
import {
    buildCertificatePrintBody,
    CERTIFICATE_PRINT_STYLES,
} from '@/lib/certificates';
import printJS from '@/lib/print-js';
import { cn } from '@/lib/utils';
import { pdf as participantCertificatesPdf } from '@/routes/event-management/participants/certificates';
import { type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { CheckCircle2, ChevronLeft, Download, Users } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

type ProgrammeParticipant = {
    id: number;
    name: string;
    email?: string | null;
    display_id?: string | null;
    checked_in_at?: string | null;
};

type ProgrammeRow = {
    id: number;
    title: string;
    description: string;
    starts_at: string | null;
    ends_at: string | null;
    location?: string | null;
    venue?: {
        name: string;
        address?: string | null;
    } | null;
    signatory_name?: string | null;
    signatory_title?: string | null;
    signatory_signature_url?: string | null;
    participants?: ProgrammeParticipant[];
};

type PageProps = {
    programme: ProgrammeRow;
};

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Event Management', href: '/event-management' },
    { title: 'Participants', href: '#' },
];

function formatDateRange(starts_at?: string | null, ends_at?: string | null) {
    if (!starts_at) return '—';
    const start = new Date(starts_at);
    if (Number.isNaN(start.getTime())) return '—';
    const end = ends_at ? new Date(ends_at) : null;
    const sameDay =
        end &&
        !Number.isNaN(end.getTime()) &&
        start.toDateString() === end.toDateString();
    const date = new Intl.DateTimeFormat('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(start);
    if (!end || Number.isNaN(end.getTime()) || sameDay) {
        return date;
    }
    const endDate = new Intl.DateTimeFormat('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(end);
    return `${date} – ${endDate}`;
}

function formatGivenDate(starts_at?: string | null) {
    if (!starts_at) return '—';
    const start = new Date(starts_at);
    if (Number.isNaN(start.getTime())) return '—';
    return new Intl.DateTimeFormat('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(start);
}

function formatVenueLabel(programme: ProgrammeRow) {
    if (programme.venue?.name) {
        return programme.venue.address
            ? `${programme.venue.name}, ${programme.venue.address}`
            : programme.venue.name;
    }
    return programme.location || '—';
}

function formatDateTimeSafe(value?: string | null) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(d);
}

function formatPrintName(name?: string | null) {
    return (name ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('en-PH');
}

function basename(u: string) {
    const s = u.split('?')[0].split('#')[0];
    const parts = s.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? u;
}

function resolveSignatureUrl(signatureUrl?: string | null) {
    if (!signatureUrl) return null;
    if (signatureUrl.startsWith('http') || signatureUrl.startsWith('/'))
        return signatureUrl;
    return `/signatures/${signatureUrl}`;
}

function csrfToken() {
    return (
        document
            .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.getAttribute('content') ?? ''
    );
}

function appendHiddenInput(form: HTMLFormElement, name: string, value: string) {
    const input = document.createElement('input');

    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
}

function submitCertificatesPdfDownload(
    programmeId: number,
    signatoryName: string,
    signatoryTitle: string,
) {
    const form = document.createElement('form');
    const pdfForm = participantCertificatesPdf.form(programmeId);

    form.method = pdfForm.method;
    form.action = pdfForm.action;
    form.style.display = 'none';

    appendHiddenInput(form, '_token', csrfToken());
    appendHiddenInput(form, 'signatory_name', signatoryName);
    appendHiddenInput(form, 'signatory_title', signatoryTitle);

    document.body.appendChild(form);
    form.submit();

    window.setTimeout(() => {
        form.remove();
    }, 5000);
}

export default function EventManagementParticipants() {
    const { programme } = usePage<PageProps>().props;
    const participantsList = programme.participants ?? [];
    const checkedInCount = participantsList.filter(
        (participant) => participant.checked_in_at,
    ).length;
    const pageSizeOptions = [1, 10, 100, 1000] as const;

    const [signatoryName, setSignatoryName] = React.useState('');
    const [signatoryTitle, setSignatoryTitle] = React.useState('');
    const [signatorySignature, setSignatorySignature] = React.useState<
        string | null
    >(null);
    const [signatorySignatureLabel, setSignatorySignatureLabel] =
        React.useState<string>('');
    const [searchQuery, setSearchQuery] = React.useState('');
    const [entriesPerPage, setEntriesPerPage] = React.useState<number>(10);
    const [currentPage, setCurrentPage] = React.useState(1);
    const [isDownloadingCertificates, setIsDownloadingCertificates] =
        React.useState(false);
    const signatorySyncEnabledRef = React.useRef(false);
    const signatorySyncTimeoutRef = React.useRef<number | null>(null);

    const filteredParticipants = React.useMemo(() => {
        const query = searchQuery.trim().toLocaleLowerCase('en-PH');

        if (!query) return participantsList;

        return participantsList.filter((participant) => {
            return [participant.name, participant.email, participant.display_id]
                .filter(Boolean)
                .some((value) =>
                    String(value).toLocaleLowerCase('en-PH').includes(query),
                );
        });
    }, [participantsList, searchQuery]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredParticipants.length / entriesPerPage),
    );
    const startIndex = (currentPage - 1) * entriesPerPage;
    const paginatedParticipants = filteredParticipants.slice(
        startIndex,
        startIndex + entriesPerPage,
    );

    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, entriesPerPage]);

    React.useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    React.useEffect(() => {
        signatorySyncEnabledRef.current = false;
        const signatureUrl = resolveSignatureUrl(
            programme.signatory_signature_url,
        );

        if (signatorySignature?.startsWith('blob:')) {
            URL.revokeObjectURL(signatorySignature);
        }

        setSignatoryName(programme.signatory_name ?? '');
        setSignatoryTitle(programme.signatory_title ?? '');
        setSignatorySignature(signatureUrl);
        setSignatorySignatureLabel(signatureUrl ? basename(signatureUrl) : '');

        const enableTimeout = window.setTimeout(() => {
            signatorySyncEnabledRef.current = true;
        }, 0);

        return () => {
            window.clearTimeout(enableTimeout);
        };
    }, [
        programme.id,
        programme.signatory_name,
        programme.signatory_title,
        programme.signatory_signature_url,
    ]);

    React.useEffect(() => {
        return () => {
            if (signatorySignature?.startsWith('blob:'))
                URL.revokeObjectURL(signatorySignature);
        };
    }, [signatorySignature]);

    React.useEffect(() => {
        if (!signatorySyncEnabledRef.current) return;
        if (signatorySyncTimeoutRef.current) {
            window.clearTimeout(signatorySyncTimeoutRef.current);
        }

        signatorySyncTimeoutRef.current = window.setTimeout(() => {
            persistSignatoryData({
                name: signatoryName,
                title: signatoryTitle,
                successMessage: 'Signatory details updated.',
            });
        }, 700);

        return () => {
            if (signatorySyncTimeoutRef.current) {
                window.clearTimeout(signatorySyncTimeoutRef.current);
            }
        };
    }, [signatoryName, signatoryTitle]);

    function persistSignatoryData({
        name,
        title,
        signatureFile,
        removeSignature,
        successMessage,
    }: {
        name?: string;
        title?: string;
        signatureFile?: File | null;
        removeSignature?: boolean;
        successMessage?: string;
    }) {
        const payload = new FormData();
        payload.append('_method', 'patch');
        payload.append('signatory_name', name ?? signatoryName ?? '');
        payload.append('signatory_title', title ?? signatoryTitle ?? '');
        if (signatureFile) payload.append('signatory_signature', signatureFile);
        if (removeSignature) payload.append('signatory_signature_remove', '1');

        router.post(`/programmes/${programme.id}`, payload, {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => {
                if (successMessage) {
                    toast.success(successMessage);
                }
            },
            onError: () => toast.error('Unable to save signatory details.'),
        });
    }

    function handleSignatureUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please upload an image file for the signature.');
            return;
        }
        const previewUrl = URL.createObjectURL(file);
        setSignatorySignature((prev) => {
            if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
            return previewUrl;
        });
        setSignatorySignatureLabel(file.name);
        persistSignatoryData({ signatureFile: file });
        toast.success('Signature attached.');
    }

    function handleSignatureRemove() {
        if (signatorySignature?.startsWith('blob:')) {
            URL.revokeObjectURL(signatorySignature);
        }
        setSignatorySignature(null);
        setSignatorySignatureLabel('');
        persistSignatoryData({ removeSignature: true });
        toast.success('Signature removed.');
    }

    function printParticipantCertificates(participant: ProgrammeParticipant) {
        const html = buildCertificatePrintBody({
            data: {
                eventName: programme.title,
                eventDate: formatDateRange(
                    programme.starts_at,
                    programme.ends_at,
                ),
                givenDate: formatGivenDate(
                    programme.ends_at ?? programme.starts_at,
                ),
                venue: formatVenueLabel(programme),
                signatoryName: signatoryName,
                signatoryTitle: signatoryTitle,
                signatorySignature: signatorySignature,
            },
            participants: [
                {
                    ...participant,
                    name: formatPrintName(participant.name),
                },
            ],
        });

        if (!html.trim()) {
            toast.error('Unable to generate certificates.');
            return;
        }

        printJS({
            printable: html,
            type: 'raw-html',
            style: CERTIFICATE_PRINT_STYLES,
            documentTitle: 'Certificates',
        });
    }

    function downloadAllCertificatesPdf() {
        if (checkedInCount === 0) {
            toast.error('No checked-in participants to download.');
            return;
        }

        if (isDownloadingCertificates) return;

        try {
            setIsDownloadingCertificates(true);
            submitCertificatesPdfDownload(
                programme.id,
                signatoryName,
                signatoryTitle,
            );
            toast.success('Certificate PDF download started.');
        } catch {
            toast.error('Unable to download certificates.');
        } finally {
            window.setTimeout(() => setIsDownloadingCertificates(false), 1500);
        }
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Participants · ${programme.title}`} />
            <div className="flex h-full min-w-0 flex-1 flex-col gap-4 rounded-xl p-3 sm:p-4">
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <Users className="h-5 w-5 text-[#00359c]" />
                        <h1 className="min-w-0 text-xl font-semibold tracking-tight break-words text-slate-900 dark:text-slate-100">
                            Participants Certificates
                        </h1>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Manage signatory details and print certificates for this
                        programme.
                    </p>
                </div>

                <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold break-words text-slate-900 dark:text-slate-100">
                                {programme.title}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                {participantsList.length.toLocaleString()}{' '}
                                joined · {checkedInCount.toLocaleString()}{' '}
                                checked in
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            className="h-9 w-full sm:w-auto"
                            onClick={() => router.get('/event-management')}
                        >
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Back to events
                        </Button>
                    </div>

                    <Separator className="my-4" />

                    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="min-w-0 space-y-4">
                            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-xs sm:p-4 dark:border-slate-800 dark:bg-slate-950">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                        <div className="font-medium text-slate-700 dark:text-slate-200">
                                            Signatory name
                                        </div>
                                        <Input
                                            className="h-8 text-xs"
                                            value={signatoryName}
                                            onChange={(e) =>
                                                setSignatoryName(e.target.value)
                                            }
                                            placeholder="Signatory name"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <div className="font-medium text-slate-700 dark:text-slate-200">
                                            Signatory title
                                        </div>
                                        <Input
                                            className="h-8 text-xs"
                                            value={signatoryTitle}
                                            onChange={(e) =>
                                                setSignatoryTitle(
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Signatory title"
                                        />
                                    </div>

                                    <div className="space-y-1 sm:col-span-2">
                                        <div className="font-medium text-slate-700 dark:text-slate-200">
                                            Signature
                                        </div>

                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <Input
                                                className="h-8 min-w-0 text-xs"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleSignatureUpload}
                                            />

                                            {signatorySignature ? (
                                                <>
                                                    <div className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 sm:max-w-[260px] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                                        <span className="truncate">
                                                            {signatorySignatureLabel ||
                                                                'Signature attached'}
                                                        </span>
                                                    </div>

                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                                                        onClick={
                                                            handleSignatureRemove
                                                        }
                                                    >
                                                        Remove
                                                    </Button>

                                                    <div className="flex items-center gap-2">
                                                        <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                                                            <img
                                                                src={
                                                                    signatorySignature
                                                                }
                                                                alt="Signature preview"
                                                                className="h-8 w-auto object-contain"
                                                            />
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                            Preview
                                                        </div>
                                                    </div>
                                                </>
                                            ) : null}
                                        </div>

                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                            Upload a signature image to embed in
                                            the certificate PDF view.
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/40">
                                <div className="text-slate-600 dark:text-slate-300">
                                    Download checked-in certificates as PDF.
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 w-full px-3 text-xs sm:w-auto"
                                    onClick={downloadAllCertificatesPdf}
                                    disabled={
                                        checkedInCount === 0 ||
                                        isDownloadingCertificates
                                    }
                                >
                                    <Download className="mr-1.5 h-3.5 w-3.5" />
                                    {isDownloadingCertificates
                                        ? 'Preparing...'
                                        : 'Download PDF'}
                                </Button>
                            </div>

                            {participantsList.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
                                    No participants have joined this event yet.
                                </div>
                            ) : (
                                <div className="min-w-0 space-y-3">
                                    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950">
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-500 dark:text-slate-400">
                                                Show entries
                                            </span>
                                            <select
                                                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:ring-2 focus:ring-slate-300 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-slate-700"
                                                value={entriesPerPage}
                                                onChange={(event) =>
                                                    setEntriesPerPage(
                                                        Number(
                                                            event.target.value,
                                                        ),
                                                    )
                                                }
                                            >
                                                {pageSizeOptions.map(
                                                    (option) => (
                                                        <option
                                                            key={option}
                                                            value={option}
                                                        >
                                                            {option}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </div>
                                        <Input
                                            className="h-8 min-w-0 text-xs sm:max-w-xs"
                                            placeholder="Search participant"
                                            value={searchQuery}
                                            onChange={(event) =>
                                                setSearchQuery(
                                                    event.target.value,
                                                )
                                            }
                                        />
                                    </div>

                                    {filteredParticipants.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
                                            No participants matched your search.
                                        </div>
                                    ) : (
                                        <>
                                            <div className="min-w-0 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
                                                {paginatedParticipants.map(
                                                    (participant) => {
                                                        const checked =
                                                            !!participant.checked_in_at;

                                                        return (
                                                            <div
                                                                key={
                                                                    participant.id
                                                                }
                                                                className="flex min-w-0 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                                        {
                                                                            participant.name
                                                                        }
                                                                    </div>
                                                                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                                                        {participant.display_id ||
                                                                            participant.email ||
                                                                            '—'}
                                                                        {checked
                                                                            ? ` · Scanned ${formatDateTimeSafe(participant.checked_in_at)}`
                                                                            : ''}
                                                                    </div>
                                                                </div>

                                                                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                                                                    {checked ? (
                                                                        <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                                            Checked
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                                                            Not
                                                                            yet
                                                                        </span>
                                                                    )}

                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className={cn(
                                                                            'h-8 flex-1 px-2 text-xs sm:flex-none',
                                                                            !checked &&
                                                                                'cursor-not-allowed opacity-60',
                                                                        )}
                                                                        onClick={() =>
                                                                            printParticipantCertificates(
                                                                                participant,
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            !checked
                                                                        }
                                                                    >
                                                                        Print
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>

                                            <div className="flex flex-col items-start justify-between gap-2 text-xs text-slate-500 sm:flex-row sm:items-center dark:text-slate-400">
                                                <div>
                                                    Showing {startIndex + 1} to{' '}
                                                    {Math.min(
                                                        startIndex +
                                                            entriesPerPage,
                                                        filteredParticipants.length,
                                                    )}{' '}
                                                    of{' '}
                                                    {filteredParticipants.length.toLocaleString()}{' '}
                                                    entries
                                                </div>
                                                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 flex-1 px-2 text-xs sm:flex-none"
                                                        onClick={() =>
                                                            setCurrentPage(
                                                                (prev) =>
                                                                    Math.max(
                                                                        1,
                                                                        prev -
                                                                            1,
                                                                    ),
                                                            )
                                                        }
                                                        disabled={
                                                            currentPage === 1
                                                        }
                                                    >
                                                        Previous
                                                    </Button>
                                                    <span>
                                                        Page {currentPage} of{' '}
                                                        {totalPages}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 flex-1 px-2 text-xs sm:flex-none"
                                                        onClick={() =>
                                                            setCurrentPage(
                                                                (prev) =>
                                                                    Math.min(
                                                                        totalPages,
                                                                        prev +
                                                                            1,
                                                                    ),
                                                            )
                                                        }
                                                        disabled={
                                                            currentPage >=
                                                            totalPages
                                                        }
                                                    >
                                                        Next
                                                    </Button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Event details
                            </div>
                            <div className="mt-2 space-y-2">
                                <div>
                                    <div className="text-[11px] text-slate-400 uppercase">
                                        Event
                                    </div>
                                    <div className="text-sm font-medium break-words text-slate-800 dark:text-slate-200">
                                        {programme.title}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[11px] text-slate-400 uppercase">
                                        Date
                                    </div>
                                    <div>
                                        {formatDateRange(
                                            programme.starts_at,
                                            programme.ends_at,
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[11px] text-slate-400 uppercase">
                                        Venue
                                    </div>
                                    <div className="break-words">
                                        {formatVenueLabel(programme)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
