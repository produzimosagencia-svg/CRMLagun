import metaLogo from '@/assets/meta-icon.png';

interface MetaIconProps {
  size?: number;
  className?: string;
}

// Logo oficial da Meta (infinity M azul)
export function MetaIcon({ size = 18, className }: MetaIconProps) {
  return (
    <img
      src={metaLogo}
      alt="Meta"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', filter: 'grayscale(1) brightness(0.6) contrast(1.2)' }}
    />
  );
}

export default MetaIcon;
