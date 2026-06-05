import { InertiaLinkProps } from '@inertiajs/react';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function isSameUrl(
    url1: NonNullable<InertiaLinkProps['href']>,
    url2: NonNullable<InertiaLinkProps['href']>,
) {
    return resolveUrl(url1) === resolveUrl(url2);
}

export function resolveUrl(url: NonNullable<InertiaLinkProps['href']>): string {
    return typeof url === 'string' ? url : url.url;
}

export function toDateOnlyTimestamp(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export type EventPhase = 'ongoing' | 'upcoming' | 'closed';

function parseDate(value?: string | null): Date | null {
    if (!value) return null;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveEventPhaseFromDates(
    startsAt?: string | null,
    endsAt?: string | null,
    nowTs = Date.now(),
    isActive = true,
): EventPhase {
    if (!isActive) return 'closed';

    const start = parseDate(startsAt);
    const end = parseDate(endsAt);
    const now = new Date(nowTs);
    const nowTime = now.getTime();

    if (start && nowTime < start.getTime()) return 'upcoming';

    if (end) {
        return nowTime <= end.getTime() ? 'ongoing' : 'closed';
    }

    if (!start) return 'upcoming';

    return toDateOnlyTimestamp(now) === toDateOnlyTimestamp(start)
        ? 'ongoing'
        : 'closed';
}
