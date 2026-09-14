<?php

namespace App\Support;

use App\Models\User;
use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\ByteMatrix;
use BaconQrCode\Encoder\Encoder;

/**
 * Builds the participant attendance QR code.
 *
 * The encoded value is the participant's `display_id` rather than the
 * 256-character `qr_payload` ciphertext. `display_id` is 14 characters of
 * uppercase letters, digits and a hyphen, so QR encodes it in alphanumeric
 * mode and the symbol fits in version 1 -- a 21x21 grid. The ciphertext forced
 * version 12 (65x65), which is what scanners were failing to read in the field.
 *
 * Encrypting bought no security to begin with: the ciphertext is printed on the
 * badge in plain sight. Nor does using `display_id` weaken check-in, since the
 * scanner's manual entry field already accepts it and posts to the same
 * endpoint.
 *
 * ScannerController::resolveParticipant() accepts display_id, the decrypted
 * payload, and the raw token, so previously issued badges still scan.
 */
class ParticipantQr
{
    /** Quiet zone required by the QR spec, in modules. */
    public const QUIET_MODULES = 4;

    /**
     * Pixels per module when rasterising. A 21x21 code plus its quiet zone is
     * 29 modules, so this yields a 464px PNG -- enough headroom to downscale
     * cleanly into an email or a high-DPI screen.
     */
    public const MODULE_PIXELS = 16;

    /**
     * The value to encode. Falls back to qr_token, which the scanner also
     * resolves, for any account without a display_id.
     */
    public static function value(?User $user): string
    {
        return (string) ($user?->display_id ?: $user?->qr_token ?: '');
    }

    /**
     * Encode at error correction level Q (25% recovery) so creased, smudged or
     * glare-hit badges still read.
     */
    public static function matrix(string $payload): ByteMatrix
    {
        return Encoder::encode($payload, ErrorCorrectionLevel::Q())->getMatrix();
    }

    /**
     * Render the QR as PNG binary.
     *
     * Uses GD directly rather than a BaconQrCode image renderer: the package
     * only ships Imagick, SVG and EPS backends, Imagick is not installed, and
     * SVG is unreliable in email clients.
     */
    public static function png(string $payload, int $modulePixels = self::MODULE_PIXELS): string
    {
        $matrix = self::matrix($payload);
        $modules = $matrix->getWidth();
        $side = ($modules + (self::QUIET_MODULES * 2)) * $modulePixels;

        $image = imagecreatetruecolor($side, $side);
        $white = imagecolorallocate($image, 255, 255, 255);
        $black = imagecolorallocate($image, 0, 0, 0);
        imagefilledrectangle($image, 0, 0, $side - 1, $side - 1, $white);

        $offset = self::QUIET_MODULES * $modulePixels;

        for ($row = 0; $row < $modules; $row++) {
            for ($column = 0; $column < $modules; $column++) {
                if ($matrix->get($column, $row) !== 1) {
                    continue;
                }

                $x = $offset + ($column * $modulePixels);
                $y = $offset + ($row * $modulePixels);

                imagefilledrectangle($image, $x, $y, $x + $modulePixels - 1, $y + $modulePixels - 1, $black);
            }
        }

        ob_start();
        imagepng($image);
        $png = (string) ob_get_clean();
        imagedestroy($image);

        return $png;
    }
}
