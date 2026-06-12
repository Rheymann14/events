<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('participant_attendances', function (Blueprint $table) {
            $table->timestamp('certificate_sent_at')->nullable()->after('scanned_at');
        });
    }

    public function down(): void
    {
        Schema::table('participant_attendances', function (Blueprint $table) {
            $table->dropColumn('certificate_sent_at');
        });
    }
};
