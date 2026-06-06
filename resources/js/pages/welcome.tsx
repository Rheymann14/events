// resources/js/pages/welcome.tsx
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';
import PublicLayout, { PUBLIC_NAV_ITEMS } from '@/layouts/public-layout';
import { cn } from '@/lib/utils';
import { Head, Link } from '@inertiajs/react';
import {
    animate,
    AnimatePresence,
    easeOut,
    motion,
    MotionValue,
    useAnimationFrame,
    useMotionValue,
    useReducedMotion,
    useScroll,
    useTransform,
} from 'framer-motion';
import { ArrowRight, CheckCircle2, MessageCircle, Star, X, MonitorCog } from 'lucide-react';

import * as React from 'react';

// --- TYPES ---
type FlagItem = { name: string; src: string };
type LeadershipItem = { id: number; title: string; src: string; description?: string };
type ActiveRegistrationProgramme = {
    id: number;
    tag: string | null;
    title: string;
    description: string | null;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
    image_url: string | null;
    is_registration_active?: boolean;
    venue?: {
        name: string;
        address?: string | null;
    } | null;
};

type WelcomeProps = {
    canRegister?: boolean;
    activeRegistrationProgramme?: ActiveRegistrationProgramme | null;
};

// --- DATA ---
const ASEAN_FLAGS = [
    { name: 'Brunei', src: '/asean/brunei.jpg' },
    { name: 'Thailand', src: '/asean/thailand.jpg' },
    { name: 'Myanmar', src: '/asean/myanmar.jpg' },
    { name: 'Laos', src: '/asean/laos.jpg' },
    { name: 'Indonesia', src: '/asean/indonesia.jpg' },
    { name: 'Malaysia', src: '/asean/malaysia.jpg' },
    { name: 'Philippines', src: '/asean/philippines.jpg' },
    { name: 'Cambodia', src: '/asean/cambodia.jpg' },
    { name: 'Singapore', src: '/asean/singapore.jpg' },
    { name: 'Vietnam', src: '/asean/vietnam.jpg' },
    { name: 'Timor-Leste', src: '/asean/timor-leste.jpg' },
] as const;

// ✅ Leadership items (realistic titles + descriptions)
const LEADERSHIP_ITEMS: LeadershipItem[] = [
    {
        id: 1,
        title: 'Ferdinand Romualdez Marcos Jr.',
        description:
            'President of the Philippines',
        src: '/img/leaders/pbbm.jpg',
    },
    {
        id: 2,
        title: 'Shirley C. Agrupis, Ph.D.',
        description:
            'Commission on Higher Education Chairperson',
        src: '/img/leaders/ched-chair.jpg',
    },
    {
        id: 3,
        title: 'Desiderio R. Apag III, D.Eng, PCpE',
        description:
            'Commission on Higher Education Commissioner',
        src: '/img/leaders/ched-commissioner-apag.jpg',
    },
    {
        id: 4,
        title: 'Ricmar P. Aquino, Ed.D.',
        description:
            'Commission on Higher Education Commissioner',
        src: '/img/leaders/ched-commissioner-aquino.jpg',
    },
    {
        id: 5,
        title: 'Myrna Q. Mallari, DBA, CPA',
        description:
            'Commission on Higher Education Commissioner',
        src: '/img/leaders/ched-commissioner-mallari.jpg',
    },
    {
        id: 6,
        title: 'Michelle A. Ong, DPA',
        description:
            'Commission on Higher Education Commissioner',
        src: '/img/leaders/ched-commissioner-ong.jpg',
    },
    // {
    //     id: 7,
    //     title: 'Ferdinand Romualdez Marcos Jr.',
    //     description:
    //         'President of the Philippines',
    //     src: '/img/leaders/pbbm.jpg',
    // },
    // {
    //     id: 8,
    //     title: 'Shirley C. Agrupis, Ph.D.',
    //     description:
    //         'Commission on Higher Education Chairperson',
    //     src: '/img/leaders/ched-chair.jpg',
    // },
];


// Split flags for left/right groups
const LEFT_FLAGS = ASEAN_FLAGS.slice(0, 5);
const RIGHT_FLAGS = ASEAN_FLAGS.slice(5, 10); // ✅ only 5 flags on the right (exclude Timor-Leste)
const TIMOR_FLAG = ASEAN_FLAGS[10]; // ✅ Timor-Leste

function resolveEventImageUrl(imageUrl?: string | null) {
    if (!imageUrl) return '/img/ched_co.jpg';
    if (imageUrl.startsWith('http') || imageUrl.startsWith('/')) return imageUrl;
    return `/event-images/${imageUrl}`;
}

