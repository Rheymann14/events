import AppLayout from '@/layouts/app-layout';
import { participantQrValue, renderQrDataUrl } from '@/lib/qr';
import {
    cn,
    resolveEventPhaseFromDates,
    toDateOnlyTimestamp,
} from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import jsQR from 'jsqr';
import * as React from 'react';

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
import { Separator } from '@/components/ui/separator';

import {
    Armchair,
    CalendarDays,
    Camera,
    Check,
    ChevronsUpDown,
    CircleCheckBig,
    CircleX,
    ExternalLink,
    FlipHorizontal2,
    History,
    Mail,
    MapPin,
    Maximize,
    Minimize,
    QrCode as QrCodeIcon,
    RefreshCcw,
    ScanLine,
    Search,
    ShieldCheck,
    TriangleAlert,
    UserRound,
} from 'lucide-react';

type EventRow = {
    id: number;
    title: string;
    image_url?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    is_active?: boolean;
    phase?: 'ongoing' | 'upcoming' | 'closed';
};

type ParticipantInfo = {
    id: number;
    full_name: string;

    display_id?: string | null;

    // ✅ from DB columns
    qr_payload?: string | null;
    qr_token?: string | null;
    profile_image_url?: string | null;
    country_code?: string | null;
    email?: string | null;
    country?: string | null;
    country_flag_url?: string | null;
    user_type?: string | null;
    is_verified?: boolean;
};

/** One row of the operator's confirmation feed. Kept in memory only -- the
 *  authoritative record is participant_attendances. */
/**
 * Where a participant sits at the event being scanned.
 *
 * Event-scoped rather than part of the participant's identity -- the same
 * person has a different seat at a different event -- so it travels alongside
 * `checked_in_event` rather than inside `participant`.
 */
type TableAssignmentInfo = {
    table_number: string;
    seat_number: number | null;
};

type RecentScan = {
    id: string;
    ok: boolean;
    alreadyCheckedIn: boolean;
    name: string;
    displayId: string | null;
    imageUrl: string | null;
    message: string;
    at: number;
    tableNumber: string | null;
    seatNumber: number | null;
};

type ScanResponse = {
    ok: boolean;
    message: string;

    participant?: ParticipantInfo | null;

    // ✅ backend may or may not return this
    qr_data_url?: string | null;

    registered_events?: Array<{
        id: number;
        title: string;
        starts_at?: string | null;
    }>;
    checked_in_event?: { id: number; title: string } | null;
    table_assignment?: TableAssignmentInfo | null;
    already_checked_in?: boolean;
    scanned_at?: string | null;
};

type PageProps = {
    events?: EventRow[];
    default_event_id?: number | null;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Scanner', href: '/scanner' }];

const PRIMARY_BTN =
    'bg-[#00359c] text-white hover:bg-[#00359c]/90 focus-visible:ring-[#00359c]/30 dark:bg-[#00359c] dark:hover:bg-[#00359c]/90';

const ENDPOINTS = {
    scan: '/scanner/scan',
    participants: '/scanner/participants',
};

const CAMERA_IDEAL_WIDTH = 1920;
const CAMERA_IDEAL_HEIGHT = 1080;
// Longest edge of the rasters handed to jsQR. Decode cost is linear in pixel
// count, and a 21x21 code plus its quiet zone is only 29 modules across, so
// large rasters buy nothing: at 640px a code filling a third of the frame
// still gets ~7px per module, well above the ~3 jsQR needs. Native
// BarcodeDetector still runs first against the full-resolution video.
const MAX_QR_SCAN_SIDE = 640;
// The centred crop needs even less: 29 modules over 320px is ~11px each.
const QR_ROI_MAX_SIDE = 320;
/**
 * Normalise what the operator types into the middle group of a display_id.
 *
 * Pasting a full "CHED-GCIY-OAB1" keeps only "GCIY"; anything else is
 * uppercased and stripped to the 4 characters the server resolves against.
 */
/** Matches resolveImageUrl() used by the event list and management pages. */
function resolveEventImageUrl(imageUrl?: string | null): string | null {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('http') || imageUrl.startsWith('/'))
        return imageUrl;

    return `/event-images/${imageUrl}`;
}

/**
 * "Table 7 - Seat 3" for the compact list rows.
 *
 * Returns null when there is no seating, so callers omit the line entirely --
 * in a scrolling list an absent table is not actionable, and a repeated
 * "No table" would be noise. The scan panel handles the empty case loudly
 * instead, because there it IS actionable.
 */
function formatSeating(
    seating?: { table_number: string; seat_number: number | null } | null,
): string | null {
    if (!seating) return null;

    return seating.seat_number !== null
        ? `${seating.table_number} - Seat ${seating.seat_number}`
        : seating.table_number;
}

function normalizeManualCode(value: string): string {
    const full = value
        .trim()
        .toUpperCase()
        .match(/^[A-Z0-9]+-([A-Z0-9]{4})-[A-Z0-9]+$/);

    if (full) return full[1];

    return value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4);
}

// Minimum gap between decode attempts. readQrValue() runs up to three passes
// (plus a mirrored variant each), so decoding on every animation frame pins the
// main thread and makes typing in the manual field feel laggy. ~11 attempts a
// second is well past what scanning needs and leaves the UI responsive.
const QR_SCAN_INTERVAL_MS = 120;

// Idle screen, shown only in fullscreen so windowed admin work is unaffected.
// It clears when a scan produces a result, so decoding runs at its normal rate
// underneath -- the banner is purely an overlay.
const IDLE_AFTER_MS = 10_000;
// A code is ignored for this long after it verifies. Attendance is idempotent
// server-side, so this is purely about not spamming the panel and the sounds.
const RESCAN_COOLDOWN_MS = 5_000;
// Shown when the selected event has no image of its own. Same branding asset
// the welcome email uses, so the idle screen never renders an empty box.
const IDLE_FALLBACK_IMAGE = '/img/ched_logo.png';

// Rows kept in the operator's confirmation feed.
const RECENT_SCAN_LIMIT = 20;
// Long enough that a fast typist issues one request, short enough to feel live.
const SEARCH_DEBOUNCE_MS = 250;
// Share of the shorter video edge decoded as a centred region of interest.
const QR_ROI_RATIO = 0.7;
// The contrast and mirrored passes are fallbacks, not the common path, so they
// run on a rota instead of every frame. Measured on a 1920x1080 stream, running
// all of them every frame costs ~93ms against a 90ms budget -- the decoder
// saturates the main thread whenever nobody is presenting a code, which is
// exactly when a queue forms. Sampling them keeps the capability at a fraction
// of the cost: a mirrored stream is still picked up within ~0.5s.
const CONTRAST_PASS_EVERY = 3;
const MIRROR_PASS_EVERY = 5;
const FULL_FRAME_PASS_EVERY = 2;

/**
 * Grayscale the frame and stretch its contrast, in place.
 *
 * A phone screen photographed by a webcam comes back washed out: auto exposure
 * blows the white modules out while the dark modules lift toward grey, leaving
 * jsQR too little separation to binarise reliably. Rescaling the 2nd to 98th
 * percentile luminance band back across the full range restores that
 * separation. Percentiles rather than min/max so a single glare highlight or
 * black border does not flatten the result.
 */
function enhanceScanContrast(imageData: ImageData): void {
    const data = imageData.data;
    const pixels = data.length / 4;
    const histogram = new Uint32Array(256);
    const gray = new Uint8Array(pixels);

    for (let i = 0, p = 0; p < pixels; i += 4, p++) {
        const value =
            (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        const level = value < 0 ? 0 : value > 255 ? 255 : value | 0;

        gray[p] = level;
        histogram[level]++;
    }

    const cut = Math.floor(pixels * 0.02);
    let low = 0;
    let high = 255;

    for (let sum = 0, level = 0; level < 256; level++) {
        sum += histogram[level];
        if (sum > cut) {
            low = level;
            break;
        }
    }

    for (let sum = 0, level = 255; level >= 0; level--) {
        sum += histogram[level];
        if (sum > cut) {
            high = level;
            break;
        }
    }

    const span = Math.max(1, high - low);

    for (let i = 0, p = 0; p < pixels; i += 4, p++) {
        const scaled = ((gray[p] - low) * 255) / span;
        const level = scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;

        data[i] = level;
        data[i + 1] = level;
        data[i + 2] = level;
    }
}

function getCsrfToken() {
    const el = document.querySelector(
        'meta[name="csrf-token"]',
    ) as HTMLMetaElement | null;
    if (el?.content) return el.content;
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
    if (!match) return '';
    return decodeURIComponent(match[1]);
}

function fmtDate(dateStr?: string | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
    }).format(d);
}

function fmtDateTime(dateStr?: string | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(d);
}

function resolveEventPhase(event: EventRow, now: number): EventRow['phase'] {
    return resolveEventPhaseFromDates(
        event.starts_at,
        event.ends_at,
        now,
        event.is_active ?? true,
    );
}

function isEventOpenForScanning(event: EventRow, now: number) {
    if (event.is_active === false) return false;

    const start = event.starts_at ? new Date(event.starts_at) : null;
    const end = event.ends_at ? new Date(event.ends_at) : null;
    const nowDate = new Date(now);

    if (
        end &&
        !Number.isNaN(end.getTime()) &&
        nowDate.getTime() > end.getTime()
    ) {
        return false;
    }

    if (start && !Number.isNaN(start.getTime())) {
        return toDateOnlyTimestamp(nowDate) >= toDateOnlyTimestamp(start);
    }

    return true;
}

function phaseLabel(phase?: EventRow['phase']) {
    switch (phase) {
        case 'ongoing':
            return 'Ongoing';
        case 'upcoming':
            return 'Upcoming';
        default:
            return 'Closed';
    }
}

function phaseBadgeClass(phase?: EventRow['phase']) {
    switch (phase) {
        case 'ongoing':
            return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
        case 'upcoming':
            return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200';
        default:
            return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600/30 dark:bg-slate-800/30 dark:text-slate-300';
    }
}

function Pill({
    children,
    tone = 'default',
}: {
    children: React.ReactNode;
    tone?: 'default' | 'success' | 'danger';
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                tone === 'success' &&
                    'bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                tone === 'danger' &&
                    'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
                tone === 'default' &&
                    'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
            )}
        >
            {children}
        </span>
    );
}

/**
 * ✅ IDENTICAL Landscape ID Card Preview (copied/adapted from your IdCardPreview)
 * - Keeps the exact layout, styles, and content positions
 * - Uses ScanResponse participant fields
 */
