import { cn } from '@ui';
import type { JSX } from 'solid-js';

const BRAND_ASSET_ROOT = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/brand`;

type BrandImageProps = Omit<JSX.ImgHTMLAttributes<HTMLImageElement>, 'src'>;

/** The canonical Conation application mark on its native dark plate. */
export function ConationMark(props: BrandImageProps) {
  return (
    <img
      {...props}
      src={`${BRAND_ASSET_ROOT}/conation-app-icon-master-v1.png`}
      alt={props.alt ?? ''}
      width={props.width ?? 1254}
      height={props.height ?? 1254}
      draggable={props.draggable ?? false}
    />
  );
}

/** The canonical Conation mark inside an SVG-compatible icon slot. */
export function ConationToolMark(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 1 1" aria-hidden="true">
      <image
        href={`${BRAND_ASSET_ROOT}/conation-app-icon-master-v1.png`}
        width="1"
        height="1"
        preserveAspectRatio="xMidYMid slice"
      />
    </svg>
  );
}

type ConationLockupProps = {
  /** Accessible product name. Pass an empty string when nearby copy names it. */
  alt?: string;
  /** Classes applied to the dark plate that guarantees contrast. */
  class?: string;
};

/** The exact transparent Conation lockup on a theme-safe dark plate. */
export function ConationLockup(props: ConationLockupProps) {
  return (
    <span
      class={cn(
        'inline-flex items-center justify-center overflow-hidden rounded-xl',
        props.class
      )}
    >
      <img
        src={`${BRAND_ASSET_ROOT}/conation-combined-lockup-master-v1.png`}
        alt={props.alt ?? 'Conation.dev'}
        width="2172"
        height="724"
        class="size-full object-contain"
        draggable={false}
      />
    </span>
  );
}
