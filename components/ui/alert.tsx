import * as React from "react";
import { cn } from "./cn";
export function Alert({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800", className)} {...props} />; }
export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("font-semibold mb-1", className)} {...props} />; }
export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("text-sm", className)} {...props} />; }
