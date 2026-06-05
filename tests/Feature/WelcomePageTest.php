<?php

use App\Models\Programme;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('welcome page features active registration event', function () {
    $admin = User::factory()->create();

    Programme::query()->create([
        'user_id' => $admin->id,
        'tag' => 'OTHER',
        'title' => 'Other Event',
        'description' => 'Other event description',
        'location' => 'Cebu',
        'starts_at' => now()->addWeek(),
        'ends_at' => now()->addWeek()->addDay(),
        'is_active' => true,
    ]);

    $activeRegistration = Programme::query()->create([
        'user_id' => $admin->id,
        'tag' => 'REG',
        'title' => 'Active Registration Event',
        'description' => 'Active registration description',
        'location' => 'Manila',
        'starts_at' => now()->addWeeks(2),
        'ends_at' => now()->addWeeks(2)->addDay(),
        'image_url' => 'featured.png',
        'is_active' => true,
        'is_registration_active' => true,
    ]);

    $this->get(route('home'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('welcome')
            ->where('activeRegistrationProgramme.id', $activeRegistration->id)
            ->where('activeRegistrationProgramme.title', 'Active Registration Event')
            ->where('activeRegistrationProgramme.image_url', 'featured.png')
        );
});

test('welcome page has no featured event when no active registration event is set', function () {
    $admin = User::factory()->create();

    Programme::query()->create([
        'user_id' => $admin->id,
        'tag' => 'LATER',
        'title' => 'Later Event',
        'description' => 'Later event description',
        'location' => 'Cebu',
        'starts_at' => now()->addMonth(),
        'ends_at' => now()->addMonth()->addDay(),
        'is_active' => true,
    ]);

    Programme::query()->create([
        'user_id' => $admin->id,
        'tag' => 'NEXT',
        'title' => 'Nearest Active Event',
        'description' => 'Nearest active event description',
        'location' => 'Manila',
        'starts_at' => now()->addWeek(),
        'ends_at' => now()->addWeek()->addDay(),
        'is_active' => true,
    ]);

    $this->get(route('home'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('welcome')
            ->where('activeRegistrationProgramme', null)
        );
});
