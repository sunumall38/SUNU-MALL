import { type InputHTMLAttributes, forwardRef, type ComponentType } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Texte fixe affiché devant la saisie (ex. indicatif « +221 »). */
  prefix?: string;
  /** Aide affichée sous le champ quand il n'y a pas d'erreur. */
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, icon: Icon, prefix, hint, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
          {prefix && (
            <span
              className={cn(
                "pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm font-medium text-ink",
                Icon ? "left-9" : "left-3.5",
              )}
            >
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "focus-ring w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink transition-colors placeholder:text-muted-foreground focus:border-orange",
              Icon && "pl-9",
              prefix && (Icon ? "pl-[4.5rem]" : "pl-14"),
              error && "border-danger focus:border-danger",
              className,
            )}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : (
          hint && <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
