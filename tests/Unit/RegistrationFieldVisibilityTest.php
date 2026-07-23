<?php

use App\Models\RegistrationField;

function registrationFieldForVisibility(int $id, string $key, string $type, array $options = [], array $routes = []): RegistrationField
{
    return (new RegistrationField)->forceFill([
        'id' => $id,
        'field_key' => $key,
        'field_type' => $type,
        'options' => $options,
        'option_routes' => $routes,
    ]);
}

test('a routed single choice only exposes its selected field segment', function () {
    $fields = collect([
        registrationFieldForVisibility(1, 'registration_type', 'radio', ['Country', 'Stakeholder'], ['country', 'stakeholder']),
        registrationFieldForVisibility(2, 'country', 'section'),
        registrationFieldForVisibility(3, 'country_name', 'text'),
        registrationFieldForVisibility(4, 'stakeholder', 'section'),
        registrationFieldForVisibility(5, 'organisation_name', 'text'),
    ]);

    expect(RegistrationField::visibleFieldIds($fields, [1 => 'Country']))
        ->toBe([1, 2, 3]);
});

test('a routed checkbox exposes every selected field segment', function () {
    $fields = collect([
        registrationFieldForVisibility(1, 'activities', 'checkbox', ['Reception', 'Dinner'], ['reception', 'dinner']),
        registrationFieldForVisibility(2, 'reception', 'section'),
        registrationFieldForVisibility(3, 'reception_guests', 'text'),
        registrationFieldForVisibility(4, 'dinner', 'section'),
        registrationFieldForVisibility(5, 'dinner_guests', 'text'),
    ]);

    expect(RegistrationField::visibleFieldIds($fields, [1 => ['Reception', 'Dinner']]))
        ->toBe([1, 2, 3, 4, 5]);
});
