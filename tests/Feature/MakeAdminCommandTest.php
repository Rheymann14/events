<?php

use App\Models\User;
use App\Models\UserType;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

it('creates an admin account with virtual id fields', function () {
    $this->artisan('make:admin')
        ->expectsQuestion('First name', 'Ada')
        ->expectsQuestion('Middle name (optional)', 'Byron')
        ->expectsQuestion('Family name', 'Lovelace')
        ->expectsQuestion('Email', 'ada@example.com')
        ->expectsQuestion('Password', 'password123')
        ->assertExitCode(0);

    $adminType = UserType::query()->where('slug', 'admin')->firstOrFail();
    $admin = User::query()->where('email', 'ada@example.com')->firstOrFail();

    expect($admin->name)->toBe('Ada Byron Lovelace')
        ->and($admin->given_name)->toBe('Ada')
        ->and($admin->middle_name)->toBe('Byron')
        ->and($admin->family_name)->toBe('Lovelace')
        ->and($admin->user_type_id)->toBe($adminType->id)
        ->and($admin->is_active)->toBeTrue()
        ->and($admin->email_verified_at)->not->toBeNull()
        ->and($admin->display_id)->toStartWith('CHED-')
        ->and(Str::isUuid($admin->qr_token))->toBeTrue()
        ->and(Crypt::decryptString($admin->qr_payload))->toBe($admin->qr_token);
});
