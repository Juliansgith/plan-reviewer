// Small line icons drawn with currentColor so they follow the text.
const PATHS = {
  logo: "M4 4h8v2H4zM4 7h8v2H4zM4 10h5v2H4z",
  locate: "M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  edit: "M10.5 3.5l2 2L6 12H4v-2l6.5-6.5Z",
  copy: "M6 6h6v7H6zM4 3h6v2H5v6H4z",
  undo: "M6 4L3 7l3 3M3.5 7H10a3 3 0 0 1 0 6H8",
  plus: "M8 3.5v9M3.5 8h9",
  close: "M4.5 4.5l7 7M11.5 4.5l-7 7",
  alert: "M8 2.5l6 10.5H2L8 2.5ZM8 7v2.5M8 11.2v.3",
  check: "M3.5 8.5l3 3 6-7",
  ok: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8ZM5.2 8.2l2 2 3.6-4",
  info: "M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8ZM8 7.2v4M8 4.8v.4",
  back: "M10 4L6 8l4 4",
  next: "M6 4l4 4-4 4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  label,
  size = 16,
}: {
  name: IconName;
  label?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
