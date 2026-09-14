<?php

namespace Database\Seeders;

use App\Models\Country;
use App\Models\User;
use App\Models\UserType;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Dummy participants for testing the participant, reports, assignment and
 * ID-card modules against a realistic population.
 *
 * Not registered in DatabaseSeeder on purpose: that runs during
 * `composer run setup`, and fake people should never appear in a fresh
 * deployment. Run it explicitly instead:
 *
 *     php artisan db:seed --class=DummyParticipantSeeder
 *
 * Re-running tops up to TARGET_COUNT rather than duplicating. Participants are
 * deliberately left with no programmes joined.
 *
 * Faker is avoided because it lives in require-dev, so a `composer install
 * --no-dev` would fatal here. The curated pools below also read as regional
 * names rather than Faker's default en_US output.
 */
class DummyParticipantSeeder extends Seeder
{
    private const TARGET_COUNT = 100;

    /** Marks a row as disposable test data and keeps emails unique. */
    private const EMAIL_DOMAIN = '@example.test';

    /** Matches CreateNewUser::DEFAULT_PARTICIPANT_PASSWORD so they can log in. */
    private const PASSWORD = 'chedevents2026';

    /**
     * From the registration form's HONORIFIC_OPTIONS, split by sex so the
     * generated records do not read as "Ms. Antonio".
     */
    private const HONORIFICS_MALE = ['Mr.', 'Dr.', 'Prof.'];

    private const HONORIFICS_FEMALE = ['Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.'];

    /** The only values sex_assigned_at_birth validation accepts. */
    private const SEXES = ['male', 'female'];

    /** Subset of ParticipantController::FOOD_RESTRICTION_OPTIONS. */
    private const FOOD_RESTRICTIONS = [
        'vegetarian',
        'vegan',
        'halal',
        'kosher',
        'gluten_free',
        'lactose_intolerant',
        'nut_allergy',
        'seafood_allergy',
    ];

    /** Subset of ParticipantController::ACCESSIBILITY_NEEDS_OPTIONS. */
    private const ACCESSIBILITY_NEEDS = [
        'wheelchair_access',
        'sign_language_interpreter',
        'assistive_technology_support',
    ];

    private const GIVEN_NAMES_MALE = [
        'Juan', 'Jose', 'Antonio', 'Ramon', 'Carlos', 'Miguel', 'Rafael',
        'Emilio', 'Andres', 'Rodrigo', 'Fernando', 'Ricardo', 'Eduardo',
        'Alfredo', 'Benigno', 'Cesar', 'Danilo', 'Ernesto', 'Gerardo', 'Hector',
    ];

    private const GIVEN_NAMES_FEMALE = [
        'Maria', 'Ana', 'Rosa', 'Carmen', 'Teresa', 'Luzviminda', 'Corazon',
        'Imelda', 'Josefina', 'Cristina', 'Gloria', 'Elena', 'Beatriz',
        'Patricia', 'Angelica', 'Divina', 'Marisol', 'Nenita', 'Remedios', 'Sofia',
    ];

    private const MIDDLE_NAMES = [
        'Bautista', 'Cruz', 'Delos Santos', 'Fernandez', 'Gonzales', 'Ilagan',
        'Jimenez', 'Lacsamana', 'Mercado', 'Navarro', 'Ocampo', 'Padilla',
        'Quijano', 'Ramirez', 'Salazar', 'Tolentino', 'Urbano', 'Valdez',
    ];

    private const FAMILY_NAMES = [
        'Santos', 'Reyes', 'Garcia', 'Torres', 'Aquino', 'Villanueva',
        'Castillo', 'Domingo', 'Espiritu', 'Flores', 'Guzman', 'Hernandez',
        'Iglesias', 'Lim', 'Magsaysay', 'Nolasco', 'Pascual', 'Rivera',
        'Soriano', 'Trinidad', 'Ventura', 'Yap', 'Zamora', 'Bonifacio',
    ];

    /** Generational suffixes, applied to male records only by convention. */
    private const SUFFIXES = [null, null, null, null, 'Jr.', 'Sr.', 'III'];

    private const ORGANIZATIONS = [
        'University of the Philippines Diliman',
        'Ateneo de Manila University',
        'De La Salle University',
        'Bicol University',
        'Mindanao State University',
        'Cebu Normal University',
        'Central Luzon State University',
        'Mariano Marcos State University',
        'Western Visayas State University',
        'Polytechnic University of the Philippines',
        'CHED Regional Office V',
        'CHED Regional Office VII',
        'Technological University of the Philippines',
        'Silliman University',
    ];

    private const POSITIONS = [
        'Faculty Researcher',
        'Associate Professor',
        'Dean of Student Affairs',
        'Program Chair',
        'Vice President for Academic Affairs',
        'Education Supervisor',
        'Institutional Researcher',
        'Registrar',
        'Extension Coordinator',
        'Quality Assurance Officer',
    ];

    private const RELATIONSHIPS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Guardian'];

