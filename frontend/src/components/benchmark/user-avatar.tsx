interface UserAvatarProps {
  initials: string;
  alt: string;
  className: string;
  textClassName?: string;
}

export function UserAvatar({
  initials,
  alt,
  className,
  textClassName = "text-xs font-bold",
}: UserAvatarProps): JSX.Element {
  return (
    <div aria-label={alt} className={className} role="img">
      <span className={textClassName}>{initials}</span>
    </div>
  );
}
