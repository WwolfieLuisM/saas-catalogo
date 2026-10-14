export interface SocialLink {
  label: string;
  url: string;
}

export function normalizeSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const links: SocialLink[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const label = (item as { label?: unknown }).label;
    const url = (item as { url?: unknown }).url;
    if (typeof label === 'string' && typeof url === 'string' && label && url) {
      links.push({ label, url });
    }
  }
  return links.slice(0, 6);
}
