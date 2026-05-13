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
      style={{ objectFit: 'contain', filter: 'brightness(0) saturate(100%) invert(88%) sepia(34%) saturate(597%) hue-rotate(348deg) brightness(105%)' }}
    />
  );
}

export default MetaIcon;
