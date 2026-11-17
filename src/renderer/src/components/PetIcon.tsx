/** Pet portraits and family crystals (the same artwork as the PetTracker app; the game's art belongs to its owners). */

const portraits = import.meta.glob<string>('../assets/pets/portraits/*.webp', { eager: true, query: '?url', import: 'default' });
const crystals = import.meta.glob<string>('../assets/pets/crystals/*.png', { eager: true, query: '?url', import: 'default' });

const portraitUrl = (id: number): string | undefined => portraits[`../assets/pets/portraits/${id}.webp`];
const crystalUrl = (family: string): string | undefined => crystals[`../assets/pets/crystals/${family.toLowerCase()}.png`];

export function PetPortrait({ id, size = 38 }: { id: number; size?: number }) {
  const url = portraitUrl(id);
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-[8px] bg-panel-head ring-1 ring-line" style={{ width: size, height: size }} aria-hidden="true">
      {url && <img src={url} alt="" width={size} height={size} className="size-full object-cover" draggable={false} />}
    </span>
  );
}

/** Family chip: the family's crystal and its name, like in PetTracker. */
export function FamilyChip({ family }: { family: string }) {
  const url = crystalUrl(family);
  if (!family) return null;
  return (
    <span className="flex items-center gap-1 rounded-[5px] bg-panel-head px-1.5 py-[1px] text-[10px] font-semibold text-ink-dim ring-1 ring-line/80">
      {url && <img src={url} alt="" width={12} height={12} className="size-3" draggable={false} />}
      {family}
    </span>
  );
}
