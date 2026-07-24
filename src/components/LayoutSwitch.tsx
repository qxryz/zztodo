import { Layout } from "../types";

const OPTIONS: { value: Layout; label: string; icon: string }[] = [
  { value: "grid", label: "卡片", icon: "▦" },
  { value: "list", label: "列表", icon: "☰" },
];

export function LayoutSwitch({
  layout,
  onChange,
}: {
  layout: Layout;
  onChange: (l: Layout) => void;
}) {
  return (
    <div className="theme-switch" role="radiogroup" aria-label="布局">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`theme-opt ${layout === o.value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
          title={o.label}
          aria-checked={layout === o.value}
          role="radio"
        >
          <span className="theme-icon">{o.icon}</span>
        </button>
      ))}
    </div>
  );
}
