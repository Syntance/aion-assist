import { createContext, useContext, type ReactNode } from 'react';
import type { ClassName } from '@shared/types';

const emblems = import.meta.glob<string>('../assets/classes/*.png', { eager: true, query: '?url', import: 'default' });
const altEmblems = import.meta.glob<string>('../assets/classes-alt/*.png', { eager: true, query: '?url', import: 'default' });
export type ClassIconSet = 'game' | 'alt';
/** Which set of emblems the class icons use (the setting); a missing second set falls back to the first. */
export const ClassIconSetContext = createContext<ClassIconSet>('game');
const emblemUrl = (name: string, set: ClassIconSet): string | undefined =>
  (set === 'alt' ? altEmblems[`../assets/classes-alt/${name}.png`] : undefined) ?? emblems[`../assets/classes/${name}.png`];

/**
 * Class emblems: the game's own emblems when the artwork is present (tools/gen-class-icons.py cuts them out of a
 * screenshot of the class list; not stored in the repository), otherwise the ones drawn here (32×32, outline + soft fill) in the style of the game's class list:
 * warm gold for the melee duelists, cyan for the cleric, silver for the ranged classes, violet for the guardians.
 */

const GOLD = 'oklch(0.82 0.13 85)';
const CYAN = 'oklch(0.83 0.11 205)';
const SILVER = 'oklch(0.86 0.03 250)';
const VIOLET = 'oklch(0.76 0.13 305)';

const TONE: Record<ClassName | 'unknown', string> = {
  gladiator: GOLD,
  assassin: GOLD,
  cleric: CYAN,
  ranger: SILVER,
  chanter: SILVER,
  sorcerer: SILVER,
  templar: VIOLET,
  spiritmaster: VIOLET,
  unknown: 'oklch(0.6 0.03 255)',
};

const LABEL: Record<ClassName | 'unknown', string> = {
  gladiator: 'Gladiator',
  assassin: 'Assassin',
  cleric: 'Cleric',
  ranger: 'Ranger',
  chanter: 'Chanter',
  sorcerer: 'Sorcerer',
  templar: 'Templar',
  spiritmaster: 'Spirit Master',
  unknown: 'Klasa nieznana',
};

/** The classes in the order of the game's class list, with their names (for the legend in the settings). */
/** True when the second set of emblems is present (its artwork is not in the repository). */
export const hasAltClassIcons = Object.keys(altEmblems).length > 0;

export const CLASS_LEGEND: { id: ClassName; label: string }[] = [
  { id: 'gladiator', label: LABEL.gladiator },
  { id: 'assassin', label: LABEL.assassin },
  { id: 'cleric', label: LABEL.cleric },
  { id: 'ranger', label: LABEL.ranger },
  { id: 'chanter', label: LABEL.chanter },
  { id: 'sorcerer', label: LABEL.sorcerer },
  { id: 'templar', label: LABEL.templar },
  { id: 'spiritmaster', label: LABEL.spiritmaster },
];

const GLYPHS: Record<ClassName | 'unknown', ReactNode> = {
  // crested helmet with a visor slit and nose guard
  gladiator: (
    <>
      <path d="M7 18C7 10 11 6 16 6s9 4 9 12v4l-4 5h-2v-6h-6v6h-2l-4-5Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M10 8c1.5-4 10.500-4 12 0M16 6V3M11 15h10M16 15v6" />
    </>
  ),
  // hood with a shadowed face
  assassin: (
    <>
      <path d="M16 3C10 3 6 8 6 14c0 6 3 11 5 14l5-3 5 3c2-3 5-8 5-14 0-6-4-11-10-11Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M16 9c-4 0-6 3-6 6s3 5 6 6c3-1 6-3 6-6s-2-6-6-6Z" fill="currentColor" fillOpacity="0.45" />
      <path d="M12.500 15l2.500.500M19.500 15l-2.500.500" />
    </>
  ),
  // long cross with pointed ends
  cleric: (
    <>
      <path d="M16 2l3 7v3h7l2 3-2 2h-7v10l-3 3-3-3V17H6l-2-2 2-3h7V9Z" fill="currentColor" fillOpacity="0.25" />
      <path d="M16 10v14" />
    </>
  ),
  // bow with a nocked arrow
  ranger: (
    <>
      <path d="M9 4c12 4 12 20 0 24M9 4v24" />
      <path d="M4 16h23M23 12l4 4-4 4M4 16l-2-3M4 16l-2 3" />
    </>
  ),
  // lyre
  chanter: (
    <>
      <path d="M9 4C6 11 8 20 16 28 24 20 26 11 23 4" fill="currentColor" fillOpacity="0.15" />
      <path d="M7 5h18M13 6v16M16 6v20M19 6v16" />
      <circle cx="7" cy="5" r="1.300" />
      <circle cx="25" cy="5" r="1.300" />
    </>
  ),
  // eight-pointed arcane star
  sorcerer: (
    <>
      <path d="M16 2l2.600 11.400L30 16l-11.400 2.600L16 30l-2.600-11.400L2 16l11.400-2.600Z" fill="currentColor" fillOpacity="0.25" />
      <path d="M8 8l5 5M24 8l-5 5M8 24l5-5M24 24l-5-5" />
    </>
  ),
  // shield with an inner crest
  templar: (
    <>
      <path d="M16 3l10 4v8c0 7-5 11-10 14C11 26 6 22 6 15V7Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M16 8l5 2v5c0 4-2 6-5 8-3-2-5-4-5-8v-5Z" fill="currentColor" fillOpacity="0.4" />
    </>
  ),
  // paw print
  spiritmaster: (
    <>
      <path d="M16 17c-5 0-8 4-8 7 0 3 3 3 8 2 5 1 8 1 8-2 0-3-3-7-8-7Z" fill="currentColor" fillOpacity="0.3" />
      <ellipse cx="8" cy="14" rx="2.600" ry="3" fill="currentColor" fillOpacity="0.3" />
      <ellipse cx="13" cy="9.500" rx="2.800" ry="3.300" fill="currentColor" fillOpacity="0.3" />
      <ellipse cx="19" cy="9.500" rx="2.800" ry="3.300" fill="currentColor" fillOpacity="0.3" />
      <ellipse cx="24" cy="14" rx="2.600" ry="3" fill="currentColor" fillOpacity="0.3" />
    </>
  ),
  unknown: <circle cx="16" cy="16" r="9" />,
};

export function ClassIcon({ className, size = 28 }: { className: ClassName | null; size?: number }) {
  const key = className ?? 'unknown';
  const set = useContext(ClassIconSetContext);
  const url = emblemUrl(key, set);
  if (url) {
    return (
      <span className="grid shrink-0 place-items-center" style={{ width: size, height: size }} title={LABEL[key]}>
        <img src={url} alt={LABEL[key]} width={size} height={size} draggable={false} className="size-full object-contain" style={{ filter: 'drop-shadow(0 1px 1.5px oklch(0.1 0.02 255 / 0.7))' }} />
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size, color: TONE[key] }} title={LABEL[key]}>
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={LABEL[key]}
        style={{ filter: 'drop-shadow(0 1px 1.5px oklch(0.1 0.02 255 / 0.7))' }}
      >
        {GLYPHS[key]}
      </svg>
    </span>
  );
}
