<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Certificate of Appearance and Participation</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f6fb; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6fb; padding: 24px 0;">
            <tr>
                <td align="center">
                    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden;">
                        <tr>
                            <td style="padding: 24px 28px;">
                                <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #475569;">
                                    Hi {{ $participantName }},
                                </p>
                                <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #475569;">
                                    Your certificate of appearance and participation for <strong>{{ $eventTitle }}</strong>{{ $eventDate !== '-' ? ' held on '.$eventDate : '' }} is attached as a PDF.
                                </p>
                                <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #475569;">
                                    Thank you!
                                </p>
                                <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #64748b; font-style: italic;">
                                    * This is a system-generated message. Please do not reply to this email.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
