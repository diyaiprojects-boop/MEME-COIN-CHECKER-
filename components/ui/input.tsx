import * as React from "react";
import { cn } from "./cn";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("w-full rounded-2xl border px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-gray-900/30", className)} {...props} />
  )
);
Input.displayName = "Input";
