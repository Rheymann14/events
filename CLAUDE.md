# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Your Role

Act as a modern full-stack **senior software engineer** with years of production experience:

- Strong **UI/UX judgment** — layouts, states (loading/empty/error), accessibility, responsive behavior, and sensible defaults are part of the work, not an afterthought.
- Write **clean, idiomatic code** and apply good engineering practices.
- Think about **data normalization** — model the schema properly rather than patching around it.
- **Optimize** queries and rendering where it measurably matters.

## Core Working Rules

1. **Update only what's needed.** No drive-by refactors, renames, or reformatting of untouched code. A small, reviewable diff is the goal.
2. **Keep other functionality intact.** Before editing anything shared (a model, middleware, layout, or UI component), grep for its callers and consumers and confirm you aren't breaking them.
3. **Match the surrounding style.** This codebase has firm conventions (below). Follow them even where you'd personally choose differently — consistency beats personal preference here.
4. **Normalize at the schema level.** Foreign keys and lookup tables over duplicated columns or comma-joined strings. If a change would denormalize, say so and explain the tradeoff.
5. **Avoid N+1 queries.** Eager load with `->with([...])`. Don't optimize past readability for micro-gains.
6. **Verify before reporting done.** Run the project's own commands (below). If something fails, say so with the output.

---

## Project Overview

**CHED Events Registration System** — event registration, attendance, table/vehicle assignment, ID cards, and certificates.

Laravel 12 (PHP 8.2+, CI runs 8.4) + Inertia 2 + React 19 + TypeScript 5.7, based on `laravel/react-starter-kit`. Auth is **Fortify**. Routes are typed into TS via **Wayfinder**. No Livewire, no Filament, no Spatie packages.

DB: MySQL in development, **sqlite `:memory:` in tests**.

## Commands

```bash
# Dev
composer run dev              # server + queue + vite (concurrently)
composer run dev:ssr          # same, with SSR
composer run setup            # install, .env, key:generate, migrate, npm install, build

# Tests (Pest 3)
composer run test             # config:clear + artisan test
./vendor/bin/pest             # what CI runs
php artisan test --filter=ParticipantManagementTest

# Quality
vendor/bin/pint               # MUTATES — formats PHP
vendor/bin/pint --test        # read-only check
npm run lint                  # MUTATES — `eslint . --fix`
npm run format                # MUTATES — prettier --write
npm run format:check          # read-only check
npm run types                 # tsc --noEmit
npm run build

# Utilities
node scripts/wayfinder-generate.js    # regenerate TS route/action helpers
php artisan make:admin                # interactive; creates an ADMIN user
```

For read-only verification use `vendor/bin/pint --test`, `npm run format:check`, and `npm run types` — the plain `pint`, `lint`, and `format` commands rewrite files.

CI (`.github/workflows/`) runs Pint, Prettier, ESLint, and Pest on push/PR to `develop` and `main`.

---

## Architecture & Conventions

**Controllers** live flat in `app/Http/Controllers/` (no `Admin/` namespace) except `Settings/`. They extend the empty base `Controller` — no `AuthorizesRequests` / `ValidatesRequests` traits.

- Page methods return `Inertia::render('kebab-case-page', [...])`, mapping 1:1 to `resources/js/pages/<name>.tsx`.
- Mutation methods return **`back()`**. Settings controllers use `to_route(...)`.
- Not strict resource controllers — `Route::resource(...)->only(['store','update','destroy'])` plus many named verb methods (`downloadIdCardsPdf`, `sendPickupNotification`, …).

**Props are hand-mapped arrays, never raw models.** No API Resources.

```php
Model::query()->get()->map(fn (Model $m) => [
    'id' => $m->id,
    'issued_at' => $m->issued_at?->toDateString(),   // dates
    'created_at' => $m->created_at?->toISOString(),  // datetimes
]);
```

**Validation** is inline `$request->validate([...])` with array-of-rules syntax (`['required', 'string', 'max:255']`), never pipe strings. FormRequests exist only for the two Fortify settings endpoints — don't introduce new ones without reason.

