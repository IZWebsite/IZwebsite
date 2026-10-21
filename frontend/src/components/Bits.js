import { Link } from "react-router-dom";
import { PackageOpen } from "lucide-react";
import { inr, STATUS, statusTone } from "../lib/format";

export const SectionHead = ({ eyebrow, title, action, to }) => (
  <div className="flex items-end justify-between gap-6 mb-8 md:mb-10">
    <div>
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h2 className="font-display text-3xl md:text-4xl leading-tight">{title}</h2>
    </div>
    {action && to && <Link to={to} className="text-sm link-u whitespace-nowrap" data-testid={`section-link-${title?.toLowerCase().replace(/\s+/g, "-")}`}>{action} →</Link>}
  </div>
);

export const Empty = ({ title, text, action, to, testid = "empty-state" }) => (
  <div className="text-center py-16 px-6 card-x" data-testid={testid}>
    <PackageOpen className="mx-auto mb-4 text-[color:var(--gold)]" size={32} strokeWidth={1.2} />
    <h3 className="font-display text-2xl mb-2">{title}</h3>
    {text && <p className="text-sm text-muted-foreground max-w-sm mx-auto">{text}</p>}
    {action && to && <Link to={to} className="btn-outline mt-6">{action}</Link>}
  </div>
);

export const GridSkeleton = ({ n = 8 }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10" data-testid="grid-skeleton">
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} className="animate-pulse"><div className="aspect-[4/5] bg-muted" /><div className="h-3 bg-muted mt-4 w-3/4" /><div className="h-3 bg-muted mt-2 w-1/3" /></div>
    ))}
  </div>
);

export const Price = ({ price, sale, className = "" }) => (
  <span className={`inline-flex items-baseline gap-2 ${className}`}>
    <span className="font-medium">{inr(sale ?? price)}</span>
    {sale != null && Number(sale) < Number(price) && <span className="text-xs text-muted-foreground line-through">{inr(price)}</span>}
  </span>
);

export const StatusBadge = ({ status, testid }) => (
  <span className={`inline-flex px-2.5 py-1 text-[11px] uppercase tracking-wider border ${statusTone(status)}`} data-testid={testid}>{STATUS[status] || status}</span>
);

export const Field = ({ label, children, hint }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="block text-xs text-muted-foreground mt-1">{hint}</span>}
  </label>
);

export const Spinner = () => <span className="inline-block h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin" />;