function formatEventDateRange(startsAt?: string | null, endsAt?: string | null) {
    if (!startsAt) return 'Date to be announced';

    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;

    if (Number.isNaN(start.getTime())) return 'Date to be announced';

    const dateFormatter = new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
    const timeFormatter = new Intl.DateTimeFormat('en-PH', {
        hour: 'numeric',
        minute: '2-digit',
    });

    if (!end || Number.isNaN(end.getTime())) {
        return `${dateFormatter.format(start)} - ${timeFormatter.format(start)}`;
    }

    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const sameDay = sameMonth && start.getDate() === end.getDate();

    if (sameDay) {
        return `${dateFormatter.format(start)} - ${timeFormatter.format(start)}-${timeFormatter.format(end)}`;
    }

    if (sameMonth) {
        const monthFormatter = new Intl.DateTimeFormat('en-PH', { month: 'short' });
        return `${monthFormatter.format(start)} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
    }

    return `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`;
}

function useMediaQuery(query: string) {
    const [matches, setMatches] = React.useState(false);

    React.useEffect(() => {
        const mq = window.matchMedia(query);
        const onChange = () => setMatches(mq.matches);

        onChange();
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, [query]);

    return matches;
}





/**
 * --------------------------------------------------------------------------
 * HERO SECTION COMPONENTS
 * --------------------------------------------------------------------------
 */

type FlagTarget = { x: number; y: number; r?: number };

function FlyingFlag({
    flag,
    index,
    side,
    progress,
    target,          // ✅ allow fixed target (mobile rows)
    size = 'lg',      // ✅ small flags on mobile
}: {
    flag: FlagItem;
    index: number;
    side: 'left' | 'right' | 'center';
    progress: MotionValue<number>;
    target?: FlagTarget;
    size?: 'sm' | 'lg';
}) {
    const LEFT_X = [-280, -620, -380, -540, -460];
    const LEFT_Y = [-140, 40, 120, -100, 0];
    const LEFT_R = [-12, 5, -8, 10, -4];

    const RIGHT_X = [280, 620, 380, 540, 460];
    const RIGHT_Y = [-140, 40, 120, -100, 0];
    const RIGHT_R = [12, -5, 8, -10, 4];

    const CENTER_X = 0;
    const CENTER_Y = -180;
    const CENTER_R = 0;

    // ✅ if target provided, use it (mobile rows)
    const targetX =
        target?.x ??
        (side === 'left'
            ? (LEFT_X[index] ?? LEFT_X[LEFT_X.length - 1])
            : side === 'right'
                ? (RIGHT_X[index] ?? RIGHT_X[RIGHT_X.length - 1])
                : CENTER_X);

    const targetY =
        target?.y ??
        (side === 'left'
            ? (LEFT_Y[index] ?? 0)
            : side === 'right'
                ? (RIGHT_Y[index] ?? 0)
                : CENTER_Y);

    const targetR =
        target?.r ??
        (side === 'left'
            ? (LEFT_R[index] ?? 0)
            : side === 'right'
                ? (RIGHT_R[index] ?? 0)
                : CENTER_R);

    const x = useTransform(progress, [0, 0.6], [0, targetX]);
    const y = useTransform(progress, [0, 0.6], [0, targetY]);
    const rotate = useTransform(progress, [0, 0.6], [0, targetR]);
    const opacity = useTransform(progress, [0, 0.05, 0.2], [0, 0, 1]);

    const scale = useTransform(progress, [0, 0.3], [0.45, target ? 1 : side === 'center' ? 0.9 : 0.8]);

    const sizeClass =
        size === 'sm'
            ? 'w-12 sm:w-32 md:w-36' // ✅ small on mobile
            : 'w-24 sm:w-32 md:w-36';

    return (
        <motion.div
            style={{
                x,
                y,
                rotate,
                scale,
                opacity,
                zIndex: target ? 65 : side === 'center' ? 65 : (5 - index) * 10,
            }}
            className="absolute pointer-events-none sm:pointer-events-auto transition-transform duration-300 sm:hover:z-50 sm:hover:scale-100"
        >
            <div className={`${sizeClass} overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/60`}>
                <img
                    src={flag.src}
                    alt={flag.name}
                    className="aspect-[3/2] h-full w-full object-cover"
                    draggable={false}
                />
            </div>
        </motion.div>
    );
}




function HeroSection({ activeRegistrationProgramme }: { activeRegistrationProgramme?: ActiveRegistrationProgramme | null }) {
    const featuredEvent = activeRegistrationProgramme ?? null;
    const featuredImageUrl = resolveEventImageUrl(featuredEvent?.image_url);
    const featuredTitle = featuredEvent?.title ?? 'No featured event';
    const featuredDescription =
        featuredEvent?.description ??
        'No featured event yet.';
    const featuredDate = formatEventDateRange(featuredEvent?.starts_at, featuredEvent?.ends_at);
    const featuredVenue = featuredEvent?.venue?.name ?? featuredEvent?.location ?? 'Venue to be announced';
    const featuredSubtitle = featuredEvent ? 'Active registration event' : 'No featured event yet';

    return (
        <section className="relative z-20 flex min-h-[90vh] items-center justify-center px-6">
            <div className="mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2 items-center gap-10 lg:gap-16">

                {/* ================= LEFT SIDE ================= */}
                <div className="relative z-30 text-center lg:text-left">

                    {/* Logos row */}
                    <div className="mb-6 flex items-center justify-center gap-3 lg:justify-start">
                        <img
                            src="/img/ched_logo.png"
                            className="h-13 w-auto"
                            alt="CHED"
                        />
                        <img
                            src="/img/bagong_pilipinas.png"
                            className="h-18 w-auto"
                            alt="Bagong Pilipinas"
                        />
                        <img
                            src="/img/achieve.png"
                            className="h-18 w-auto"
                            alt="ACHIEVE"
                        />
                    </div>

                    {/* Main Title */}
                    <h1 className="text-[52px] font-extrabold leading-[1.05] tracking-tight text-[#0b1220]">
                        CHED Events
                        <br />
                        Registration System
                    </h1>

                    {/* Subtitle */}
                    <p className="mt-4 max-w-xl text-[16px] leading-[1.7] text-slate-600 lg:mx-0 mx-auto">
                        A centralized platform for managing event registration, participant attendance,
                        and event-related records for CHED activities.
                    </p>

                    {/* CTA */}
                    <div className="relative z-[60] mt-10 flex justify-center lg:justify-start">
                        <Button
                            asChild
                            className="group relative z-[60] min-h-14 w-full max-w-xs touch-manipulation rounded-full bg-[#0033A0] px-10 py-4 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-[#002a85] sm:w-auto"
                        >
                            <Link href="/register">
                                Register Now
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition group-hover:bg-white/25">
                                    <ArrowRight className="h-4 w-4 text-white" />
                                </span>
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* ================= RIGHT SIDE ================= */}
                <div className="flex justify-center pb-12 lg:justify-end lg:pb-0">
                    <div className="w-full max-w-[600px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)]">

                        {/* HEADER */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[18px] font-bold text-slate-900">
                                    Featured Event
                                </h3>

                                <span className="rounded-full bg-[#0033A0]/10 px-3 py-1 text-[11px] font-semibold text-[#0033A0]">
                                    CHED
                                </span>
                            </div>

                            <p className="text-[12px] text-slate-500">
                                {featuredSubtitle}
                            </p>
                        </div>

                        {/* EVENT CARD */}
                        {featuredEvent ? (
                            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-[#0033A0]/5 via-white to-amber-50/40">

                                {/* IMAGE */}
                                <div className="relative h-32 w-full">
                                    <img
                                        src={featuredImageUrl}
                                        alt={featuredEvent.title}
                                        className="h-full w-full object-cover"
                                    />

                                    {/* overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/10 to-transparent" />

                                    {/* badge */}
                                    <div className="absolute left-3 top-3">
                                        <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-white backdrop-blur">
                                            FEATURED
                                        </span>
                                    </div>

                                    {/* date */}
                                    <div className="absolute bottom-3 left-3">
                                        <p className="text-[10px] text-white/70 uppercase tracking-wider">
                                            Date
                                        </p>
                                        <p className="text-sm font-semibold text-white">{featuredDate}</p>
                                    </div>
                                </div>

                                {/* CONTENT */}
                                <div className="p-4">

                                    <h4 className="text-sm font-bold text-slate-900">
                                        {featuredTitle}
                                    </h4>

                                    <p className="mt-1 text-[12px] text-slate-600 leading-relaxed">
                                        {featuredDescription}
                                    </p>

                                    {/* META */}
                                    <div className="mt-4 grid grid-cols-1 gap-2 text-[11px]">
                                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                                            <p className="text-slate-400 uppercase">Venue</p>
                                            <p className="font-semibold text-slate-800">{featuredVenue}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
                                <p className="text-sm font-semibold text-slate-500">
                                    No Featured Event Yet
                                </p>
                                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
                                    Registration details will appear here once a featured event is available.
                                </p>
                            </div>
                        )}


                    </div>
                </div>
            </div>
        </section>
    );
}


function ClientPortal({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;
    return createPortal(children, document.body);
}



/**
 * --------------------------------------------------------------------------
 * MODAL COMPONENT (Leadership Profile)
 * --------------------------------------------------------------------------
 */
function LeaderModal({
    item,
    isOpen,
    onClose,
}: {
    item: LeadershipItem | null;
    isOpen: boolean;
    onClose: () => void;
}) {
    const shouldReduceMotion = useReducedMotion();

    React.useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen, onClose]);

    if (!item) return null;

    return (
        <ClientPortal>
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Overlay */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
                        />

                        {/* Centered modal */}
                        <div
                            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                            onClick={onClose}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: 18 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: 18 }}
                                transition={{ duration: 0.22, ease: easeOut }}
                                onClick={(e) => e.stopPropagation()} // ✅ don’t close when clicking inside
                                className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-950 dark:ring-white/10"
                            >
                                <button
                                    onClick={onClose}
                                    className="absolute right-4 top-4 z-10 rounded-full bg-black/10 p-2 transition hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
                                    aria-label="Close"
                                    type="button"
                                >
                                    <X className="h-5 w-5 text-slate-800 dark:text-slate-100" />
                                </button>

                                <div className="grid grid-cols-1 md:grid-cols-2">
                                    <div className="relative h-64 bg-slate-100 md:h-[520px]">
                                        <img
                                            src={item.src}
                                            alt={item.title}
                                            className="h-full w-full object-cover"
                                            draggable={false}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-slate-950/10 to-transparent" />
                                        <div className="absolute bottom-4 left-4 right-4">
                                            <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-[0.22em] text-white backdrop-blur">
                                                CHED EVENTS
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col justify-center p-8 md:p-12">
                                        <span className="mb-2 text-xs font-bold tracking-[0.28em] text-[#1e3c73] uppercase dark:text-amber-200/90">
                                            Leadership Profile
                                        </span>

                                        <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                                            {item.title}
                                        </h2>

                                        <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                            {item.description ||
                                                'A key leadership role supporting the delivery of CHED Events through coordinated planning, operational readiness, and delegate services.'}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>
        </ClientPortal>
    );
}


/**
 * --------------------------------------------------------------------------
 * 3D RING COMPONENT
 * --------------------------------------------------------------------------
 */

interface ThreeDImageRingProps {
    items: LeadershipItem[];
    width?: number;
    perspective?: number;
    imageDistance?: number;
    initialRotation?: number;
    animationDuration?: number;
    staggerDelay?: number;
    hoverOpacity?: number;
    containerClassName?: string;
    ringClassName?: string;
    imageClassName?: string;
    draggable?: boolean;
    ease?: string;
    mobileBreakpoint?: number;
    mobileScaleFactor?: number;
    inertiaPower?: number;
    inertiaTimeConstant?: number;
    inertiaVelocityMultiplier?: number;
    onItemClick: (item: LeadershipItem) => void;
}

function ThreeDImageRing({
    items,
    width = 300,
    perspective = 2000,
    imageDistance = 500,
    initialRotation = 180,
    animationDuration = 1.5,
    staggerDelay = 0.1,
    containerClassName,
    ringClassName,
    imageClassName,
    draggable = true,
    ease = 'easeOut',
    mobileBreakpoint = 768,
    mobileScaleFactor = 0.8,
    inertiaPower = 0.8,
    inertiaTimeConstant = 300,
    inertiaVelocityMultiplier = 20,
    onItemClick,
}: ThreeDImageRingProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const ringRef = React.useRef<HTMLDivElement>(null);

    const shouldReduceMotion = useReducedMotion();

    const rotationY = useMotionValue(initialRotation);
    const startX = React.useRef<number>(0);
    const currentRotationY = React.useRef<number>(initialRotation);
    const isDragging = React.useRef<boolean>(false);
    const velocity = React.useRef<number>(0);
    const [isHovering, setIsHovering] = React.useState(false);

    const [currentScale, setCurrentScale] = React.useState(1);
    const [showImages, setShowImages] = React.useState(false);

    const angle = React.useMemo(() => 360 / items.length, [items.length]);

    useAnimationFrame((t, delta) => {
        if (shouldReduceMotion) return;
        if (!isDragging.current && velocity.current === 0 && !isHovering) {
            const newRot = rotationY.get() + 0.015 * delta;
            rotationY.set(newRot);
            currentRotationY.current = newRot;
        }
    });

    React.useEffect(() => {
        const unsubscribe = rotationY.on('change', (latestRotation) => {
            currentRotationY.current = latestRotation;
        });
        return () => unsubscribe();
    }, [rotationY]);

    React.useEffect(() => {
        const handleResize = () => {
            const viewportWidth = window.innerWidth;
            const newScale = viewportWidth <= mobileBreakpoint ? mobileScaleFactor : 1;
            setCurrentScale(newScale);
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [mobileBreakpoint, mobileScaleFactor]);

    React.useEffect(() => {
        setShowImages(true);
    }, []);

    const handleDragStart = (event: React.MouseEvent | React.TouchEvent) => {
        if (!draggable) return;
        isDragging.current = true;
        const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
        startX.current = clientX;
        rotationY.stop();
        velocity.current = 0;

        if (ringRef.current) (ringRef.current as HTMLElement).style.cursor = 'grabbing';

        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchmove', handleDrag);
        document.addEventListener('touchend', handleDragEnd);
    };

    const handleDrag = (event: MouseEvent | TouchEvent) => {
        if (!draggable || !isDragging.current) return;
        const clientX =
            'touches' in event ? (event as TouchEvent).touches[0].clientX : (event as MouseEvent).clientX;

        const deltaX = clientX - startX.current;
        velocity.current = -deltaX * 0.5;

        rotationY.set(currentRotationY.current + velocity.current);
        startX.current = clientX;
    };

    const handleDragEnd = () => {
        isDragging.current = false;

        if (ringRef.current) {
            ringRef.current.style.cursor = 'grab';
            currentRotationY.current = rotationY.get();
        }

        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDrag);
        document.removeEventListener('touchend', handleDragEnd);

        const initial = rotationY.get();
        const velocityBoost = velocity.current * inertiaVelocityMultiplier;
        const target = initial + velocityBoost;

        animate(initial, target, {
            type: 'inertia',
            velocity: velocityBoost,
            power: inertiaPower,
            timeConstant: inertiaTimeConstant,
            restDelta: 0.5,
            modifyTarget: (t) => Math.round(t / angle) * angle,
            onUpdate: (latest) => rotationY.set(latest),
        });

        velocity.current = 0;
    };

    const imageVariants = {
        hidden: { y: 200, opacity: 0 },
        visible: { y: 0, opacity: 1 },
    };

    return (
        <div
            ref={containerRef}
            className={cn('relative h-full w-full select-none overflow-visible', containerClassName)}
            style={{ transform: `scale(${currentScale})`, transformOrigin: 'center center' }}
            onMouseDown={draggable ? handleDragStart : undefined}
            onTouchStart={draggable ? handleDragStart : undefined}
        >
            <div
                style={{
                    perspective: `${perspective}px`,
                    width: `${width}px`,
                    height: `${width * 1.33}px`,
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                }}
            >
                <motion.div
                    ref={ringRef}
                    className={cn('absolute h-full w-full', ringClassName)}
                    style={{
                        transformStyle: 'preserve-3d',
                        rotateY: rotationY,
                        cursor: draggable ? 'grab' : 'default',
                    }}
                >
                    <AnimatePresence>
                        {showImages &&
                            items.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    onMouseEnter={() => setIsHovering(true)}
                                    onMouseLeave={() => setIsHovering(false)}
                                    onClick={() => onItemClick(item)}
                                    className={cn(
                                        'group absolute h-full w-full cursor-pointer overflow-hidden rounded-xl bg-slate-950 shadow-2xl ring-1 ring-white/20',
                                        imageClassName,
                                    )}
                                    style={{
                                        transformStyle: 'preserve-3d',
                                        backfaceVisibility: 'hidden',
                                        rotateY: index * -angle,
                                        z: -imageDistance * currentScale,
                                        transformOrigin: `50% 50% ${imageDistance * currentScale}px`,
                                    }}
                                    initial="hidden"
                                    animate="visible"
                                    exit="hidden"
                                    variants={imageVariants}
                                    transition={{
                                        delay: index * staggerDelay,
                                        duration: animationDuration,
                                        ease: easeOut,
                                    }}
                                    whileHover={{ scale: 1.05, transition: { duration: 0.15 } }}
                                >
                                    {/* ✅ NO LEFT/RIGHT SHIFT: keep center position; only zoom (subtle) */}
                                    <motion.div
                                        className="absolute inset-0 bg-cover bg-center will-change-transform"
                                        style={{ backgroundImage: `url(${item.src})`, backgroundPosition: 'center' }}
                                        animate={
                                            shouldReduceMotion
                                                ? undefined
                                                : {
                                                    scale: [1.08, 1.02, 1.08],
                                                }
                                        }
                                        transition={
                                            shouldReduceMotion
                                                ? undefined
                                                : {
                                                    duration: 9,
                                                    repeat: Infinity,
                                                    ease: 'easeInOut',
                                                }
                                        }
                                        whileHover={{ scale: 1.14, transition: { duration: 0.25 } }}
                                    >
                                        <div className="absolute inset-0 bg-slate-950/25 transition-colors group-hover:bg-slate-950/55" />
                                    </motion.div>

                                    <div className="absolute inset-x-0 bottom-0 p-6">
                                        <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
                                            <h3 className="text-balance text-center text-base font-semibold text-white drop-shadow">
                                                {item.title}
                                            </h3>
                                            {/* <p className="mt-2 line-clamp-3 text-center text-xs leading-relaxed text-white/80"> */}
                                            {/* {item.description} */}
                                            {/* </p> */}

                                            <div className="mt-4 flex justify-center">
                                                <Button
                                                    size="sm"
                                                    className="rounded-full bg-white/15 text-white hover:bg-white/30 backdrop-blur-sm shadow-lg border border-white/20"
                                                >
                                                    View Profile
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
}

/**
 * --------------------------------------------------------------------------
 * MAIN PAGE
 * --------------------------------------------------------------------------
 */


export default function Welcome({ canRegister = true, activeRegistrationProgramme = null }: WelcomeProps) {





    const [selectedLeader, setSelectedLeader] = React.useState<LeadershipItem | null>(null);
    const [modalOpen, setModalOpen] = React.useState(false);

    const sectionNavItems = React.useMemo(() => PUBLIC_NAV_ITEMS.filter((i) => i.href.startsWith('#')), []);

    const [feedbackRating, setFeedbackRating] = React.useState(0);
    const [feedbackOpen, setFeedbackOpen] = React.useState(false);
    const [feedbackLauncherHidden, setFeedbackLauncherHidden] = React.useState(false);
    const [includeUserExperience, setIncludeUserExperience] = React.useState(true);
    const [includeEventFeedback, setIncludeEventFeedback] = React.useState(false);
    const [recommendations, setRecommendations] = React.useState('');
    const [feedbackStatus, setFeedbackStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
    const [feedbackMessage, setFeedbackMessage] = React.useState('');
    const [feedbackSubmitting, setFeedbackSubmitting] = React.useState(false);
    const [eventRatings, setEventRatings] = React.useState<Record<string, number>>({});

    const eventCategories = React.useMemo(() => ['Venue', 'Food', 'Speaker', 'Program flow', 'Sound system'], []);
    const hasEventRatings = React.useMemo(
        () => includeEventFeedback && Object.values(eventRatings).some((value) => value > 0),
        [eventRatings, includeEventFeedback],
    );
    const hasUserExperienceRating = includeUserExperience && feedbackRating > 0;
    const canSubmitFeedback = hasEventRatings || hasUserExperienceRating;

    const handleLeaderClick = (item: LeadershipItem) => {
        setSelectedLeader(item);
        setModalOpen(true);
    };

    const sendFeedback = React.useCallback(async () => {
        if (feedbackSubmitting) return;

        if (!canSubmitFeedback) {
            setFeedbackStatus('error');
            setFeedbackMessage('Please add at least one rating before sending your feedback.');
            return;
        }

        setFeedbackSubmitting(true);
        setFeedbackStatus('idle');
        setFeedbackMessage('');

        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
        const eventRatingsPayload = Object.fromEntries(Object.entries(eventRatings).filter(([, value]) => value > 0));

        const payload: Record<string, unknown> = {};

        if (includeUserExperience && feedbackRating > 0) payload.user_experience_rating = feedbackRating;

        if (includeEventFeedback && Object.keys(eventRatingsPayload).length > 0) payload.event_ratings = eventRatingsPayload;

        if (recommendations.trim()) payload.recommendations = recommendations.trim();

        try {
            const response = await fetch('/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                    Accept: 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const message = errorData?.message || 'We could not send your feedback. Please try again.';
                setFeedbackStatus('error');
                setFeedbackMessage(message);
                return;
            }

            setFeedbackStatus('success');
            setFeedbackMessage('Thanks for sharing your feedback!');
            setFeedbackRating(0);
            setEventRatings({});
            setRecommendations('');
        } catch (error) {
            setFeedbackStatus('error');
            setFeedbackMessage('We could not send your feedback. Please try again.');
        } finally {
            setFeedbackSubmitting(false);
        }
    }, [
        canSubmitFeedback,
        eventRatings,
        feedbackRating,
        feedbackSubmitting,
        includeEventFeedback,
        includeUserExperience,
        recommendations,
    ]);

    const [activeHref, setActiveHref] = React.useState<string>(() => {
        if (typeof window === 'undefined') return '#home';
        return window.location.hash || '#home';
    });

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const headerOffset = 84;
        const sections = sectionNavItems
            .map((i) => document.querySelector(i.href) as HTMLElement | null)
            .filter(Boolean) as HTMLElement[];

        if (!sections.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting);
                if (!visible.length) return;

                visible.sort((a, b) => {
                    if (b.intersectionRatio !== a.intersectionRatio) return b.intersectionRatio - a.intersectionRatio;
                    return a.boundingClientRect.top - b.boundingClientRect.top;
                });

                const id = (visible[0].target as HTMLElement).id;
                if (id) setActiveHref(`#${id}`);
            },
            {
                root: null,
                threshold: [0.15, 0.25, 0.35, 0.5],
                rootMargin: `-${headerOffset}px 0px -60% 0px`,
            },
        );

        sections.forEach((s) => observer.observe(s));

        const onHash = () => setActiveHref(window.location.hash || '#home');
        window.addEventListener('hashchange', onHash);

        return () => {
            observer.disconnect();
            window.removeEventListener('hashchange', onHash);
        };
    }, [sectionNavItems]);

    React.useEffect(() => {
        if (typeof document === 'undefined') return;
        const bodyStyle = document.body.style;
        const originalOverflow = bodyStyle.overflow;
        if (feedbackOpen) bodyStyle.overflow = 'hidden';
        return () => {
            bodyStyle.overflow = originalOverflow;
        };
    }, [feedbackOpen]);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const updateFeedbackVisibility = () => {
            const footer = document.querySelector('footer');
            const shouldHide = footer ? footer.getBoundingClientRect().top <= window.innerHeight - 16 : false;
            setFeedbackLauncherHidden(shouldHide);
            if (shouldHide) setFeedbackOpen(false);
        };

        updateFeedbackVisibility();
        window.addEventListener('scroll', updateFeedbackVisibility, { passive: true });
        window.addEventListener('resize', updateFeedbackVisibility);

        return () => {
            window.removeEventListener('scroll', updateFeedbackVisibility);
            window.removeEventListener('resize', updateFeedbackVisibility);
        };
    }, []);

    return (
        <>
            <Head title="">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600,700" rel="stylesheet" />
            </Head>

      <PublicLayout
    canRegister={canRegister}
    navActive={activeHref}
    onNavActiveChange={setActiveHref}
    background={
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">

            {/* Base */}
            <div className="absolute inset-0 bg-white" />

            {/* Top-left blob */}
            <div className="absolute -top-44 -left-44 h-[560px] w-[560px] rounded-full bg-[#0033A0]/[0.14] blur-[120px]" />

            {/* Top-right blob */}
            <div className="absolute -top-36 -right-40 h-[560px] w-[560px] rounded-full bg-amber-300/[0.18] blur-[130px]" />

            {/* Center soft glow */}
            <div className="absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/[0.16] blur-[145px]" />

            {/* Bottom accent */}
            <div className="absolute -bottom-44 left-1/3 h-[560px] w-[560px] rounded-full bg-indigo-300/[0.14] blur-[135px]" />
        </div>
    }
>


                {/* 1. HERO */}
                <HeroSection activeRegistrationProgramme={activeRegistrationProgramme} />

                {/* 2. 3D RING LEADERSHIP */}
                {/* 2. 3D RING LEADERSHIP (fade-in on reach) */}
                <motion.section
                    className="relative z-30 hidden h-[680px] w-full overflow-hidden py-20"
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, amount: 0.25 }} // ✅ triggers only when section is reached
                    variants={{
                        hidden: { opacity: 0, y: 28 },
                        show: {
                            opacity: 1,
                            y: 0,
                            transition: {
                                duration: 0.7,
                                ease: easeOut,
                                when: 'beforeChildren',
                                staggerChildren: 0.08,
                            },
                        },
                    }}
                >
                    <motion.div
                        className="mx-auto mb-10 max-w-2xl text-center"
                        variants={{
                            hidden: { opacity: 0, y: 18 },
                            show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: easeOut } },
                        }}
                    >
                        <motion.div
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
                            variants={{
                                hidden: { opacity: 0, y: 10 },
                                show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOut } },
                            }}
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Leaders
                        </motion.div>

                        <motion.h2
                            className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl"
                            variants={{
                                hidden: { opacity: 0, y: 14 },
                                show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: easeOut } },
                            }}
                        >
                            <span className="text-[#0033A0]">CHED</span> <span className="text-slate-900">Events</span>{' '}
                            <span className="text-amber-600">Registration</span>
                            <div className="span text-lg">Higher Education Sector</div>
                        </motion.h2>

                        <motion.p
                            className="mt-3 text-base leading-relaxed text-slate-600"
                            variants={{
                                hidden: { opacity: 0, y: 14 },
                                show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: easeOut } },
                            }}
                        >
                            Leaders supporting CHED Events coordination, protocol, readiness, and delegate services.
                        </motion.p>
                    </motion.div>

                    <motion.div
                        className="flex h-full w-full items-start justify-center"
                        variants={{
                            hidden: { opacity: 0, y: 18, scale: 0.985 },
                            show: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { duration: 0.65, ease: easeOut },
                            },
                        }}
                    >
                        <ThreeDImageRing
                            items={LEADERSHIP_ITEMS}
                            width={280}
                            imageDistance={550}
                            onItemClick={handleLeaderClick}
                        />
                    </motion.div>
                </motion.section>


                {/* MODAL */}
                <LeaderModal item={selectedLeader} isOpen={modalOpen} onClose={() => setModalOpen(false)} />

                {/* 3. FEEDBACK FORM (UNCHANGED) */}
                <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
                    <div
                        className={cn(
                            'w-[280px] max-w-[calc(100vw-2.5rem)] sm:w-[320px]',
                            'transition-all duration-300 ease-out',
                            feedbackOpen
                                ? 'translate-y-0 scale-100 opacity-100'
                                : 'pointer-events-none translate-y-4 scale-95 opacity-0',
                        )}
                    >
                        <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/95 p-4 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.6)] ring-1 ring-slate-200/60 backdrop-blur">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold tracking-[0.32em] text-[#1e3c73] uppercase">
                                        CHED Events Registration
                                    </p>

                                    <p className="mt-1 text-xs text-slate-600">
                                        Share your experience to help us elevate the event.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setFeedbackOpen(false)}
                                    className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-[#1e3c73]/40 hover:text-[#1e3c73]"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 space-y-2">
                                <p className="text-xs font-semibold text-slate-700">Include feedback for</p>
                                <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-slate-300 text-[#1e3c73]"
                                            checked={includeUserExperience}
                                            onChange={(event) => setIncludeUserExperience(event.target.checked)}
                                        />
                                        User experience
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-slate-300 text-[#1e3c73]"
                                            checked={includeEventFeedback}
                                            onChange={(event) => setIncludeEventFeedback(event.target.checked)}
                                        />
                                        Event
                                    </label>
                                </div>
                            </div>

                            <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                                {includeEventFeedback && (
                                    <div>
                                        <p className="text-xs font-semibold text-slate-700">Event highlights</p>
                                        <div className="mt-2 space-y-2">
                                            {eventCategories.map((category) => {
                                                const rating = eventRatings[category] ?? 0;
                                                return (
                                                    <div
                                                        key={category}
                                                        className="rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                    >
                                                        <p className="text-xs font-semibold tracking-[0.22em] text-slate-500 uppercase">
                                                            {category}
                                                        </p>
                                                        <div className="mt-2 flex items-center gap-1.5">
                                                            {[1, 2, 3, 4, 5].map((star) => {
                                                                const isActive = star <= rating;
                                                                return (
                                                                    <button
                                                                        key={star}
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setEventRatings((current) => ({
                                                                                ...current,
                                                                                [category]: star,
                                                                            }))
                                                                        }
                                                                        className={cn(
                                                                            'inline-flex h-8 w-8 items-center justify-center rounded-full border transition',
                                                                            isActive
                                                                                ? 'border-amber-300/60 bg-amber-100/60 text-amber-500'
                                                                                : 'border-slate-200 text-slate-400 hover:border-[#1e3c73]/40 hover:text-[#1e3c73]',
                                                                        )}
                                                                        aria-label={`Rate ${category} ${star} star${star === 1 ? '' : 's'}`}
                                                                    >
                                                                        <Star
                                                                            className={cn(
                                                                                'h-4 w-4',
                                                                                isActive ? 'fill-amber-400 text-amber-400' : '',
                                                                            )}
                                                                        />
                                                                    </button>
                                                                );
                                                            })}
                                                            <span className="text-[10px] font-medium text-slate-500">
                                                                {rating ? `${rating}/5` : 'Tap a star'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {includeUserExperience && (
                                    <div>
                                        <p className="text-xs font-semibold text-slate-700">Ease of navigation</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            {[1, 2, 3, 4, 5].map((star) => {
                                                const isActive = star <= feedbackRating;
                                                return (
                                                    <button
                                                        key={star}
                                                        type="button"
                                                        onClick={() => setFeedbackRating(star)}
                                                        className={cn(
                                                            'inline-flex h-8 w-8 items-center justify-center rounded-full border transition',
                                                            isActive
                                                                ? 'border-amber-300/60 bg-amber-100/60 text-amber-500'
                                                                : 'border-slate-200 text-slate-400 hover:border-[#1e3c73]/40 hover:text-[#1e3c73]',
                                                        )}
                                                        aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                                                    >
                                                        <Star
                                                            className={cn(
                                                                'h-4 w-4',
                                                                isActive ? 'fill-amber-400 text-amber-400' : '',
                                                            )}
                                                        />
                                                    </button>
                                                );
                                            })}
                                            <span className="text-[10px] font-medium text-slate-500">
                                                {feedbackRating ? `${feedbackRating}/5` : 'Tap a star'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <label className="block text-xs font-semibold text-slate-700">
                                    Recommendations
                                    <textarea
                                        rows={3}
                                        placeholder="Tell us what would make the experience even better..."
                                        value={recommendations}
                                        onChange={(event) => setRecommendations(event.target.value)}
                                        className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm transition outline-none focus:border-[#1e3c73] focus:ring-2 focus:ring-[#1e3c73]/20"
                                    />
                                </label>
                            </div>

                            <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
                                <Button
                                    type="button"
                                    onClick={sendFeedback}
                                    disabled={!canSubmitFeedback || feedbackSubmitting}
                                    className="h-10 w-full rounded-2xl bg-[#1e3c73] text-xs font-semibold text-white shadow-lg shadow-[#1e3c73]/30 transition hover:bg-[#25468a] disabled:cursor-not-allowed disabled:bg-slate-400"
                                >
                                    {feedbackSubmitting ? 'Sending...' : 'Send feedback'}
                                </Button>

                                {feedbackMessage && (
                                    <div
                                        className={cn(
                                            'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
                                            feedbackStatus === 'success'
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                : 'border-rose-200 bg-rose-50 text-rose-600',
                                        )}
                                    >
                                        {feedbackStatus === 'success' && <CheckCircle2 className="h-4 w-4" />}
                                        <span>{feedbackMessage}</span>
                                        {feedbackStatus === 'success' && (
                                            <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] tracking-[0.2em] text-emerald-700 uppercase">
                                                Sent
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <Button
                        type="button"
                        onClick={() => setFeedbackOpen((open) => !open)}
                        aria-hidden={feedbackLauncherHidden}
                        className={cn(
                            'group h-10 rounded-full bg-gradient-to-r from-[#1e3c73] via-[#25468a] to-[#1e3c73] px-4 text-xs font-semibold text-white shadow-lg shadow-[#1e3c73]/30 transition hover:brightness-110',
                            feedbackLauncherHidden && 'pointer-events-none translate-y-3 scale-95 opacity-0',
                        )}
                    >
                        <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                            <MessageCircle className="h-3.5 w-3.5" />
                        </span>
                        {feedbackOpen ? 'Hide feedback' : 'Give feedback'}
                    </Button>
                </div>
            </PublicLayout>
        </>
    );
}
