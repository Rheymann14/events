<?php

namespace App\Http\Controllers;

use App\Models\ParticipantAttendance;
use App\Models\ParticipantTableAssignment;
use App\Models\Programme;
use App\Models\User;
use App\Support\EventDefaults;
use Carbon\Carbon;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Inertia\Inertia;

class ScannerController extends Controller
{
    public function index()
    {
        $now = now();

        $programmes = Programme::query()
            ->orderBy('starts_at')
            ->get()
            ->map(function (Programme $programme) use ($now) {
                return [
                    'id' => $programme->id,
                    'title' => $programme->title,
                    'image_url' => $programme->image_url,
                    'starts_at' => $programme->starts_at?->toISOString(),
                    'ends_at' => $programme->ends_at?->toISOString(),
                    'is_active' => $programme->is_active,
                    'is_registration_active' => $programme->is_registration_active,
                    'phase' => $this->resolvePhase($programme, $now),
                ];
            })
            ->values();

        $defaultEventId = EventDefaults::defaultEventId(
            $programmes,
            fn ($events) => $events->firstWhere('phase', 'ongoing') ?? $events->firstWhere('phase', 'upcoming'),
        ) ?: null;

        return Inertia::render('scanner', [
            'events' => $programmes,
            'default_event_id' => $defaultEventId,
        ]);
    }

    public function scan(Request $request)
    {
        $validated = $request->validate([
            'code' => ['required', 'string'],
            'event_id' => ['required', 'exists:programmes,id'],
        ]);

        $event = Programme::query()->find($validated['event_id']);
        if (! $event) {
            return response()->json([
                'ok' => false,
                'message' => 'Selected event not found.',
            ]);
        }

        $now = now();

        if (! $this->isOpenForScanning($event, $now)) {
            return response()->json([
                'ok' => false,
                'message' => $this->scanClosedMessage($event, $now),
            ]);
        }

        $matches = $this->resolveParticipants($validated['code']);

        if ($matches->count() > 1) {
            return response()->json([
                'ok' => false,
                'message' => 'Several participants share that code. Enter the full Participant ID.',
            ]);
        }

        $participant = $matches->first();
        if (! $participant) {
            return response()->json([
                'ok' => false,
                'message' => 'Invalid QR code or participant ID.',
            ]);
        }

        if (! $participant->is_active) {
            return response()->json([
                'ok' => false,
                'message' => 'Participant is inactive.',
            ]);
        }

        $isRegistered = $participant->joinedProgrammes()
            ->where('programmes.id', $event->id)
            ->exists();

        if (! $isRegistered) {
            return response()->json([
                'ok' => false,
                'message' => 'Participant is not registered for the selected event.',
            ]);
        }

        $attendance = ParticipantAttendance::query()
            ->where('user_id', $participant->id)
            ->where('programme_id', $event->id)
            ->first();
        $alreadyCheckedIn = (bool) $attendance;

        if (! $attendance) {
            $attendance = ParticipantAttendance::updateOrCreate(
                ['user_id' => $participant->id, 'programme_id' => $event->id],
                ['status' => 'scanned', 'scanned_at' => now()],
            );
        }

        $participant->loadMissing(['country', 'userType', 'joinedProgrammes']);

        $profileImageUrl = $this->profileImageUrl($participant);

        // At most one row per (programme_id, user_id) -- enforced by
        // pt_assign_programme_user_unique -- so this lookup is exact.
        $tableAssignment = ParticipantTableAssignment::query()
            ->with('participantTable')
            ->where('programme_id', $event->id)
            ->where('user_id', $participant->id)
            ->first();

        return response()->json([
            'ok' => true,
            'message' => $alreadyCheckedIn
                ? 'Already checked in for this event.'
                : 'Attendance recorded successfully.',
            'participant' => [
                'id' => $participant->id,
                'full_name' => $participant->name,
                'profile_image_url' => $profileImageUrl,
                'display_id' => $participant->display_id,
                'qr_payload' => $participant->qr_payload,
                'qr_token' => $participant->qr_token,
                'email' => $participant->email,
                'country' => $participant->country?->name,
                'country_code' => $participant->country?->code,
                'country_flag_url' => $participant->country?->flag_url,
                'user_type' => $participant->userType?->name,
                'is_verified' => (bool) $participant->email_verified_at,
            ],
            'registered_events' => $participant->joinedProgrammes
                ->sortBy('starts_at')
                ->map(fn (Programme $programme) => [
                    'id' => $programme->id,
                    'title' => $programme->title,
                    'starts_at' => $programme->starts_at?->toISOString(),
                ])
                ->values(),
            'checked_in_event' => [
                'id' => $event->id,
                'title' => $event->title,
            ],
            'table_assignment' => $tableAssignment?->participantTable
                ? [
                    'table_number' => $tableAssignment->participantTable->table_number,
                    'seat_number' => $tableAssignment->seat_number,
                ]
                : null,
            'already_checked_in' => $alreadyCheckedIn,
            'scanned_at' => $attendance?->scanned_at?->toISOString(),
        ]);
    }

