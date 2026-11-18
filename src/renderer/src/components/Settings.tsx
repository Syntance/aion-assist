import { useState, type ReactNode } from 'react';
import { CLASS_LEGEND, ClassIcon, ClassIconSetContext, hasAltClassIcons } from './ClassIcon';
import { FpsAccess } from './FpsAccess';
import { acceleratorLabel, buildAccelerator, DEFAULT_HOTKEYS, HOTKEY_KEYS, isValidAccelerator, MODIFIERS, splitAccelerator } from '@shared/keys';
import { DEFAULT_CLASS_COLORS, DEFAULT_COLORS, DEFAULT_TAG_BG, DEFAULT_TAG_TEXT, PANEL_IDS, type ColorSettings, type OverlaySnapshot, type PanelId, type Settings } from '@shared/types';

export const PANEL_LABEL: Record<PanelId, string> = { meter: 'DPS i PvP', pvp: 'PvP', target: 'Cel', daily: 'Dzisiaj', pets: 'Zwierzaki' };
const REGIONS: Settings['region'][] = ['eu', 'nae', 'naw', 'sa', 'asia'];

type TabId = 'look' | 'behavior' | 'hotkeys' | 'privacy' | 'about';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'look', label: 'Wygląd', icon: 'M2 4h12v8H2ZM2 7h12M5 4v8' },
  { id: 'behavior', label: 'Zachowanie', icon: 'M3 4.5h10M3 8h10M3 11.5h10M6 3v3M10 6.5v3M5 10v3' },
  { id: 'hotkeys', label: 'Skróty klawiszowe', icon: 'M2 5h12v7H2ZM4.5 7.5h1M7.5 7.5h1M10.5 7.5h1M5 10h6' },
  { id: 'privacy', label: 'Dane i prywatność', icon: 'M8 1.5l5 2v4c0 3-2 5.2-5 7-3-1.8-5-4-5-7v-4Z' },
  { id: 'about', label: 'O aplikacji', icon: 'M8 2a6 6 0 1 0 0.01 0ZM8 7v4M8 5v.01' },
];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-ink transition-[left] duration-150 ${checked ? 'left-[18px] !bg-panel-head' : 'left-0.5'}`}
        aria-hidden="true"
      />
    </button>
  );
}

/** One setting: title + explanation on the left, control on the right. */
function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line/60 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-snug text-ink-mute">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-5">
    <h3 className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-mute">{title}</h3>
    <div className="rounded-[8px] bg-row px-3.5">{children}</div>
  </section>
);

const control = 'rounded-[6px] border border-line bg-panel-head px-2 py-1 text-[12px] text-ink';
const button = 'rounded-[6px] bg-panel-head px-3 py-1.5 text-[12px] font-semibold text-ink ring-1 ring-line hover:bg-line';

function ClassLegend({ snap }: { snap: OverlaySnapshot }) {
  const api = window.overlay;
  return (
    <Section title="Ikony klas">
      <Row title="Zestaw ikon" hint={hasAltClassIcons ? 'Zestaw 1: emblematy z listy klas. Zestaw 2: kolorowe herby. Zmiana działa od razu we wszystkich oknach.' : 'Drugi zestaw nie jest dostępny w tej wersji (grafik nie ma w repozytorium).'}>
        <select
          className={control}
          aria-label="Zestaw ikon klas"
          value={snap.settings.classIcons}
          disabled={!hasAltClassIcons}
          onChange={(e) => api.updateSettings({ classIcons: e.target.value === 'alt' ? 'alt' : 'game' })}
        >
          <option value="game">Zestaw 1</option>
          <option value="alt">Zestaw 2</option>
        </select>
      </Row>
      <ClassIconSetContext.Provider value={snap.settings.classIcons}>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1.5 p-0">
        {CLASS_LEGEND.map((c) => (
          <li key={c.id} className="flex items-center gap-2.5 rounded-[8px] bg-row px-2.5 py-1.5">
            <ClassIcon className={c.id} size={30} />
            <span className="text-[13px] font-semibold">{c.label}</span>
          </li>
        ))}
      </ul>
      </ClassIconSetContext.Provider>
    </Section>
  );
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-10 cursor-pointer rounded-[5px] border border-line bg-panel-head p-0.5"
    />
  );
}

function ColorSettingsSection({ snap }: { snap: OverlaySnapshot }) {
  const colors = snap.settings.colors;
  const api = window.overlay;
  const set = (next: Partial<ColorSettings>) => api.updateSettings({ colors: { ...colors, ...next } });
  return (
    <Section title="Kolory">
      {CLASS_LEGEND.map((c) => (
        <Row key={c.id} title={c.label}>
          <span className="flex items-center gap-2">
            <ClassIcon className={c.id} size={24} />
            <ColorInput label={`Kolor paska: ${c.label}`} value={colors.classes[c.id] ?? DEFAULT_CLASS_COLORS[c.id]} onChange={(hex) => set({ classes: { ...colors.classes, [c.id]: hex } })} />
            <button
              type="button"
              className={button}
              disabled={colors.classes[c.id] === undefined}
              onClick={() => {
                const { [c.id]: _drop, ...rest } = colors.classes;
                void _drop;
                set({ classes: rest });
              }}
            >
              Domyślny
            </button>
          </span>
        </Row>
      ))}
      <Row title="Mój pasek" hint="Własny kolor twojego paska w licznikach, niezależnie od klasy. „Kolor klasy” wraca do koloru wybranego wyżej.">
        <span className="flex items-center gap-2">
          <ColorInput label="Kolor mojego paska" value={colors.self ?? DEFAULT_CLASS_COLORS.assassin} onChange={(hex) => set({ self: hex })} />
          <button type="button" className={button} disabled={colors.self === null} onClick={() => set({ self: null })}>
            Kolor klasy
          </button>
        </span>
      </Row>
      <Row title="Znaczek „JA”" hint="Tło i kolor napisu znaczka przy twoim nicku.">
        <span className="flex items-center gap-2">
          <span className="rounded-[3px] px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.06em]" style={{ background: colors.tagBg, color: colors.tagText }}>
            JA
          </span>
          <ColorInput label="Tło znaczka JA" value={colors.tagBg} onChange={(hex) => set({ tagBg: hex })} />
          <ColorInput label="Napis znaczka JA" value={colors.tagText} onChange={(hex) => set({ tagText: hex })} />
          <button type="button" className={button} onClick={() => set({ tagBg: DEFAULT_TAG_BG, tagText: DEFAULT_TAG_TEXT })}>
            Domyślne
          </button>
        </span>
      </Row>
      <Row title="Wszystkie kolory" hint="Przywraca kolory klas, paska i znaczka „JA” do wbudowanych.">
        <button type="button" className={button} onClick={() => api.updateSettings({ colors: DEFAULT_COLORS })}>
          Przywróć domyślne
        </button>
      </Row>
    </Section>
  );
}

function Look({ snap }: { snap: OverlaySnapshot }) {
  const { settings } = snap;
  const api = window.overlay;
  return (
    <>
      <Section title="Okna na ekranie">
        {PANEL_IDS.filter((id) => id !== 'pvp').map((id) => (
          <Row key={id} title={PANEL_LABEL[id]}>
            <Switch label={`Pokaż okno ${PANEL_LABEL[id]}`} checked={settings.panels[id].visible} onChange={(v) => api.updatePanel({ id, layout: { visible: v } })} />
          </Row>
        ))}
        <Row title="Godzina w oknie DPS" hint="Pokazuje aktualną godzinę (czas lokalny) w prawym dolnym rogu okna DPS.">
          <Switch label="Godzina w oknie DPS" checked={settings.showClock} onChange={(v) => api.updateSettings({ showClock: v })} />
        </Row>
        <Row title="Ping w oknie DPS" hint="Pokazuje na dole okna realne opóźnienie w grze: czas sieci do serwera (zmierzony) plus to, o ile później od normy nadchodzą sygnały serwera. Przy zdrowym połączeniu jest bliski zwykłemu pingowi, a przy laguje i zacięciach rośnie do setek ms. W podpowiedzi są składowe. Pomiar jest bierny, nic nie jest wysyłane.">
          <Switch label="Ping w oknie DPS" checked={settings.showPing} onChange={(v) => api.updateSettings({ showPing: v })} />
        </Row>
        <Row
          title="FPS gry w oknie DPS"
          hint={
            snap.settings.showFps && snap.fps.state === 'denied' ? (
              <FpsAccess />
            ) : snap.settings.showFps && snap.fps.state === 'error' ? (
              <span className="text-bad">Nie udało się uruchomić śledzenia klatek gry.</span>
            ) : (
              'Pokazuje obok pingu klatki na sekundę, które gra faktycznie wyświetla. Dane pochodzą ze zdarzeń Windows (ETW, jak w PresentMon): nic nie jest wstrzykiwane do gry, nie otwieram jej procesu. Śledzenie działa tylko przy włączonej opcji.'
            )
          }
        >
          <Switch label="FPS gry w oknie DPS" checked={snap.settings.showFps} onChange={(v) => api.updateSettings({ showFps: v })} />
        </Row>
        <Row title="Zakładka Lobby w oknie DPS" hint="Trzecia zakładka obok Bossy i PvP: drużyna z gotowością, GS i CP. Włącza się sama, gdy pojawia się lobby i nie trwa walka.">
          <Switch label="Lobby w oknie DPS" checked={settings.showLobby} onChange={(v) => api.updateSettings({ showLobby: v })} />
        </Row>
      </Section>
      <ClassLegend snap={snap} />
      <ColorSettingsSection snap={snap} />
      <Section title="Przezroczystość">
        <Row title="Krycie okien" hint="Przyciemnia tylko tło okien z licznikami (do 5%); napisy i ikony zostają w pełni widoczne. Pasek, historia i ustawienia zawsze mają pełne tło.">
          <span className="flex items-center gap-2.5">
            <input
              type="range"
              aria-label="Krycie"
              min={0.05}
              max={1}
              step={0.02}
              value={settings.opacity}
              onChange={(e) => api.updateSettings({ opacity: Number(e.target.value) })}
              className="w-40 accent-[var(--color-accent)]"
            />
            <span className="num w-9 text-right text-[12px] text-ink-dim">{Math.round(settings.opacity * 100)}%</span>
          </span>
        </Row>
      </Section>
    </>
  );
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="num rounded-[5px] bg-panel-head px-2 py-1 text-[11px] font-semibold text-ink ring-1 ring-line">{children}</kbd>
);

const MODIFIER_LABEL: Record<string, string> = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };

/** One global shortcut: modifier toggles plus a key. Works while the game is in front. */
function HotkeyRow({ id, title, hint, snap }: { id: 'pin' | 'edit' | 'hideAll'; title: string; hint: string; snap: OverlaySnapshot }) {
  const current = snap.settings.hotkeys[id];
  const { modifiers, key } = splitAccelerator(current);
  const conflict = snap.hotkeyConflicts.includes(id);
  const save = (nextModifiers: string[], nextKey: string) => {
    const accelerator = buildAccelerator(nextModifiers, nextKey);
    if (!isValidAccelerator(accelerator)) return; // at least one modifier is required
    window.overlay.updateSettings({ hotkeys: { ...snap.settings.hotkeys, [id]: accelerator } });
  };
  const toggle = (m: string) => save(modifiers.includes(m) ? modifiers.filter((x) => x !== m) : [...modifiers, m], key);
  return (
    <Row
      title={title}
      hint={
        conflict ? (
          <span className="text-bad">Ten skrót jest zajęty przez inny program albo powtarza się z drugim skrótem. Wybierz inną kombinację.</span>
        ) : (
          hint
        )
      }
    >
      <span className="flex items-center gap-2">
        <span className="flex gap-1" role="group" aria-label={`Modyfikatory: ${title}`}>
          {MODIFIERS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modifiers.includes(m)}
              onClick={() => toggle(m)}
              className={`num rounded-[5px] px-2 py-1 text-[11px] font-semibold ring-1 transition-[background-color,color] duration-150 ${
                modifiers.includes(m) ? 'bg-accent/25 text-accent ring-accent/60' : 'bg-panel-head text-ink-dim ring-line hover:text-ink'
              }`}
            >
              {MODIFIER_LABEL[m]}
            </button>
          ))}
        </span>
        <span className="text-ink-mute">+</span>
        <select className={`${control} w-[68px]`} aria-label={`Klawisz: ${title}`} value={key} onChange={(e) => save(modifiers, e.target.value)}>
          {HOTKEY_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        {current !== DEFAULT_HOTKEYS[id] && (
          <button type="button" className={button} onClick={() => window.overlay.updateSettings({ hotkeys: { ...snap.settings.hotkeys, [id]: DEFAULT_HOTKEYS[id] } })}>
            Domyślny
          </button>
        )}
      </span>
    </Row>
  );
}

const PANEL_KEY_SUGGESTION: Record<PanelId, string> = {
  meter: 'Control+Alt+1',
  pvp: 'Control+Alt+2',
  target: 'Control+Alt+3',
  daily: 'Control+Alt+4',
  pets: 'Control+Alt+6',
};

/** The shortcut that pins / unpins one window: unassigned until you choose modifiers and a key. */
function PanelHotkeyRow({ id, snap }: { id: PanelId; snap: OverlaySnapshot }) {
  const current = snap.settings.panelHotkeys[id] ?? null;
  const title = PANEL_LABEL[id];
  const conflict = snap.hotkeyConflicts.includes(`panel:${id}`);
  const set = (accelerator: string | null) => {
    const { [id]: _drop, ...rest } = snap.settings.panelHotkeys;
    void _drop;
    window.overlay.updateSettings({ panelHotkeys: accelerator === null ? rest : { ...rest, [id]: accelerator } });
  };
  const { modifiers, key } = current ? splitAccelerator(current) : { modifiers: [] as string[], key: 'A' };
  const save = (nextModifiers: string[], nextKey: string) => {
    const accelerator = buildAccelerator(nextModifiers, nextKey);
    if (isValidAccelerator(accelerator)) set(accelerator);
  };
  return (
    <Row
      title={title}
      hint={conflict ? <span className="text-bad">Ten skrót jest zajęty przez inny program albo powtarza się z innym skrótem. Wybierz inną kombinację.</span> : 'Przypina albo odpina tylko to okno (przypięte nie chowa się przy kursorze).'}
    >
      {current === null ? (
        <button type="button" className={button} onClick={() => set(PANEL_KEY_SUGGESTION[id])}>
          Przypisz skrót
        </button>
      ) : (
        <span className="flex items-center gap-2">
          <span className="flex gap-1" role="group" aria-label={`Modyfikatory: ${title}`}>
            {MODIFIERS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modifiers.includes(m)}
                onClick={() => save(modifiers.includes(m) ? modifiers.filter((x) => x !== m) : [...modifiers, m], key)}
                className={`num rounded-[5px] px-2 py-1 text-[11px] font-semibold ring-1 transition-[background-color,color] duration-150 ${
                  modifiers.includes(m) ? 'bg-accent/25 text-accent ring-accent/60' : 'bg-panel-head text-ink-dim ring-line hover:text-ink'
                }`}
              >
                {MODIFIER_LABEL[m]}
              </button>
            ))}
          </span>
          <span className="text-ink-mute">+</span>
          <select className={`${control} w-[68px]`} aria-label={`Klawisz: ${title}`} value={key} onChange={(e) => save(modifiers, e.target.value)}>
            {HOTKEY_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button type="button" className={button} onClick={() => set(null)}>
            Usuń
          </button>
        </span>
      )}
    </Row>
  );
}

function Hotkeys({ snap }: { snap: OverlaySnapshot }) {
  return (
    <>
      <Section title="Skróty globalne">
        <HotkeyRow
          id="pin"
          title="Przypięcie okien"
          hint="Działa w grze jak pinezka na pasku: włączony trzyma wszystkie okna widoczne mimo kursora, wyłączony przywraca chowanie."
          snap={snap}
        />
        <HotkeyRow id="edit" title="Przesuwanie okien" hint="Włącza i wyłącza tryb przesuwania okien (to samo robi przycisk ze strzałkami na pasku)." snap={snap} />
        <HotkeyRow id="hideAll" title="Ukryj wszystkie okna" hint="Chowa całą nakładkę (okna i pasek); ten sam skrót ją przywraca. Działa też z menu ikony w zasobniku systemowym i z przycisku oka na pasku." snap={snap} />
      </Section>
      <Section title="Przypięcie pojedynczych okien">
        {PANEL_IDS.filter((id) => id !== 'pvp').map((id) => (
          <PanelHotkeyRow key={id} id={id} snap={snap} />
        ))}
      </Section>
      <p className="m-0 text-[11px] leading-snug text-ink-mute">
        Skróty działają także w grze. Kombinacja musi zawierać co najmniej jeden modyfikator (Ctrl, Alt lub Shift). Jeśli inny program już ją zajął, zobaczysz ostrzeżenie. Skrót z samych modyfikatorów
        (np. „przytrzymaj Ctrl+Alt") nie jest możliwy, bo gra blokuje odczyt stanu klawiszy.
      </p>
    </>
  );
}

function PetImport() {
  const [state, setState] = useState<string>('');
  return (
    <span className="flex items-center gap-2">
      {state && <span className="text-[11px] text-ink-dim">{state}</span>}
      <button
        type="button"
        className={button}
        onClick={() => {
          setState('…');
          void window.overlay.importPetTracker().then((n) => setState(n > 0 ? `Zaimportowano ${n} petów.` : 'Nie znaleziono zapisu dla tej postaci (zaloguj się postacią w grze).'));
        }}
      >
        Importuj
      </button>
    </span>
  );
}

function Behavior({ snap }: { snap: OverlaySnapshot }) {
  const { settings } = snap;
  const api = window.overlay;
  return (
    <>
      <Section title="Widoczność">
        <Row title="Ukrywaj przy kursorze" hint="Okna z licznikami znikają, gdy w grze pojawia się kursor (mapa, ekwipunek, menu).">
          <Switch label="Ukrywaj przy kursorze" checked={settings.hideOnCursor} onChange={(v) => api.updateSettings({ hideOnCursor: v })} />
        </Row>
        <Row title="Tytuł okna gry" hint="Nakładka pokazuje się tylko, gdy na pierwszym planie jest okno z tym tekstem w tytule.">
          <input
            className={`${control} w-32`}
            aria-label="Tytuł okna gry"
            value={settings.gameTitle}
            maxLength={64}
            onChange={(e) => e.target.value && api.updateSettings({ gameTitle: e.target.value })}
          />
        </Row>
      </Section>
      <Section title="Okienko po śmierci">
        <Row title="Pokazuj okienko po śmierci" hint="Po twoim zgonie pokazuje, kto cię zabił (klasa, GS, CP), i daje przyciski +K / +D / cofnij do ręcznej poprawki K/D/A. Wyłączone: okienko w ogóle się nie pojawia, a zgony nadal liczą się w K/D/A.">
          <Switch label="Pokazuj okienko po śmierci" checked={settings.deathPopup} onChange={(v) => api.updateSettings({ deathPopup: v })} />
        </Row>
        {settings.deathPopup && (
          <Row title="Kiedy znika" hint="Po odrodzeniu: okienko chowa się samo, gdy znowu grasz (ekran ładowania, rzucanie umiejętności, odzyskane HP) albo po 30 s. Ręcznie: zostaje, dopóki go nie zamkniesz krzyżykiem albo nie zginiesz ponownie.">
            <select
              className={control}
              aria-label="Kiedy znika okienko po śmierci"
              value={settings.deathPopupClose}
              onChange={(e) => api.updateSettings({ deathPopupClose: e.target.value === 'manual' ? 'manual' : 'respawn' })}
            >
              <option value="respawn">Po odrodzeniu</option>
              <option value="manual">Po ręcznym zamknięciu</option>
            </select>
          </Row>
        )}
      </Section>
      <Section title="Historia">
        <Row title="Tylko bossy" hint="Do historii trafiają walki z celami o dużej puli HP (główne i poboczne bossy), bez zwykłych mobów. Wyłącz, żeby zapisywać też walki na kukle.">
          <Switch label="Historia: tylko bossy" checked={settings.historyBossOnly} onChange={(v) => api.updateSettings({ historyBossOnly: v })} />
        </Row>
      </Section>
      <Section title="Zwierzaki">
        <Row title="Liczba wierszy" hint="Ile petów pokazuje okno naraz (przypięte liczą się do limitu). Rangi i dusze wczytują się przy logowaniu postaci; później rosną na bieżąco z nagród.">
          <select className={`${control} w-16`} aria-label="Liczba wierszy petów" value={settings.petsRows} onChange={(e) => api.updateSettings({ petsRows: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Import z Pet Trackera" hint="Kopiuje rangi i dusze z zapisu osobnej aplikacji Pet Tracker (folder %LOCALAPPDATA%\PetTracker). Dzieje się też samo przy pierwszym uruchomieniu postaci bez danych. Własne dane aplikacja i tak odświeża przy każdym logowaniu postaci.">
          <PetImport />
        </Row>
        <Row title="Ukryj pety na MAX" hint="Pety z maksymalną rangą znikają z listy ostatnich i bliskich.">
          <Switch label="Ukryj pety na MAX" checked={settings.petsHideMaxed} onChange={(v) => api.updateSettings({ petsHideMaxed: v })} />
        </Row>
      </Section>
      <Section title="Liczniki">
        <Row title="Maks. graczy na liście" hint="Ile graczy pokazuje okno DPS/PvP naraz na każdej liście (po stronie twojej i przeciwników). Przy masowym PvP zostają ci z największymi obrażeniami, a ty zawsze jesteś na liście. Sumy i paski liczą wszystkich graczy.">
          <select className={`${control} w-24`} aria-label="Maksymalna liczba graczy na liście" value={settings.maxPlayerRows} onChange={(e) => api.updateSettings({ maxPlayerRows: Number(e.target.value) })}>
            {[3, 5, 8, 10, 15, 20, 30, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={0}>Bez limitu</option>
          </select>
        </Row>
        <Row title="Reset licznika po przerwie (Bossy)" hint="Po ilu sekundach bez zadawanych obrażeń walka się kończy, a następne trafienie zaczyna nowy licznik. Przy bossie z długimi mechanikami walka i tak trwa, dopóki boss żyje (do 15 minut ciszy). Domyślnie 8 s.">
          <select className={control} aria-label="Reset licznika po przerwie, bossy" value={settings.fightIdleSec} onChange={(e) => api.updateSettings({ fightIdleSec: Number(e.target.value) })}>
            {[3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} s
              </option>
            ))}
          </select>
        </Row>
        <Row title="Reset licznika po przerwie (PvP)" hint="Po ilu sekundach bez trafień starcie z graczami się kończy, zapisuje w historii i następne trafienie zaczyna nowe. Domyślnie 20 s.">
          <select className={control} aria-label="Reset licznika po przerwie, PvP" value={settings.pvpIdleSec} onChange={(e) => api.updateSettings({ pvpIdleSec: Number(e.target.value) })}>
            {[5, 8, 10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} s
              </option>
            ))}
          </select>
        </Row>
        <Row title="Wyzeruj DPS" hint="Czyści bieżącą walkę w liczniku bossów.">
          <button type="button" className={button} onClick={() => api.resetMeter()}>
            Wyzeruj
          </button>
        </Row>
        <Row title="Wyzeruj PvP" hint="Czyści bieżące starcie w zakładce PvP. Zapisana historia zostaje.">
          <button type="button" className={button} onClick={() => api.resetPvp()}>
            Wyzeruj
          </button>
        </Row>
      </Section>
    </>
  );
}

/** Gets boss / dungeon names from the Abyss Logs program installed on this PC (the game sends only numbers). */
function CatalogRow() {
  const [state, setState] = useState<{ busy: boolean; ok: boolean | null; message: string }>({ busy: false, ok: null, message: '' });
  const run = () => {
    setState({ busy: true, ok: null, message: '' });
    void window.overlay.importCatalog().then((r) => setState({ busy: false, ok: r.ok, message: r.message }));
  };
  return (
    <Row
      title="Uzupełnij z Abyss Logs (opcjonalnie)"
      hint={
        state.message ? (
          <span className={state.ok ? 'text-good' : 'text-bad'}>{state.message}</span>
        ) : (
          'Gra wysyła tylko numery NPC, a aplikacja ma wbudowaną tabelę nazw bossów, mobów i instancji, więc nie potrzebujesz niczego instalować. Jeśli masz też Abyss Logs, ten przycisk jednorazowo dopisze z niego poziomy trudności instancji i brakujące nazwy (nic nie jest pobierane z internetu).'
        )
      }
    >
      <button type="button" className={button} disabled={state.busy} onClick={run}>
        {state.busy ? 'Importuję…' : 'Importuj'}
      </button>
    </Row>
  );
}

function Privacy({ snap }: { snap: OverlaySnapshot }) {
  const { settings } = snap;
  const api = window.overlay;
  return (
    <>
      <p className="m-0 mb-4 rounded-[8px] bg-accent/10 px-3.5 py-2.5 text-[12px] leading-snug text-ink-dim ring-1 ring-accent/30">
        Aplikacja tylko słucha ruchu sieciowego gry (nic do gry nie wysyła) i nie dotyka jej procesu ani pamięci. Opcje poniżej dotyczą danych o <b>innych graczach</b> i zwiększają ryzyko
        związane z regulaminem wydawcy. Wszystko jest domyślnie wyłączone lub ograniczone do minimum.
      </p>
      <Section title="Profile z oficjalnej strony">
        <Row title="Pobieraj profile graczy" hint="Karta „Cel” i lista graczy pobierają CP, item level i rangę z oficjalnej strony postaci (zapytania z Twojego IP, najwyżej raz na sekundę). Wyłączone: karta pokazuje tylko to, co przyszło z gry.">
          <Switch label="Pobieraj profile graczy" checked={settings.armoryLookup} onChange={(v) => api.updateSettings({ armoryLookup: v })} />
        </Row>
        <Row title="Region profili">
          <select
            className={control}
            aria-label="Region profili"
            value={settings.region}
            onChange={(e) => {
              const region = REGIONS.find((r) => r === e.target.value);
              if (region) api.updateSettings({ region });
            }}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r.toUpperCase()}
              </option>
            ))}
          </select>
        </Row>
      </Section>
      <Section title="Nazwy bossów i instancji">
        <CatalogRow />
      </Section>
    </>
  );
}

function UpdateSection({ snap }: { snap: OverlaySnapshot }) {
  const { update, settings } = snap;
  const api = window.overlay;
  const status =
    update.state === 'off'
      ? 'Aktualizacje działają tylko w zainstalowanej wersji.'
      : update.state === 'checking'
        ? 'Sprawdzam…'
        : update.state === 'downloading'
          ? `Pobieram wersję ${update.available ?? ''} (${update.percent ?? 0}%)…`
          : update.state === 'ready'
            ? `Wersja ${update.available ?? ''} pobrana. Zainstaluje się przy zamknięciu aplikacji albo od razu przyciskiem.`
            : update.state === 'current'
              ? 'Masz najnowszą wersję.'
              : update.state === 'error'
                ? `Nie udało się sprawdzić: ${update.error ?? 'brak odpowiedzi'}`
                : 'Jeszcze nie sprawdzano.';
  return (
    <Section title="Aktualizacje">
      <Row title={`Wersja ${update.version}`} hint={status}>
        {update.state === 'ready' ? (
          <button type="button" className={button} onClick={() => api.installUpdate()}>
            Zainstaluj i uruchom ponownie
          </button>
        ) : (
          <button type="button" className={button} disabled={update.state === 'checking' || update.state === 'downloading' || update.state === 'off'} onClick={() => api.checkUpdate()}>
            Sprawdź aktualizacje
          </button>
        )}
      </Row>
      <Row title="Sprawdzaj automatycznie" hint="Co kilka godzin pyta GitHub, czy jest nowsza wersja, i pobiera ją w tle. Instalacja następuje dopiero po zamknięciu aplikacji albo na twoje kliknięcie.">
        <Switch label="Sprawdzaj aktualizacje automatycznie" checked={settings.autoUpdate} onChange={(v) => api.updateSettings({ autoUpdate: v })} />
      </Row>
    </Section>
  );
}

function Diagnostics({ snap }: { snap: OverlaySnapshot }) {
  const { settings } = snap;
  const api = window.overlay;
  const [saved, setSaved] = useState('');
  return (
    <Section title="Diagnostyka">
      <Row title="Szczegółowe logi" hint="Zapisuje do pliku app.log dodatkowe wpisy co 30 s (liczba zdarzeń z gry, ping, FPS, stan przechwytywania). Podstawowe wpisy (start, błędy, aktualizacje) zapisują się zawsze. Plik ma najwyżej ok. 2 MB i zostaje na komputerze.">
        <Switch label="Szczegółowe logi" checked={settings.debugLog} onChange={(v) => api.updateSettings({ debugLog: v })} />
      </Row>
      <Row title="Nagrywaj surowe pakiety" hint="Zaawansowane: zapisuje ruch gry do pliku raw_tcp_ours.log (do analizy nowych pakietów). Plik szybko rośnie (do ok. 400 MB, potem nagrywanie się zatrzymuje) i zawiera nicki graczy z okolicy. Zmiana działa po ponownym uruchomieniu aplikacji.">
        <Switch label="Nagrywaj surowe pakiety" checked={settings.rawCapture} onChange={(v) => api.updateSettings({ rawCapture: v })} />
      </Row>
      <Row title="Folder z logami" hint="Otwiera folder %APPDATA%\\aion-assist (app.log, crash.log, ustawienia, historia).">
        <button type="button" className={button} onClick={() => api.openLogFolder()}>
          Otwórz folder
        </button>
      </Row>
      <Row title="Raport diagnostyczny" hint={saved ? `Zapisano: ${saved}` : 'Zapisuje plik tekstowy z wersjami, stanem przechwytywania, ustawieniami i końcówką logów, do wysłania w razie problemu. Zawiera nazwę twojej postaci; nie ma w nim historii walk ani danych innych graczy.'}>
          <button
            type="button"
            className={button}
            onClick={() => {
              void api.saveReport().then((p) => setSaved(p ?? ''));
            }}
          >
            Zapisz raport
          </button>
        </Row>
    </Section>
  );
}

function About({ hotkeys, snap }: { hotkeys: { pin: string; edit: string; hideAll: string }; snap: OverlaySnapshot }) {
  const keys: [string, string][] = [
    [acceleratorLabel(hotkeys.edit), 'Przesuwanie okien (to samo robi przycisk na pasku)'],
    [acceleratorLabel(hotkeys.pin), 'Przypięcie: wszystkie okna widoczne mimo kursora'],
  ];
  return (
    <>
      <UpdateSection snap={snap} />
      <Diagnostics snap={snap} />
      <Section title="Skróty">
        {keys.map(([k, v]) => (
          <Row key={k} title={v}>
            <Kbd>{k}</Kbd>
          </Row>
        ))}
      </Section>
      <Section title="Dane na dysku">
        <Row title="Gdzie są zapisywane dane" hint="Ustawienia, historia walk, nazwy bossów i umiejętności oraz rozpoznane postacie leżą w folderze %APPDATA%\aion-assist. Nic nie jest wysyłane poza zapytaniami o profile z oficjalnej strony (jeśli są włączone).">
          <span />
        </Row>
      </Section>
    </>
  );
}

/** Large settings popup with a tab sidebar; new groups of options are added as tabs/sections. */
export function SettingsWindow({ snap, onClose, embedded = false }: { snap: OverlaySnapshot; onClose: () => void; embedded?: boolean }) {
  const [tab, setTab] = useState<TabId>('look');
  return (
    <section
      data-hit={embedded ? undefined : 'settings'}
      aria-label="Ustawienia"
      className={
        embedded
          ? 'flex h-full w-full flex-col overflow-hidden bg-panel'
          : 'absolute left-1/2 top-1/2 z-40 flex h-[min(780px,90vh)] w-[1080px] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] bg-panel shadow-[0_20px_60px_oklch(0.1_0.02_255/0.75)] ring-1 ring-line'
      }
    >
      <header className={`flex items-center gap-2 bg-panel-head px-4 py-2.5 ${embedded ? 'hidden' : ''}`}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M8 1l7 7-7 7-7-7Z" fill="var(--color-accent)" />
          <path d="M8 4.5l3.5 3.5L8 11.5 4.5 8Z" fill="var(--color-panel-head)" />
        </svg>
        <h2 className="m-0 text-[15px] font-bold">Ustawienia</h2>
        <button type="button" aria-label="Zamknij ustawienia" onClick={onClose} className="ml-auto grid size-7 place-items-center rounded-[6px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Kategorie ustawień" role="tablist" aria-orientation="vertical" className="flex w-[190px] shrink-0 flex-col gap-0.5 border-r border-line bg-panel-head/50 p-2.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[13px] font-semibold transition-[background-color,color] duration-150 ${
                tab === t.id ? 'bg-accent/20 text-accent' : 'text-ink-dim hover:bg-row hover:text-ink'
              }`}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </nav>
        <div role="tabpanel" className="min-w-0 flex-1 overflow-y-auto p-5">
          <h3 className="m-0 mb-4 text-[18px] font-bold">{TABS.find((t) => t.id === tab)?.label}</h3>
          {tab === 'look' && <Look snap={snap} />}
          {tab === 'behavior' && <Behavior snap={snap} />}
          {tab === 'hotkeys' && <Hotkeys snap={snap} />}
          {tab === 'privacy' && <Privacy snap={snap} />}
          {tab === 'about' && <About hotkeys={snap.settings.hotkeys} snap={snap} />}
        </div>
      </div>
    </section>
  );
}
