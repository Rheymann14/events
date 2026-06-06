<?php

use App\Models\ParticipantTable;
use App\Models\ParticipantTableAssignment;
use App\Models\Programme;
use App\Models\User;
use App\Models\UserType;

test('admin can manually assign a participant to a specific table seat', function () {
    $adminType = UserType::query()->create([
        'name' => 'ADMIN',
        'slug' => 'ADMIN',
        'is_active' => true,
    ]);

    $owner = User::factory()->create();
    $admin = User::factory()->create([
        'user_type_id' => $adminType->id,
    ]);
    $participant = User::factory()->create();

    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'TABLE-MANUAL',
        'title' => 'Manual Seating Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => true,
    ]);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table A',
        'capacity' => 4,
    ]);

    $participant->joinedProgrammes()->attach($programme->id);

    $this->actingAs($admin)
        ->post(route('table-assignment.assignments.store'), [
            'programme_id' => $programme->id,
            'participant_table_id' => $table->id,
            'seat_number' => 3,
            'participant_ids' => [$participant->id],
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $this->assertDatabaseHas('participant_table_assignments', [
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'user_id' => $participant->id,
        'seat_number' => 3,
    ]);
});

test('auto assignment fills the first open seat within table capacity', function () {
    $adminType = UserType::query()->create([
        'name' => 'ADMIN',
        'slug' => 'ADMIN',
        'is_active' => true,
    ]);

    $owner = User::factory()->create();
    $admin = User::factory()->create([
        'user_type_id' => $adminType->id,
    ]);
    $firstParticipant = User::factory()->create();
    $thirdParticipant = User::factory()->create();
    $newParticipant = User::factory()->create();

    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'TABLE-AUTO',
        'title' => 'Auto Seating Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => true,
    ]);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table B',
        'capacity' => 4,
    ]);

    $programme->users()->attach([
        $firstParticipant->id,
        $thirdParticipant->id,
        $newParticipant->id,
    ]);

    ParticipantTableAssignment::query()->create([
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'seat_number' => 1,
        'user_id' => $firstParticipant->id,
        'assigned_at' => now(),
    ]);

    ParticipantTableAssignment::query()->create([
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'seat_number' => 3,
        'user_id' => $thirdParticipant->id,
        'assigned_at' => now(),
    ]);

    $this->actingAs($admin)
        ->post(route('table-assignment.assignments.store'), [
            'programme_id' => $programme->id,
            'participant_table_id' => $table->id,
            'participant_ids' => [$newParticipant->id],
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $this->assertDatabaseHas('participant_table_assignments', [
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'user_id' => $newParticipant->id,
        'seat_number' => 2,
    ]);
});
