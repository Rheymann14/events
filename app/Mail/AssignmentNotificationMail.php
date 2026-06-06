<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AssignmentNotificationMail extends Mailable
{
    use SerializesModels;

    public function __construct(public array $details) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'CHED Events Assignment Notification',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.assignment-notification',
            text: 'emails.assignment-notification-text',
            with: $this->details,
        );
    }
}
