<?php

use App\Models\ParticipantTable;
use App\Models\ParticipantTableAssignment;
use App\Models\Programme;
use App\Models\User;
use App\Models\UserType;

/**
 * Seating shown at check-in.
 *
 * The scanner answers "where do I sit?" at the desk, so the scan response and
 * the participant search both carry the table and seat for the event being
 * scanned.
 */
function scannerAdmin(): User
{
    $adminType = UserType::query()->firstOrCreate(
        ['slug' => 'ADMIN'],
        ['name' => 'ADMIN', 'is_active' => true],
    );

    return User::factory()->create([
        'user_type_id' => $adminType->id,
    ]);
}

function scannerEvent(): Programme
{
    return Programme::query()->create([
        'user_id' => User::factory()->create()->id,
        'tag' => 'SCAN-'.uniqid(),
        'title' => 'Scanner Seating Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => true,
    ]);
}

test('a scan returns the table and seat for the scanned event', function () {
    $admin = scannerAdmin();
    $programme = scannerEvent();
    $participant = User::factory()->create();

    $participant->joinedProgrammes()->attach($programme->id);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table 7',
        'capacity' => 10,
    ]);

    ParticipantTableAssignment::query()->create([
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'seat_number' => 3,
        'user_id' => $participant->id,
        'assigned_at' => now(),
    ]);

    $this->actingAs($admin)
        ->postJson(route('scanner.scan'), [
            'code' => $participant->display_id,
            'event_id' => $programme->id,
        ])
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('table_assignment.table_number', 'Table 7')
        ->assertJsonPath('table_assignment.seat_number', 3);
});

test('a scan returns no seating when the participant has no table', function () {
    $admin = scannerAdmin();
    $programme = scannerEvent();
    $participant = User::factory()->create();

    $participant->joinedProgrammes()->attach($programme->id);

    $this->actingAs($admin)
        ->postJson(route('scanner.scan'), [
            'code' => $participant->display_id,
            'event_id' => $programme->id,
        ])
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonPath('table_assignment', null);
});

test('re-scanning an already checked in participant still returns the seating', function () {
    $admin = scannerAdmin();
    $programme = scannerEvent();
    $participant = User::factory()->create();

    $participant->joinedProgrammes()->attach($programme->id);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Head Table',
        'capacity' => 8,
    ]);

    ParticipantTableAssignment::query()->create([
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'seat_number' => 1,
        'user_id' => $participant->id,
        'assigned_at' => now(),
    ]);

    $payload = [
        'code' => $participant->display_id,
        'event_id' => $programme->id,
    ];

    $this->actingAs($admin)->postJson(route('scanner.scan'), $payload)->assertOk();

    // The second scan is how an operator re-checks a seat at the desk.
    $this->actingAs($admin)
        ->postJson(route('scanner.scan'), $payload)
        ->assertOk()
        ->assertJsonPath('already_checked_in', true)
        ->assertJsonPath('table_assignment.table_number', 'Head Table')
        ->assertJsonPath('table_assignment.seat_number', 1);
});

test('the participant search includes seating for each row', function () {
    $admin = scannerAdmin();
    $programme = scannerEvent();

    $seated = User::factory()->create(['name' => 'Ana Cruz Reyes']);
    $unseated = User::factory()->create(['name' => 'Ben Santos']);

    $seated->joinedProgrammes()->attach($programme->id);
    $unseated->joinedProgrammes()->attach($programme->id);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table 2',
        'capacity' => 10,
    ]);

    ParticipantTableAssignment::query()->create([
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'seat_number' => 5,
        'user_id' => $seated->id,
        'assigned_at' => now(),
    ]);

    $response = $this->actingAs($admin)
        ->getJson(route('scanner.participants', [
            'event_id' => $programme->id,
        ]))
        ->assertOk();

    $rows = collect($response->json('participants'))->keyBy('id');

    expect($rows[$seated->id]['table_assignment'])
        ->toMatchArray(['table_number' => 'Table 2', 'seat_number' => 5]);
    expect($rows[$unseated->id]['table_assignment'])->toBeNull();
});
