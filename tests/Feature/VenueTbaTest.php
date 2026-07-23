<?php

use App\Models\Programme;
use App\Models\User;
use App\Models\Venue;
use Inertia\Testing\AssertableInertia as Assert;

function createProgrammeForVenue(User $user, array $overrides = []): Programme
{
    return Programme::query()->create([
        'user_id' => $user->id,
        'tag' => 'VENUE',
        'title' => 'Venue Test Event',
        'description' => 'Programme description',
        'location' => 'Philippines',
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'is_active' => true,
        ...$overrides,
    ]);
}

test('an administrator can mark a venue as to be announced', function () {
    $admin = User::factory()->create();
    $programme = createProgrammeForVenue($admin);

    $this->actingAs($admin)
        ->post(route('venues.store'), [
            'programme_id' => $programme->id,
            'name' => 'TBA',
            'address' => 'TBA',
            'is_tba' => true,
            'google_maps_url' => 'https://maps.google.com/?q=manila',
            'embed_url' => 'https://www.google.com/maps/embed?pb=test',
            'is_active' => true,
        ])
        ->assertRedirect();

    $this->assertDatabaseHas('venues', [
        'programme_id' => $programme->id,
        'is_tba' => true,
    ]);
});

test('the public venue payload identifies a tba venue', function () {
    $admin = User::factory()->create();
    $programme = createProgrammeForVenue($admin, [
        'is_registration_active' => true,
    ]);

    Venue::query()->create([
        'programme_id' => $programme->id,
        'name' => 'TBA',
        'address' => 'TBA',
        'is_tba' => true,
        'google_maps_url' => 'https://maps.google.com/?q=manila',
        'embed_url' => 'https://www.google.com/maps/embed?pb=test',
        'is_active' => true,
    ]);

    $this->get(route('venue'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('venue')
            ->where('venues.0.is_tba', true)
        );
});
