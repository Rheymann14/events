<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Models\UserType;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class MakeAdmin extends Command
{
    protected $signature = 'make:admin';

    protected $description = 'Create an admin account with generated virtual ID and participant ID data.';

    public function handle(): int
    {
        $givenName = $this->requiredAnswer('First name');
        $middleName = $this->ask('Middle name (optional)');
        $familyName = $this->requiredAnswer('Family name');
        $email = Str::lower($this->requiredAnswer('Email'));
        $password = (string) $this->secret('Password');

        $data = [
            'given_name' => $givenName,
            'middle_name' => $middleName ?: null,
            'family_name' => $familyName,
            'email' => $email,
            'password' => $password,
        ];

        $validator = Validator::make($data, [
            'given_name' => ['required', 'string', 'max:255'],
            'middle_name' => ['nullable', 'string', 'max:255'],
            'family_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $adminType = $this->adminUserType();

        $existingUser = User::query()
            ->whereRaw('LOWER(email) = ?', [$email])
            ->first();

        if ($existingUser && ! $this->confirm('This email already exists. Update it as an admin account?', false)) {
            $this->warn('No admin account was created.');

            return self::SUCCESS;
        }

        $user = $existingUser ?: new User;
        $user->forceFill([
            'name' => $this->buildFullName($givenName, $middleName, $familyName),
            'given_name' => $givenName,
            'middle_name' => $middleName ?: null,
            'family_name' => $familyName,
            'email' => $email,
            'email_verified_at' => now(),
            'password' => Hash::make($password),
            'user_type_id' => $adminType->id,
            'is_active' => true,
        ]);

        $this->ensureVirtualIdFields($user);

        $user->save();

        $this->info($existingUser ? 'Admin account updated.' : 'Admin account created.');
        $this->line("Name: {$user->name}");
        $this->line("Email: {$user->email}");
        $this->line("Participant ID: {$user->display_id}");

        return self::SUCCESS;
    }

    private function requiredAnswer(string $question): string
    {
        do {
            $answer = trim((string) $this->ask($question));

            if ($answer !== '') {
                return $answer;
            }

            $this->error("{$question} is required.");
        } while (true);
    }

    private function buildFullName(string $givenName, ?string $middleName, string $familyName): string
    {
        return collect([$givenName, $middleName, $familyName])
            ->map(fn ($part) => trim((string) $part))
            ->filter()
            ->implode(' ');
    }

    private function adminUserType(): UserType
    {
        $adminType = UserType::query()
            ->whereRaw('LOWER(slug) = ?', ['admin'])
            ->orWhereRaw('LOWER(name) = ?', ['admin'])
            ->first() ?: new UserType;

        $attributes = [
            'name' => 'Admin',
            'slug' => 'admin',
            'is_active' => true,
        ];

        if (Schema::hasColumn('user_types', 'sequence_order')) {
            $attributes['sequence_order'] = 0;
        }

        $adminType->forceFill($attributes)->save();

        return $adminType;
    }

    private function ensureVirtualIdFields(User $user): void
    {
        if (blank($user->display_id)) {
            $user->display_id = $this->newDisplayId();
        }

        if (blank($user->qr_token)) {
            $user->qr_token = (string) Str::uuid();
        }

        if (blank($user->qr_payload)) {
            $user->qr_payload = Crypt::encryptString((string) $user->qr_token);
        }
    }

    private function newDisplayId(): string
    {
        do {
            $displayId = 'CHED-'.Str::upper(Str::random(4)).'-'.Str::upper(Str::random(4));
        } while (User::query()->where('display_id', $displayId)->exists());

        return $displayId;
    }
}
