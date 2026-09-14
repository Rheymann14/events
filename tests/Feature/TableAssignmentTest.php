<?php

use App\Models\ParticipantTable;
use App\Models\ParticipantTableAssignment;
use App\Models\Programme;
use App\Models\User;
use App\Models\UserType;
use Inertia\Testing\AssertableInertia as Assert;

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

test('bulk unassign removes the selected assignments and resequences seats', function () {
    $adminType = UserType::query()->create([
        'name' => 'ADMIN',
        'slug' => 'ADMIN',
        'is_active' => true,
    ]);

    $owner = User::factory()->create();
    $admin = User::factory()->create([
        'user_type_id' => $adminType->id,
    ]);

    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'TABLE-BULK',
        'title' => 'Bulk Unassign Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => true,
    ]);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table C',
        'capacity' => 4,
    ]);

    $seated = collect(range(1, 3))->map(function (int $seat) use ($programme, $table) {
        $participant = User::factory()->create();
        $programme->users()->attach($participant->id);

        return ParticipantTableAssignment::query()->create([
            'programme_id' => $programme->id,
            'participant_table_id' => $table->id,
            'seat_number' => $seat,
            'user_id' => $participant->id,
            'assigned_at' => now(),
        ]);
    });

    // Remove seats 1 and 2; the occupant of seat 3 should close the gap.
    $this->actingAs($admin)
        ->delete(route('table-assignment.assignments.bulk-destroy'), [
            'assignment_ids' => [$seated[0]->id, $seated[1]->id],
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $this->assertDatabaseMissing('participant_table_assignments', [
        'id' => $seated[0]->id,
    ]);
    $this->assertDatabaseMissing('participant_table_assignments', [
        'id' => $seated[1]->id,
    ]);
    $this->assertDatabaseHas('participant_table_assignments', [
        'id' => $seated[2]->id,
        'seat_number' => 1,
    ]);
});

test('bulk unassign is rejected when the programme is closed', function () {
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
        'tag' => 'TABLE-CLOSED',
        'title' => 'Closed Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => false,
    ]);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table D',
        'capacity' => 4,
    ]);

    $programme->users()->attach($participant->id);

    $assignment = ParticipantTableAssignment::query()->create([
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'seat_number' => 1,
        'user_id' => $participant->id,
        'assigned_at' => now(),
    ]);

    $this->actingAs($admin)
        ->delete(route('table-assignment.assignments.bulk-destroy'), [
            'assignment_ids' => [$assignment->id],
        ])
        ->assertSessionHasErrors('assignment_ids');

    $this->assertDatabaseHas('participant_table_assignments', [
        'id' => $assignment->id,
    ]);
});

test('deleting a table cascades its seat assignments', function () {
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
        'tag' => 'TABLE-CASCADE',
        'title' => 'Cascade Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => true,
    ]);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table E',
        'capacity' => 4,
    ]);

    $programme->users()->attach($participant->id);

    $assignment = ParticipantTableAssignment::query()->create([
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'seat_number' => 1,
        'user_id' => $participant->id,
        'assigned_at' => now(),
    ]);

    $this->actingAs($admin)
        ->delete(route('table-assignment.tables.destroy', $table))
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    // This is the consequence the delete confirmation warns about.
    $this->assertDatabaseMissing('participant_table_assignments', [
        'id' => $assignment->id,
    ]);
});

