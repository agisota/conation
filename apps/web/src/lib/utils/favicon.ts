const FAVICON_SIZE = 48;
const FAVICON_ASSET_PATH = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/icon.png`;

let currentFaviconLink: HTMLLinkElement | null = null;

/**
 * Return the environment-specific Conation orbit icon URL.
 *
 * `color` remains part of the public signature because callers use the same
 * theme signal for the notification badge. The supplied photographic brand
 * mark has fixed colors and therefore is not recolored at runtime.
 */
export function getFaviconUrl(_color: string) {
  return FAVICON_ASSET_PATH;
}

/**
 * Update the site's live favicon with a new color, and optionally a notification
 * badge with its own color.
 */
export function updateFavicon(
  faviconColor: string,
  badgeColor?: string,
  hasBadge?: boolean
): void {
  if (currentFaviconLink?.parentNode) {
    currentFaviconLink.parentNode.removeChild(currentFaviconLink);
    currentFaviconLink = null;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;

  const img = new Image();
  img.src = getFaviconUrl(faviconColor);

  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (hasBadge) {
      const badgeRadius = 6;
      const badgeX = canvas.width - badgeRadius;
      const badgeY = badgeRadius;

      // Clear the artwork behind the badge so its state remains legible over
      // the metallic sphere on the right edge of the orbit mark.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius + 1, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = badgeColor || faviconColor;
      ctx.fill();
    }

    const faviconUrl = canvas.toDataURL();

    if (currentFaviconLink?.parentNode) {
      currentFaviconLink.parentNode.removeChild(currentFaviconLink);
    }

    const existingLinks = document.querySelectorAll('link[rel*="icon"]');
    existingLinks.forEach((link) => {
      link.remove();
    });

    // create and add new favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = faviconUrl;
    document.head.appendChild(link);
    currentFaviconLink = link;

    // update existing shortcut icon if present
    const existingShortcutIcon = document.querySelector(
      'link[rel="shortcut icon"]'
    ) as HTMLLinkElement;
    if (existingShortcutIcon) {
      existingShortcutIcon.href = faviconUrl;
    }
  };
}
