type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function iconProps({ size = 20, className, strokeWidth = 1.6 }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true
  };
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5.5 8h13l1 12h-15z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 21c.6-4 3.4-6.2 7.5-6.2s6.9 2.2 7.5 6.2" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 7h18M3 12h18M3 17h18" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m5 5 14 14M19 5 5 19" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function StarIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...iconProps(props)} fill={filled ? "currentColor" : "none"}>
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9L3.5 9.7l5.9-.8z" />
    </svg>
  );
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...iconProps(props)} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20s-7.5-4.4-7.5-9.4A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 3C19.5 15.6 12 20 12 20z" />
    </svg>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17.5" cy="18" r="2" />
    </svg>
  );
}

export function GiftIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 10h16v10H4zM3 6.5h18V10H3zM12 6.5V20" />
      <path d="M12 6.5C10.5 3.5 7.5 3 6.5 5s2 3.5 5.5 1.5zM12 6.5c1.5-3 4.5-3.5 5.5-1.5s-2 3.5-5.5 1.5z" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 19c0-9 5-14 15-14 0 10-5 15-15 14z" />
      <path d="M4 21c2-6 6-10 12-12" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m3 11 9-8 9 8" />
      <path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7h16M9 7V4.5h6V7M6 7l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 3h3l1.5 4.5-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2L21 15v3c0 1.7-1.3 3-3 3C10.3 21 3 13.7 3 6c0-1.7 1.3-3 3-3z" />
    </svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9z" />
      <path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20c.5-3.6 3-5.6 6.2-5.6s5.7 2 6.2 5.6" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 14.6c2.2.5 3.5 2.3 3.8 5.4" />
    </svg>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 3h8l10 10-8 8L3 11z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3v12M7 10l5 5 5-5M4 19h16" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="42" height="42" rx="21" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <path d="M16 20h16v13H16z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14 16h20v4H14zM24 16v17" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M24 16c-1.7-3.4-5.5-4-6.5-1.7-1 2.4 2.3 4 6.5 1.7 4.2 2.3 7.5.7 6.5-1.7-1-2.3-4.8-1.7-6.5 1.7z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.6-4.3A8.5 8.5 0 1 1 20.5 11.5z" />
      <path d="M9 8.5c.3-.6.7-.6 1-.6h.5l1 2c.1.3 0 .5-.2.8l-.7.7c.6 1.2 1.6 2.2 2.8 2.8l.7-.7c.2-.2.4-.3.7-.2l2 1c.3.1.4.3.4.6 0 1.1-1 1.8-2 1.8-3.3 0-7.3-4-7.3-7.3 0-1 .5-1.6 1.1-1.9z" />
    </svg>
  );
}