**Models are thin**: `$fillable`, `$casts`, typed relation methods (`: BelongsTo`, `: HasMany`). **No query scopes anywhere.** Queries open with `Model::query()`, filter via `->when($cond, fn ($q) => ...)`, and eager load with constrained closures:

```php
->with(['venues' => fn ($query) => $query->where('is_active', true)->orderBy('id')])
```

**Service layer is light**: `App\Services\{WelcomeNotificationService, SemaphoreSms}`, `App\Support\EventDefaults`. No repositories, no Actions outside `App\Actions\Fortify`.

**Naming**: British **`Programme`** for events throughout — keep it. Kebab-case URIs (`/event-management`), dot-notation route names, kebab-case page files. Migrations are hand-written with `_000000` / `_000001` same-day ordering suffixes — follow the existing max date when adding one.

---

## Auth & Roles

Roles live in `users.user_type_id` → `user_types` table. **No enum, no string column.**

**Read [app/Http/Middleware/EnsureRole.php](app/Http/Middleware/EnsureRole.php) before touching route middleware.** The names are misleading:

| Middleware | Actually means |
|---|---|
| `role:ched` | **ADMIN only** — not "any CHED user" |
| `role:ched_admin` | ADMIN **or** CHED LO |
| `role:ched_lo` | CHED LO only |
| `role:participant` | rejects admins and CHED LO |

- **There is no `isAdmin()` on the `User` model.** The check is re-implemented inline in `EnsureRole`, `TableAssignmentController`, `VehicleAssignmentController`, and `resources/js/components/app-sidebar.tsx`.
- **There are zero Policies and zero Gates.** Authorization is route middleware only. Don't call `$this->authorize()` — it isn't wired up.
- Fortify handles auth. Login accepts **email or `display_id`** and rejects `is_active = false` users. `LoginResponse` redirects by role.
- Global middleware: `ForceHttps`, `HandleAppearance`, `HandleInertiaRequests`, `EnsureActiveUser`, `LogActivity`.
- **When you add a mutating route, add a case in `LogActivity::resolveSpecialDescription()`** so it renders a proper description in `/settings/activity-log`.

---

## Frontend Patterns

Page component shape:

```tsx
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Issuances', href: '/issuances-management' }];
type PageProps = { issuances?: Issuance[] };

export default function Page({ issuances = [] }: PageProps) { ... }
```

- Path alias `@/` → `resources/js/`. Prop types are declared **locally in the page file**.
- Layouts: `@/layouts/app-layout` (authed), `@/layouts/public-layout` (public), `@/layouts/auth-layout` (Fortify), `@/layouts/settings/layout` (nested).
- **shadcn/ui** (new-york, neutral, lucide) on Radix. `sonner` for toasts, `AlertDialog` for destructive actions, `DropdownMenu` + `MoreHorizontal` for row actions.
- **Tailwind v4, CSS-first — there is no `tailwind.config.js`.** Design tokens are oklch CSS variables in `resources/css/app.css`. Compose classes with `cn()` from `@/lib/utils`.
- Two coexisting form styles: **Wayfinder typed helpers** (`@/routes`, `@/actions` — used in auth/settings) and a local `const ENDPOINTS = {...}` object with `useForm` / `router.post` (used in most admin CRUD). Prefer Wayfinder for new code; match the file you're in otherwise.
- File uploads need `_method: 'patch'` spoofing with `post(url, { forceFormData: true })`.
- Shared props from `HandleInertiaRequests`: `auth.user`, `name`, `quote`, `sidebarOpen` — read via `usePage<SharedData>().props`.

---

## Known Gotchas

