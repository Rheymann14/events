import * as React from 'react';
import { Head, Form, Link } from '@inertiajs/react';
import { Eye, EyeOff, LogIn } from 'lucide-react';

import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import LoginLayout from '@/layouts/login-layout';
import { register } from '@/routes';
import { store } from '@/routes/login';

interface LoginProps {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
}

export default function Login({ status, canResetPassword, canRegister }: LoginProps) {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
        <LoginLayout>
            <Head title="Log in" />

            <div className="mx-auto flex min-h-[100svh] w-full items-center justify-center px-4 py-10 sm:px-6">
                <div className="w-full max-w-md rounded-[28px] border border-border/60 bg-background/90 p-8 shadow-2xl backdrop-blur">

                    {/* HEADER */}
                    <div className="text-center">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-3 rounded-2xl px-2 py-1"
                        >
                            <img
                                src="/img/ched_logo.png"
                                alt="CHED Events"
                                className="h-13 w-auto object-contain"
                            />
                            <img
                                src="/img/bagong_pilipinas.png"
                                alt="Bagong Pilipinas"
                                className="h-20 w-auto object-contain"
                            />
                        </Link>

                        <div className="text-xs font-semibold tracking-widest text-muted-foreground mt-2">
                            USER LOGIN
                        </div>

                        <p className="mt-2 text-sm text-muted-foreground">
                            Enter your email or participant ID and password to continue
                        </p>
                    </div>

                    {/* STATUS */}
                    {status && (
                        <div className="mt-6 rounded-2xl border border-green-200/70 bg-green-50/80 px-4 py-3 text-sm font-medium text-green-700">
                            {status}
                        </div>
                    )}

                    {/* FORM */}
                    <div className="mt-6">
                        <Form {...store.form()} resetOnSuccess={['password']} className="space-y-4">
                            {({ processing, errors }) => (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email or Participant ID</Label>
                                        <Input
                                            id="email"
                                            type="text"
                                            name="email"
                                            required
                                            autoFocus
                                            autoComplete="username"
                                            placeholder="email@example.com or CHED-XXXX-XXXX"
                                            className="h-11 rounded-xl"
                                        />
                                        <InputError message={errors.email} />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="password">Password</Label>

                                        <div className="relative">
                                            <Input
                                                id="password"
                                                type={showPassword ? 'text' : 'password'}
                                                name="password"
                                                required
                                                autoComplete="current-password"
                                                placeholder="Password"
                                                className="h-11 rounded-xl pr-11"
                                            />

                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(v => !v)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                            >
                                                {showPassword ? (
                                                    <Eye className="h-4 w-4" />
                                                ) : (
                                                    <EyeOff className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>

                                        <InputError message={errors.password} />
                                    </div>

                                    <Button
                                        type="submit"
                                        className="h-11 w-full rounded-xl bg-gradient-to-r from-[#1e3c73] to-[#25468a] text-white"
                                        disabled={processing}
                                    >
                                        {processing ? <Spinner /> : <LogIn className="mr-2 h-4 w-4" />}
                                        Log in
                                    </Button>

                                    {canRegister && (
                                        <div className="pt-2 text-center text-sm text-muted-foreground">
                                            Don&apos;t have an account?{' '}
                                            <TextLink href={register()} className="font-medium">
                                                Sign up
                                            </TextLink>
                                        </div>
                                    )}
                                </>
                            )}
                        </Form>
                    </div>
                </div>
            </div>
        </LoginLayout>
    );
}
