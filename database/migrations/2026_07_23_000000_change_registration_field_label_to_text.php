<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('registration_fields', function (Blueprint $table) {
            $table->text('label')->change();
        });
    }

    public function down(): void
    {
        Schema::table('registration_fields', function (Blueprint $table) {
            $table->string('label', 500)->change();
        });
    }
};
