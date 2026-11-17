# Aion Assist

<p align="center">
  <a href="https://github.com/Syntance/aion-assist/releases/latest"><img src="https://img.shields.io/github/v/release/Syntance/aion-assist?label=wersja&color=2dd4bf&style=for-the-badge" alt="Najnowsza wersja"></a>
  <a href="https://github.com/Syntance/aion-assist/releases/latest/download/Aion-Assist-Setup.exe"><img src="https://img.shields.io/badge/POBIERZ_INSTALATOR-Windows_x64-2dd4bf?style=for-the-badge&logo=windows&logoColor=white" alt="Pobierz instalator dla Windows"></a>
</p>

> **Pobieranie:** [**Aion-Assist-Setup.exe**](https://github.com/Syntance/aion-assist/releases/latest/download/Aion-Assist-Setup.exe) · [wszystkie wydania](https://github.com/Syntance/aion-assist/releases)
>
> 1. Zainstaluj [Npcap](https://npcap.com/#download) (jeśli go nie masz).
> 2. Uruchom instalator. Windows pokaże ostrzeżenie SmartScreen, bo instalator nie jest podpisany: kliknij **Więcej informacji → Uruchom mimo to**.
> 3. Uruchom Aion Assist i zaloguj postać w grze. Kolejne wersje pobierają się same.

Przezroczysta nakładka (Electron + React + Tailwind) dla AION 2: licznik DPS drużyny, panel PvP z K/D/A, karta celu i dzienne liczniki Abyss.

Aplikacja **wyłącznie nasłuchuje** własnego ruchu sieciowego przez Npcap i używa zwykłych funkcji okien Windows. Nie czyta pamięci gry, nie wstrzykuje kodu, nie wysyła nic do serwerów gry i nie automatyzuje klawiatury ani myszy.

## Uruchomienie

Wymagania: Windows 10/11, Node 22+, pnpm, [Npcap](https://npcap.com) (przy instalacji **nie** zaznaczaj „Restrict Npcap driver's access to Administrators only" — wtedy nakładka działa bez uprawnień administratora). Gra musi działać w trybie okna bez ramek (borderless), bo nad pełnym ekranem wyłącznym żadna nakładka się nie wyświetli.

```bash
pnpm install
```

```bash
node node_modules/electron/install.js
```

```bash
pnpm demo
```

```bash
pnpm dev
```

`pnpm demo` pokazuje nakładkę na sztucznych danych (bez gry, nic nie zapisuje na dysk). `pnpm dev` uruchamia prawdziwy nasłuch. `pnpm dist` buduje instalator.

Bramka jakości: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Sterowanie

| Skrót | Działanie |
| --- | --- |
| `Ctrl+Shift+L` | Tryb edycji: nakładka staje się klikalna, panele można przesuwać i poszerzać, pojawia się pasek ustawień. Ponowne naciśnięcie zapisuje układ i przywraca click-through. |
| `Ctrl+Shift+K` | Przypięcie: nakładka widoczna zawsze (ignoruje auto-ukrywanie). |

Te same opcje są w menu ikony w zasobniku oraz na **pasku Aion Assist**. Pasek jest widoczny zawsze, gdy gra jest na pierwszym planie (także przy otwartym menu). Klikalny jest tylko sam pasek, reszta ekranu przepuszcza kliknięcia do gry. Na pasku: pokazywanie/ukrywanie paneli, krycie, **„Przestaw układ”** (przesuwasz wszystkie panele i sam pasek, ponowne kliknięcie zapisuje układ), przypięcie i zerowanie DPS/PvP. Kursor do klikania w pasek pokazujesz w grze jak zwykle (np. `Alt`).

**Nazwy bossów i instancji.** Gra wysyła tylko numery NPC, nigdy nazw, więc bez dodatkowych danych boss to „NPC #2300910". Ustawienia → Dane i prywatność → „Importuj z zainstalowanego Abyss Logs" jednorazowo odczytuje (tylko odczyt pliku) tabele nazw bossów i instancji z programu Abyss Logs zainstalowanego na tym komputerze i zapisuje je w `npc-catalog.json` w folderze danych (`%APPDATA%\aion-assist`). Nic nie jest pobierane z internetu, nic nie jest dołączone do aplikacji i nie dotykam gry. Katalog zawiera nazwy NPC z flagą „boss" oraz instancje z kategorią i poziomem trudności (np. „Dungeon · Conquest [Normal]"). Nazwa wpisana ołówkiem zawsze wygrywa z katalogiem, a flaga „boss" z katalogu ma pierwszeństwo przed zgadywaniem po HP (kukła treningowa nie jest bossem, więc przy „Historia: tylko bossy" się nie zapisuje). Nowe walki dostają nazwy od razu; w historii już zapisane też, bo nazwy są dopisywane przy wyświetlaniu. Format pliku: `{"npcs":{"<kod>":{"name":"…","boss":true,"dungeonId":600092,"tier":"…","category":"…"}},"dungeons":{"<id>":{"name":"…","tier":"…","category":"…"}}}`.

**K/D/A i historia dzień po dniu.** Zabójstwa, zgony i asysty (z rekordów zabójstw) są zapisywane osobno dla każdego dnia kalendarzowego (czas lokalny) razem z pozostałymi statystykami dnia w `aion-assist.json` (ostatnie 120 dni). Licznik K/D/A w zakładce PvP pokazuje liczby z dzisiaj: zostaje po restarcie aplikacji i zaczyna się od zera dopiero z nowym dniem, a przycisk „Wyzeruj PvP" czyści tylko bieżące starcie. Historia → PvP grupuje walki według dni: nagłówek dnia ma K/D/A, liczbę walk, sumę obrażeń (twoja strona vs przeciwnicy) i AP z tego dnia; dzisiejszy dzień jest rozwinięty, starsze zwijasz i rozwijasz, a kosz przy dniu usuwa wszystkie jego walki (po potwierdzeniu). Zapisuje się do 400 ostatnich starć.

**Kto kogo zabił.** Każde zabójstwo, zgon i asysta z udziałem twojej postaci (z rekordów zabójstw, z nazwami obu stron) zapisuje się do `aion-assist.json` (ostatnie 400 wpisów, więc zostaje po restarcie). W oknie DPS, w zakładce PvP, pod listą graczy jest sekcja „Kto kogo zabił (dzisiaj)": zabójstwo (ty → gracz), zgon (gracz → ty) i asysta, z godziną. W Historii → PvP ten sam dziennik widać w rozwiniętym dniu, a w oknie szczegółów konkretnej walki wpisy z jej czasu (z nazwą umiejętności, gdy jest znana). Zabójstwa innych graczy, w których nie bierzesz udziału, nie są zapisywane.

**Skróty klawiszowe** (Ustawienia → Zachowanie): przypięcie okien (domyślnie `Ctrl+Shift+K`, to samo co pinezka na pasku) i przesuwanie okien (`Ctrl+Shift+L`). Kombinacja to 1–3 modyfikatory plus litera, cyfra albo F1–F12; zmieniasz ją przełącznikami Ctrl/Alt/Shift i listą klawiszy. Skróty rejestruje systemowe API skrótów globalnych, więc działają także w grze; jeśli inny program już zajął kombinację, ustawienia to pokażą. Skrótu typu „przytrzymaj Ctrl+Alt" nie da się zrobić: gra blokuje odczyt stanu klawiszy przed innymi programami (potwierdzone logiem), a jedyna alternatywa, hak klawiatury, wygląda jak keylogger i nie nadaje się do aplikacji, która ma być bezpieczna.

**Szczegóły gracza i historia.** Kliknięcie wiersza w oknie DPS otwiera tabelę umiejętności (obrażenia, %, rzuty, kryt., maks., średnia, parowanie) oraz statystyki trafień (krytyki, z tyłu/z przodu, parowanie, perfekt, podwójne). Obok licznika DPS jest ikona czaszki: liczba śmierci drużyny w bieżącym wejściu. Przycisk zegara na pasku otwiera **historię**: wejścia do dungeonów z listą walk (boss, czas, obrażenia, liczba graczy); walka rozwija się do listy graczy, a gracz do szczegółów. Dane trafiają do `history.json` i `names.json` w `%APPDATA%\aion-assist` (ostatnie 25 wejść, nic nie jest wysyłane). Nazwy umiejętności pobierane są z oficjalnej strony dla postaci, które znamy; nazwy map, instancji i bossów nadajesz ikoną ołówka (pakiety zawierają tylko id). Procenty parowania/perfekt/podwójnych i licznik śmierci opierają się na heurystykach i nie były jeszcze porównane z Abyss Logs w grze.

Auto-ukrywanie (co 150 ms): nakładka jest widoczna tylko wtedy, gdy okno na pierwszym planie (`GetForegroundWindow`) ma w tytule tekst z ustawienia „Tytuł okna gry" (domyślnie `AION2`) i kursor systemowy jest ukryty (`GetCursorInfo`). Otwarcie mapy, ekwipunku czy ustawień pokazuje kursor, więc nakładka płynnie znika.

## Bezpieczeństwo konta — stan faktyczny

**Nie da się zagwarantować braku bana.** NCSOFT nie zatwierdził żadnego zewnętrznego licznika DPS. Poniżej to, co udało się ustalić (listopad 2026), i jak aplikacja ogranicza ryzyko.

Co wiadomo:

- Regulamin operacyjny wymienia „Use of Unauthorized Programs" z karą bana konta, a EULA zabrania m.in. dostępu do usług przez narzędzia firm trzecich i zbierania danych innych użytkowników bez zgody. Pasywny licznik nie jest tam nazwany wprost, ale nie jest też dozwolony.
- Na koreańskiej transmisji 26.05.2026 twórcy ostrzegli operatorów zewnętrznych liczników i stron z logami (zapowiedź blokowania zbierania danych i kroków prawnych). Według relacji nie dotyczyło to zwykłych graczy.
- Do 22.10.2026 serwisy społeczności nie potwierdziły ani jednego bana za sam licznik oparty na nasłuchu pakietów; bany dotyczyły botów, makr i farmienia.
- Gra ma oficjalny licznik (Combat Analysis, `Ctrl+X`), ale pokazuje tylko własne obrażenia.

Jak aplikacja ogranicza ryzyko:

- Żadnego kontaktu z procesem gry: brak `OpenProcess`, `ReadProcessMemory`, hooków i wstrzykiwania. Gra jest rozpoznawana po tytule okna, więc aplikacja nie otwiera nawet uchwytu do jej procesu.
- Nasłuch jest tylko do odczytu, w trybie niepromiskuitywnym; funkcje wysyłania pakietów nie są w ogóle podpięte.
- Surowe pakiety nie opuszczają procesu nasłuchu i nie są zapisywane. Na dysk trafia jeden plik z ustawieniami, bilansem z rywalami i licznikami dziennymi.
- Nic nie jest wysyłane do zewnętrznych serwisów. Jedyny ruch wychodzący to opcjonalne pobieranie profilu postaci z oficjalnej strony AION 2 (najwyżej jedno zapytanie na sekundę, z pamięcią podręczną). Można to wyłączyć w trybie edycji.

Czego nie da się wyeliminować: sterownik Npcap i sam proces nakładki są widoczne w systemie, a NCSOFT może w każdej chwili zacząć egzekwować zakaz. Panel celu pokazuje dane innych graczy, czyli dokładnie ten obszar, którego dotyczyło ostrzeżenie z maja 2026. Najbezpieczniejszy wariant to wyłączenie paneli „Cel" i „PvP" oraz pobierania profili, czyli sam licznik DPS drużyny.

## Skąd pochodzą dane i czego nie ma

| Funkcja | Źródło | Uwagi |
| --- | --- | --- |
| DPS własny i drużyny | pakiety obrażeń `04 38`, `05 38` | Przy bossach w otwartym świecie gra wysyła tylko własne trafienia. Obrażenia przywołańców (Spiritmaster) nie są jeszcze przypisywane właścicielowi. |
| GS i CP drużyny | lista drużyny `02 97` | Najlepsze dopasowanie; przesunięcia pól bywają zmienne. |
| GS przeciwników | brak | Gra nie wysyła GS obcych graczy. Zamiast niego pokazywany jest item level z oficjalnego profilu. |
| CP i ranga Abyss przeciwników | oficjalna strona postaci | Wymaga włączonego pobierania profili. |
| K/D/A, bilans z graczem | obrażenia + pakiet śmierci `42 36` | Zabójstwo = ostatnie trafienie należało do ciebie (okno 10 s); inaczej asysta. |
| Lobby (w oknie DPS) | lista drużyny `02 97` (tytuł, członkowie, lider) | Sekcja nad listą DPS, widoczna między walkami (w trakcie walki ustępuje miejsca licznikowi; przełącznik na pasku). Pokazuje poczekalnię ekspedycji i drużynę: lider, **gotowy / niegotowy** (bit `0x02` bajtu nagłówka członka, potwierdzony na dwóch przełączeniach w grze), GS i CP każdego gracza. W drużynie poza poczekalnią flaga gotowości nie ma znaczenia. DPS członków liczy się w panelu DPS, gdy znani są z listy drużyny. |
| Cel w panelu DPS | NPC, w którego ostatnio biłeś (zaznaczenie celu w grze nie jest odczytywalne) | HP aktualne i maksymalne z pakietu `00 8d`, TTK = HP / bieżący DPS drużyny. Gra nie wysyła nazw mobów, więc pasek nie ma nazwy. **Stagger** (`05 e0`) jest zaimplementowany wg dokumentacji otwartych projektów, ale niezweryfikowany na żywym bossie (kukła go nie ma). |
| Cel | ostatni gracz, którego trafiłeś lub który trafił ciebie | Zaznaczenie celu nie jest odczytywalne: ruch klienta jest zaszyfrowany, a serwer nie odpowiada pakietem „cel zaznaczony" (potwierdzone trzema nagraniami). Karta pojawia się po pierwszej wymianie obrażeń. |
| W pobliżu | rekordy graczy w pakietach, także osadzone wewnątrz innych | Wrogowie na górze, potem gracze o nieznanej frakcji; sojusznicy ukryci, chyba że włączysz „Sojusznicy w W pobliżu" w trybie edycji. Frakcja wynika z numeru serwera (1xxx Elyos, 2xxx Asmodian), a gracz bez znanego serwera ma frakcję nieznaną. Profil z oficjalnej strony pobierany jest tylko dla wrogów i nieznanych. |
| AP dziennie | licznik tygodniowy `AB FF` | Liczone od pierwszego odczytu po uruchomieniu nakładki danego dnia. |
| Ping (opcja w oknie DPS) | czas sieci z potwierdzeń TCP + czas nadejścia heartbeatów serwera (co 50 ms, z zegarem serwera w środku) | Realne opóźnienie w grze = **sieć** (czas od wysłania danych do potwierdzenia przez serwer, zbliżony do pingu ICMP) + **opóźnienie serwera** (o ile później od normy, czyli najmniejszej różnicy z ostatnich 2 min, dochodzą jego sygnały; rośnie przy zacięciach serwera i oczekiwaniu na retransmisję utraconych pakietów, nawet gdy zwykły ping jest niski). Opóźnienie serwera jest wygładzone (ok. 2 s), a gdy sygnały przestają przychodzić, równa się czasowi ciszy. Podpowiedź pokazuje składowe i najgorszy sygnał z 10 s. Przy zdrowym połączeniu liczba jest bliska zwykłemu pingowi (nie dopasowana do żadnego innego programu). Pomiar bierny, nic nie jest wysyłane. |
| FPS gry (opcja w oknie DPS, obok pingu) | zdarzenia Present z dostawcy Microsoft-Windows-DXGI (ETW), przefiltrowane do procesu okna gry | To klatki, które gra faktycznie wyświetla, liczone z czasów tych zdarzeń (jak PresentMon). Bierne: nie otwieram procesu gry, nic nie wstrzykuję, czytam tylko zdarzenia, które Windows i tak publikuje. Śledzenie działa tylko przy włączonej opcji i tylko gdy okno gry jest na pierwszym planie (wtedy znamy jego proces). Wymaga konta administratora albo członka grupy „Użytkownicy dzienników wydajności" (Performance Log Users); aplikacja się nie podnosi do administratora, a bez uprawnień pokazuje, jak to naprawić. Gdy gra działa powyżej częstotliwości odświeżania monitora, liczba może być wyższa niż to, co widzisz na ekranie. |
| Punkty rankingowe dziennie | oficjalny profil własnej postaci, odświeżany co 10 min | Zależy od tego, jak często strona aktualizuje ranking. |

**Stan sprawdzenia na żywej grze (12.11.2026):** połączenie z grą, rozpoznanie własnej postaci, tygodniowy licznik AP i rekordy innych graczy (także osadzone w większych pakietach) działają. Nie sprawdzono jeszcze na żywo: DPS drużyny, GS i CP z listy drużyny, K/D/A i listę wrogów w strefie PvP. Zdarzało się, że panel „W pobliżu" pokazywał nazwy, które nie wyglądały na prawdziwych graczy; przyczyna nie jest ustalona (podejrzewam zbyt słaby filtr rekordów osadzonych), więc jeśli to zobaczysz, nagraj log trybem odkrywania. Mapowanie kodów klas z pakietów na nazwy klas jest założeniem (numeracja jak na oficjalnej stronie), a kod regionu inny niż `eu` nie był weryfikowany.

### Tryb odkrywania (karta celu po zaznaczeniu)

Żaden otwarty projekt nie opisuje pakietu „zaznaczono cel", więc trzeba go znaleźć na żywej grze:

1. `pnpm discover` (zwykły nasłuch + zapis do `%APPDATA%\aion-assist\discovery-log.txt`).
2. W grze, przy innych graczach: naciśnij skrót znacznika, a w ciągu 3 sekund kliknij jednego gracza. Powtórz 5–10 razy na różnych graczach, z przerwami. Skrót, który faktycznie zadziałał, widać w stopce panelu DPS (próbowane po kolei: `Ctrl+Shift+M`, `Ctrl+Alt+M`, `Ctrl+Shift+F9`, `F9`; `Ctrl+Shift+M` często zajmuje Discord).
3. Wyślij plik logu. Zawiera nazwy postaci z okolicy i fragmenty pakietów (pierwsze 48 bajtów), więc nie publikuj go nigdzie.

Po patchu gry kody pakietów potrafią się przesunąć. Można je nadpisać bez przebudowy, tworząc `%APPDATA%\aion-assist\opcodes.json`, np. `{ "damage": "04 38", "death": "42 36" }` (nazwy pól: `src/core/protocol/opcodes.ts`).

## Zwierzaki (Pet Tracker)

Okno „Zwierzaki” pokazuje rangi petów i dusze do następnej rangi, ostatnie nagrody, pety widoczne w pobliżu i licznik sesji. Wyszukiwarka („Szukaj”) listuje wszystkie pety z filtrami (rodzina, ranga, najbliżej awansu) i opisem, skąd je wziąć. Dane pochodzą z tego samego biernego przechwytu pakietów co reszta aplikacji: nic nie jest odczytywane z pamięci gry ani wysyłane.

- Kolekcja (rangi i liczniki dusz) przychodzi z gry tylko **przy logowaniu postaci**. Jeśli aplikacja startuje, gdy już grasz, wróć do wyboru postaci i zaloguj się ponownie. Do tego czasu pokazuję zapamiętany stan oznaczony jako nieaktualny („~”).
- Zapis: `pets.json` w folderze danych, osobno dla każdej postaci (rangi, liczniki, przypięte pety).
- Pety kupowane wyłącznie za prawdziwe pieniądze są pomijane na listach.
- Nie ma jeszcze map farmienia z oryginalnego Pet Trackera (to ok. 40 MB grafik) ani celów awansu z powiadomieniem.
- Format pakietów kolekcji, tabela „który mob daje którego peta” i opisy źródeł pochodzą z [PetTracker](https://github.com/0Fox2Give/PetTracker) (GPL-3.0). Dane są wygenerowane skryptem `tools/gen-pet-data.py` do `src/core/pets/petData.ts`; grafik petów (portrety i kryształy rodzin) w repozytorium nie ma: skrypt `tools/gen-pet-assets.py <ścieżka do PetTracker>` buduje je lokalnie z kopii PetTrackera, a bez nich okno działa z pustymi ramkami zamiast portretów.

## Aktualizacje

Zainstalowana wersja sprawdza wydania na GitHubie (`Syntance/aion-assist`) i aktualizuje się sama; szczegóły wydawania w `docs/RELEASING.md`.

## Architektura

```
src/capture   proces nasłuchu: Npcap (koffi → wpcap.dll) → zdarzenia gry
src/core      czysta logika: TCP, ramki, LZ4, dekodery, silnik statystyk, demo
src/main      okno nakładki, auto-ukrywanie, skróty, zapis, profile postaci
src/preload   wąski most IPC (contextIsolation, sandbox)
src/renderer  UI (React + Tailwind v4, kolory OKLCH)
tests         Vitest: protokół, składanie TCP, silnik
```

## Źródła protokołu i licencja

Wiedza o protokole pochodzi z otwartych projektów na licencji GPL-3.0: [A2Tools DPS Meter](https://github.com/taengu/A2Tools-DPS-Meter), [Aion2DPSMeter](https://github.com/domel1998/Aion2DPSMeter) i [aion2dps](https://github.com/TheLoop705/aion2dps). Kod został napisany od nowa na podstawie opisu formatów, ale z ostrożności projekt jest udostępniany na **GPL-3.0-or-later**.

Projekt nie jest powiązany z NCSOFT. Używasz na własną odpowiedzialność.
