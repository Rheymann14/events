<?php

use App\Models\Programme;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('public event page still shows active events after registration is closed', function () {
    $admin = User::factory()->create();

    $programme = Programme::query()->create([
        'user_id' => $admin->id,
        'tag' => 'REG',
        'title' => 'Registration Closed Event',
        'description' => 'The event remains visible.',
        'location' => 'Manila',
        'starts_at' => now()->addWeek(),
        'ends_at' => now()->addWeek()->addDay(),
        'is_active' => true,
        'is_registration_active' => false,
    ]);

    $this->get(route('event'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('event')
            ->where('programmes.0.id', $programme->id)
            ->where('programmes.0.title', 'Registration Closed Event')
            ->where('programmes.0.is_active', true)
            ->where('programmes.0.is_registration_active', false)
        );
});
