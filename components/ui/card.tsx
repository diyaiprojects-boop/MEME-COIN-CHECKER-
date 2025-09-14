import * as React from "react";
import { cn } from "./cn";
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-2xl border bg-white shadow-sm", className)} {...props} />; }
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("p-4 border-b bg-gradient-to-b from-white to-gray-50 rounded-t-2xl", className)} {...props} />; }
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <h3 className={cn("text-lg font-semibold", className)} {...props} />; }
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("p-4 space-y-3", className)} {...props} />; }
