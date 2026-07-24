import { Theme } from "../types";

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "亮", icon: "☀" },
  { value: "dark", label: "暗", icon: "☾" },
  { value: "system", label: "系统", icon: "⌘" },
];

export function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (t: Theme) => void;
}) {
  return (
    <div className="theme-switch" role="radiogroup" aria-label="主题">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`theme-opt ${theme === o.value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
          title={o.label}
          aria-checked={theme === o.value}
          role="radio"
        >
          <span className="theme-icon">{o.icon}</span>
        </button>
      ))}
    </div>
  );
}
