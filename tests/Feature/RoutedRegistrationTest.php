<?php

use App\Actions\Fortify\CreateNewUser;
use App\Models\Programme;
use App\Models\User;
use Illuminate\Support\Facades\DB;

function routedRegistrationInput(Programme $programme, array $responses): array
{
    $userTypeId = DB::table('user_types')->insertGetId([
        'name' => 'Participant',
        'slug' => 'participant-'.str()->random(8),
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return [
        'honorific_title' => 'mr',
        'given_name' => 'Branch',
        'family_name' => 'Tester',
        'sex_assigned_at_birth' => 'male',
        'organization_name' => 'Test Organization',
        'position_title' => 'Delegate',
        'email' => fake()->unique()->safeEmail(),
        'contact_number' => '09171234567',
        'user_type_id' => $userTypeId,
        'programme_ids' => [$programme->id],
        'registration_responses' => [$programme->id => $responses],
    ];
}

test('public registration validates and stores only the selected routed branch', function () {
    $owner = User::factory()->create();
    $programme = Programme::query()->create([
        'user_id' => $owner->id,
        'tag' => 'ROUTED',
        'title' => 'Routed Registration Event',
        'description' => 'Registration branching test',
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDays(2),
        'location' => 'Manila',
        'is_active' => true,
        'is_registration_active' => true,
    ]);

    $source = $programme->registrationFields()->create([
        'field_key' => 'registration_type',
        'label' => 'Registration type',
        'field_type' => 'radio',
        'options' => ['Country', 'Stakeholder'],
        'option_routes' => ['country_section', 'stakeholder_section'],
        'is_required' => true,
        'sort_order' => 0,
    ]);
    $programme->registrationFields()->create([
        'field_key' => 'country_section',
        'label' => 'Country',
        'field_type' => 'section',
        'sort_order' => 1,
    ]);
    $countryQuestion = $programme->registrationFields()->create([
        'field_key' => 'country_name',
        'label' => 'Country name',
        'field_type' => 'text',
        'is_required' => true,
        'sort_order' => 2,
    ]);
    $programme->registrationFields()->create([
        'field_key' => 'stakeholder_section',
        'label' => 'Stakeholder',
        'field_type' => 'section',
        'sort_order' => 3,
    ]);
    $hiddenQuestion = $programme->registrationFields()->create([
        'field_key' => 'organisation_name',
        'label' => 'Stakeholder organization',
        'field_type' => 'text',
        'is_required' => true,
        'sort_order' => 4,
    ]);

    $user = app(CreateNewUser::class)->create(routedRegistrationInput($programme, [
        $source->id => 'Country',
        $countryQuestion->id => 'Philippines',
        $hiddenQuestion->id => 'Stale hidden answer',
    ]));

    $this->assertDatabaseHas('registration_field_responses', [
        'user_id' => $user->id,
        'registration_field_id' => $countryQuestion->id,
    ]);
    $this->assertDatabaseMissing('registration_field_responses', [
        'user_id' => $user->id,
        'registration_field_id' => $hiddenQuestion->id,
    ]);
});
