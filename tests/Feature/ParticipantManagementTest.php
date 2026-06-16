<?php

use App\Mail\ParticipantCertificateMail;
use App\Models\Country;
use App\Models\EventRegistrationAttendee;
use App\Models\EventRegistrationSubmission;
use App\Models\ParticipantAttendance;
use App\Models\Programme;
use App\Models\RegistrationField;
use App\Models\User;
use App\Models\UserType;
use App\Services\WelcomeNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

function adminUser(): User
{
    $adminType = UserType::query()->create([
        'name' => 'ADMIN',
        'slug' => 'ADMIN',
        'is_active' => true,
    ]);

    return User::factory()->create([
        'user_type_id' => $adminType->id,
    ]);
}

function participantFixture(): array
{
    $country = Country::query()->create([
        'code' => 'PH',
        'name' => 'Philippines',
        'is_active' => true,
    ]);

    $participantType = UserType::query()->create([
        'name' => 'Participant',
        'slug' => 'participant',
        'is_active' => true,
    ]);

    $owner = User::factory()->create();

    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'EVT',
        'title' => 'ASEAN Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'is_active' => true,
    ]);

    return [$country, $participantType, $programme];
}

function participantPayload(Country $country, UserType $participantType, array $overrides = []): array
{
    return array_replace_recursive([
        'full_name' => 'Test Participant',
        'email' => fake()->unique()->safeEmail(),
        'contact_number' => '09171234567',
        'contact_country_code' => '+63',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
        'given_name' => 'Test',
        'family_name' => 'Participant',
        'is_active' => true,
    ], $overrides);
}

