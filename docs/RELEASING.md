# Wydawanie aktualizacji (GitHub Releases)

Aplikacja sama sprawdza GitHub co kilka godzin, pobiera nowszą wersję w tle i instaluje ją przy zamknięciu albo na kliknięcie („Zainstaluj i uruchom ponownie” w ustawieniach → O aplikacji). Znajomy instaluje pierwszy raz ręcznie, potem aktualizacje przychodzą same.

## Konfiguracja (zrobiona)

- Repozytorium: <https://github.com/Syntance/aion-assist> (publiczne; musi takie być ze względu na licencję GPL-3.0, bo aplikacja korzysta z kodu PetTrackera). Konto organizacji powinno mieć włączone 2FA: kto przejmie konto, może wypchnąć złośliwą aktualizację.
- `package.json` → `build.publish` wskazuje `Syntance/aion-assist`.
- Do publikacji potrzebny jest token GitHuba w zmiennej `GH_TOKEN`. Najprościej użyć tokenu zalogowanego `gh` (nie zapisuj go w plikach projektu):

```powershell
$env:GH_TOKEN = (gh auth token)
```

## Każda nowa wersja

1. Podnieś `version` w `package.json` (np. `0.1.1`). Aktualizacja działa tylko wtedy, gdy numer jest wyższy od zainstalowanego.
2. Sprawdź jakość, zatwierdź zmiany i wypchnij je razem z tagiem wersji (GitHub nie utworzy wydania bez istniejącego tagu):

```powershell
pnpm typecheck; pnpm lint; pnpm test
git add -A; git commit -m "Wersja 0.1.1"; git push
git tag v0.1.1; git push origin v0.1.1
```

3. Opublikuj:

```powershell
$env:GH_TOKEN = (gh auth token)
pnpm release
```

`pnpm release` buduje instalator, tworzy wydanie na GitHubie i wgrywa instalator, `latest.yml` (z sumą kontrolną, którą aplikacja sprawdza przed instalacją) i blockmap. Po wydaniu sprawdź, że `latest.yml` w wydaniu zgadza się z instalatorem (suma `sha512` i `size`); gdyby publikacja przerwała się w połowie, `pnpm release` zbuduje instalator od nowa, więc przed ponowną próbą uruchom go jeszcze raz w całości.

## Co znajomy powinien wiedzieć

- Instalator nie jest podpisany certyfikatem, więc Windows pokaże ostrzeżenie SmartScreen („Więcej informacji” → „Uruchom mimo to”). Podpisanie wymaga płatnego certyfikatu.
- Potrzebny jest [Npcap](https://npcap.com/#download) (nie jest dołączony do aplikacji).
- Aplikacja jest nieoficjalna i nie ma zgody NCSOFT; używanie narzędzi trzecich może grozić sankcjami na koncie. Nasłuch jest bierny (nic nie jest wstrzykiwane do gry ani czytane z jej pamięci), ale nie ma gwarancji bezpieczeństwa.
- Dane (ustawienia, historia, kolekcja petów) leżą lokalnie w `%APPDATA%\aion-assist` i nie są wysyłane.
