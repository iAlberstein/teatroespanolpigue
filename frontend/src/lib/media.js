import { getAPIUrl } from './api';

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);

const buildAbsoluteUrl = (value) => {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;
  if (value.startsWith('//')) {
    return `${window?.location?.protocol || 'https:'}${value}`;
  }
  const base = getAPIUrl();
  if (!value.startsWith('/')) {
    return `${base}/${value}`;
  }
  return `${base}${value}`;
};

/**
 * Resolve an image URL that might be relative (/media/...) into an absolute URL.
 */
export const resolveMediaUrl = (path) => buildAbsoluteUrl(path);

const SLOT_PRIORITY = {
  principal_web: ['image_principal_web', 'image_url'],
  principal_mobile: ['image_principal_mobile', 'image_principal_web', 'image_url'],
  secundaria_web: ['image_secundaria_web', 'image_principal_web', 'image_url'],
  legacy: ['image_url', 'image_principal_web', 'image_principal_mobile']
};

/**
 * Returns the best available image URL for a show and slot.
 * @param {object} show
 * @param {'principal_web'|'principal_mobile'|'secundaria_web'|'legacy'} slot
 * @returns {string|null}
 */
export function getShowImageUrl(show, slot = 'principal_web') {
  if (!show) return null;
  const candidates = SLOT_PRIORITY[slot] || [slot];
  const rawPath = candidates.map((key) => show?.[key]).find(Boolean);
  return resolveMediaUrl(rawPath);
}