function certificateSignatureFixture(): string
{
    $fileName = 'test-certificate-signature.png';
    $directory = public_path('signatures');
    $path = $directory.'/'.$fileName;

    File::ensureDirectoryExists($directory);

    if (! File::exists($path)) {
        File::put($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q7wAAAABJRU5ErkJggg=='));
    }

    return $fileName;
}

test('participant index is paginated and filterable by event and search', function () {
    $admin = adminUser();
    [$country, $participantType, $programme] = participantFixture();

    $alpha = User::factory()->create([
        'name' => 'Alpha Delegate',
        'email' => 'alpha@example.test',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);

    $participants = User::factory()->count(11)->create([
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ])->push($alpha);

    $programme->participants()->attach($participants->pluck('id'));

    $this->actingAs($admin)
        ->get(route('participant', ['programme_id' => $programme->id, 'per_page' => 10]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('participant')
            ->where('participantPagination.total', 12)
            ->where('participantPagination.per_page', 10)
            ->where('participants', fn ($rows) => count($rows) === 10)
        );

    $this->actingAs($admin)
        ->get(route('participant', [
            'programme_id' => $programme->id,
            'search' => 'Alpha Delegate',
            'per_page' => 10,
        ]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('participantPagination.total', 1)
            ->where('participants.0.full_name', 'Alpha Delegate')
        );
});

test('participant index defaults to active registration event when no event filter is provided', function () {
    $admin = adminUser();
    [$country, $participantType, $activeProgramme] = participantFixture();

    $owner = User::factory()->create();
    $registrationProgramme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'REG',
        'title' => 'Registration Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->addDays(2),
        'ends_at' => now()->addDays(2)->addHour(),
        'is_active' => true,
        'is_registration_active' => true,
    ]);

    $activeParticipant = User::factory()->create([
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);
    $registrationParticipant = User::factory()->create([
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);

    $activeProgramme->participants()->attach($activeParticipant->id);
    $registrationProgramme->participants()->attach($registrationParticipant->id);

    $this->actingAs($admin)
        ->get(route('participant'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('participant')
            ->where('filters.programme_id', (string) $registrationProgramme->id)
            ->where('participantPagination.total', 1)
        );
});

test('participant index shows one ASEMME10 row per participant', function () {
    $admin = adminUser();
    [$country, $participantType] = participantFixture();

    $owner = User::factory()->create();
    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'ASEMME10',
        'title' => '10th Asia-Europe Meeting of Ministers for Education (ASEMME10)',
        'description' => 'ASEMME10 registration',
        'location' => 'Manila',
        'starts_at' => now()->addMonth(),
        'ends_at' => now()->addMonth()->addDays(2),
        'is_active' => true,
    ]);

    $participant = User::factory()->create([
        'name' => 'Rheymann Cuartocruz',
        'email' => 'rheyman101@gmail.com',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);
    $participant->joinedProgrammes()->attach($programme->id);

    $oldSubmission = EventRegistrationSubmission::query()->create([
        'programme_id' => $programme->id,
        'country_id' => $country->id,
        'registration_type' => 'Country Delegation',
        'focal_name' => 'CHED LO',
        'focal_email' => 'focal@example.test',
        'consents' => [],
        'delegation_details' => [],
        'status' => 'submitted',
        'submitted_at' => now()->subDay(),
    ]);
    EventRegistrationAttendee::query()->create([
        'submission_id' => $oldSubmission->id,
        'programme_id' => $programme->id,
        'user_id' => $participant->id,
        'role' => 'head',
        'given_name' => 'Old',
        'family_name' => 'Name',
        'email' => $participant->email,
    ]);

    $latestSubmission = EventRegistrationSubmission::query()->create([
        'programme_id' => $programme->id,
        'country_id' => $country->id,
        'registration_type' => 'ASEAN Secretariat',
        'focal_name' => 'CHED LO',
        'focal_email' => 'focal@example.test',
        'consents' => [],
        'delegation_details' => [],
        'status' => 'submitted',
        'submitted_at' => now(),
    ]);
    EventRegistrationAttendee::query()->create([
        'submission_id' => $latestSubmission->id,
        'programme_id' => $programme->id,
        'user_id' => $participant->id,
        'role' => 'head',
        'given_name' => 'Latest',
        'family_name' => 'Name',
        'email' => $participant->email,
    ]);

    $this->actingAs($admin)
        ->get(route('participant', ['programme_id' => $programme->id, 'per_page' => 10]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('participant')
            ->where('participantPagination.total', 1)
            ->where('participants.0.full_name', 'Latest Name')
            ->where('participants.0.asemme10_registration.registration_type', 'ASEAN Secretariat')
        );
});

test('participant create stores selected event and dynamic registration responses', function () {
    $admin = adminUser();
    [$country, $participantType, $programme] = participantFixture();

    $field = RegistrationField::query()->create([
        'programme_id' => $programme->id,
        'field_key' => 'delegation_role',
        'label' => 'Delegation role',
        'field_type' => 'select',
        'options' => ['Head', 'Member'],
        'is_required' => true,
        'sort_order' => 1,
    ]);

    $this->actingAs($admin)
        ->post(route('participants.store'), participantPayload($country, $participantType, [
            'programme_id' => $programme->id,
            'registration_responses' => [
                $programme->id => [
                    $field->id => 'Head',
                ],
            ],
        ]))
        ->assertRedirect();

    $user = User::query()->where('email', '!=', $admin->email)->where('name', 'Test Participant')->firstOrFail();

    expect($user->joinedProgrammes()->whereKey($programme->id)->exists())->toBeTrue();
    expect($user->registrationFieldResponses()
        ->where('programme_id', $programme->id)
        ->where('registration_field_id', $field->id)
        ->firstOrFail()
        ->answer)->toBe('Head');
});

test('participant create stores the default password as a hash', function () {
    $admin = adminUser();
    [$country, $participantType] = participantFixture();

    $this->actingAs($admin)
        ->post(route('participants.store'), participantPayload($country, $participantType, [
            'email' => 'new-participant@example.test',
        ]))
        ->assertRedirect();

    $participant = User::query()->where('email', 'new-participant@example.test')->firstOrFail();

    expect($participant->password)->not->toBe('chedevents2026');
    expect(Hash::check('chedevents2026', $participant->password))->toBeTrue();
});

test('participant create requires an email address', function () {
    $admin = adminUser();
    [$country, $participantType] = participantFixture();

    $this->actingAs($admin)
        ->post(route('participants.store'), participantPayload($country, $participantType, [
            'full_name' => 'Participant Without Email',
            'email' => '   ',
            'given_name' => 'Participant',
            'family_name' => 'Without Email',
        ]))
        ->assertSessionHasErrors(['email']);

    expect(User::query()->where('name', 'Participant Without Email')->exists())->toBeFalse();
});

test('participant update can clear an existing email address', function () {
    $admin = adminUser();
    [$country, $participantType] = participantFixture();

    $participant = User::factory()->create([
        'name' => 'Existing Participant',
        'email' => 'existing-participant@example.test',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);

    $this->actingAs($admin)
        ->patch(route('participants.update', $participant), [
            'email' => '',
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect($participant->refresh()->email)->toBeNull();
});

test('participant create dispatches the welcome email notification', function () {
    $admin = adminUser();
    [$country, $participantType] = participantFixture();

    $notifications = Mockery::mock(WelcomeNotificationService::class);
    $notifications
        ->shouldReceive('dispatch')
        ->once()
        ->with(Mockery::on(fn (User $user) => $user->email === 'new-participant@example.test'));

    $this->app->instance(WelcomeNotificationService::class, $notifications);

    $this->actingAs($admin)
        ->post(route('participants.store'), participantPayload($country, $participantType, [
            'email' => 'new-participant@example.test',
        ]))
        ->assertRedirect()
        ->assertSessionHasNoErrors();
});

test('participant create succeeds when welcome notification dispatch fails', function () {
    $admin = adminUser();
    [$country, $participantType] = participantFixture();

    $notifications = Mockery::mock(WelcomeNotificationService::class);
    $notifications
        ->shouldReceive('dispatch')
        ->once()
        ->andThrow(new RuntimeException('Queue unavailable'));

    $this->app->instance(WelcomeNotificationService::class, $notifications);

    $this->actingAs($admin)
        ->post(route('participants.store'), participantPayload($country, $participantType, [
            'email' => 'notification-failure@example.test',
        ]))
        ->assertRedirect();

    expect(User::query()->where('email', 'notification-failure@example.test')->exists())->toBeTrue();
});

test('participant update upserts and deletes dynamic registration responses', function () {
    $admin = adminUser();
    [$country, $participantType, $programme] = participantFixture();

    $field = RegistrationField::query()->create([
        'programme_id' => $programme->id,
        'field_key' => 'badge_name',
        'label' => 'Badge name',
        'field_type' => 'text',
        'options' => [],
        'is_required' => false,
        'sort_order' => 1,
    ]);

    $participant = User::factory()->create([
        'name' => 'Existing Participant',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);

    $participant->registrationFieldResponses()->create([
        'programme_id' => $programme->id,
        'registration_field_id' => $field->id,
        'answer' => 'Old badge',
    ]);

    $this->actingAs($admin)
        ->patch(route('participants.update', $participant), participantPayload($country, $participantType, [
            'full_name' => 'Existing Participant',
            'email' => $participant->email,
            'programme_id' => $programme->id,
            'registration_responses' => [
                $programme->id => [
                    $field->id => 'New badge',
                ],
            ],
        ]))
        ->assertRedirect();

    expect($participant->registrationFieldResponses()
        ->where('registration_field_id', $field->id)
        ->firstOrFail()
        ->answer)->toBe('New badge');

    $this->actingAs($admin)
        ->patch(route('participants.update', $participant), participantPayload($country, $participantType, [
            'full_name' => 'Existing Participant',
            'email' => $participant->email,
            'programme_id' => $programme->id,
            'registration_responses' => [
                $programme->id => [
                    $field->id => '',
                ],
            ],
        ]))
        ->assertRedirect();

    expect($participant->registrationFieldResponses()
        ->where('registration_field_id', $field->id)
        ->exists())->toBeFalse();
});

test('participant password reset stores the default password as a hash', function () {
    $admin = adminUser();
    [$country, $participantType] = participantFixture();

    $participant = User::factory()->create([
        'name' => 'Existing Participant',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
        'password' => 'old-password',
    ]);

    $this->actingAs($admin)
        ->patch(route('participants.update', $participant), [
            'password' => 'chedevents2026',
        ])
        ->assertRedirect();

    $participant->refresh();

    expect($participant->password)->not->toBe('chedevents2026');
    expect(Hash::check('chedevents2026', $participant->password))->toBeTrue();
});

test('admin can download participant id cards as portrait and landscape pdfs', function () {
    $admin = adminUser();
    [$country, $participantType] = participantFixture();

    $participant = User::factory()->create([
        'name' => 'Downloadable Participant',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
        'display_id' => 'EVT-0001',
        'qr_payload' => 'EVT-0001',
    ]);

    foreach (['portrait', 'landscape'] as $orientation) {
        $response = $this->actingAs($admin)
            ->post(route('participants.id-cards.pdf'), [
                'orientation' => $orientation,
                'ids' => [$participant->id],
            ]);

        $response
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');

        expect($response->headers->get('Content-Disposition'))->toContain("participant-ids-{$orientation}-");
    }
});

test('admin can download checked-in participant certificates as a pdf', function () {
    $admin = adminUser();
    [$country, $participantType, $programme] = participantFixture();
    $programme->forceFill([
        'signatory_signature_url' => certificateSignatureFixture(),
    ])->save();

    $participant = User::factory()->create([
        'name' => 'Certified Participant',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);

    $programme->participants()->attach($participant->id);

    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $programme->id,
        'status' => 'checked-in',
        'scanned_at' => now(),
    ]);

    $response = $this->actingAs($admin)
        ->post(route('event-management.participants.certificates.pdf', $programme), [
            'signatory_name' => 'Dr. Signatory',
            'signatory_title' => 'Chairperson',
        ]);

    $response
        ->assertOk()
        ->assertHeader('Content-Type', 'application/pdf');

    expect($response->headers->get('Content-Disposition'))->toContain('participant-certificates-asean-event-');
});

test('admin can save programme signatory details with signature upload', function () {
    $admin = adminUser();
    [, , $programme] = participantFixture();

    $this->actingAs($admin)
        ->post(route('programmes.update', $programme), [
            '_method' => 'patch',
            'signatory_name' => 'Dr. Signatory',
            'signatory_title' => 'Chairperson',
            'signatory_signature' => UploadedFile::fake()->image('signature.png', 320, 120),
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $programme->refresh();

    expect($programme->signatory_name)->toBe('Dr. Signatory')
        ->and($programme->signatory_title)->toBe('Chairperson')
        ->and($programme->signatory_signature_url)->not->toBeNull()
        ->and(File::exists(public_path('signatures/'.$programme->signatory_signature_url)))->toBeTrue();

    File::delete(public_path('signatures/'.$programme->signatory_signature_url));
});

test('admin can email a checked-in participant certificate pdf', function () {
    Mail::fake();

    $admin = adminUser();
    [$country, $participantType, $programme] = participantFixture();
    $programme->forceFill([
        'signatory_signature_url' => certificateSignatureFixture(),
    ])->save();

    $participant = User::factory()->create([
        'name' => 'Certified Participant',
        'email' => 'certified@example.test',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);

    $programme->participants()->attach($participant->id);

    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $programme->id,
        'status' => 'checked-in',
        'scanned_at' => now(),
    ]);

    $this->actingAs($admin)
        ->post(route('event-management.participants.certificates.send', [$programme, $participant]), [
            'signatory_name' => 'Dr. Signatory',
            'signatory_title' => 'Chairperson',
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    Mail::assertSent(ParticipantCertificateMail::class, function (ParticipantCertificateMail $mail) use ($participant, $programme) {
        return $mail->hasTo($participant->email)
            && $mail->participant->is($participant)
            && $mail->programme->is($programme)
            && str_starts_with($mail->pdf, '%PDF')
            && str_starts_with($mail->filename, 'participant-certificate-certified-participant-');
    });

    $firstSentAt = ParticipantAttendance::query()
        ->where('user_id', $participant->id)
        ->where('programme_id', $programme->id)
        ->value('certificate_sent_at');

    expect($firstSentAt)->not->toBeNull();

    $this->actingAs($admin)
        ->post(route('event-management.participants.certificates.send', [$programme, $participant]), [
            'signatory_name' => 'Dr. Signatory',
            'signatory_title' => 'Chairperson',
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    Mail::assertSent(ParticipantCertificateMail::class, 2);

    expect(
        ParticipantAttendance::query()
            ->where('user_id', $participant->id)
            ->where('programme_id', $programme->id)
            ->value('certificate_sent_at')
    )->not->toBeNull();
});

test('admin cannot email a participant certificate without check-in attendance', function () {
    Mail::fake();

    $admin = adminUser();
    [$country, $participantType, $programme] = participantFixture();
    $programme->forceFill([
        'signatory_signature_url' => certificateSignatureFixture(),
    ])->save();

    $participant = User::factory()->create([
        'name' => 'Absent Participant',
        'email' => 'absent@example.test',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);

    $programme->participants()->attach($participant->id);

    $this->actingAs($admin)
        ->from(route('event-management.participants', $programme))
        ->post(route('event-management.participants.certificates.send', [$programme, $participant]), [
            'signatory_name' => 'Dr. Signatory',
            'signatory_title' => 'Chairperson',
        ])
        ->assertRedirect(route('event-management.participants', $programme))
        ->assertSessionHasErrors(['certificates']);

    Mail::assertNothingSent();

    expect(
        ParticipantAttendance::query()
            ->where('user_id', $participant->id)
            ->where('programme_id', $programme->id)
            ->value('certificate_sent_at')
    )->toBeNull();
});

test('admin cannot email a participant certificate without complete signatory details', function () {
    Mail::fake();

    $admin = adminUser();
    [$country, $participantType, $programme] = participantFixture();

    $participant = User::factory()->create([
        'name' => 'Certified Participant',
        'email' => 'certified-signatory@example.test',
        'country_id' => $country->id,
        'user_type_id' => $participantType->id,
    ]);

    $programme->participants()->attach($participant->id);

    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $programme->id,
        'status' => 'checked-in',
        'scanned_at' => now(),
    ]);

    $this->actingAs($admin)
        ->from(route('event-management.participants', $programme))
        ->post(route('event-management.participants.certificates.send', [$programme, $participant]), [
            'signatory_name' => 'Dr. Signatory',
            'signatory_title' => 'Chairperson',
        ])
        ->assertRedirect(route('event-management.participants', $programme))
        ->assertSessionHasErrors(['certificates']);

    $programme->forceFill([
        'signatory_signature_url' => certificateSignatureFixture(),
    ])->save();

    $this->actingAs($admin)
        ->from(route('event-management.participants', $programme))
        ->post(route('event-management.participants.certificates.send', [$programme, $participant]), [
            'signatory_name' => '',
            'signatory_title' => 'Chairperson',
        ])
        ->assertRedirect(route('event-management.participants', $programme))
        ->assertSessionHasErrors(['certificates']);

    $this->actingAs($admin)
        ->from(route('event-management.participants', $programme))
        ->post(route('event-management.participants.certificates.send', [$programme, $participant]), [
            'signatory_name' => 'Dr. Signatory',
            'signatory_title' => '',
        ])
        ->assertRedirect(route('event-management.participants', $programme))
        ->assertSessionHasErrors(['certificates']);

    Mail::assertNothingSent();

    expect(
        ParticipantAttendance::query()
            ->where('user_id', $participant->id)
            ->where('programme_id', $programme->id)
            ->value('certificate_sent_at')
    )->toBeNull();
});

test('dynamic registration responses are validated for required fields and option types', function () {
    $admin = adminUser();
    [$country, $participantType, $programme] = participantFixture();

    $required = RegistrationField::query()->create([
        'programme_id' => $programme->id,
        'field_key' => 'required_text',
        'label' => 'Required text',
        'field_type' => 'text',
        'options' => [],
        'is_required' => true,
        'sort_order' => 1,
    ]);

    $radio = RegistrationField::query()->create([
        'programme_id' => $programme->id,
        'field_key' => 'role',
        'label' => 'Role',
        'field_type' => 'radio',
        'options' => ['Speaker', 'Guest'],
        'is_required' => false,
        'sort_order' => 2,
    ]);

    $checkbox = RegistrationField::query()->create([
        'programme_id' => $programme->id,
        'field_key' => 'sessions',
        'label' => 'Sessions',
        'field_type' => 'checkbox',
        'options' => ['Morning', 'Afternoon'],
        'is_required' => false,
        'sort_order' => 3,
    ]);

    $email = RegistrationField::query()->create([
        'programme_id' => $programme->id,
        'field_key' => 'assistant_email',
        'label' => 'Assistant email',
        'field_type' => 'email',
        'options' => [],
        'is_required' => false,
        'sort_order' => 4,
    ]);

    $this->actingAs($admin)
        ->post(route('participants.store'), participantPayload($country, $participantType, [
            'programme_id' => $programme->id,
            'registration_responses' => [
                $programme->id => [
                    $required->id => '',
                    $radio->id => 'Invalid',
                    $checkbox->id => ['Morning', 'Invalid'],
                    $email->id => 'not-an-email',
                ],
            ],
        ]))
        ->assertSessionHasErrors([
            "registration_responses.{$programme->id}.{$required->id}",
            "registration_responses.{$programme->id}.{$radio->id}",
            "registration_responses.{$programme->id}.{$checkbox->id}",
            "registration_responses.{$programme->id}.{$email->id}",
        ]);
});
