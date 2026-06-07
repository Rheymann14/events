<?php

namespace App\Services;

use App\Jobs\SendWelcomeNotifications;
use App\Mail\ParticipantWelcomeMail;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class WelcomeNotificationService
{
    public function dispatch(User $user): void
    {
        try {
            SendWelcomeNotifications::dispatchAfterResponse($user->id);
        } catch (Throwable $exception) {
            report($exception);

            Log::warning('Welcome notification dispatch failed.', [
                'user_id' => $user->id,
            ]);
        }
    }

    public function sendNow(User $user): void
    {
        $this->sendWelcomeEmail($user);
        rescue(fn () => app(SemaphoreSms::class)->sendWelcome($user), report: true);
    }

    private function sendWelcomeEmail(User $user): void
    {
        if (! $user->email) {
            Log::info('Welcome email skipped: participant has no email.', [
                'user_id' => $user->id,
            ]);

            return;
        }

        try {
            Mail::to($user->email)->send(new ParticipantWelcomeMail($user));
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