    /**
     * Search everyone registered for an event, with their check-in state.
     *
     * The scanner's own recent list is capped and lives only in the page's
     * memory, so this is what answers "has this person already checked in?"
     * once a queue has moved through.
     */
    public function participants(Request $request)
    {
        $validated = $request->validate([
            'event_id' => ['required', 'exists:programmes,id'],
            'q' => ['nullable', 'string', 'max:255'],
        ]);

        $eventId = $validated['event_id'];
        $term = trim((string) ($validated['q'] ?? ''));

        $participants = User::query()
            ->whereHas('joinedProgrammes', fn ($query) => $query->where('programmes.id', $eventId))
            // Grouped so the orWhere cannot escape the event constraint above.
            ->when($term !== '', fn ($query) => $query->where(fn ($group) => $group
                ->where('name', 'like', '%'.$term.'%')
                ->orWhere('display_id', 'like', '%'.$term.'%')))
            // Eager loaded: this endpoint returns up to 50 rows, so resolving
            // either relation lazily would be a 50-query N+1.
            ->with([
                'participantAttendances' => fn ($query) => $query->where('programme_id', $eventId),
                'tableAssignments' => fn ($query) => $query
                    ->where('programme_id', $eventId)
                    ->with('participantTable'),
            ])
            ->orderBy('name')
            ->limit(50)
            ->get()
            ->map(function (User $participant) {
                $attendance = $participant->participantAttendances->first();
                $seating = $participant->tableAssignments->first();

                return [
                    'id' => $participant->id,
                    'full_name' => $participant->name,
                    'display_id' => $participant->display_id,
                    'profile_image_url' => $this->profileImageUrl($participant),
                    'checked_in' => (bool) $attendance,
                    'scanned_at' => $attendance?->scanned_at?->toISOString(),
                    'table_assignment' => $seating?->participantTable
                        ? [
                            'table_number' => $seating->participantTable->table_number,
                            'seat_number' => $seating->seat_number,
                        ]
                        : null,
                ];
            })
            ->values();

        return response()->json([
            'participants' => $participants,
        ]);
    }

    /**
     * Public URL for a participant's photo, whichever column it landed in.
     */
    private function profileImageUrl(User $participant): ?string
    {
        $rawProfilePath = $participant->profile_image_path
            ?? $participant->profile_image
            ?? $participant->profile_photo_path
            ?? null;

        if (! $rawProfilePath) {
            return null;
        }

        $rawProfilePath = ltrim((string) $rawProfilePath, '/');

        if (str_starts_with($rawProfilePath, 'http://') || str_starts_with($rawProfilePath, 'https://')) {
            return $rawProfilePath;
        }

        $relative = str_starts_with($rawProfilePath, 'profile-image/')
            || str_starts_with($rawProfilePath, 'storage/profile-image/')
            ? $rawProfilePath
            : 'profile-image/'.$rawProfilePath;

        return asset($relative);
    }

    /**
     * Every participant a scanned or typed code could refer to.
     *
     * Returns a collection rather than a single user so the caller can tell an
     * unknown code apart from an ambiguous one. A bare middle group is not
     * guaranteed unique, and silently taking the first match would check in
     * the wrong person.
     */
    private function resolveParticipants(string $code): Collection
    {
        $participant = User::query()
            ->where('display_id', $code)
            ->first();

        if ($participant) {
            return collect([$participant]);
        }

        // A bare middle group, e.g. "GCIY" from CHED-GCIY-OAB1. display_id has
        // exactly three segments, so the surrounding hyphens pin this to the
        // middle one: it can match neither the prefix nor the trailing group.
        // The character class is also what keeps LIKE wildcards out of $code.
        if (preg_match('/^[A-Za-z0-9]{4}$/', $code)) {
            $matches = User::query()
                ->where('display_id', 'like', '%-'.Str::upper($code).'-%')
                ->get();

            if ($matches->isNotEmpty()) {
                return $matches;
            }
        }

        try {
            $token = Crypt::decryptString($code);
            $participant = User::query()
                ->where('qr_token', $token)
                ->first();
        } catch (DecryptException) {
            $participant = User::query()
                ->where('qr_token', $code)
                ->first();
        }

        return $participant ? collect([$participant]) : collect();
    }

    private function resolvePhase(Programme $programme, Carbon $now): string
    {
        if (! $programme->is_active) {
            return 'closed';
        }

        $start = $programme->starts_at ?? $programme->ends_at ?? $now;
        $end = $programme->ends_at;

        if ($now->lessThan($start)) {
            return 'upcoming';
        }

        if ($end) {
            return $now->lessThanOrEqualTo($end) ? 'ongoing' : 'closed';
        }

        return $now->isSameDay($start) ? 'ongoing' : 'closed';
    }

    private function isOpenForScanning(Programme $programme, Carbon $now): bool
    {
        if (! $programme->is_active) {
            return false;
        }

        if ($programme->ends_at && $now->greaterThan($programme->ends_at)) {
            return false;
        }

        if ($programme->starts_at) {
            return $now->copy()->startOfDay()->greaterThanOrEqualTo(
                $programme->starts_at->copy()->startOfDay()
            );
        }

        return true;
    }

    private function scanClosedMessage(Programme $programme, Carbon $now): string
    {
        if (
            $programme->starts_at
            && $now->copy()->startOfDay()->lessThan($programme->starts_at->copy()->startOfDay())
        ) {
            return 'Early check-in opens on the event day.';
        }

        return 'This event is no longer open for scanning.';
    }
}
