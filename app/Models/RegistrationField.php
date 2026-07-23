<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

class RegistrationField extends Model
{
    use HasFactory;

    protected $fillable = [
        'programme_id',
        'field_key',
        'label',
        'field_type',
        'options',
        'option_routes',
        'placeholder',
        'help_text',
        'is_required',
        'sort_order',
    ];

    protected $casts = [
        'options' => 'array',
        'option_routes' => 'array',
        'is_required' => 'boolean',
    ];

    public function programme(): BelongsTo
    {
        return $this->belongsTo(Programme::class);
    }

    public function responses(): HasMany
    {
        return $this->hasMany(RegistrationFieldResponse::class);
    }

    /** @return array<int, int> */
    public static function visibleFieldIds(Collection $fields, array $responses): array
    {
        $targetKeys = $fields
            ->flatMap(fn (self $field) => $field->option_routes ?? [])
            ->filter()
            ->unique()
            ->values();

        if ($targetKeys->isEmpty()) {
            return $fields->pluck('id')->map(fn ($id) => (int) $id)->all();
        }

        $activeTargets = collect();
        foreach ($fields as $source) {
            $routes = $source->option_routes ?? [];
            if (! collect($routes)->filter()->isNotEmpty()) {
                continue;
            }

            $answer = $responses[$source->id] ?? $responses[(string) $source->id] ?? null;
            $selected = is_array($answer) ? array_map('strval', $answer) : [(string) $answer];

            foreach ($source->options ?? [] as $optionIndex => $option) {
                $target = $routes[$optionIndex] ?? null;
                if ($target && in_array((string) $option, $selected, true)) {
                    $activeTargets->push($target);
                }
            }
        }

        $visibleIds = [];
        $owningTarget = null;
        foreach ($fields as $field) {
            if ($targetKeys->contains($field->field_key)) {
                $owningTarget = $field->field_key;
            }

            if ($owningTarget === null || $activeTargets->contains($owningTarget)) {
                $visibleIds[] = (int) $field->id;
            }
        }

        return $visibleIds;
    }
}
