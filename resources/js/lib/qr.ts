import QRCode from 'qrcode';

/**
 * Shared settings for participant attendance QR codes.
 *
 * These codes are scanned from phone screens, printed ID cards and emails, so
 * they are tuned for legibility rather than compactness:
 *
 * - `errorCorrectionLevel: 'Q'` recovers 25% of a damaged symbol, which covers
 *   creased cards, glare and print defects. At this payload length it costs
 *   nothing -- level M produces the same 21x21 grid.
 * - `margin: 4` is the quiet zone the QR spec requires. Scanners use it to find
 *   the symbol edge; the previous value of 1 was a large part of why codes read
 *   unreliably in the field.
 * - `scale` sets an exact whole number of pixels per module, so the symbol is
 *   crisp at any display size. Sizing with `width` instead produces fractional
 *   modules and visibly blurs the edges. 16 gives a 464px bitmap for a 21x21
 *   code, which leaves plenty of headroom for high-DPI screens and for print.
 */
export const PARTICIPANT_QR_OPTIONS = {
    errorCorrectionLevel: 'Q',
    margin: 4,
    scale: 16,
} as const satisfies QRCode.QRCodeToDataURLOptions;

export type ParticipantQrSource = {
    display_id?: string | null;
    qr_token?: string | null;
    qr_payload?: string | null;
};

/**
 * The value encoded into a participant's QR code: the participant ID.
 *
 * `display_id` is 14 characters of uppercase letters, digits and a hyphen, so
 * QR encodes it in alphanumeric mode and the symbol fits in version 1 -- a
 * 21x21 grid. For comparison, `qr_token` needs 33x33 and the old `qr_payload`
 * ciphertext needed 65x65, which is what scanners were failing to read.
 *
 * This does not weaken check-in: the scanner's manual entry field already
 * accepts `display_id` and posts it to the same endpoint, so anyone able to
 * read a badge could already check that participant in.
 *
 * Falls back to `qr_token`, which the scanner also resolves.
 */
export function participantQrValue(participant: ParticipantQrSource): string {
    return (participant.display_id || participant.qr_token || '').trim();
}

/**
 * Render an already-resolved QR value as a PNG data URL.
 *
 * Effects should depend on this string rather than on the participant object,
 * which is a fresh reference on every render.
 */
export function renderQrDataUrl(
    value: string,
    overrides: QRCode.QRCodeToDataURLOptions = {},
): Promise<string> {
    return QRCode.toDataURL(value, { ...PARTICIPANT_QR_OPTIONS, ...overrides });
}

/**
 * Render a participant's QR code as a PNG data URL, or null when the
 * participant has no scannable identifier yet.
 */
export async function participantQrDataUrl(
    participant: ParticipantQrSource,
    overrides: QRCode.QRCodeToDataURLOptions = {},
): Promise<string | null> {
    const value = participantQrValue(participant);

    return value ? renderQrDataUrl(value, overrides) : null;
}
