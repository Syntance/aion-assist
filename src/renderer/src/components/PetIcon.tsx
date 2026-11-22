/** Pet portraits and family crystals (the same artwork as the PetTracker app; the game's art belongs to its owners). */

const portraits = import.meta.glob<string>('../assets/pets/portraits/*.webp', { eager: true, query: '?url', import: 'default' });
const crystals = import.meta.glob<string>('../assets/pets/crystals/*.png', { eager: true, query: '?url', import: 'default' });

const portraitUrl = (id: number): string | undefined => portraits[`../assets/pets/portraits/${id}.webp`];
const crystalUrl = (family: string): string | undefined => crystals[`../assets/pets/crystals/${family.toLowerCase()}.png`];

export const FAMILIES = ['Cogni', 'Fera', 'Natura', 'Varian', 'Special'] as const;

/** One colour per pet family, used for the map dots and the legend chips (OKLCH, readable on the dark map). */
export const FAMILY_COLOR: Record<string, string> = {
  Cogni: 'oklch(0.74 0.13 235)',
  Fera: 'oklch(0.68 0.2 25)',
  Natura: 'oklch(0.76 0.17 150)',
  Varian: 'oklch(0.72 0.17 310)',
  Special: 'oklch(0.85 0.15 90)',
};
export const familyColor = (family: string): string => FAMILY_COLOR[family] ?? 'oklch(0.8 0.02 250)';

export function PetPortrait({ id, size = 38 }: { id: number; size?: number }) {
  const url = portraitUrl(id);
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-[8px] bg-panel-head ring-1 ring-line" style={{ width: size, height: size }} aria-hidden="true">
      {url && <img src={url} alt="" width={size} height={size} className="size-full object-cover" draggable={false} />}
    </span>
  );
}

/** Family chip: the family's crystal and its name, like in PetTracker. */
export function FamilyChip({ family, compact = false }: { family: string; compact?: boolean }) {
  const url = crystalUrl(family);
  if (!family) return null;
  if (compact) {
    return (
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-panel-head ring-1 ring-line/80" title={family} role="img" aria-label={family}>
        {url ? <img src={url} alt="" width={12} height={12} className="size-3" draggable={false} /> : <span className="size-2 rounded-full" style={{ background: familyColor(family) }} />}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-[5px] bg-panel-head px-1.5 py-[1px] text-[10px] font-semibold text-ink-dim ring-1 ring-line/80">
      {url && <img src={url} alt="" width={12} height={12} className="size-3" draggable={false} />}
      {family}
    </span>
  );
}
