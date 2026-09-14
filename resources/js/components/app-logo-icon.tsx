import { cn } from '@/lib/utils';
import { ImgHTMLAttributes } from 'react';

type AppLogoIconProps = ImgHTMLAttributes<HTMLImageElement>;

export default function AppLogoIcon({ className, ...props }: AppLogoIconProps) {
    return (
        <img
            {...props}
            src="/img/ched_logo.png"
            alt={props.alt ?? 'App Logo'}
            draggable={false}
            loading={props.loading ?? 'lazy'}
            decoding={props.decoding ?? 'async'}
            className={cn(
                'h-16 w-auto shrink-0 object-contain', // ✅ bigger by default
                className,
            )}
        />
    );
}
