type Props = { className?: string };

export function IconGrid({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconUsers({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M20 19c0-1.7-1.1-3.2-2.6-3.8M4 19c0-1.7 1.1-3.2 2.6-3.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

export function IconSchool({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 9.2 12 4.8l8.5 4.4L12 13.6 3.5 9.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M6.8 11v5.2c0 .5.3 1 .8 1.2l4 1.9c.3.1.6.1.9 0l4-1.9c.5-.2.8-.7.8-1.2V11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconCalendar({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3v3M17 3v3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4.5 7.5h15v12a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M4.5 10.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export function IconFileText({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3.8h7l3 3V20a1.8 1.8 0 0 1-1.8 1.8H7A1.8 1.8 0 0 1 5.2 20V5.6A1.8 1.8 0 0 1 7 3.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 3.8v3.2h3.2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 12h8M8 15.5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

export function IconSettings({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.4 13.1a7.7 7.7 0 0 0 .1-2.2l2-1.5-2-3.4-2.4 1a8.4 8.4 0 0 0-1.8-1L15 3h-4l-.3 3a8.4 8.4 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2.2l-2 1.5 2 3.4 2.4-1a8.4 8.4 0 0 0 1.8 1l.3 3h4l.3-3a8.4 8.4 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

export function IconBell({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 21a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 21Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M18 16.8H6c.8-1 1.2-2.4 1.2-3.8V10a4.8 4.8 0 0 1 9.6 0v3c0 1.4.4 2.8 1.2 3.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSearch({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M10.8 18.2a7.4 7.4 0 1 1 0-14.8 7.4 7.4 0 0 1 0 14.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M16.6 16.6 21 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconChevronDown({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6.8 9.4 12 14.6l5.2-5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

