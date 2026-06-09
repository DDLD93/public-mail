import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
dayjs.extend(relativeTime);

export function relativeTimeStr(d) {
  if (!d) return '';
  const dt = dayjs(d);
  const now = dayjs();
  if (now.diff(dt, 'day') === 0) return dt.format('h:mm A');
  if (now.diff(dt, 'day') < 7) return dt.format('ddd');
  if (now.year() === dt.year()) return dt.format('MMM D');
  return dt.format('MMM D, YYYY');
}

export function fullTime(d) {
  if (!d) return '';
  return dayjs(d).format('MMM D, YYYY · h:mm A');
}

export function initials(name, address) {
  const src = (name || address || '').trim();
  if (!src) return '?';
  const parts = src.replace(/[<>"]/g, '').split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function avatarColor(seed) {
  const palette = [
    'from-rose-400 to-pink-600',
    'from-amber-400 to-orange-600',
    'from-emerald-400 to-teal-600',
    'from-sky-400 to-indigo-600',
    'from-violet-400 to-fuchsia-600',
    'from-lime-400 to-green-600',
    'from-cyan-400 to-blue-600',
    'from-yellow-400 to-amber-600',
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function fmtBytes(n) {
  if (!n || n < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function displayName(name, address) {
  if (name && name.trim()) return name.trim();
  if (!address) return '';
  return address.split('@')[0];
}

export function domainOf(address) {
  if (!address) return '';
  const at = address.lastIndexOf('@');
  if (at < 0) return '';
  return address
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/[<>"'\s]+$/g, '');
}

export function domainColor(domain) {
  const palette = [
    'bg-phos-400',
    'bg-emerald-400',
    'bg-sky-400',
    'bg-violet-400',
    'bg-rose-400',
    'bg-amber-400',
    'bg-cyan-400',
    'bg-lime-400',
  ];
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
