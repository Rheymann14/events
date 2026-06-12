<?php

namespace App\Mail;

use App\Models\Programme;
use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ParticipantCertificateMail extends Mailable
{
    use SerializesModels;

    public function __construct(
        public User $participant,
        public Programme $programme,
        public string $pdf,
        public string $filename,
        public string $eventDate,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Certificate of Appearance and Participation: '.$this->programme->title,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.participant-certificate',
            text: 'emails.participant-certificate-text',
            with: [
                'participantName' => $this->participant->name ?: 'Participant',
                'eventTitle' => $this->programme->title,
                'eventDate' => $this->eventDate,
            ],
        );
    }

    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->pdf, $this->filename)
                ->withMime('application/pdf'),
        ];
    }
}