function ScannerIdCardPreview({
    participant,
    orientation,
    verifiedSuccess = false,
}: {
    participant: {
        name: string;
        display_id: string;
        qr_payload?: string | null;
        qr_token?: string | null;
        profile_image_url?: string | null;
        is_verified?: boolean;
    };
    orientation: 'portrait' | 'landscape';
    verifiedSuccess?: boolean;
}) {
    const isLandscape = orientation === 'landscape';
    const hasParticipantImage = !!participant.profile_image_url;
    const participantImageSrc =
        participant.profile_image_url ?? '/img/ched_logo.png';
    const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
    const qrValue = participantQrValue(participant);

    React.useEffect(() => {
        let active = true;
        const run = async () => {
            if (verifiedSuccess) {
                setQrDataUrl(null);
                return;
            }

            if (!qrValue) {
                setQrDataUrl(null);
                return;
            }

            try {
                const url = await renderQrDataUrl(qrValue);
                if (active) setQrDataUrl(url);
            } catch {
                if (active) setQrDataUrl(null);
            }
        };

        run();
        return () => {
            active = false;
        };
    }, [qrValue, verifiedSuccess]);

    // ✅ keep accurate print size, but DON'T force fixed aspect height on screen
    const printSize = isLandscape
        ? 'print:w-[3.37in] print:h-[2.125in]'
        : 'print:w-[3.46in] print:h-[5.51in]';

    const maxW = isLandscape
        ? 'max-w-[520px]'
        : 'max-w-[320px] sm:max-w-[360px]';

    const qrPanelWidth = isLandscape ? 'w-full min-[420px]:w-[178px]' : '';
    const qrBoxClass = isLandscape
        ? 'size-28 min-[420px]:size-[132px]'
        : 'size-[172px]';

    // ✅ slightly reduce bottom padding so it feels tighter
    const pad = isLandscape ? 'px-3 pt-3 pb-2' : 'p-4 pb-3';
    const headerLogo = isLandscape ? 'h-8 w-8' : 'h-9 w-9';

    return (
        <div
            className={cn(
                'relative mx-auto w-full overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950',
                maxW,
                'print:max-w-none',
                printSize,
            )}
        >
            {/* Background */}
            <div aria-hidden className="absolute inset-0">
                <img
                    src="/img/id-card-bg.jpg"
                    alt=""
                    className={cn(
                        'absolute inset-0 h-full w-full object-cover',
                        'brightness-80 contrast-150 saturate-200 filter',
                        'dark:brightness-80 dark:contrast-110',
                        isLandscape
                            ? 'opacity-100 dark:opacity-35'
                            : 'opacity-100 dark:opacity-30',
                    )}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                />

                <div className="absolute inset-0 bg-black/10 dark:bg-black/15" />
                <div className="absolute inset-0 bg-gradient-to-b from-white/45 via-white/20 to-white/55 dark:from-slate-950/55 dark:via-slate-950/28 dark:to-slate-950/55" />
                <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-slate-200/60 blur-3xl dark:bg-slate-800/60" />
            </div>

            <div className={cn('relative flex flex-col', pad)}>
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <img
                            src="/img/ched_logo.png"
                            alt="CHED"
                            className={cn(
                                'object-contain drop-shadow-sm',
                                headerLogo,
                            )}
                            draggable={false}
                            loading="lazy"
                        />
                        <img
                            src="/img/bagong_pilipinas.png"
                            alt="Bagong Pilipinas"
                            className={cn(
                                'object-contain drop-shadow-sm',
                                headerLogo,
                            )}
                            draggable={false}
                            loading="lazy"
                        />

                        <div className="min-w-0">
                            <div
                                className={cn(
                                    'truncate font-semibold tracking-wide text-slate-700 dark:text-slate-200',
                                    'text-[11px]',
                                )}
                            >
                                CHED Events Registration
                            </div>
                            <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                                Participant Identification
                            </div>
                        </div>
                    </div>
                </div>

                <Separator
                    className={cn(
                        'bg-slate-200/70 dark:bg-white/10',
                        isLandscape ? 'my-2' : 'my-2.5',
                    )}
                />

                {/* Body (✅ removed flex-1 so container height follows content) */}
                <div
                    className={cn(
                        'min-h-0',
                        isLandscape
                            ? 'flex flex-col gap-3 min-[420px]:grid min-[420px]:grid-cols-[1fr_178px] min-[420px]:items-start'
                            : 'flex flex-col gap-3',
                    )}
                >
                    {/* LEFT INFO */}
                    <div className="min-w-0">
                        <div className="text-[10px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                            Participant
                        </div>

                        <div
                            className={cn(
                                'mt-0.5 font-semibold tracking-tight break-words text-slate-900 dark:text-slate-100',
                                isLandscape
                                    ? 'text-sm leading-4'
                                    : 'text-lg leading-6',
                                'line-clamp-2',
                            )}
                            title={participant.name}
                        >
                            {participant.name}
                        </div>

                        <div
                            className={cn(
                                'flex items-center gap-2.5',
                                isLandscape ? 'mt-2' : 'mt-2.5',
                            )}
                        >
                            <div
                                className={cn(
                                    'overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950',
                                    'h-9 w-9',
                                )}
                            >
                                <img
                                    src={participantImageSrc}
                                    alt="Participant"
                                    className="h-full w-full object-cover"
                                    draggable={false}
                                    loading="lazy"
                                />
                            </div>

                            {isLandscape ? (
                                <div className="min-w-0">
                                    <div className="text-[10px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                                        Participant ID
                                    </div>

                                    <div className="mt-1 inline-flex max-w-full rounded-2xl border border-slate-200/70 bg-white/80 px-2.5 py-1.5 font-mono text-[10px] leading-4 break-words whitespace-normal text-slate-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/45 dark:text-slate-100">
                                        {participant.display_id}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {!isLandscape ? (
                            <div className="mt-3">
                                <div className="text-[10px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                                    Participant ID
                                </div>

                                <div className="mt-1 inline-flex max-w-full rounded-2xl border border-slate-200/70 bg-white/80 px-2.5 py-1.5 font-mono text-[11px] leading-4 break-words whitespace-normal text-slate-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/45 dark:text-slate-100">
                                    {participant.display_id}
                                </div>
                            </div>
                        ) : null}

                        <div
                            className={cn(
                                'text-[10px] text-slate-500 dark:text-slate-400',
                                isLandscape ? 'mt-1.5' : 'mt-2',
                            )}
                        >
                            Scan QR for attendance verification.
                        </div>
                    </div>

                    {/* RIGHT QR / VERIFIED PHOTO */}
                    <div
                        className={cn(
                            'flex flex-col items-center justify-center rounded-3xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/45',
                            qrPanelWidth,
                            isLandscape ? 'p-2.5' : 'p-3',
                            !isLandscape && 'mt-auto',
                        )}
                    >
                        <div
                            className={cn(
                                'inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200',
                                isLandscape
                                    ? 'mb-1 text-[10px]'
                                    : 'mb-1.5 text-[11px]',
                            )}
                        >
                            {verifiedSuccess ? (
                                <CircleCheckBig
                                    className={cn(
                                        'text-emerald-600',
                                        isLandscape ? 'h-3.5 w-3.5' : 'h-4 w-4',
                                    )}
                                />
                            ) : (
                                <QrCodeIcon
                                    className={cn(
                                        isLandscape ? 'h-3.5 w-3.5' : 'h-4 w-4',
                                    )}
                                />
                            )}
                            {verifiedSuccess ? 'Verified' : 'QR Code'}
                        </div>

                        {verifiedSuccess ? (
                            <div
                                className={cn(
                                    'relative overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-500/30 dark:bg-slate-950',
                                    qrBoxClass,
                                )}
                            >
                                <img
                                    src={participantImageSrc}
                                    alt="Participant profile"
                                    className={cn(
                                        'h-full w-full',
                                        hasParticipantImage
                                            ? 'object-cover'
                                            : 'object-contain p-4',
                                    )}
                                    draggable={false}
                                    loading="lazy"
                                />
                                <div className="absolute right-2 bottom-2 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-emerald-600 text-white shadow-sm dark:border-slate-950">
                                    <CircleCheckBig className="h-5 w-5" />
                                </div>
                            </div>
                        ) : qrDataUrl ? (
                            <img
                                src={qrDataUrl}
                                alt="Participant QR code"
                                className={cn(
                                    'rounded-2xl bg-white object-contain p-2',
                                    qrBoxClass,
                                )}
                                draggable={false}
                                loading="lazy"
                            />
                        ) : (
                            <div
                                className={cn(
                                    'flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/70 bg-white/60 text-center dark:border-white/10 dark:bg-slate-950/30',
                                    qrBoxClass,
                                )}
                            >
                                <QrCodeIcon className="h-7 w-7 text-slate-400" />
                                <div className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                    QR unavailable
                                </div>
                            </div>
                        )}

                        <div className="mt-2 w-full text-center">
                            <div
                                className={cn(
                                    'font-semibold text-slate-900 dark:text-slate-100',
                                    isLandscape ? 'text-[10px]' : 'text-[11px]',
                                )}
                            >
                                <span
                                    className="line-clamp-2"
                                    title={participant.name}
                                >
                                    {participant.name}
                                </span>
                            </div>
                            <div className="mt-1 font-mono text-[10px] break-words text-slate-500 dark:text-slate-400">
                                {participant.display_id}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** ✅ Scan sounds (no files needed) */
function useScanSounds() {
    const ctxRef = React.useRef<AudioContext | null>(null);
    const unlockedRef = React.useRef(false);

    const masterRef = React.useRef<GainNode | null>(null);
    const compRef = React.useRef<DynamicsCompressorNode | null>(null);

    const getCtx = React.useCallback(() => {
        if (typeof window === 'undefined') return null;

        const AC =
            window.AudioContext ||
            (window as WindowWithWebkitAudioContext).webkitAudioContext;
        if (!AC) return null;

        if (!ctxRef.current) ctxRef.current = new AC();
        const ctx = ctxRef.current;

        // Master chain (smooth + consistent volume)
        if (!masterRef.current || !compRef.current) {
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.setValueAtTime(-26, ctx.currentTime);
            comp.knee.setValueAtTime(16, ctx.currentTime);
            comp.ratio.setValueAtTime(10, ctx.currentTime);
            comp.attack.setValueAtTime(0.003, ctx.currentTime);
            comp.release.setValueAtTime(0.12, ctx.currentTime);

            const master = ctx.createGain();
            master.gain.setValueAtTime(0.9, ctx.currentTime);

            master.connect(comp);
            comp.connect(ctx.destination);

            masterRef.current = master;
            compRef.current = comp;
        }

        return ctx;
    }, []);

    const out = React.useCallback(() => {
        const ctx = getCtx();
        const master = masterRef.current;
        if (!ctx || !master) return null;
        return { ctx, master };
    }, [getCtx]);

    const unlock = React.useCallback(async () => {
        const ctx = getCtx();
        if (!ctx) return;

        try {
            if (ctx.state === 'suspended') await ctx.resume();
        } catch {
            // ignore
        }

        // iOS/Safari unlock with silent buffer once
        if (!unlockedRef.current) {
            try {
                const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
                const src = ctx.createBufferSource();
                src.buffer = buffer;
                src.connect(ctx.destination);
                src.start(0);
                unlockedRef.current = true;
            } catch {
                // ignore
            }
        }
    }, [getCtx]);

    // Smooth envelope (Apple-ish: soft attack + fast decay)
    const env = React.useCallback(
        (gain: GainNode, t0: number, dur: number, peak: number) => {
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(
                Math.max(0.0002, peak),
                t0 + 0.01,
            );
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        },
        [],
    );

    // Tiny “tap” (subtle, makes it feel like a real scanner trigger)
    const click = React.useCallback(
        (when = 0, strength = 0.06) => {
            const o = out();
            if (!o) return;
            const { ctx, master } = o;
            const t0 = ctx.currentTime + when;

            const dur = 0.012;
            const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
            const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++)
                data[i] = (Math.random() * 2 - 1) * 0.6;

            const src = ctx.createBufferSource();
            src.buffer = buffer;

            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(1400, t0);

            const g = ctx.createGain();
            env(g, t0, dur, strength);

            src.connect(hp);
            hp.connect(g);
            g.connect(master);

            src.start(t0);
            src.stop(t0 + dur + 0.02);
        },
        [out, env],
    );

    const tone = React.useCallback(
        (
            freq: number,
            ms: number,
            when = 0,
            peak = 0.12,
            type: OscillatorType = 'sine',
        ) => {
            const o = out();
            if (!o) return;
            const { ctx, master } = o;

            const t0 = ctx.currentTime + when;
            const dur = Math.max(0.04, ms / 1000);

            const osc = ctx.createOscillator();
            const g = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, t0);

            // slight “glassy” shimmer via very tiny detune LFO
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.frequency.setValueAtTime(10, t0);
            lfoGain.gain.setValueAtTime(3, t0); // subtle
            lfo.connect(lfoGain);
            lfoGain.connect(osc.detune);

            env(g, t0, dur, peak);

            osc.connect(g);
            g.connect(master);

            lfo.start(t0);
            osc.start(t0);
            osc.stop(t0 + dur + 0.03);
            lfo.stop(t0 + dur + 0.03);
        },
        [out, env],
    );

    const success = React.useCallback(async () => {
        await unlock();

        // ✅ Apple-like “success”: clean ascending tri-tone (clear but pleasant)
        // Notes: C6, E6, G6 (major chord)
        click(0.0, 0.05);
        tone(1046.5, 75, 0.02, 0.12, 'sine');
        tone(1318.5, 90, 0.1, 0.11, 'sine');
        tone(1568.0, 85, 0.19, 0.1, 'sine');

        // tiny sparkle
        tone(2093.0, 40, 0.28, 0.06, 'triangle');
    }, [unlock, click, tone]);

    const error = React.useCallback(async () => {
        await unlock();

        // ✅ Apple-like “error”: soft “nope” downward interval + low thud
        click(0.0, 0.04);

        // low thud (subtle)
        tone(110, 120, 0.02, 0.08, 'sine');

        // descending tones (clear rejection, not harsh)
        tone(659.3, 110, 0.06, 0.13, 'triangle'); // E5
        tone(523.3, 140, 0.16, 0.12, 'triangle'); // C5
    }, [unlock, click, tone]);

    React.useEffect(() => {
        return () => {
            try {
                ctxRef.current?.close?.();
            } catch {
                // ignore
            }
            ctxRef.current = null;
            masterRef.current = null;
            compRef.current = null;
        };
    }, []);

    return { unlock, success, error };
}

/* =========================
   ✅ QR "alignment highlight"
   - Uses BarcodeDetector if available
   - Draws detected QR outline on canvas overlay
   - Turns frame green when centered/aligned
========================= */

type DetectedBarcode = {
    rawValue?: string;
    boundingBox?: DOMRectReadOnly;
    cornerPoints?: Array<{ x: number; y: number }>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
    detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};

type WindowWithWebkitAudioContext = Window &
    typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
    };

declare global {
    interface Window {
        BarcodeDetector?: BarcodeDetectorConstructor;
    }
}

function getCoverTransform(
    containerW: number,
    containerH: number,
    mediaW: number,
    mediaH: number,
) {
    // object-fit: cover mapping
    const scale = Math.max(containerW / mediaW, containerH / mediaH);
    const renderW = mediaW * scale;
    const renderH = mediaH * scale;
    const offsetX = (containerW - renderW) / 2;
    const offsetY = (containerH - renderH) / 2;
    return { scale, offsetX, offsetY };
}

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

function getCameraErrorMessage(error: unknown) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        return 'Camera scanning requires HTTPS or localhost. Open this page from a secure URL, or use manual entry.';
    }

    if (error instanceof DOMException) {
        if (
            error.name === 'NotAllowedError' ||
            error.name === 'SecurityError'
        ) {
            return 'Camera permission denied. Please allow camera access for this site.';
        }

        if (
            error.name === 'NotFoundError' ||
            error.name === 'OverconstrainedError'
        ) {
            return 'No usable camera was found on this device.';
        }

        if (error.name === 'NotReadableError' || error.name === 'AbortError') {
            return 'The camera is already in use or could not be started. Close other apps using the camera, then try again.';
        }
    }

    return 'Unable to start camera. Try again.';
}