test('admin can update several tables in one request', function () {
    $adminType = UserType::query()->create([
        'name' => 'ADMIN',
        'slug' => 'ADMIN',
        'is_active' => true,
    ]);

    $owner = User::factory()->create();
    $admin = User::factory()->create([
        'user_type_id' => $adminType->id,
    ]);

    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'TABLE-BULK-EDIT',
        'title' => 'Bulk Edit Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => true,
    ]);

    $first = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table 1',
        'capacity' => 4,
    ]);
    $second = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table 2',
        'capacity' => 4,
    ]);

    $this->actingAs($admin)
        ->patch(route('table-assignment.tables.bulk-update'), [
            'tables' => [
                ['id' => $first->id, 'table_number' => 'Table 1', 'capacity' => 8],
                ['id' => $second->id, 'table_number' => 'Head Table', 'capacity' => 12],
            ],
        ])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    $this->assertDatabaseHas('participant_tables', [
        'id' => $first->id,
        'table_number' => 'Table 1',
        'capacity' => 8,
    ]);
    $this->assertDatabaseHas('participant_tables', [
        'id' => $second->id,
        'table_number' => 'Head Table',
        'capacity' => 12,
    ]);
});

test('bulk table update rejects duplicate names inside the batch', function () {
    $adminType = UserType::query()->create([
        'name' => 'ADMIN',
        'slug' => 'ADMIN',
        'is_active' => true,
    ]);

    $owner = User::factory()->create();
    $admin = User::factory()->create([
        'user_type_id' => $adminType->id,
    ]);

    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'TABLE-BULK-DUPE',
        'title' => 'Bulk Duplicate Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => true,
    ]);

    $first = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table 1',
        'capacity' => 4,
    ]);
    $second = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table 2',
        'capacity' => 4,
    ]);

    // Renaming both rows to the same name would slip past a per-row unique rule.
    $this->actingAs($admin)
        ->patch(route('table-assignment.tables.bulk-update'), [
            'tables' => [
                ['id' => $first->id, 'table_number' => 'Same Name', 'capacity' => 4],
                ['id' => $second->id, 'table_number' => 'Same Name', 'capacity' => 4],
            ],
        ])
        ->assertSessionHasErrors('tables');

    // Nothing is written when the batch is rejected.
    $this->assertDatabaseHas('participant_tables', [
        'id' => $first->id,
        'table_number' => 'Table 1',
    ]);
});

test('bulk table update is rejected when the programme is closed', function () {
    $adminType = UserType::query()->create([
        'name' => 'ADMIN',
        'slug' => 'ADMIN',
        'is_active' => true,
    ]);

    $owner = User::factory()->create();
    $admin = User::factory()->create([
        'user_type_id' => $adminType->id,
    ]);

    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'TABLE-BULK-CLOSED',
        'title' => 'Bulk Closed Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => false,
    ]);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table 1',
        'capacity' => 4,
    ]);

    $this->actingAs($admin)
        ->patch(route('table-assignment.tables.bulk-update'), [
            'tables' => [
                ['id' => $table->id, 'table_number' => 'Table 1', 'capacity' => 20],
            ],
        ])
        ->assertSessionHasErrors('tables');

    $this->assertDatabaseHas('participant_tables', [
        'id' => $table->id,
        'capacity' => 4,
    ]);
});

test('the seating plan payload carries the badge id for seated participants', function () {
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
        'tag' => 'TABLE-DISPLAY-ID',
        'title' => 'Badge Id Event',
        'description' => 'Programme description',
        'location' => 'Manila',
        'starts_at' => now()->subHour(),
        'ends_at' => now()->addHour(),
        'is_active' => true,
    ]);

    $table = ParticipantTable::query()->create([
        'programme_id' => $programme->id,
        'table_number' => 'Table 1',
        'capacity' => 4,
    ]);

    $programme->users()->attach($participant->id);

    ParticipantTableAssignment::query()->create([
        'programme_id' => $programme->id,
        'participant_table_id' => $table->id,
        'seat_number' => 1,
        'user_id' => $participant->id,
        'assigned_at' => now(),
    ]);

    // The seating plan search matches on this field, so it has to be sent.
    $this->actingAs($admin)
        ->get(route('table-assignment.create', ['event_id' => $programme->id]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('table-assignmeny')
            ->where(
                'tables.0.assignments.0.participant.display_id',
                $participant->display_id
            )
        );
});
