// Small line icons, 16 px, drawn with currentColor so they follow the text.
const PATHS = {
  logo: "M4 4h8v2H4zM4 7h8v2H4zM4 10h5v2H4z",
  locate: "M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  edit: "M10.5 3.5l2 2L6 12H4v-2l6.5-6.5Z",
  copy: "M6 6h6v7H6zM4 3h6v2H5v6H4z",
  undo: "M6 4L3 7l3 3M3.5 7H10a3 3 0 0 1 0 6H8",
  plus: "M8 3.5v9M3.5 8h9",
  close: "M4.5 4.5l7 7M11.5 4.5l-7 7",
  alert: "M8 3l5.5 9.5h-11L8 3ZM8 7v2.5M8 11v.5",
  check: "M3.5 8.5l3 3 6-7",
  back: "M10 4L6 8l4 4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
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