/**
 * Manual entry, isolated from the rest of the page.
 *
 * The code lives in this component's own state and the submit handler arrives
 * through a ref, so both props are stable and React.memo keeps every keystroke
 * from re-rendering the camera tree alongside it.
 */
type ParticipantSearchRow = {
    id: number;
    full_name: string;
    display_id?: string | null;
    profile_image_url?: string | null;
    checked_in: boolean;
    scanned_at?: string | null;
    table_assignment?: TableAssignmentInfo | null;
};

/**
 * Recent scans, plus a search across everyone registered for the event.
 *
 * Memoised and owning its own query state on purpose: the page component runs
 * the camera loop, so letting every keystroke re-render that tree would undo
 * the decode-budget work.
 *
 * The session list only holds the last RECENT_SCAN_LIMIT scans and is lost on
 * refresh, so searching hits the server instead of filtering it -- that is what
 * answers "has this person already checked in?" once a queue has moved through.
 */
const RecentScansDialog = React.memo(function RecentScansDialog({
    open,
    onOpenChange,
    scans,
    eventId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scans: RecentScan[];
    eventId: string;
}) {
    const [query, setQuery] = React.useState('');
    const [results, setResults] = React.useState<ParticipantSearchRow[] | null>(
        null,
    );
    const [searching, setSearching] = React.useState(false);
    const [searchError, setSearchError] = React.useState<string | null>(null);

    const term = query.trim();

    React.useEffect(() => {
        if (!open || !term || !eventId) {
            setResults(null);
            setSearching(false);
            setSearchError(null);

            return;
        }

        // Abort the previous request so a slow early keystroke cannot land
        // after a faster later one and show stale results.
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setSearching(true);
            setSearchError(null);

            try {
                const params = new URLSearchParams({
                    event_id: eventId,
                    q: term,
                });
                const res = await fetch(
                    `${ENDPOINTS.participants}?${params.toString()}`,
                    {
                        headers: {
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        credentials: 'include',
                        signal: controller.signal,
                    },
                );

                if (!res.ok) throw new Error(String(res.status));

                const data = await res.json();
                setResults(data.participants ?? []);
            } catch (error) {
                if ((error as Error)?.name === 'AbortError') return;
                setSearchError('Could not search participants.');
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [open, term, eventId]);

    // Start clean each time it opens rather than resuming an old search.
    React.useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-hidden p-0">
                <DialogHeader className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <DialogTitle className="text-sm font-semibold">
                        {term
                            ? 'Search participants'
                            : `Recent scans${scans.length ? ` (${scans.length})` : ''}`}
                    </DialogTitle>
                </DialogHeader>

                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex h-11 items-center rounded-2xl border border-slate-200 bg-white pl-3 focus-within:ring-2 focus-within:ring-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:ring-slate-700">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name or participant ID"
                            autoComplete="off"
                            spellCheck={false}
                            className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                        />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                        {term
                            ? 'Searching everyone registered for this event.'
                            : 'Showing this session’s scans. Search to look up anyone registered.'}
                    </p>
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                    {term ? (
                        searching ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-slate-500">
                                <RefreshCcw className="h-4 w-4 animate-spin" />
                                Searching…
                            </div>
                        ) : searchError ? (
                            <div className="px-4 py-8 text-center text-xs text-red-600 dark:text-red-400">
                                {searchError}
                            </div>
                        ) : results && results.length ? (
                            <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                {results.map((row) => (
                                    <div
                                        key={row.id}
                                        className="flex items-start gap-3 px-4 py-3"
                                    >
                                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                                            {row.profile_image_url ? (
                                                <img
                                                    src={row.profile_image_url}
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center">
                                                    <UserRound className="h-4 w-4 text-slate-400" />
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                                {row.full_name}
                                            </div>
                                            {row.display_id ? (
                                                <div className="truncate font-mono text-xs text-slate-500">
                                                    {row.display_id}
                                                </div>
                                            ) : null}
                                            {formatSeating(
                                                row.table_assignment,
                                            ) ? (
                                                <div className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-[#00359c] dark:text-sky-300">
                                                    <Armchair className="h-3 w-3 shrink-0" />
                                                    {formatSeating(
                                                        row.table_assignment,
                                                    )}
                                                </div>
                                            ) : null}
                                            <div className="mt-0.5 truncate text-xs text-slate-500">
                                                {row.checked_in
                                                    ? `Checked in ${fmtDateTime(row.scanned_at) ?? ''}`
                                                    : 'Not yet checked in'}
                                            </div>
                                        </div>

                                        <Pill
                                            tone={
                                                row.checked_in
                                                    ? 'success'
                                                    : 'default'
                                            }
                                        >
                                            {row.checked_in
                                                ? 'Checked in'
                                                : 'Not in yet'}
                                        </Pill>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="px-4 py-8 text-center text-xs text-slate-500">
                                No participant matches “{term}”.
                            </div>
                        )
                    ) : scans.length ? (
                        <div className="divide-y divide-slate-200 dark:divide-slate-800">
                            {scans.map((scan) => (
                                <div
                                    key={scan.id}
                                    className="flex items-start gap-3 px-4 py-3"
                                >
                                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                                        {scan.imageUrl ? (
                                            <img
                                                src={scan.imageUrl}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center">
                                                <UserRound className="h-4 w-4 text-slate-400" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                            {scan.name}
                                        </div>
                                        {scan.displayId ? (
                                            <div className="truncate font-mono text-xs text-slate-500">
                                                {scan.displayId}
                                            </div>
                                        ) : null}
                                        {scan.tableNumber ? (
                                            <div className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-[#00359c] dark:text-sky-300">
                                                <Armchair className="h-3 w-3 shrink-0" />
                                                {formatSeating({
                                                    table_number:
                                                        scan.tableNumber,
                                                    seat_number:
                                                        scan.seatNumber,
                                                })}
                                            </div>
                                        ) : null}
                                        <div className="mt-0.5 truncate text-xs text-slate-500">
                                            {scan.message}
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        <Pill
                                            tone={
                                                scan.ok ? 'success' : 'danger'
                                            }
                                        >
                                            {scan.ok
                                                ? scan.alreadyCheckedIn
                                                    ? 'Already in'
                                                    : 'Checked in'
                                                : 'Rejected'}
                                        </Pill>
                                        <span className="text-[11px] text-slate-400">
                                            {new Date(
                                                scan.at,
                                            ).toLocaleTimeString('en-PH', {
                                                hour: 'numeric',
                                                minute: '2-digit',
                                            })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="px-4 py-8 text-center text-xs text-slate-500">
                            Scans will appear here as participants check in.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
});

const ManualEntryPanel = React.memo(function ManualEntryPanel({
    submitRef,
    disabled,
}: {
    submitRef: React.RefObject<((code: string) => Promise<boolean>) | null>;
    disabled: boolean;
}) {
    const [code, setCode] = React.useState('');
    const [busy, setBusy] = React.useState(false);

    return (
        <form
            className="flex items-end gap-2"
            onSubmit={async (e) => {
                e.preventDefault();

                const value = code.trim();
                if (!value || busy) return;

                setBusy(true);
                try {
                    // Cleared only on success, so a typo stays put for editing.
                    const ok = await submitRef.current?.(value);
                    if (ok) setCode('');
                } finally {
                    setBusy(false);
                }
            }}
        >
            <div className="grid min-w-0 flex-1 gap-2">
                <label
                    className="text-xs font-semibold text-slate-600 dark:text-slate-400"
                    htmlFor="manual-participant-id"
                >
                    Participant ID
                </label>
                <div className="flex h-11 min-w-0 items-center rounded-2xl border border-slate-200 bg-white py-1 pl-3 focus-within:ring-2 focus-within:ring-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:ring-slate-700">
                    <span className="font-mono text-sm text-slate-400 select-none">
                        CHED-
                    </span>
                    <Input
                        id="manual-participant-id"
                        value={code}
                        onChange={(e) =>
                            setCode(normalizeManualCode(e.target.value))
                        }
                        placeholder="XXXX"
                        inputMode="text"
                        maxLength={4}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        className="h-full w-[6.5rem] min-w-0 border-0 bg-transparent px-1 font-mono text-base tracking-[0.3em] shadow-none focus-visible:ring-0 dark:bg-transparent"
                    />
                    <span className="mr-2 font-mono text-sm text-slate-400 select-none">
                        -&#8230;
                    </span>

                    <Button
                        type="submit"
                        title="Enter the four characters in the middle of the participant's ID. Pasting the full ID works too."
                        className={cn(
                            'ml-auto h-9 shrink-0 rounded-xl px-4',
                            PRIMARY_BTN,
                        )}
                        disabled={disabled || busy || !code.trim()}
                    >
                        <Check className="mr-2 h-4 w-4" />
                        Check in
                    </Button>
                </div>
            </div>
        </form>
    );
});

/**
 * The middle column: who just checked in, or the event image during a lull.
 *
 * This replaces the old result modal. Because it is persistent rather than
 * dismissed, the scanner never has to stop between participants -- the panel
 * simply re-renders as each result arrives.
 */
function ScanResultPanel({
    isIdle,
    idleImageUrl,
    result,
    participantDisplayId,
    cardParticipant,
    dialogTitle,
    dialogTone,
}: {
    isIdle: boolean;
    idleImageUrl: string;
    result: ScanResponse | null;
    participantDisplayId: string | null;
    cardParticipant:
        | React.ComponentProps<typeof ScannerIdCardPreview>['participant']
        | null;
    dialogTitle: string;
    dialogTone: 'success' | 'danger';
}) {
    const shell =
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800';

    if (isIdle) {
        return (
            <div
                className={cn(
                    shell,
                    'items-center justify-center bg-slate-950 p-4',
                )}
            >
                <img
                    src={idleImageUrl}
                    alt=""
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                    className="h-full w-full rounded-2xl object-contain"
                />
            </div>
        );
    }

    if (!result) {
        return (
            <div
                className={cn(
                    shell,
                    'items-center justify-center gap-3 bg-slate-50 p-6 text-center dark:bg-slate-900/30',
                )}
            >
                <ScanLine className="h-8 w-8 text-slate-400" />
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Waiting for the next participant
                </div>
                <p className="text-xs text-slate-500">
                    Scanned details will appear here.
                </p>
            </div>
        );
    }

    const ok = result.ok;

    return (
        <div className={cn(shell, 'bg-white dark:bg-slate-950')}>
            <div
                className={cn(
                    'flex items-start gap-3 border-b p-4',
                    ok
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                        : 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30',
                )}
            >
                <div
                    className={cn(
                        'grid size-10 shrink-0 place-items-center rounded-2xl',
                        ok
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                    )}
                >
                    {ok ? (
                        <CircleCheckBig className="h-5 w-5" />
                    ) : (
                        <CircleX className="h-5 w-5" />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div
                        className={cn(
                            'text-sm font-semibold',
                            ok
                                ? 'text-emerald-900 dark:text-emerald-100'
                                : 'text-red-900 dark:text-red-100',
                        )}
                    >
                        {dialogTitle}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {result.message}
                    </div>
                    {result.scanned_at ? (
                        <div className="mt-1 text-xs text-slate-500">
                            Scanned at {fmtDateTime(result.scanned_at)}
                        </div>
                    ) : null}
                </div>

                {result.already_checked_in ? (
                    <Pill tone={dialogTone}>Already in</Pill>
                ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-4">
                <div className="flex h-full flex-col gap-4 xl:flex-row xl:items-start">
                    {cardParticipant ? (
                        <div className="shrink-0">
                            <ScannerIdCardPreview
                                participant={cardParticipant}
                                orientation="landscape"
                                verifiedSuccess={ok}
                            />
                        </div>
                    ) : null}

                    <div className="min-w-0 flex-1">
                        {result.participant ? (
                            <div className="grid gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                {/* Unlike every other optional field here, the
                                    empty case is rendered rather than hidden: a
                                    blank space cannot be told apart from a field
                                    that failed to load, and an unassigned
                                    arrival still has to be sent somewhere. */}
                                {result.table_assignment ? (
                                    <div className="mb-1 rounded-lg border border-[#00359c]/25 bg-[#00359c]/5 px-3 py-2 dark:border-[#00359c]/40 dark:bg-[#00359c]/15">
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#00359c] uppercase dark:text-sky-300">
                                            <Armchair className="h-3.5 w-3.5 shrink-0" />
                                            Seating
                                        </div>
                                        <div className="mt-0.5 truncate text-lg leading-tight font-bold text-slate-900 dark:text-slate-50">
                                            {
                                                result.table_assignment
                                                    .table_number
                                            }
                                            {result.table_assignment
                                                .seat_number !== null ? (
                                                <span className="text-slate-400 dark:text-slate-500">
                                                    {' · '}
                                                </span>
                                            ) : null}
                                            {result.table_assignment
                                                .seat_number !== null
                                                ? `Seat ${result.table_assignment.seat_number}`
                                                : ''}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-1 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                                        <TriangleAlert className="h-4 w-4 shrink-0" />
                                        <span className="text-sm font-semibold">
                                            No table assigned
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center gap-2">
                                    <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                        {result.participant.full_name}
                                    </span>
                                </div>

                                {participantDisplayId ? (
                                    <div className="flex items-center gap-2">
                                        <QrCodeIcon className="h-4 w-4 shrink-0" />
                                        <span className="truncate font-mono">
                                            {participantDisplayId}
                                        </span>
                                    </div>
                                ) : null}

                                {result.participant.email ? (
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 shrink-0" />
                                        <span className="truncate">
                                            {result.participant.email}
                                        </span>
                                    </div>
                                ) : null}

                                {result.participant.country ||
                                result.participant.user_type ? (
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 shrink-0" />
                                        {result.participant.country_flag_url ? (
                                            <img
                                                src={
                                                    result.participant
                                                        .country_flag_url
                                                }
                                                alt=""
                                                className="h-3 w-4 shrink-0 rounded-[2px] object-cover"
                                            />
                                        ) : null}
                                        <span className="truncate">
                                            {result.participant.country ??
                                                'Unknown'}
                                            {result.participant.user_type
                                                ? ' - ' +
                                                  result.participant.user_type
                                                : ''}
                                        </span>
                                    </div>
                                ) : null}

                                {result.participant.is_verified ? (
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 shrink-0" />
                                        <Pill tone="success">
                                            Verified Participant
                                        </Pill>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {result.checked_in_event ? (
                            <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
                                <ExternalLink className="h-4 w-4 shrink-0" />
                                <span className="truncate">
                                    Checked in for{' '}
                                    {result.checked_in_event.title}
                                </span>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Scanner(props: PageProps) {
    const events = React.useMemo(() => props.events ?? [], [props.events]);
    const defaultEventId = props.default_event_id
        ? String(props.default_event_id)
        : '';
    const [selectedEventId, setSelectedEventId] =
        React.useState<string>(defaultEventId);
    const [eventOpen, setEventOpen] = React.useState(false);
    const [isScanning, setIsScanning] = React.useState(false);
    const [status, setStatus] = React.useState<
        'idle' | 'scanning' | 'verifying' | 'success' | 'error' | 'camera-error'
    >('idle');

    const [devices, setDevices] = React.useState<
        Array<{ deviceId: string; label: string }>
    >([]);
    const [deviceId, setDeviceId] = React.useState<string>('');
    const [deviceDiscoveryReady, setDeviceDiscoveryReady] =
        React.useState(false);
    const [cameraError, setCameraError] = React.useState<string | null>(null);
    const [cameraMirrored, setCameraMirrored] = React.useState(true);

    // Held in a ref so ManualEntryPanel's props stay stable across renders.
    const manualSubmitRef = React.useRef<
        ((code: string) => Promise<boolean>) | null
    >(null);
    const [recentScans, setRecentScans] = React.useState<RecentScan[]>([]);
    const [recentOpen, setRecentOpen] = React.useState(false);
    // Read by the scan loop, which closes over its scope and cannot see state.
    const recentOpenRef = React.useRef(false);
    const [kioskMode, setKioskMode] = React.useState(false);
    const [isIdle, setIsIdle] = React.useState(false);
    const lastActivityAtRef = React.useRef(Date.now());

    const [result, setResult] = React.useState<ScanResponse | null>(null);

    // ✅ dialog for BOTH success and error
    const [autoStartSuppressed, setAutoStartSuppressed] = React.useState(
        Boolean(defaultEventId),
    );

    const nowTs = Date.now();

    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    const scanCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

    const markActivity = React.useCallback(() => {
        lastActivityAtRef.current = Date.now();
        setIsIdle(false);
    }, []);
    const streamRef = React.useRef<MediaStream | null>(null);
    const scanFrameRef = React.useRef<number | null>(null);
    const lastDecodeAtRef = React.useRef(0);
    const decodeAttemptRef = React.useRef(0);
    // Codes seen recently, so a badge left in front of the lens does not
    // re-fire every frame. Replaces the old consecutive-frame filter, which
    // reset the moment a single frame failed to decode.
    const recentCodesRef = React.useRef(new Map<string, number>());

    function isCoolingDown(code: string): boolean {
        const seenAt = recentCodesRef.current.get(code);

        return seenAt !== undefined && Date.now() - seenAt < RESCAN_COOLDOWN_MS;
    }

    function markCodeScanned(code: string): void {
        const now = Date.now();

        // Prune while we are here so a long session cannot grow the map.
        for (const [seen, at] of recentCodesRef.current) {
            if (now - at >= RESCAN_COOLDOWN_MS)
                recentCodesRef.current.delete(seen);
        }

        recentCodesRef.current.set(code, now);
    }
    const lockRef = React.useRef(false);
    const isScanningRef = React.useRef(false);
    const cameraMirroredRef = React.useRef(true);

    // ✅ sounds
    const sounds = useScanSounds();

    // ✅ alignment / detection UI
    const [qrAim, setQrAim] = React.useState<
        'idle' | 'searching' | 'detected' | 'aligned'
    >('idle');
    const qrAimRef = React.useRef(qrAim);

    // Leaving real fullscreen (Esc, or the browser's own control) should also
    // leave kiosk mode. This only ever turns kiosk OFF -- it is not the source
    // of truth, because on iPadOS requestFullscreen does nothing and the event
    // never fires, which previously left the button looking broken.
    React.useEffect(() => {
        const onFullscreenChange = () => {
            if (!document.fullscreenElement) setKioskMode(false);
        };

        document.addEventListener('fullscreenchange', onFullscreenChange);

        return () =>
            document.removeEventListener(
                'fullscreenchange',
                onFullscreenChange,
            );
    }, []);

    // Chrome is hidden with CSS rather than useSidebar().setOpen(false),
    // which would persist the collapse into the sidebar_state cookie.
    React.useEffect(() => {
        const root = document.documentElement;

        if (kioskMode) {
            root.setAttribute('data-scanner-fullscreen', '');
        } else {
            root.removeAttribute('data-scanner-fullscreen');
        }

        return () => root.removeAttribute('data-scanner-fullscreen');
    }, [kioskMode]);

    /**
     * Hide the app chrome, and enter real fullscreen if the browser allows it.
     *
     * The CSS does the actual hiding, so this works everywhere. Fullscreen is
     * attempted separately and its failure is ignored -- iPadOS Safari has no
     * usable requestFullscreen, and gating the layout on it left the button
     * doing nothing on exactly the device this station runs on.
     */
    async function toggleKioskMode() {
        const next = !kioskMode;

        setKioskMode(next);

        try {
            if (!next) {
                if (document.fullscreenElement) await document.exitFullscreen();

                return;
            }

            const root = document.documentElement as HTMLElement & {
                webkitRequestFullscreen?: () => Promise<void>;
            };

            await (root.requestFullscreen?.() ??
                root.webkitRequestFullscreen?.());
        } catch {
            // Unsupported or denied. Kiosk mode still applies via CSS.
        }
    }

    manualSubmitRef.current = async (code: string) => {
        await sounds.unlock();

        const res = await verifyCode(code);

        return !!res?.ok;
    };

    React.useEffect(() => {
        if (!isScanning) {
            setIsIdle(false);

            return;
        }

        const timer = window.setInterval(() => {
            if (Date.now() - lastActivityAtRef.current < IDLE_AFTER_MS) return;

            setIsIdle(true);
        }, 1000);

        return () => window.clearInterval(timer);
    }, [isScanning]);

    const scanBoxRef = React.useRef<HTMLDivElement | null>(null);
    const overlayCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

    React.useEffect(() => {
        qrAimRef.current = qrAim;
    }, [qrAim]);

    React.useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                if (!navigator.mediaDevices?.enumerateDevices) return;

                const list = await navigator.mediaDevices.enumerateDevices();
                if (!mounted) return;

                const mapped = list
                    .filter((device) => device.kind === 'videoinput')
                    .map((d, idx) => ({
                        deviceId: d.deviceId,
                        label: d.label || `Camera ${idx + 1}`,
                    }));
                setDevices(mapped);

                const preferred =
                    mapped.find((d) => /back|rear|environment/i.test(d.label))
                        ?.deviceId ??
                    mapped[0]?.deviceId ??
                    '';
                setDeviceId(preferred);
            } catch {
                // user may grant permission later
            } finally {
                if (mounted) {
                    setDeviceDiscoveryReady(true);
                }
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    React.useEffect(() => {
        return () => stopScan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ keep overlay canvas crisp
    React.useEffect(() => {
        const host = scanBoxRef.current;
        const canvas = overlayCanvasRef.current;
        if (!host || !canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = host.getBoundingClientRect();
            canvas.width = Math.max(1, Math.floor(rect.width * dpr));
            canvas.height = Math.max(1, Math.floor(rect.height * dpr));
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
            ctx.clearRect(0, 0, rect.width, rect.height);
        };

        resize();

        const ro = new ResizeObserver(() => resize());
        ro.observe(host);

        return () => ro.disconnect();
    }, []);

    const clearQrOverlay = React.useCallback(() => {
        const host = scanBoxRef.current;
        const canvas = overlayCanvasRef.current;
        const ctx = canvas?.getContext('2d');

        if (host && ctx) {
            const r = host.getBoundingClientRect();
            ctx.clearRect(0, 0, r.width, r.height);
        }
    }, []);

    React.useEffect(() => {
        cameraMirroredRef.current = cameraMirrored;
        clearQrOverlay();
    }, [cameraMirrored, clearQrOverlay]);

    const updateQrAim = React.useCallback((aim: typeof qrAimRef.current) => {
        if (aim === qrAimRef.current) {
            return;
        }

        qrAimRef.current = aim;
        setQrAim(aim);
    }, []);

    const drawQrOverlay = React.useCallback(
        (barcodes: DetectedBarcode[]) => {
            const host = scanBoxRef.current;
            const video = videoRef.current;
            const canvas = overlayCanvasRef.current;

            if (!host || !video || !canvas) {
                updateQrAim('searching');
                return;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                updateQrAim('searching');
                return;
            }

            const rect = host.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;

            ctx.clearRect(0, 0, w, h);

            // Mirror the decoder's region of interest: readQrValue() crops a
            // centred square of QR_ROI_RATIO and decodes it at native
            // resolution, so the on-screen guide has to mark the same square.
            // A frame derived from the box edges would report "aligned" while
            // the code sat outside the area actually being read.
            const guide = Math.min(w, h) * QR_ROI_RATIO;
            const frameX = (w - guide) / 2;
            const frameY = (h - guide) / 2;
            const frameW = guide;
            const frameH = guide;

            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.fillRect(0, 0, w, h);
            ctx.clearRect(frameX, frameY, frameW, frameH);
            ctx.restore();

            const vw = video.videoWidth || 0;
            const vh = video.videoHeight || 0;
            if (!vw || !vh) {
                updateQrAim('searching');
                return;
            }

            const { scale, offsetX, offsetY } = getCoverTransform(w, h, vw, vh);
            const mapPoint = (p: { x: number; y: number }) => {
                const x = p.x * scale + offsetX;
                return {
                    x: cameraMirroredRef.current ? w - x : x,
                    y: p.y * scale + offsetY,
                };
            };

            let best: {
                points: { x: number; y: number }[];
                cx: number;
                cy: number;
                area: number;
            } | null = null;

            for (const b of barcodes) {
                const pts = b.cornerPoints?.length ? b.cornerPoints : null;

                if (pts && pts.length >= 4) {
                    const mp = pts.map(mapPoint);
                    const xs = mp.map((p) => p.x);
                    const ys = mp.map((p) => p.y);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);

                    const area = (maxX - minX) * (maxY - minY);
                    const cx = (minX + maxX) / 2;
                    const cy = (minY + maxY) / 2;

                    if (!best || area > best.area) {
                        best = { points: mp, cx, cy, area };
                    }
                    continue;
                }

                const bb = b.boundingBox;
                if (bb) {
                    const points = [
                        mapPoint({ x: bb.x, y: bb.y }),
                        mapPoint({ x: bb.x + bb.width, y: bb.y }),
                        mapPoint({
                            x: bb.x + bb.width,
                            y: bb.y + bb.height,
                        }),
                        mapPoint({ x: bb.x, y: bb.y + bb.height }),
                    ];
                    const xs = points.map((p) => p.x);
                    const ys = points.map((p) => p.y);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);

                    const area = (maxX - minX) * (maxY - minY);
                    const cx = (minX + maxX) / 2;
                    const cy = (minY + maxY) / 2;

                    if (!best || area > best.area) {
                        best = { points, cx, cy, area };
                    }
                }
            }

            if (!best) {
                updateQrAim('searching');
                return;
            }

            const margin = guide * 0.08;
            const inFrame =
                best.cx > frameX + margin &&
                best.cx < frameX + frameW - margin &&
                best.cy > frameY + margin &&
                best.cy < frameY + frameH - margin;

            const aim = inFrame ? ('aligned' as const) : ('detected' as const);

            ctx.save();
            ctx.lineWidth = 3;
            ctx.strokeStyle =
                aim === 'aligned'
                    ? 'rgba(16,185,129,0.95)'
                    : 'rgba(56,189,248,0.95)';
            ctx.shadowColor =
                aim === 'aligned'
                    ? 'rgba(16,185,129,0.55)'
                    : 'rgba(56,189,248,0.45)';
            ctx.shadowBlur = 18;

            ctx.beginPath();
            best.points.forEach((p, idx) => {
                const x = clamp(p.x, 0, w);
                const y = clamp(p.y, 0, h);
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            updateQrAim(aim);
        },
        [updateQrAim],
    );

    React.useEffect(() => {
        if (isScanning) {
            return;
        }

        clearQrOverlay();
        updateQrAim('idle');
    }, [clearQrOverlay, isScanning, updateQrAim]);

    function vibrateSuccess() {
        if (navigator.vibrate) navigator.vibrate([40, 40, 90]);
    }

    function vibrateError() {
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    }

    function hardStopVideoStream() {
        const video = videoRef.current;
        if (!video) return;

        const stream = video.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
    }

    /** ✅ dialog + sound + vibration */
    /**
     * Show a scan outcome without interrupting the scanner.
     *
     * Scanning is continuous now, so this deliberately does not touch
     * isScanning or tear the camera down; the result simply replaces what the
     * middle column is showing. `status` keeps describing the camera, and the
     * success/failure signal comes from `result.ok`.
     */
    async function applyScanResult(data: ScanResponse) {
        setResult(data);
        markActivity();

        // Failure responses carry no participant, so every field is optional.
        setRecentScans((prev) =>
            [
                {
                    id:
                        globalThis.crypto?.randomUUID?.() ??
                        String(Date.now() + Math.random()),
                    ok: data.ok,
                    alreadyCheckedIn: !!data.already_checked_in,
                    name: data.participant?.full_name ?? 'Unknown participant',
                    displayId: data.participant?.display_id ?? null,
                    imageUrl: data.participant?.profile_image_url ?? null,
                    message: data.message,
                    at: Date.now(),
                    tableNumber: data.table_assignment?.table_number ?? null,
                    seatNumber: data.table_assignment?.seat_number ?? null,
                },
                ...prev,
            ].slice(0, RECENT_SCAN_LIMIT),
        );
        if (data.ok) {
            vibrateSuccess();
            sounds.success();
        } else {
            vibrateError();
            sounds.error();
        }
    }

    const selectedEvent = selectedEventId
        ? events.find((e) => String(e.id) === selectedEventId)
        : null;
    const selectedEventPhase = selectedEvent
        ? resolveEventPhase(selectedEvent, nowTs)
        : undefined;
    const isEventBlocked = selectedEvent
        ? !isEventOpenForScanning(selectedEvent, nowTs)
        : false;
    function ensureEventSelected() {
        if (!selectedEventId) {
            const data = {
                ok: false,
                message: 'Please select an event before scanning.',
            } as ScanResponse;
            void applyScanResult(data);
            return false;
        }
        if (selectedEvent && !isEventOpenForScanning(selectedEvent, nowTs)) {
            const data = {
                ok: false,
                message:
                    selectedEventPhase === 'upcoming'
                        ? 'Early check-in opens on the event day.'
                        : 'This event is no longer open for scanning.',
            } as ScanResponse;
            void applyScanResult(data);
            return false;
        }
        return true;
    }

    function teardownScanSession() {
        if (scanFrameRef.current !== null) {
            window.cancelAnimationFrame(scanFrameRef.current);
            scanFrameRef.current = null;
        }

        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        hardStopVideoStream();
    }

    async function readQrValue(
        video: HTMLVideoElement,
        detector: InstanceType<BarcodeDetectorConstructor> | null,
    ) {
        const mirrorEnabled = cameraMirroredRef.current;

        if (detector) {
            const codes = await detector.detect(video);
            const rawValue = codes[0]?.rawValue?.trim();

            drawQrOverlay(codes);

            if (rawValue) {
                return rawValue;
            }

            // If native detection misses a small/far QR, try the jsQR fallback.
        }

        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;

        if (!sourceWidth || !sourceHeight) {
            return '';
        }

        const canvas =
            scanCanvasRef.current ?? document.createElement('canvas');
        const context = canvas.getContext('2d', {
            willReadFrequently: true,
        });

        scanCanvasRef.current = canvas;

        if (!context) {
            return '';
        }

        const roiSide = Math.floor(
            Math.min(sourceWidth, sourceHeight) * QR_ROI_RATIO,
        );
        const roiExtent = Math.min(roiSide, QR_ROI_MAX_SIDE);
        const fullScale = Math.min(
            1,
            MAX_QR_SCAN_SIDE / Math.max(sourceWidth, sourceHeight),
        );

        // Ordered cheapest and most likely first; the loop stops on the first hit.
        //
        // The centred crop is decoded at native resolution, so a code held in the
        // aim box gets roughly 3-4x more pixels per module than it would in the
        // downscaled full frame. The contrast pass then covers glare and washed
        // out phone screens, and the full frame still catches a code held wide.
        const passes = [
            {
                sx: Math.floor((sourceWidth - roiSide) / 2),
                sy: Math.floor((sourceHeight - roiSide) / 2),
                sw: roiSide,
                sh: roiSide,
                width: roiExtent,
                height: roiExtent,
                enhance: false,
                fullFrame: false,
            },
            {
                sx: Math.floor((sourceWidth - roiSide) / 2),
                sy: Math.floor((sourceHeight - roiSide) / 2),
                sw: roiSide,
                sh: roiSide,
                width: roiExtent,
                height: roiExtent,
                enhance: true,
                fullFrame: false,
            },
            {
                sx: 0,
                sy: 0,
                sw: sourceWidth,
                sh: sourceHeight,
                width: Math.max(1, Math.floor(sourceWidth * fullScale)),
                height: Math.max(1, Math.floor(sourceHeight * fullScale)),
                enhance: false,
                fullFrame: true,
            },
        ];

        const scanWithJsQr = (
            pass: (typeof passes)[number],
            mirrored: boolean,
        ) => {
            const { sx, sy, sw, sh, width, height, enhance } = pass;

            canvas.width = width;
            canvas.height = height;

            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, width, height);

            if (mirrored) {
                context.save();
                context.translate(width, 0);
                context.scale(-1, 1);
                context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
                context.restore();
            } else {
                context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
            }

            const imageData = context.getImageData(0, 0, width, height);

            if (enhance) {
                enhanceScanContrast(imageData);
            }

            const code = jsQR(imageData.data, width, height, {
                inversionAttempts: 'attemptBoth',
            });

            if (!code) {
                return null;
            }

            const pointScaleX = sw / width;
            const pointScaleY = sh / height;

            return {
                value: code.data?.trim() ?? '',
                barcode: {
                    rawValue: code.data,
                    cornerPoints: [
                        code.location.topLeftCorner,
                        code.location.topRightCorner,
                        code.location.bottomRightCorner,
                        code.location.bottomLeftCorner,
                    ].map((point) => ({
                        x:
                            sx +
                            (mirrored ? width - point.x : point.x) *
                                pointScaleX,
                        y: sy + point.y * pointScaleY,
                    })),
                },
            };
        };

        let result: ReturnType<typeof scanWithJsQr> = null;

        decodeAttemptRef.current += 1;

        const attempt = decodeAttemptRef.current;
        const tryContrast = attempt % CONTRAST_PASS_EVERY === 0;
        const tryFullFrame = attempt % FULL_FRAME_PASS_EVERY === 0;
        // A mirrored frame only occurs when the driver itself flips the stream,
        // so this is a periodic probe rather than a per-frame cost.
        const tryMirror = mirrorEnabled && attempt % MIRROR_PASS_EVERY === 0;

        for (const pass of passes) {
            if (pass.enhance && !tryContrast) {
                continue;
            }

            if (pass.fullFrame && !tryFullFrame) {
                continue;
            }

            result =
                scanWithJsQr(pass, false) ??
                (tryMirror ? scanWithJsQr(pass, true) : null);

            if (result?.value) {
                break;
            }
        }

        if (result?.value) {
            drawQrOverlay([result.barcode]);
            return result.value;
        }

        if (!result) {
            drawQrOverlay([]);
        }

        return '';
    }

    async function startScan() {
        if (!ensureEventSelected()) return;
        if (!videoRef.current) return;

        setAutoStartSuppressed(false);
        setCameraError(null);
        markActivity();
        setResult(null);
        setStatus('scanning');
        setIsScanning(true);
        isScanningRef.current = true;
        lockRef.current = false;
        setQrAim('searching');

        try {
            teardownScanSession();

            const videoConstraints: MediaTrackConstraints = {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: deviceId ? undefined : { ideal: 'environment' },
                width: { ideal: CAMERA_IDEAL_WIDTH },
                height: { ideal: CAMERA_IDEAL_HEIGHT },
                ...({
                    focusMode: 'continuous',
                    advanced: [{ focusMode: 'continuous' }, { zoom: 1 }],
                } as unknown as MediaTrackConstraints),
            };

            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: false,
            });

            streamRef.current = stream;

            const video = videoRef.current;
            if (!video || !isScanningRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            video.srcObject = stream;
            await video.play();

            if (navigator.mediaDevices?.enumerateDevices) {
                const list = await navigator.mediaDevices.enumerateDevices();
                const mapped = list
                    .filter((device) => device.kind === 'videoinput')
                    .map((d, idx) => ({
                        deviceId: d.deviceId,
                        label: d.label || `Camera ${idx + 1}`,
                    }));

                setDevices(mapped);
            }

            const detector = window.BarcodeDetector
                ? new window.BarcodeDetector({ formats: ['qr_code'] })
                : null;

            const scan = async () => {
                if (!isScanningRef.current) {
                    return;
                }

                const currentVideo = videoRef.current;
                const now = performance.now();
                const ready = currentVideo && currentVideo.readyState >= 2;

                if (
                    ready &&
                    !lockRef.current &&
                    // Nobody is presenting a code while the history is open,
                    // so skip the decode entirely and keep the preview live.
                    !recentOpenRef.current &&
                    now - lastDecodeAtRef.current >= QR_SCAN_INTERVAL_MS
                ) {
                    lastDecodeAtRef.current = now;

                    try {
                        const rawValue = await readQrValue(
                            currentVideo,
                            detector,
                        );

                        // Stop may have been pressed while that decode ran.
                        // Without this the loop would queue another frame and
                        // keep going for one more tick.
                        if (!isScanningRef.current) {
                            return;
                        }

                        if (rawValue && !isCoolingDown(rawValue)) {
                            markCodeScanned(rawValue);
                            lockRef.current = true;

                            setStatus('verifying');
                            await verifyCode(rawValue);

                            lockRef.current = false;

                            // Back to scanning rather than idle: the camera is
                            // still live, the outcome lives in the result panel.
                            if (isScanningRef.current) {
                                setStatus('scanning');
                            }
                        }
                    } catch {
                        teardownScanSession();
                        setCameraError(
                            'The camera image could not be scanned. Keep the QR code inside the frame or use manual entry.',
                        );
                        setStatus('camera-error');
                        setIsScanning(false);
                        isScanningRef.current = false;
                        setQrAim('idle');
                        return;
                    }
                }

                if (!isScanningRef.current) {
                    return;
                }

                scanFrameRef.current = window.requestAnimationFrame(scan);
            };

            scanFrameRef.current = window.requestAnimationFrame(scan);
        } catch (e: unknown) {
            const msg = getCameraErrorMessage(e);
            teardownScanSession();
            setCameraError(msg);
            setStatus('camera-error');
            setIsScanning(false);
            isScanningRef.current = false;
            setQrAim('idle');
        }
    }

    function pauseScanForVerification() {
        teardownScanSession();
        setIsScanning(false);
        isScanningRef.current = false;
        setQrAim('idle');
    }

    function stopScan() {
        pauseScanForVerification();
        setStatus((s) => (s === 'scanning' ? 'idle' : s));

        // Stopping is a deliberate choice, so hold the camera off. Without
        // this the auto-start effect sees an idle, unblocked scanner and
        // restarts it on the next render, making Stop look like a no-op.
        // The flag is cleared again by startScan() and by the event picker.
        setAutoStartSuppressed(true);
    }

    async function verifyCode(code: string) {
        setCameraError(null);

        if (!ensureEventSelected()) return;

        setStatus('verifying');
        setResult(null);

        try {
            const csrf = getCsrfToken();
            const payload: { code: string; event_id: number } = {
                code,
                event_id: Number(selectedEventId),
            };

            const res = await fetch(ENDPOINTS.scan, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrf,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'include',
                body: JSON.stringify(payload),
            });

            const data = (await res.json()) as ScanResponse;

            const participantJoinedSelectedEvent =
                !!data.registered_events?.some(
                    (event) => String(event.id) === selectedEventId,
                );

            if (
                !data.ok &&
                !!data.participant &&
                Array.isArray(data.registered_events) &&
                !participantJoinedSelectedEvent
            ) {
                data.message = 'Participant not joined to this event.';
            }

            await applyScanResult(data); // ✅ plays sound + vibrates

            return data;
        } catch {
            const data = {
                ok: false,
                message: 'Network/server error. Please try again.',
            } as ScanResponse;
            await applyScanResult(data); // ✅ error sound + vibrate

            return data;
        }
    }

    React.useEffect(() => {
        if (
            isScanning ||
            status !== 'idle' ||
            isEventBlocked ||
            !selectedEventId ||
            !deviceDiscoveryReady ||
            cameraError ||
            autoStartSuppressed
        ) {
            return;
        }

        void startScan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        selectedEventId,
        deviceId,
        deviceDiscoveryReady,
        isEventBlocked,
        isScanning,
        status,
        cameraError,
        autoStartSuppressed,
    ]);

    React.useEffect(() => {
        if (!isScanning) return;
        if (!selectedEventId || isEventBlocked) {
            stopScan();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEventId, isEventBlocked, isScanning]);

    const filteredEvents = React.useMemo(() => {
        return events.map((event) => ({
            ...event,
            phase: resolveEventPhase(event, nowTs),
        }));
    }, [events, nowTs]);

    // ✅ build ID-card participant shape (match virtual ID content)
    const participantDisplayId = React.useMemo(() => {
        const displayId = (result?.participant?.display_id ?? '')
            .toString()
            .trim();
        return displayId || null;
    }, [result?.participant?.display_id]);

    const cardParticipant = React.useMemo(() => {
        const p = result?.participant;
        if (!p) return null;

        return {
            name: p.full_name,
            display_id: participantDisplayId ?? '—',
            country: {
                name: p.country ?? null,
                code: p.country_code ?? null,
            },
            profile_image_url: p.profile_image_url ?? null,
            qr_payload: p.qr_payload ?? null,
            qr_token: p.qr_token ?? null,
            is_verified: p.is_verified ?? true,
        };
    }, [participantDisplayId, result?.participant]);
    const dialogTitle = result?.ok
        ? 'Verified'
        : result?.message?.toLowerCase().includes('not joined')
          ? 'Not Joined'
          : 'Not Allowed';

    const qrAimTone =
        qrAim === 'aligned'
            ? 'border-emerald-200'
            : qrAim === 'detected'
              ? 'border-sky-200'
              : 'border-white/80';

    const idleImageUrl =
        resolveEventImageUrl(selectedEvent?.image_url) ?? IDLE_FALLBACK_IMAGE;

    const dialogTone = result?.ok ? 'success' : 'danger';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Scanner" />

            <RecentScansDialog
                open={recentOpen}
                onOpenChange={(open) => {
                    recentOpenRef.current = open;
                    setRecentOpen(open);
                }}
                scans={recentScans}
                eventId={selectedEventId}
            />

            {/* MAIN CARD */}
            <div className="scanner-shell flex w-full flex-col bg-white p-0 lg:overflow-hidden dark:bg-slate-950">
                <div className="relative px-4 pt-4 pb-3 sm:px-6">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#00359c]/10 via-transparent to-transparent dark:from-[#00359c]/15"
                    />

                    <div className="itemss flex items-start justify-between gap-3">
                        <div>
                            <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                QR Scanner
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-400">
                                Scan participant QR to verify attendance.
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={toggleKioskMode}
                                className="h-9 rounded-xl"
                                aria-label={
                                    kioskMode
                                        ? 'Exit kiosk mode'
                                        : 'Enter kiosk mode'
                                }
                            >
                                {kioskMode ? (
                                    <Minimize className="h-4 w-4" />
                                ) : (
                                    <Maximize className="h-4 w-4" />
                                )}
                                <span className="ml-2 hidden sm:inline">
                                    {kioskMode ? 'Exit kiosk' : 'Kiosk mode'}
                                </span>
                            </Button>

                            <Pill
                                tone={
                                    status === 'success'
                                        ? 'success'
                                        : status === 'error' ||
                                            status === 'camera-error'
                                          ? 'danger'
                                          : 'default'
                                }
                            >
                                {status === 'verifying'
                                    ? 'Verifying...'
                                    : status === 'scanning'
                                      ? 'Scanning'
                                      : status === 'success'
                                        ? 'Verified'
                                        : status === 'error'
                                          ? 'Rejected'
                                          : status === 'camera-error'
                                            ? 'Camera error'
                                            : 'Ready'}
                            </Pill>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
                        <div className="grid min-w-0 flex-1 gap-2">
                            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                Event (required)
                            </div>
                            <Popover
                                open={eventOpen}
                                onOpenChange={setEventOpen}
                            >
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={eventOpen}
                                        className="h-11 w-full min-w-0 justify-between rounded-2xl px-3"
                                    >
                                        <span className="flex min-w-0 flex-1 items-center gap-2">
                                            {selectedEvent ? (
                                                <>
                                                    <span className="min-w-0 flex-1 truncate text-left">
                                                        {selectedEvent.title}
                                                    </span>
                                                    {selectedEventPhase ? (
                                                        <span
                                                            className={cn(
                                                                'hidden shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase min-[380px]:inline-flex',
                                                                phaseBadgeClass(
                                                                    selectedEventPhase,
                                                                ),
                                                            )}
                                                        >
                                                            {phaseLabel(
                                                                selectedEventPhase,
                                                            )}
                                                        </span>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                                                    Select event…
                                                </span>
                                            )}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>

                                <PopoverContent
                                    align="start"
                                    sideOffset={8}
                                    collisionPadding={12}
                                    className="w-[min(var(--radix-popper-anchor-width),calc(100vw-2rem),28rem)] p-0"
                                >
                                    <Command>
                                        <CommandInput placeholder="Search event…" />
                                        <CommandEmpty>
                                            No event found.
                                        </CommandEmpty>

                                        <CommandList className="max-h-[320px] overflow-y-auto">
                                            <CommandGroup>
                                                {filteredEvents.map((event) => (
                                                    <CommandItem
                                                        key={event.id}
                                                        value={event.title}
                                                        onSelect={() => {
                                                            setSelectedEventId(
                                                                String(
                                                                    event.id,
                                                                ),
                                                            );
                                                            setEventOpen(false);
                                                            setResult(null);
                                                            setStatus('idle');
                                                            setCameraError(
                                                                null,
                                                            );
                                                            setAutoStartSuppressed(
                                                                false,
                                                            );
                                                        }}
                                                        className="flex items-center gap-2"
                                                    >
                                                        {/* ✅ this is important: allows truncate to actually shrink */}
                                                        <span className="min-w-0 flex-1 truncate">
                                                            {event.title}
                                                        </span>

                                                        {event.phase ? (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                                                                    phaseBadgeClass(
                                                                        event.phase,
                                                                    ),
                                                                )}
                                                            >
                                                                {phaseLabel(
                                                                    event.phase,
                                                                )}
                                                            </span>
                                                        ) : null}

                                                        <Check
                                                            className={cn(
                                                                'ml-2 h-4 w-4 shrink-0',
                                                                selectedEventId ===
                                                                    String(
                                                                        event.id,
                                                                    )
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0',
                                                            )}
                                                        />
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <ManualEntryPanel
                            submitRef={manualSubmitRef}
                            disabled={isEventBlocked}
                        />

                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                recentOpenRef.current = true;
                                setRecentOpen(true);
                            }}
                            className="h-11 shrink-0 rounded-2xl"
                        >
                            <History className="mr-2 h-4 w-4" />
                            Recent
                            {recentScans.length ? (
                                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {recentScans.length}
                                </span>
                            ) : null}
                        </Button>
                    </div>

                    {selectedEvent ? (
                        <div className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4" />
                                <span>
                                    {fmtDate(selectedEvent.starts_at) ?? '—'}
                                </span>
                            </div>
                            {isEventBlocked ? (
                                <div className="text-xs font-medium text-red-600 dark:text-red-400">
                                    Scanning is disabled until the event starts.
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <Separator />

                <div className="relative min-h-0 flex-1 px-4 py-4 sm:px-6">
                    <div className="grid grid-cols-1 gap-4 lg:h-full lg:grid-cols-12">
                        <div className="flex min-h-0 flex-col gap-3 lg:col-span-6">
                            <div
                                ref={scanBoxRef}
                                className={cn(
                                    'relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-800 dark:bg-slate-900/30',
                                    'aspect-[4/3] w-full lg:aspect-auto lg:min-h-0 lg:flex-1',
                                )}
                            >
                                <video
                                    ref={videoRef}
                                    className="h-full w-full object-cover"
                                    style={{
                                        transform: cameraMirrored
                                            ? 'scaleX(-1)'
                                            : undefined,
                                    }}
                                    playsInline
                                    muted
                                />

                                <div className="pointer-events-none absolute inset-0">
                                    {/* ✅ crisp overlay canvas for QR highlight */}
                                    <canvas
                                        ref={overlayCanvasRef}
                                        className="absolute inset-0 h-full w-full"
                                    />

                                    <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_30%,rgba(255,255,255,0.10),transparent_55%)]" />
                                    <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent" />
                                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent" />
                                    {/* Aim guide. aspect-square at 70% height is the
                                same centred region readQrValue() crops and
                                decodes at native resolution, so "aligned"
                                means the code is actually being read. */}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div
                                            className={cn(
                                                'relative aspect-square h-[70%] rounded-[28px] border-2 transition-all duration-200',
                                                qrAim === 'aligned'
                                                    ? 'border-emerald-300/90 shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_0_30px_rgba(16,185,129,0.35)]'
                                                    : qrAim === 'detected'
                                                      ? 'border-sky-200/70 shadow-[0_0_26px_rgba(56,189,248,0.25)]'
                                                      : 'border-white/30',
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'absolute -top-0.5 -left-0.5 h-10 w-10 rounded-tl-2xl border-t-4 border-l-4 transition-colors',
                                                    qrAimTone,
                                                )}
                                            />
                                            <div
                                                className={cn(
                                                    'absolute -top-0.5 -right-0.5 h-10 w-10 rounded-tr-2xl border-t-4 border-r-4 transition-colors',
                                                    qrAimTone,
                                                )}
                                            />
                                            <div
                                                className={cn(
                                                    'absolute -bottom-0.5 -left-0.5 h-10 w-10 rounded-bl-2xl border-b-4 border-l-4 transition-colors',
                                                    qrAimTone,
                                                )}
                                            />
                                            <div
                                                className={cn(
                                                    'absolute -right-0.5 -bottom-0.5 h-10 w-10 rounded-br-2xl border-r-4 border-b-4 transition-colors',
                                                    qrAimTone,
                                                )}
                                            />

                                            {isScanning ? (
                                                <div className="absolute inset-0 overflow-hidden rounded-[28px]">
                                                    <div className="absolute inset-0 h-full animate-[scanline_1.8s_ease-in-out_infinite] will-change-transform">
                                                        <div className="h-px w-full bg-white/80 shadow-[0_0_18px_rgba(255,255,255,0.45)]" />
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* ✅ hint pill */}
                                    {isScanning ? (
                                        <div className="absolute top-4 left-1/2 -translate-x-1/2">
                                            <div
                                                className={cn(
                                                    'rounded-full px-3 py-1 text-xs font-semibold text-white backdrop-blur',
                                                    qrAim === 'aligned'
                                                        ? 'bg-emerald-600/55'
                                                        : qrAim === 'detected'
                                                          ? 'bg-sky-600/50'
                                                          : 'bg-black/35',
                                                )}
                                            >
                                                {qrAim === 'aligned'
                                                    ? 'QR detected • Hold steady'
                                                    : qrAim === 'detected'
                                                      ? 'QR detected • Center it'
                                                      : 'Searching for QR…'}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon-sm"
                                    aria-label={
                                        cameraMirrored
                                            ? 'Disable mirrored camera'
                                            : 'Mirror camera'
                                    }
                                    aria-pressed={cameraMirrored}
                                    title={
                                        cameraMirrored
                                            ? 'Disable mirror'
                                            : 'Mirror camera'
                                    }
                                    onClick={() =>
                                        setCameraMirrored((value) => !value)
                                    }
                                    className={cn(
                                        'absolute top-3 right-3 z-20 rounded-full border border-white/25 bg-black/35 text-white shadow-sm backdrop-blur hover:bg-black/50 hover:text-white',
                                        cameraMirrored &&
                                            'border-[#00359c]/40 bg-[#00359c]/85 hover:bg-[#00359c]',
                                    )}
                                >
                                    <FlipHorizontal2 className="h-4 w-4" />
                                </Button>

                                {!isScanning && status !== 'verifying' ? (
                                    <div className="absolute inset-0 grid place-items-center p-6 text-center">
                                        <div className="rounded-3xl bg-black/35 px-5 py-4 text-white backdrop-blur">
                                            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/15">
                                                <ScanLine className="h-6 w-6" />
                                            </div>
                                            <div className="mt-2 text-sm font-semibold">
                                                Align QR inside the frame
                                            </div>
                                            <div className="mt-1 text-xs text-white/80">
                                                {selectedEventId
                                                    ? 'Start camera when ready to scan.'
                                                    : 'Select an event before scanning.'}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {cameraError ? (
                                    <div className="absolute inset-0 grid place-items-center p-6 text-center">
                                        <div className="rounded-3xl bg-black/45 px-5 py-4 text-white backdrop-blur">
                                            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/15">
                                                <CircleX className="h-6 w-6" />
                                            </div>
                                            <div className="mt-2 text-sm font-semibold">
                                                Camera Error
                                            </div>
                                            <div className="mt-1 text-xs text-white/80">
                                                {cameraError}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {status === 'verifying' ? (
                                    <div className="absolute inset-0 grid place-items-center p-6 text-center">
                                        <div className="rounded-3xl bg-black/45 px-5 py-4 text-white backdrop-blur">
                                            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/15">
                                                <RefreshCcw className="h-6 w-6 animate-spin" />
                                            </div>
                                            <div className="mt-2 text-sm font-semibold">
                                                Verifying…
                                            </div>
                                            <div className="mt-1 text-xs text-white/80">
                                                Checking participant &
                                                registration.
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            <div className="grid gap-2">
                                {devices.length > 1 ? (
                                    <Select
                                        value={deviceId}
                                        onValueChange={setDeviceId}
                                    >
                                        <SelectTrigger className="h-11 rounded-2xl">
                                            <SelectValue placeholder="Select camera" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {devices.map((d) => (
                                                <SelectItem
                                                    key={d.deviceId}
                                                    value={d.deviceId}
                                                >
                                                    {d.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : null}

                                {isScanning ? (
                                    <Button
                                        onClick={stopScan}
                                        variant="secondary"
                                        className="h-11 rounded-2xl"
                                    >
                                        Stop
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => {
                                            setAutoStartSuppressed(false);
                                            setCameraError(null);
                                            void startScan();
                                        }}
                                        className={cn(
                                            'h-11 rounded-2xl',
                                            PRIMARY_BTN,
                                        )}
                                        disabled={isEventBlocked}
                                    >
                                        <Camera className="mr-2 h-4 w-4" />
                                        {cameraError
                                            ? 'Retry Camera'
                                            : 'Start Camera'}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-col gap-4 lg:col-span-6">
                            <ScanResultPanel
                                isIdle={isIdle}
                                idleImageUrl={idleImageUrl}
                                result={result}
                                participantDisplayId={participantDisplayId}
                                cardParticipant={cardParticipant}
                                dialogTitle={dialogTitle}
                                dialogTone={dialogTone}
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6 dark:border-slate-800 dark:bg-slate-950">
                    <div className="text-center text-xs text-slate-500">
                        Tip: Select an event then scan participant QR.
                    </div>
                </div>
            </div>

            <style>{`
                /* h-full is useless here: the parent <main> is min-h-svh, a
                   minimum, so it grows with content instead of bounding it.
                   5rem = the h-16 app header plus the inset variant's m-2. */
                /* Only pin the shell to the viewport once the columns are side
                   by side. Stacked, the content is legitimately taller than
                   the screen and the page should scroll instead of clipping. */
                @media (min-width: 1024px) {
                    .scanner-shell {
                        height: calc(100svh - 5rem);
                    }
                    /* Kiosk hides the header, so the shell reclaims it. */
                    html[data-scanner-fullscreen] .scanner-shell {
                        height: 100svh;
                    }
                }
                html[data-scanner-fullscreen] [data-slot='sidebar'],
                html[data-scanner-fullscreen]
                    [data-slot='sidebar-inset']
                    > header {
                    display: none !important;
                }
                /* The inset variant gives <main> m-2 and rounded corners. In
                   fullscreen those margins would push the 100svh shell past
                   the viewport and bring the scrollbar back, so drop them and
                   go edge to edge. */
                html[data-scanner-fullscreen] [data-slot='sidebar-inset'] {
                    min-height: 100svh;
                    margin: 0 !important;
                    border-radius: 0 !important;
                }
                /* A fullscreened root sits on the UA's black backdrop and is
                   no longer inside bg-background, so paint it explicitly. */
                html[data-scanner-fullscreen],
                html[data-scanner-fullscreen] body {
                    background: #ffffff;
                }
                html.dark[data-scanner-fullscreen],
                html.dark[data-scanner-fullscreen] body {
                    background: #020617;
                }
                @keyframes scanline {
                    0% { transform: translate3d(0, 0, 0); opacity: .7; }
                    50% { transform: translate3d(0, calc(100% - 1px), 0); opacity: 1; }
                    100% { transform: translate3d(0, 0, 0); opacity: .7; }
                }
            `}</style>
        </AppLayout>
    );
}