- **`resources/js/{routes,actions,wayfinder}` are generated and gitignored.** Never hand-edit; run `node scripts/wayfinder-generate.js` (also runs automatically under Vite).
- **`resources/js/pages/table-assignmeny.tsx` is a live typo.** Don't "fix" the filename without updating the matching `Inertia::render` call in `TableAssignmentController`.
- **Uploads bypass the Storage disk.** Files go to `public/*` via `$file->move(public_path(...))` — there is no `public/storage` symlink, and uploads are lost if `public/` is rebuilt on deploy.
- **`$user->toArray()` is spread into shared Inertia props.** Any new sensitive column must be added to `User::$hidden`.
- **Tests run on sqlite while dev runs MySQL** — avoid driver-specific SQL.
- **Only `UserFactory` exists.** Tests create other records with `Model::query()->create([...])` — see `tests/Feature/ParticipantManagementTest.php`.
- `.prettierignore` excludes `resources/js/components/ui/*` — don't reformat shadcn primitives.
- Legacy duplicates: `routes/web.php:92` and `:95` both serve `participant-dashboard`; both `pages/event-list.tsx` and `pages/event-list/index.tsx` exist.

### Section Management

`/section-management` ([VenueSectionController](app/Http/Controllers/VenueSectionController.php)) is **not** a taxonomy — it's a singleton CMS block (`VenueSection` + `VenueSectionImage`) that renders one title and a card grid on the **public `/venue` page only**. It has no relation to users, participants, programmes, or venues.

- `resolveSection()` uses `firstOrCreate([])`, so **only one `venue_sections` row can ever exist**.
- No `sequence_order` (cards always sort by `id`) and no `is_active`. The only way to hide the block is to blank the title or delete every image.
- The `/venue` render requires a **non-empty title AND at least one image** — this is the usual cause of "I added a section and nothing appeared."
- **Its sidebar entry is currently hidden** (see the comment in `app-sidebar.tsx`). The route, controller, and page are untouched and still reachable at `/section-management` by direct URL.

### Participant QR codes

QR images encode **`display_id`** (e.g. `CHED-GCIY-OAB1`), never `qr_payload`. `qr_payload` is
`Crypt::encryptString($qr_token)` = exactly 256 base64 chars, which forces QR byte mode and
version 12 (65x65 modules) -- dense enough that scanners failed in production. `display_id` is
14 chars of uppercase letters, digits and a hyphen, so QR uses alphanumeric mode and fits
version 1 -- **21x21**. (`qr_token` would be 33x33.)

Encrypting bought no security: the ciphertext is printed on the badge in plain sight. Using
`display_id` does not weaken check-in either -- the scanner's **manual entry field already
accepts it** and posts to the same endpoint, so anyone able to read a badge could already
check that participant in.

- Frontend: use `resources/js/lib/qr.ts` (`participantQrValue`, `renderQrDataUrl`,
  `participantQrDataUrl`). Do not hand-write `QRCode.toDataURL` options -- `margin` must be
  **4** (the spec quiet zone) and sizing uses integer `scale`, not `width`.
- Backend: use `App\Support\ParticipantQr` (`value`, `matrix`, `png`). Error correction is
  level **Q**. `png()` rasterises with GD from the encoder matrix because Imagick is not
  installed and bacon/bacon-qr-code ships no GD backend.
- Any controller sending `qr_payload` to the client must also send `qr_token` (the fallback).
- Rendering is high-resolution on purpose: `scale: 16` / `MODULE_PIXELS = 16` gives a 464px
  bitmap for a 21x21 code, so it stays crisp on high-DPI screens and downscales cleanly.
- The scanner decodes in three passes (centre crop at native resolution, the same crop with a
  contrast stretch for glare, then the full frame). See `enhanceScanContrast` in `scanner.tsx`.
- `qr_payload` is still generated and stored. Keep it: `ScannerController::resolveParticipant()`
  accepts display_id, the decrypted payload, and the raw token, so **badges printed before this
  change still scan**.

**Sidebar grouping is anchored by title string.** `NavMain` splits `mainNavItems` into the "Registration" and "Page Settings" groups by `findIndex` on a hardcoded title ([nav-main.tsx](resources/js/components/nav-main.tsx)) — currently `'Events & Certificates'`. If you remove or rename the first item of the Page Settings group, **re-point that anchor**, or the whole group silently collapses into "Registration" and loses its label.

**Don't confuse this with `registration_fields.field_type = 'section'`** — an unrelated display-only header/divider in the registration form builder. That one is what appears in registration forms, participant views, and reports.
