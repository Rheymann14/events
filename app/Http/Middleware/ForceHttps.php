<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ForceHttps
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($this->shouldForceHttps() && ! $request->secure()) {
            return redirect()->secure($request->getRequestUri(), 301);
        }

        return $next($request);
    }

    private function shouldForceHttps(): bool
    {
        if ((bool) config('app.force_https')) {
            return true;
        }

        return str_starts_with((string) config('app.url'), 'https://');
    }
}
