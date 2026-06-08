<?php

use App\Models\Programme;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('public event page only marks explicitly closed registration events as registration closed', function () {
    $admin = User::factory()->create();

    $closedRegistrationProgramme = Programme::query()->create([
        'user_id' => $admin->id,
        'tag' => 'REG',
        'title' => 'Registration Closed Event',
        'description' => 'The event remains visible.',
        'location' => 'Manila',
        'starts_at' => now()->addWeek(),
        'ends_at' => now()->addWeek()->addDay(),
        'is_active' => true,
        'is_registration_active' => false,
        'is_registration_closed' => true,
    ]);

    $upcomingProgramme = Programme::query()->create([
        'user_id' => $admin->id,
        'tag' => 'NEXT',
        'title' => 'Normal Upcoming Event',
        'description' => 'This event is not marked registration closed.',
        'location' => 'Cebu',
        'starts_at' => now()->addWeeks(2),
        'ends_at' => now()->addWeeks(2)->addDay(),
        'is_active' => true,
        'is_registration_active' => false,
        'is_registration_closed' => false,
    ]);

    $this->get(route('event'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('event')
            ->where('programmes.0.id', $upcomingProgramme->id)
            ->where('programmes.0.title', 'Normal Upcoming Event')
            ->where('programmes.0.is_active', true)
            ->where('programmes.0.is_registration_active', false)
            ->where('programmes.0.is_registration_closed', false)
            ->where('programmes.1.id', $closedRegistrationProgramme->id)
            ->where('programmes.1.title', 'Registration Closed Event')
            ->where('programmes.1.is_active', true)
            ->where('programmes.1.is_registration_active', false)
            ->where('programmes.1.is_registration_closed', true)
        );
});
