"use client";

import { X } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "danger" | "warning" | "neutral" | "info" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Button({ children, className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`button ${variant} ${className}`} {...props}>{children}</button>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Progress({ value, tone = "green" }: { value: number; tone?: "green" | "lime" | "orange" | "blue" }) {
  return <div className="progress"><span className={tone} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`modal ${wide ? "wide" : ""}`}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Kapat"><X size={19} /></button></div>{children}</div></div>;
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-mark">◇</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function PageHeader({ eyebrow, title, text, actions }: { eyebrow?: string; title: string; text: string; actions?: ReactNode }) {
  return <div className="page-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{text}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function Skeleton() {
  return <div className="skeleton-page"><div className="skeleton wide"/><div className="metric-grid">{[1,2,3,4].map(x=><div key={x} className="skeleton box" />)}</div><div className="skeleton chart" /></div>;
}
