<?php

use App\Models\ParticipantAttendance;
use App\Models\Programme;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

function makeEventKitProgramme(User $owner, array $overrides = []): Programme
{
    return Programme::query()->create(array_merge([
        'user_id' => $owner->id,
        'tag' => 'EVENT',
        'title' => 'Event Kit Programme',
        'description' => 'Programme description',
        'starts_at' => now()->subDays(2),
        'ends_at' => now()->subDay(),
        'location' => 'Manila',
        'is_active' => true,
    ], $overrides));
}

test('event kit survey only lists events the participant joined and checked into including closed events', function () {
    $owner = User::factory()->create();
    $participant = User::factory()->create();

    $eligibleClosed = makeEventKitProgramme($owner, [
        'tag' => 'CLOSED',
        'title' => 'Closed Joined Checked Event',
        'is_active' => false,
    ]);
    $joinedOnly = makeEventKitProgramme($owner, [
        'tag' => 'JOINED',
        'title' => 'Joined Only Event',
    ]);
    $checkedInOnly = makeEventKitProgramme($owner, [
        'tag' => 'CHECKED',
        'title' => 'Checked In Only Event',
    ]);
    $unrelated = makeEventKitProgramme($owner, [
        'tag' => 'OTHER',
        'title' => 'Unrelated Event',
    ]);

    $participant->joinedProgrammes()->attach([$eligibleClosed->id, $joinedOnly->id, $unrelated->id]);

    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $eligibleClosed->id,
        'status' => 'checked-in',
        'scanned_at' => now()->subDay(),
    ]);
    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $checkedInOnly->id,
        'status' => 'checked-in',
        'scanned_at' => now()->subDay(),
    ]);

    $this->withSession(['event_kit.participant_id' => $participant->id])
        ->get(route('event-kit.survey'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('event-kit-survey')
            ->where('programmes', fn ($programmes) => collect($programmes)->pluck('id')->all() === [$eligibleClosed->id])
            ->where('selected_programme_id', $eligibleClosed->id)
        );
});

test('event kit survey submission rejects events the participant did not both join and check into', function () {
    $owner = User::factory()->create();
    $participant = User::factory()->create();
    $checkedInOnly = makeEventKitProgramme($owner, [
        'title' => 'Checked In Only Event',
    ]);

    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $checkedInOnly->id,
        'status' => 'checked-in',
        'scanned_at' => now(),
    ]);

    $this->withSession(['event_kit.participant_id' => $participant->id])
        ->from(route('event-kit.survey'))
        ->post(route('event-kit.survey.submit'), [
            'programme_id' => $checkedInOnly->id,
            'user_experience_rating' => 5,
            'event_ratings' => [],
            'recommendations' => '',
        ])
        ->assertRedirect(route('event-kit.survey'))
        ->assertSessionHasErrors('programme_id');
});

test('event kit materials only lists events the participant joined and checked into including closed events', function () {
    $owner = User::factory()->create();
    $participant = User::factory()->create();

    $eligibleClosed = makeEventKitProgramme($owner, [
        'tag' => 'CLOSED',
        'title' => 'Closed Materials Event',
        'is_active' => false,
    ]);
    $checkedInOnly = makeEventKitProgramme($owner, [
        'tag' => 'CHECKED',
        'title' => 'Checked In Only Materials Event',
    ]);

    $participant->joinedProgrammes()->attach($eligibleClosed->id);

    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $eligibleClosed->id,
        'status' => 'checked-in',
        'scanned_at' => now()->subDay(),
    ]);
    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $checkedInOnly->id,
        'status' => 'checked-in',
        'scanned_at' => now()->subDay(),
    ]);

    $this->withSession([
        'event_kit.participant_id' => $participant->id,
        'event_kit.programme_id' => $checkedInOnly->id,
        'event_kit.survey_completed' => true,
    ])
        ->get(route('event-kit.materials'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('event-kit-materials')
            ->where('programme.id', $eligibleClosed->id)
            ->where('checked_in_programmes', fn ($programmes) => collect($programmes)->pluck('id')->all() === [$eligibleClosed->id])
        );
});

test('event kit materials selector rejects events the participant did not both join and check into', function () {
    $owner = User::factory()->create();
    $participant = User::factory()->create();
    $checkedInOnly = makeEventKitProgramme($owner, [
        'title' => 'Checked In Only Materials Event',
    ]);

    ParticipantAttendance::query()->create([
        'user_id' => $participant->id,
        'programme_id' => $checkedInOnly->id,
        'status' => 'checked-in',
        'scanned_at' => now(),
    ]);

    $this->withSession(['event_kit.participant_id' => $participant->id])
        ->from(route('event-kit.materials'))
        ->post(route('event-kit.select-programme'), [
            'programme_id' => $checkedInOnly->id,
        ])
        ->assertRedirect(route('event-kit.materials'))
        ->assertSessionHasErrors('programme_id');
});
