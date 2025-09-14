import * as React from "react";
import { cn } from "./cn";
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default"|"secondary"|"ghost" };
export function Button({ className, variant="default", ...props }: Props) {
  const base = "inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm font-medium transition border";
  const styles = variant==="secondary"
    ? "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
    : variant==="ghost"
    ? "bg-transparent border-transparent hover:bg-gray-100"
    : "bg-gray-900 text-white border-gray-900 hover:bg-black";
  return <button className={cn(base, styles, className)} {...props} />;
}
