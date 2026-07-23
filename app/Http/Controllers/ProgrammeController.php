<?php

namespace App\Http\Controllers;

use App\Mail\ParticipantCertificateMail;
use App\Models\ParticipantAttendance;
use App\Models\Programme;
use App\Models\User;
use Dompdf\Cpdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Inertia;

class ProgrammeController extends Controller
{
    public function index()
    {
        $attendanceByProgramme = ParticipantAttendance::query()
            ->select(['programme_id', 'user_id', 'scanned_at'])
            ->get()
            ->groupBy('programme_id');

        $programmes = Programme::query()
            ->with([
                'user',
                'materials',
                'venues' => fn ($query) => $query->orderBy('id'),
            ])
            ->withCount('participants')
            ->latest('starts_at')
            ->get()
            ->map(function (Programme $programme) use ($attendanceByProgramme) {
                $attendanceEntries = $attendanceByProgramme->get($programme->id, collect());
                $venue = $programme->venues->first();

                return [
                    'id' => $programme->id,
                    'tag' => $programme->tag,
                    'title' => $programme->title,
                    'description' => $programme->description,
                    'starts_at' => $programme->starts_at?->toISOString(),
                    'ends_at' => $programme->ends_at?->toISOString(),
                    'location' => $programme->location,
                    'venue' => $venue
                        ? [
                            'id' => $venue->id,
                            'name' => $venue->name,
                            'address' => $venue->address,
                            'is_tba' => $venue->is_tba,
                            'google_maps_url' => $venue->google_maps_url,
                            'embed_url' => $venue->embed_url,
                            'is_active' => $venue->is_active,
                        ]
                        : null,
                    'image_url' => $programme->image_url,
                    'pdf_url' => $programme->pdf_url,
                    'materials' => $programme->materials
                        ->map(fn ($material) => [
                            'id' => $material->id,
                            'file_name' => $material->file_name,
                            'file_path' => $material->file_path,
                            'file_type' => $material->file_type,
                        ])
                        ->values()
                        ->all(),
                    'signatory_name' => $programme->signatory_name,
                    'signatory_title' => $programme->signatory_title,
                    'signatory_signature_url' => $programme->signatory_signature_url,
                    'is_active' => $programme->is_active,
                    'is_registration_active' => $programme->is_registration_active,
                    'is_registration_closed' => $programme->is_registration_closed,
                    'updated_at' => $programme->updated_at?->toISOString(),
                    'created_by' => $programme->user
                        ? [
                            'name' => $programme->user->name,
                        ]
                        : null,
                    'participant_count' => $programme->participants_count,
                    'checked_in_count' => $attendanceEntries->count(),
                ];
            });

        return Inertia::render('event-management', [
            'programmes' => $programmes,
        ]);
    }

    public function publicIndex()
    {
        $programmes = Programme::query()
            ->latest('starts_at')
            ->get()
            ->map(fn (Programme $programme) => [
                'id' => $programme->id,
                'tag' => $programme->tag,
                'title' => $programme->title,
                'description' => $programme->description,
                'starts_at' => $programme->starts_at?->toISOString(),
                'ends_at' => $programme->ends_at?->toISOString(),
                'location' => $programme->location,
                'image_url' => $programme->image_url,
                'pdf_url' => $programme->pdf_url,
                'is_active' => $programme->is_active,
                'is_registration_active' => $programme->is_registration_active,
                'is_registration_closed' => $programme->is_registration_closed,
                'updated_at' => $programme->updated_at?->toISOString(),
            ]);

        return Inertia::render('event', [
            'programmes' => $programmes,
        ]);
    }

    public function participants(Programme $programme)
    {
        $attendanceByUser = ParticipantAttendance::query()
            ->select(['user_id', 'scanned_at', 'certificate_sent_at'])
            ->where('programme_id', $programme->id)
            ->get()
            ->keyBy('user_id');

        $programme->load([
            'venues' => fn ($query) => $query->where('is_active', true)->orderBy('id'),
            'participants',
        ]);

        $venue = $programme->venues->first();

        return Inertia::render('event-management-participants', [
            'programme' => [
                'id' => $programme->id,
                'title' => $programme->title,
                'description' => $programme->description,
                'starts_at' => $programme->starts_at?->toISOString(),
                'ends_at' => $programme->ends_at?->toISOString(),
                'location' => $programme->location,
                'venue' => $venue
                    ? [
                        'name' => $venue->name,
                        'address' => $venue->address,
                    ]
                    : null,
                'signatory_name' => $programme->signatory_name,
                'signatory_title' => $programme->signatory_title,
                'signatory_signature_url' => $programme->signatory_signature_url,
                'participants' => $programme->participants
                    ->map(function ($participant) use ($attendanceByUser) {
                        $attendance = $attendanceByUser->get($participant->id);

                        return [
                            'id' => $participant->id,
                            'name' => $participant->name,
                            'email' => $participant->email,
                            'display_id' => $participant->display_id,
                            'checked_in_at' => $attendance?->scanned_at?->toISOString(),
                            'certificate_sent_at' => $attendance?->certificate_sent_at?->toISOString(),
                        ];
                    })
                    ->values()
                    ->all(),
            ],
        ]);
    }

