<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('registration_fields', function (Blueprint $table) {
            $table->json('option_routes')->nullable()->after('options');
        });

        $targets = [
            'country_delegation',
            'stakeholder_delegation',
            'asean_secretariat',
            'european_union',
            'single_participant_other',
        ];

        DB::table('registration_fields')
            ->where('field_key', 'registration_type')
            ->get(['id', 'programme_id'])
            ->each(function ($field) use ($targets) {
                $availableTargets = DB::table('registration_fields')
                    ->where('programme_id', $field->programme_id)
                    ->whereIn('field_key', $targets)
                    ->pluck('field_key')
                    ->all();

                if (count(array_intersect($targets, $availableTargets)) === count($targets)) {
                    DB::table('registration_fields')
                        ->where('id', $field->id)
                        ->update(['option_routes' => json_encode($targets)]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('registration_fields', function (Blueprint $table) {
            $table->dropColumn('option_routes');
        });
    }
};