    public function run(): void
    {
        $userTypes = UserType::query()
            // Admins are never participants: EnsureRole treats any other type
            // as one, so the remaining three are the participant types.
            ->where('slug', '!=', 'admin')
            ->where('is_active', true)
            ->pluck('id')
            ->all();

        $countries = Country::query()->where('is_active', true)->pluck('id')->all();

        if (empty($userTypes) || empty($countries)) {
            $this->command?->error(
                'Lookup data missing. Run: php artisan db:seed --class=ParticipantSeeder'
            );

            return;
        }

        $existing = User::query()
            ->where('email', 'like', '%'.self::EMAIL_DOMAIN)
            ->count();

        $missing = self::TARGET_COUNT - $existing;

        if ($missing <= 0) {
            $this->command?->info(
                "Already {$existing} dummy participants; nothing to create."
            );

            return;
        }

        // Emails are the uniqueness key, so continue past whatever exists
        // rather than restarting at 1 and colliding.
        $nextIndex = $existing + 1;

        DB::transaction(function () use ($missing, $nextIndex, $userTypes, $countries) {
            for ($i = 0; $i < $missing; $i++) {
                $this->createParticipant($nextIndex + $i, $userTypes, $countries);
            }
        });

        $this->command?->info(
            "Created {$missing} dummy participants (now ".self::TARGET_COUNT.' total).'
        );
    }

    /**
     * @param  array<int, int>  $userTypes
     * @param  array<int, int>  $countries
     */
    private function createParticipant(int $index, array $userTypes, array $countries): void
    {
        $sex = self::SEXES[$index % 2];
        $given = $sex === 'male'
            ? self::GIVEN_NAMES_MALE[$index % count(self::GIVEN_NAMES_MALE)]
            : self::GIVEN_NAMES_FEMALE[$index % count(self::GIVEN_NAMES_FEMALE)];

        $honorifics = $sex === 'male' ? self::HONORIFICS_MALE : self::HONORIFICS_FEMALE;
        $honorific = $honorifics[$index % count($honorifics)];

        $middle = self::MIDDLE_NAMES[$index % count(self::MIDDLE_NAMES)];
        $family = self::FAMILY_NAMES[$index % count(self::FAMILY_NAMES)];
        $suffix = $sex === 'male'
            ? self::SUFFIXES[$index % count(self::SUFFIXES)]
            : null;

        $fullName = trim(implode(' ', array_filter([$given, $middle, $family, $suffix])));

        // Roughly a third carry dietary or accessibility needs, so the filters
        // have both populated and empty rows to work with.
        $hasFood = $index % 3 === 0;
        $foodRestrictions = $hasFood
            ? [self::FOOD_RESTRICTIONS[$index % count(self::FOOD_RESTRICTIONS)]]
            : [];

        $accessibility = $index % 7 === 0
            ? [self::ACCESSIBILITY_NEEDS[$index % count(self::ACCESSIBILITY_NEEDS)]]
            : [];

        $attendsDinner = $index % 2 === 0;

        $user = User::create([
            'name' => $fullName,
            'honorific_title' => $honorific,
            'given_name' => $given,
            'middle_name' => $middle,
            'family_name' => $family,
            'suffix' => $suffix,
            'sex_assigned_at_birth' => $sex,
            'organization_name' => self::ORGANIZATIONS[$index % count(self::ORGANIZATIONS)],
            'position_title' => self::POSITIONS[$index % count(self::POSITIONS)],
            'email' => 'participant'.$index.self::EMAIL_DOMAIN,
            'contact_country_code' => '+63',
            'contact_number' => '9'.str_pad((string) (170000000 + $index), 9, '0', STR_PAD_LEFT),
            'password' => self::PASSWORD,
            'country_id' => $countries[$index % count($countries)],
            'user_type_id' => $userTypes[$index % count($userTypes)],
            'ip_affiliation' => $index % 11 === 0,
            'ip_group_name' => $index % 11 === 0 ? 'Sample IP Community' : null,
            'consent_contact_sharing' => $index % 4 !== 0,
            'consent_photo_video' => $index % 5 !== 0,
            'attend_welcome_dinner' => $attendsDinner,
            'avail_transport_from_makati_to_peninsula' => $attendsDinner && $index % 3 === 0,
            'has_food_restrictions' => $hasFood,
            'food_restrictions' => $foodRestrictions,
            'dietary_allergies' => $hasFood && $index % 6 === 0 ? 'Peanuts' : null,
            'accessibility_needs' => $accessibility,
            'emergency_contact_name' => ($index % 2 === 0
                ? self::GIVEN_NAMES_FEMALE[$index % count(self::GIVEN_NAMES_FEMALE)]
                : self::GIVEN_NAMES_MALE[$index % count(self::GIVEN_NAMES_MALE)]).' '.$family,
            'emergency_contact_relationship' => self::RELATIONSHIPS[$index % count(self::RELATIONSHIPS)],
            'emergency_contact_phone' => '9'.str_pad((string) (180000000 + $index), 9, '0', STR_PAD_LEFT),
            'emergency_contact_email' => 'emergency'.$index.self::EMAIL_DOMAIN,
            'is_active' => true,
        ]);

        // Not fillable, so it has to be set after create -- without it these
        // accounts hit Fortify's email verification wall on login.
        $user->forceFill(['email_verified_at' => now()])->save();

    }
}