    public function registrationFields(Programme $programme)
    {
        $programme->load('registrationFields');

        return Inertia::render('event-management-registration-fields', [
            'programme' => [
                'id' => $programme->id,
                'title' => $programme->title,
                'registration_fields' => $this->registrationFieldsPayload($programme),
            ],
        ]);
    }

    public function downloadParticipantCertificatesPdf(Request $request, Programme $programme)
    {
        @ini_set('memory_limit', '512M');
        @set_time_limit(180);

        $validated = $request->validate([
            'signatory_name' => ['nullable', 'string', 'max:255'],
            'signatory_title' => ['nullable', 'string', 'max:255'],
        ]);

        $checkedInParticipantIds = ParticipantAttendance::query()
            ->where('programme_id', $programme->id)
            ->whereNotNull('scanned_at')
            ->pluck('user_id')
            ->unique()
            ->values();

        $participants = $programme->participants()
            ->select(['users.id', 'users.name'])
            ->whereIn('users.id', $checkedInParticipantIds)
            ->orderBy('users.name')
            ->get()
            ->map(fn (User $participant) => [
                'name' => $this->certificateParticipantName($participant->name),
            ])
            ->values();

        if ($participants->isEmpty()) {
            return back()->withErrors([
                'certificates' => 'No checked-in participants to download.',
            ]);
        }

        $pdf = $this->buildParticipantCertificatesPdf(
            $participants,
            $this->participantCertificateData($programme, $validated),
        );

        $filename = sprintf(
            'participant-certificates-%s-%s.pdf',
            Str::slug($programme->title) ?: 'programme',
            now()->format('Ymd-His'),
        );

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    public function sendParticipantCertificateEmail(Request $request, Programme $programme, User $participant)
    {
        @ini_set('memory_limit', '512M');
        @set_time_limit(180);

        $validated = $request->validate([
            'signatory_name' => ['nullable', 'string', 'max:255'],
            'signatory_title' => ['nullable', 'string', 'max:255'],
        ]);

        $signatoryName = trim((string) ($validated['signatory_name'] ?? $programme->signatory_name ?? ''));
        $signatoryTitle = trim((string) ($validated['signatory_title'] ?? $programme->signatory_title ?? ''));

        if ($signatoryName === '' || $signatoryTitle === '' || ! $this->certificateSignaturePath($programme->signatory_signature_url)) {
            return back()->withErrors([
                'certificates' => 'Signatory name, signatory title, and signature are required before sending certificates.',
            ]);
        }

        if (! $programme->participants()->whereKey($participant->id)->exists()) {
            abort(404);
        }

        if (! $participant->email) {
            return back()->withErrors([
                'certificates' => 'This participant does not have an email address.',
            ]);
        }

        $attendance = ParticipantAttendance::query()
            ->where('programme_id', $programme->id)
            ->where('user_id', $participant->id)
            ->whereNotNull('scanned_at')
            ->first();

        if (! $attendance) {
            return back()->withErrors([
                'certificates' => 'Only checked-in participants can receive certificates.',
            ]);
        }

        $pdf = $this->buildParticipantCertificatesPdf(collect([
            [
                'name' => $this->certificateParticipantName($participant->name),
            ],
        ]), $this->participantCertificateData($programme, [
            'signatory_name' => $signatoryName,
            'signatory_title' => $signatoryTitle,
        ]));

        $filename = sprintf(
            'participant-certificate-%s-%s.pdf',
            Str::slug($participant->name ?: 'participant') ?: 'participant',
            now()->format('Ymd-His'),
        );

        Mail::to($participant->email, $participant->name)
            ->send(new ParticipantCertificateMail(
                participant: $participant,
                programme: $programme,
                pdf: $pdf,
                filename: $filename,
                eventDate: $this->formatCertificateDateRange($programme->starts_at, $programme->ends_at),
            ));

        $attendance->forceFill([
            'certificate_sent_at' => now(),
        ])->save();

        return back()->with('success', 'Certificate email sent to '.$participant->email.'.');
    }

    public function participantIndex(Request $request)
    {
        $attendanceEntries = ParticipantAttendance::query()
            ->select(['programme_id', 'scanned_at'])
            ->where('user_id', $request->user()->id)
            ->get();

        $programmes = Programme::query()
            ->with([
                'materials',
                'venues' => fn ($query) => $query->where('is_active', true)->orderBy('id'),
            ])
            ->latest('starts_at')
            ->get()
            ->map(function (Programme $programme) {
                $venue = $programme->venues->first();

                return [
                    'id' => $programme->id,
                    'tag' => $programme->tag,
                    'title' => $programme->title,
                    'description' => $programme->description,
                    'starts_at' => $programme->starts_at?->toISOString(),
                    'ends_at' => $programme->ends_at?->toISOString(),
                    'location' => $programme->location,
                    'venue' => $venue
                        ? [
                            'name' => $venue->name,
                            'address' => $venue->address,
                        ]
                        : null,
                    'image_url' => $programme->image_url,
                    'pdf_url' => $programme->pdf_url,
                    'materials' => $programme->materials
                        ->map(fn ($material) => [
                            'id' => $material->id,
                            'file_name' => $material->file_name,
                            'file_path' => $material->file_path,
                            'file_type' => $material->file_type,
                        ])
                        ->values()
                        ->all(),
                    'is_active' => $programme->is_active,
                    'updated_at' => $programme->updated_at?->toISOString(),
                ];
            });

        return Inertia::render('event-list', [
            'programmes' => $programmes,
            'joined_programme_ids' => $request->user()
                ->joinedProgrammes()
                ->pluck('programmes.id'),
            'welcome_dinner_preferences' => [
                'attend_welcome_dinner' => $request->user()->attend_welcome_dinner,
                'avail_transport_from_makati_to_peninsula' => $request->user()->avail_transport_from_makati_to_peninsula,
            ],
            'checked_in_programmes' => $attendanceEntries
                ->map(fn (ParticipantAttendance $attendance) => [
                    'programme_id' => $attendance->programme_id,
                    'scanned_at' => $attendance->scanned_at?->toISOString(),
                ])
                ->values()
                ->all(),
        ]);
    }

    public function join(Request $request, Programme $programme)
    {
        $now = now();
        $startsAt = $programme->starts_at;
        $endsAt = $programme->ends_at;

        if (! $programme->is_active) {
            return back()->withErrors(['event' => 'This event is closed.']);
        }

        if ($endsAt && $now->greaterThan($endsAt)) {
            return back()->withErrors(['event' => 'This event is closed.']);
        }

        if (! $endsAt && $startsAt && $now->greaterThan($startsAt) && ! $now->isSameDay($startsAt)) {
            return back()->withErrors(['event' => 'This event is closed.']);
        }

        $request->user()->joinedProgrammes()->syncWithoutDetaching([$programme->id]);

        return back();
    }

    public function leave(Request $request, Programme $programme)
    {
        $request->user()->joinedProgrammes()->detach($programme->id);

        return back();
    }

    public function clearSelections(Request $request)
    {
        $request->user()->joinedProgrammes()->detach();

        return back();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'tag' => ['nullable', 'string', 'max:255'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['required', 'string'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'location' => ['nullable', 'string', 'max:255'],
            'image' => ['nullable', 'image', 'max:10240'],
            'pdf' => ['nullable', 'file', 'mimes:pdf', 'max:20480'],
            'materials' => ['nullable', 'array'],
            'materials.*' => ['file', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx', 'max:20480'],
            'materials_remove' => ['nullable', 'array'],
            'materials_remove.*' => ['integer'],
            'signatory_name' => ['nullable', 'string', 'max:255'],
            'signatory_title' => ['nullable', 'string', 'max:255'],
            'signatory_signature' => ['nullable', 'image', 'max:10240'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $imageName = null;
        if ($request->hasFile('image')) {
            $file = $request->file('image');
            $imageName = Str::uuid()->toString().'.'.$file->getClientOriginalExtension();
            $destination = public_path('event-images');

            if (! File::exists($destination)) {
                File::makeDirectory($destination, 0755, true);
            }

            $file->move($destination, $imageName);
        }

        $pdfName = null;
        if ($request->hasFile('pdf')) {
            $file = $request->file('pdf');
            $destination = public_path('downloadables');

            if (! File::exists($destination)) {
                File::makeDirectory($destination, 0755, true);
            }

            $pdfName = $this->resolveUploadName($file->getClientOriginalName(), $destination);
            $file->move($destination, $pdfName);
        }

        $signatureName = null;
        if ($request->hasFile('signatory_signature')) {
            $file = $request->file('signatory_signature');
            $signatureName = Str::uuid()->toString().'.'.$file->getClientOriginalExtension();
            $destination = public_path('signatures');

            if (! File::exists($destination)) {
                File::makeDirectory($destination, 0755, true);
            }

            $file->move($destination, $signatureName);
        }

        $programme = Programme::create([
            'user_id' => $request->user()->id,
            'tag' => $validated['tag'] ?? '',
            'title' => $validated['title'],
            'description' => $validated['description'],
            'starts_at' => $validated['starts_at'] ?? null,
            'ends_at' => $validated['ends_at'] ?? null,
            'location' => $validated['location'] ?? '',
            'image_url' => $imageName,
            'pdf_url' => $pdfName,
            'signatory_name' => $validated['signatory_name'] ?? null,
            'signatory_title' => $validated['signatory_title'] ?? null,
            'signatory_signature_url' => $signatureName,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $this->storeMaterials($request, $programme);

        return back();
    }

    public function update(Request $request, Programme $programme)
    {
        $validated = $request->validate([
            'tag' => ['sometimes', 'nullable', 'string', 'max:255'],
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['sometimes', 'required', 'string'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'image' => ['nullable', 'image', 'max:10240'],
            'pdf' => ['nullable', 'file', 'mimes:pdf', 'max:20480'],
            'materials' => ['nullable', 'array'],
            'materials.*' => ['file', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx', 'max:20480'],
            'signatory_name' => ['nullable', 'string', 'max:255'],
            'signatory_title' => ['nullable', 'string', 'max:255'],
            'signatory_signature' => ['nullable', 'image', 'max:10240'],
            'signatory_signature_remove' => ['nullable', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('is_active', $validated) && ! $validated['is_active']) {
            $validated['is_registration_active'] = false;
        }

        unset(
            $validated['image'],
            $validated['pdf'],
            $validated['materials'],
            $validated['signatory_signature'],
            $validated['signatory_signature_remove'],
        );

        if ($request->hasFile('image')) {
            $file = $request->file('image');
            $imageName = Str::uuid()->toString().'.'.$file->getClientOriginalExtension();
            $destination = public_path('event-images');

            if (! File::exists($destination)) {
                File::makeDirectory($destination, 0755, true);
            }

            $file->move($destination, $imageName);

            if ($programme->image_url) {
                $existing = public_path('event-images/'.ltrim($programme->image_url, '/'));
                if (File::exists($existing)) {
                    File::delete($existing);
                }
            }

            $validated['image_url'] = $imageName;
        }

        if ($request->hasFile('pdf')) {
            $file = $request->file('pdf');
            $destination = public_path('downloadables');

            if (! File::exists($destination)) {
                File::makeDirectory($destination, 0755, true);
            }

            $pdfName = $this->resolveUploadName($file->getClientOriginalName(), $destination);
            $file->move($destination, $pdfName);

            if ($programme->pdf_url) {
                $existing = public_path('downloadables/'.ltrim($programme->pdf_url, '/'));
                if (File::exists($existing)) {
                    File::delete($existing);
                }
            }

            $validated['pdf_url'] = $pdfName;
        }

        if ($request->boolean('signatory_signature_remove')) {
            if ($programme->signatory_signature_url) {
                $existing = public_path('signatures/'.ltrim($programme->signatory_signature_url, '/'));
                if (File::exists($existing)) {
                    File::delete($existing);
                }
            }
            $validated['signatory_signature_url'] = null;
        }

        if ($request->hasFile('signatory_signature')) {
            $file = $request->file('signatory_signature');
            $signatureName = Str::uuid()->toString().'.'.$file->getClientOriginalExtension();
            $destination = public_path('signatures');

            if (! File::exists($destination)) {
                File::makeDirectory($destination, 0755, true);
            }

            $file->move($destination, $signatureName);

            if ($programme->signatory_signature_url) {
                $existing = public_path('signatures/'.ltrim($programme->signatory_signature_url, '/'));
                if (File::exists($existing)) {
                    File::delete($existing);
                }
            }

            $validated['signatory_signature_url'] = $signatureName;
        }

        $programme->update($validated);

        // ✅ remove selected existing materials (delete file + db row)
        $removeIds = $request->input('materials_remove', []);
        if (is_array($removeIds) && count($removeIds)) {
            $removeIds = collect($removeIds)->filter()->unique()->values();

            $materialsToRemove = $programme->materials()
                ->whereIn('id', $removeIds)
                ->get();

            foreach ($materialsToRemove as $material) {
                $existing = public_path('event-materials/'.ltrim($material->file_path, '/'));
                if (File::exists($existing)) {
                    File::delete($existing);
                }
                $material->delete();
            }
        }

        $this->storeMaterials($request, $programme);

        return back();
    }

    public function updateRegistrationFields(Request $request, Programme $programme)
    {
        $validated = $request->validate([
            'registration_fields' => ['nullable', 'array'],
            'registration_fields.*.id' => ['nullable', 'integer', 'exists:registration_fields,id'],
            'registration_fields.*.label' => ['required', 'string'],
            'registration_fields.*.field_key' => ['nullable', 'string', 'max:100'],
            'registration_fields.*.field_type' => ['required', 'string', 'in:section,text,textarea,email,tel,date,radio,checkbox,select'],
            'registration_fields.*.options' => ['nullable', 'array'],
            'registration_fields.*.options.*' => ['nullable', 'string', 'max:255'],
            'registration_fields.*.option_routes' => ['nullable', 'array'],
            'registration_fields.*.option_routes.*' => ['nullable', 'string', 'max:100'],
            'registration_fields.*.placeholder' => ['nullable', 'string', 'max:255'],
            'registration_fields.*.help_text' => ['nullable', 'string', 'max:1000'],
            'registration_fields.*.is_required' => ['nullable', 'boolean'],
            'registration_fields.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $fields = collect($validated['registration_fields'] ?? [])->values();
        $keptIds = $fields->pluck('id')->filter()->map(fn ($id) => (int) $id)->values();

        $programme->registrationFields()
            ->when($keptIds->isNotEmpty(), fn ($query) => $query->whereNotIn('id', $keptIds))
            ->delete();

        $usedKeys = [];
        foreach ($fields as $index => $field) {
            $type = $field['field_type'];
            $options = in_array($type, ['radio', 'checkbox', 'select'], true)
                ? collect($field['options'] ?? [])
                    ->map(fn ($option) => trim((string) $option))
                    ->filter()
                    ->unique()
                    ->values()
                    ->all()
                : [];
            $submittedRoutes = array_values($field['option_routes'] ?? []);
            $optionRoutes = collect($options)
                ->map(fn ($option, $optionIndex) => trim((string) ($submittedRoutes[$optionIndex] ?? '')) ?: null)
                ->all();

            $baseKey = trim((string) ($field['field_key'] ?? ''));
            $key = $this->uniqueFieldKey($baseKey ?: (string) $field['label'], $usedKeys);
            $usedKeys[] = $key;

            $payload = [
                'field_key' => $key,
                'label' => trim((string) $field['label']),
                'field_type' => $type,
                'options' => $options,
                'option_routes' => $optionRoutes,
                'placeholder' => trim((string) ($field['placeholder'] ?? '')) ?: null,
                'help_text' => trim((string) ($field['help_text'] ?? '')) ?: null,
                'is_required' => $type !== 'section' && (bool) ($field['is_required'] ?? false),
                'sort_order' => (int) ($field['sort_order'] ?? $index),
            ];

            if (! empty($field['id'])) {
                $programme->registrationFields()
                    ->whereKey($field['id'])
                    ->update($payload);
            } else {
                $programme->registrationFields()->create($payload);
            }
        }

        return back();
    }

    public function activateRegistration(Programme $programme)
    {
        Programme::query()
            ->where('is_registration_active', true)
            ->where('id', '!=', $programme->id)
            ->update(['is_registration_active' => false]);

        $programme->forceFill([
            'is_active' => true,
            'is_registration_active' => true,
            'is_registration_closed' => false,
        ])->save();

        return back();
    }

    public function closeRegistration(Programme $programme)
    {
        $programme->forceFill([
            'is_registration_active' => false,
            'is_registration_closed' => true,
        ])->save();

        return back();
    }

    private function storeMaterials(Request $request, Programme $programme): void
    {
        if (! $request->hasFile('materials')) {
            return;
        }

        $destination = public_path('event-materials');

        if (! File::exists($destination)) {
            File::makeDirectory($destination, 0755, true);
        }

        foreach ($request->file('materials', []) as $file) {
            $fileName = $this->resolveUploadName($file->getClientOriginalName(), $destination);
            $file->move($destination, $fileName);

            $programme->materials()->create([
                'file_name' => $file->getClientOriginalName(),
                'file_path' => $fileName,
                'file_type' => $file->getClientOriginalExtension(),
            ]);
        }
    }

    private function registrationFieldsPayload(Programme $programme): array
    {
        return $programme->registrationFields
            ->map(fn ($field) => [
                'id' => $field->id,
                'field_key' => $field->field_key,
                'label' => $field->label,
                'field_type' => $field->field_type,
                'options' => $field->options ?? [],
                'option_routes' => $field->option_routes ?? [],
                'placeholder' => $field->placeholder,
                'help_text' => $field->help_text,
                'is_required' => $field->is_required,
                'sort_order' => $field->sort_order,
            ])
            ->values()
            ->all();
    }

    private function certificateParticipantName(?string $name): string
    {
        $normalized = trim(preg_replace('/\s+/', ' ', (string) $name) ?? '');

        return Str::upper($normalized !== '' ? $normalized : 'Participant');
    }

    private function formatCertificateDateRange($startsAt, $endsAt): string
    {
        if (! $startsAt) {
            return '-';
        }

        $startDate = $startsAt->format('F j, Y');

        if (! $endsAt || $startsAt->toDateString() === $endsAt->toDateString()) {
            return $startDate;
        }

        return $startDate.' - '.$endsAt->format('F j, Y');
    }

    private function formatCertificateDate($date): string
    {
        return $date ? $date->format('jS').' Day of '.$date->format('F Y') : '-';
    }

    private function participantCertificateData(Programme $programme, array $overrides = []): array
    {
        $programme->load([
            'venues' => fn ($query) => $query->where('is_active', true)->orderBy('id'),
        ]);

        $venue = $programme->venues->first();
        $venueLabel = $venue
            ? ($venue->address ? "{$venue->name}, {$venue->address}" : $venue->name)
            : ($programme->location ?: '-');

        return [
            'title' => $programme->title,
            'eventDate' => $this->formatCertificateDateRange($programme->starts_at, $programme->ends_at),
            'givenDate' => $this->formatCertificateDate($programme->ends_at ?? $programme->starts_at),
            'venue' => $venueLabel,
            'signatoryName' => $overrides['signatory_name'] ?? $programme->signatory_name ?? '',
            'signatoryTitle' => $overrides['signatory_title'] ?? $programme->signatory_title ?? '',
            'signatorySignature' => $this->certificateSignaturePath($programme->signatory_signature_url),
        ];
    }

    private function certificateSignaturePath(?string $signatureUrl): ?string
    {
        if (! $signatureUrl) {
            return null;
        }

        if (Str::startsWith($signatureUrl, ['data:', 'http://', 'https://'])) {
            return null;
        }

        $normalized = ltrim($signatureUrl, '/');
        $path = Str::startsWith($normalized, 'signatures/')
            ? public_path($normalized)
            : public_path('signatures/'.$normalized);

        return File::exists($path) ? $path : null;
    }

    private function buildParticipantCertificatesPdf($participants, array $data): string
    {
        $pageWidth = 595.28;
        $pageHeight = 841.89;
        $certificateWidth = 520.0;
        $certificateHeight = 367.7;
        $certificateX = ($pageWidth - $certificateWidth) / 2;
        $bottomY = 34.0;
        $topY = $pageHeight - $bottomY - $certificateHeight;

        $assets = [
            'appearance' => public_path('img/appearance_bg.png'),
            'participation' => public_path('img/appearance_bg1.png'),
            'logo' => public_path('img/ched_logo_bagong_pilipinas.png'),
        ];

        $pdf = new Cpdf([0, 0, $pageWidth, $pageHeight], false);

        foreach ($participants as $index => $participant) {
            if ($index > 0) {
                $pdf->newPage();
            }

            $this->drawCertificate(
                $pdf,
                $assets['appearance'],
                $assets['logo'],
                $certificateX,
                $topY,
                $certificateWidth,
                $certificateHeight,
                'CERTIFICATE OF APPEARANCE',
                'This is to certify that',
                $participant['name'],
                [
                    ['text' => 'has appeared during the conduct of ', 'bold' => false],
                    ['text' => $data['title'], 'bold' => true],
                    ['text' => ' on ', 'bold' => false],
                    ['text' => $data['eventDate'], 'bold' => true],
                    ['text' => ' at '.$data['venue'].'.', 'bold' => false],
                ],
                'Given this '.$data['givenDate'].' at the '.$data['venue'].'.',
                $data
            );

            $this->drawCertificate(
                $pdf,
                $assets['participation'],
                $assets['logo'],
                $certificateX,
                $bottomY,
                $certificateWidth,
                $certificateHeight,
                'CERTIFICATE OF PARTICIPATION',
                'This certificate is hereby given to',
                $participant['name'],
                [
                    ['text' => 'for actively participating in ', 'bold' => false],
                    ['text' => $data['title'], 'bold' => true],
                    ['text' => ' on ', 'bold' => false],
                    ['text' => $data['eventDate'], 'bold' => true],
                    ['text' => ' at '.$data['venue'].'.', 'bold' => false],
                ],
                'Given this '.$data['givenDate'].' at the '.$data['venue'].'.',
                $data
            );
        }

        return $pdf->output();
    }

    private function drawCertificate(
        Cpdf $pdf,
        string $backgroundPath,
        string $logoPath,
        float $x,
        float $y,
        float $width,
        float $height,
        string $title,
        string $lead,
        string $recipient,
        array $bodySegments,
        string $given,
        array $data
    ): void {
        if (File::exists($backgroundPath)) {
            $pdf->addPngFromFile($backgroundPath, $x, $y, $width, $height);
        }

        $centerX = $x + ($width / 2);
        $centerY = $y + ($height / 2);
        $logoWidth = 136.0;
        $logoHeight = 34.0;
        $logoY = $centerY + 55.0;
        $titleY = $centerY + 31.0;
        $leadY = $titleY - 28.0;
        $recipientY = $leadY - 17.0;
        $bodyY = $recipientY - 24.0;
        $givenY = $bodyY - 24.0;

        if (File::exists($logoPath)) {
            $pdf->addPngFromFile($logoPath, $centerX - ($logoWidth / 2), $logoY, $logoWidth, $logoHeight);
        }

        $this->drawCenteredPdfText($pdf, $title, $centerX, $titleY, 15.8, true);
        $this->drawCenteredPdfText($pdf, $lead, $centerX, $leadY, 8.5);
        $this->drawCenteredPdfText($pdf, $recipient, $centerX, $recipientY, 10.8, true);
        $this->drawCenteredPdfSegments($pdf, $bodySegments, $centerX, $bodyY, 8.2, $width - 150.0);
        $this->drawCenteredPdfText($pdf, $given, $centerX, $givenY, 7.8);

        if (! empty($data['signatorySignature']) || ! empty($data['signatoryName']) || ! empty($data['signatoryTitle'])) {
            $signatoryNameY = $givenY - 59.0;
            $lineY = $signatoryNameY - 4.0;
            $signatoryTitleY = $lineY - 10.0;
            $signatureY = $signatoryNameY + 2.0;

            if (! empty($data['signatorySignature']) && File::exists($data['signatorySignature'])) {
                $this->drawPdfImageContain($pdf, $data['signatorySignature'], $centerX - 45.0, $signatureY, 90.0, 30.0);
            }

            $this->drawCenteredPdfText($pdf, (string) ($data['signatoryName'] ?? ''), $centerX, $signatoryNameY, 8.8, true);
            $pdf->line($centerX - 65.0, $lineY, $centerX + 65.0, $lineY);
            $this->drawCenteredPdfText($pdf, (string) ($data['signatoryTitle'] ?? ''), $centerX, $signatoryTitleY, 7.5);
        }
    }

    private function drawCenteredPdfSegments(Cpdf $pdf, array $segments, float $centerX, float $y, float $size, float $maxWidth): void
    {
        $segments = array_map(function (array $segment) {
            $segment['text'] = preg_replace('/\s+/', ' ', (string) ($segment['text'] ?? '')) ?? '';

            return $segment;
        }, $segments);

        $segments = array_values(array_filter($segments, fn (array $segment) => trim($segment['text']) !== ''));
        $plainText = collect($segments)->pluck('text')->implode('');

        while ($size > 6.5 && $this->pdfSegmentsWidth($pdf, $segments, $size) > $maxWidth) {
            $size -= 0.3;
        }

        if ($this->pdfSegmentsWidth($pdf, $segments, $size) > $maxWidth) {
            $plainText = $this->limitPdfText($plainText, $this->charsForWidth($maxWidth, $size));
            $this->drawCenteredPdfText($pdf, $plainText, $centerX, $y, $size);

            return;
        }

        $totalWidth = $this->pdfSegmentsWidth($pdf, $segments, $size);
        $cursorX = $centerX - ($totalWidth / 2);

        foreach ($segments as $segment) {
            $this->selectPdfFont($pdf, ! empty($segment['bold']));
            $text = $this->pdfSegmentText((string) $segment['text']);
            $pdf->addText($cursorX, $y, $size, $text);
            $cursorX += $pdf->getTextWidth($size, $text);
        }
    }

    private function drawCenteredPdfText(Cpdf $pdf, string $text, float $centerX, float $y, float $size, bool $bold = false): void
    {
        $text = $this->pdfText(trim(preg_replace('/\s+/', ' ', $text) ?? ''));
        $this->selectPdfFont($pdf, $bold);
        $pdf->addText($centerX - ($pdf->getTextWidth($size, $text) / 2), $y, $size, $text);
    }

    private function selectPdfFont(Cpdf $pdf, bool $bold = false): void
    {
        $font = $bold ? 'Times-Bold.afm' : 'Times-Roman.afm';
        $path = base_path('vendor/dompdf/dompdf/lib/fonts/'.$font);

        if (File::exists($path)) {
            $pdf->selectFont($path);

            return;
        }

        $pdf->selectFont(base_path('vendor/dompdf/dompdf/lib/fonts/Helvetica.afm'));
    }

    private function drawPdfImage(Cpdf $pdf, string $path, float $x, float $y, float $width, float $height): void
    {
        $extension = Str::lower(pathinfo($path, PATHINFO_EXTENSION));

        if ($extension === 'png') {
            $pdf->addPngFromFile($path, $x, $y, $width, $height);

            return;
        }

        if ($extension === 'svg') {
            $pdf->addSvgFromFile($path, $x, $y, $width, $height);

            return;
        }

        $pdf->addJpegFromFile($path, $x, $y, $width, $height);
    }

    private function drawPdfImageContain(Cpdf $pdf, string $path, float $x, float $y, float $maxWidth, float $maxHeight): void
    {
        $imageSize = @getimagesize($path);

        if (! $imageSize || empty($imageSize[0]) || empty($imageSize[1])) {
            $this->drawPdfImage($pdf, $path, $x, $y, $maxWidth, $maxHeight);

            return;
        }

        $ratio = $imageSize[0] / $imageSize[1];
        $boxRatio = $maxWidth / $maxHeight;

        if ($ratio > $boxRatio) {
            $width = $maxWidth;
            $height = $maxWidth / $ratio;
        } else {
            $height = $maxHeight;
            $width = $maxHeight * $ratio;
        }

        $drawX = $x + (($maxWidth - $width) / 2);
        $drawY = $y + (($maxHeight - $height) / 2);

        $this->drawPdfImage($pdf, $path, $drawX, $drawY, $width, $height);
    }

    private function pdfSegmentsWidth(Cpdf $pdf, array $segments, float $size): float
    {
        $width = 0.0;

        foreach ($segments as $segment) {
            $this->selectPdfFont($pdf, ! empty($segment['bold']));
            $width += $pdf->getTextWidth($size, $this->pdfSegmentText((string) $segment['text']));
        }

        return $width;
    }

    private function pdfTextWidth(string $text, float $size): float
    {
        return strlen($text) * $size * 0.50;
    }

    private function limitPdfText(string $text, int $length): string
    {
        if (strlen($text) <= $length) {
            return $text;
        }

        return rtrim(substr($text, 0, max(0, $length - 3))).'...';
    }

    private function charsForWidth(float $width, float $fontSize): int
    {
        return max(4, (int) floor($width / max(1.0, $fontSize * 0.52)));
    }

    private function pdfText(string $text): string
    {
        $text = trim(preg_replace('/\s+/', ' ', $text) ?? '');

        return preg_replace('/(?<=[A-Za-z])\?(?=[a-z]{2,})/', 'ñ', $text) ?? $text;
    }

    private function pdfSegmentText(string $text): string
    {
        $text = preg_replace('/\s+/', ' ', $text) ?? '';

        return preg_replace('/(?<=[A-Za-z])\?(?=[a-z]{2,})/', 'ñ', $text) ?? $text;
    }

    private function uniqueFieldKey(string $value, array $usedKeys): string
    {
        $base = Str::of($value)->lower()->replaceMatches('/[^a-z0-9]+/', '_')->trim('_')->limit(80, '')->value();
        $base = $base !== '' ? $base : 'field';
        $key = $base;
        $counter = 2;

        while (in_array($key, $usedKeys, true)) {
            $key = "{$base}_{$counter}";
            $counter++;
        }

        return $key;
    }

    public function destroy(Programme $programme)
    {
        if ($programme->image_url) {
            $existing = public_path('event-images/'.ltrim($programme->image_url, '/'));
            if (File::exists($existing)) {
                File::delete($existing);
            }
        }

        if ($programme->pdf_url) {
            $existing = public_path('downloadables/'.ltrim($programme->pdf_url, '/'));
            if (File::exists($existing)) {
                File::delete($existing);
            }
        }

        if ($programme->signatory_signature_url) {
            $existing = public_path('signatures/'.ltrim($programme->signatory_signature_url, '/'));
            if (File::exists($existing)) {
                File::delete($existing);
            }
        }

        // ✅ delete event materials files + rows
        foreach ($programme->materials()->get() as $material) {
            $existing = public_path('event-materials/'.ltrim($material->file_path, '/'));
            if (File::exists($existing)) {
                File::delete($existing);
            }
        }
        $programme->materials()->delete();

        $programme->venues()->delete();

        $programme->delete();

        return back();
    }

    private function resolveUploadName(string $originalName, string $destination): string
    {
        $candidate = $originalName;
        $path = $destination.DIRECTORY_SEPARATOR.$candidate;

        if (! File::exists($path)) {
            return $candidate;
        }

        $base = pathinfo($originalName, PATHINFO_FILENAME);
        $ext = pathinfo($originalName, PATHINFO_EXTENSION);
        $suffix = 1;

        do {
            $candidate = $base.'-'.$suffix.($ext ? '.'.$ext : '');
            $path = $destination.DIRECTORY_SEPARATOR.$candidate;
            $suffix++;
        } while (File::exists($path));

        return $candidate;
    }
}
