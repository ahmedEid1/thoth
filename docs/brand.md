# Thoth — Brand Guidelines

## Name & meaning

**Thoth** is the Greek transliteration of the ancient Egyptian *Ḏḥwty*, the ibis-headed god of writing, wisdom, knowledge, and scribes. The hieroglyph for "scribe" was an ibis — a direct symbolic match to a tool that drafts and verifies systematic literature reviews. The name itself means "[he] is like the ibis."

## Tagline

- **Primary:** Agentic systematic literature reviews with verifiable citations.
- **Secondary (brand context only):** Named for Thoth, ancient Egypt's ibis-headed god of writing, wisdom, and scribes.

## Color palette

| Role     | Name              | Hex / OKLCH                       | Use                                                      |
| -------- | ----------------- | --------------------------------- | -------------------------------------------------------- |
| Primary  | Thoth blue (lapis lazuli)   | `#1E3A8A` / `--thoth-blue-ink`    | Logo on light backgrounds, wordmark, primary brand accent |
| Mid blue | Thoth blue (accent)         | `--thoth-blue`                    | Body links, focus rings, secondary interactive elements |
| Surface  | Papyrus           | `--thoth-papyrus`                 | Page background — warm off-white                         |
| Accent   | Papyrus gold      | `#C9A961` / `--thoth-gold`        | Sparing accent — eyebrow rules, CTA backgrounds          |
| Body     | Stone             | `--thoth-stone` (≈ oklch 0.42)    | Body / secondary copy (6.8:1 contrast on papyrus, WCAG AA pass) |
| Warning  | Brick warn        | `--thoth-warn` (≈ oklch 0.45 0.18 25) | Error states, "demo unavailable" cards — replaces Tailwind reds for brand consistency |

The Tailwind theme maps these to the standard shadcn variables (`--primary`, `--background`, `--muted` etc.) in `app/globals.css`, so any shadcn component inherits the palette without per-component overrides.

## Typography

| Role     | Family                      | Weight | Use                                                |
| -------- | --------------------------- | ------ | -------------------------------------------------- |
| Display  | **Fraunces** (variable)     | 400-600 | Headings, the wordmark, large numerals; opsz + SOFT axes set per surface |
| Body     | **Geist**                   | 400/500 | Paragraph copy, navigation, controls               |
| Mono     | **Geist Mono**              | 400    | Code, tabular numerals on metric cards             |

All three load via `next/font/google` with `display: "swap"`.

## Logo files

| File                                | Use case                                                                |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `app/icon.svg`                      | Browser favicon (Next.js automatic-icon convention) — Thoth-blue ibis only, 512×512 viewBox |
| `app/layout.tsx` (`IbisMark` inline)| Header logo in the rendered app — same SVG path, sized via `text-*` + `w-* h-*` |
| `app/page.tsx` (decorative inline)  | Subtle decorative ibis bleeding off the home hero's right edge          |
| `public/thoth-logo.svg`             | Square mark for OG images and embeds, single-color blue                  |
| `public/thoth-wordmark.svg`         | Ibis + "Thoth" wordmark in Fraunces, for social cards                    |
| `docs/assets/thoth-logo.svg`        | 320×320 mark with a soft papyrus disc, for the README banner             |

All artwork uses the same source path — see the credits note below.

## Credits

The ibis silhouette is by [Delapouite](https://delapouite.com/) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), via [game-icons.net](https://game-icons.net/1x1/delapouite/ibis.html). Recolored to Thoth blue ink (`#1E3A8A`) for in-product use.

## DO

- Pair the name "Thoth" with Fraunces (display) and Geist (body).
- Use a single ibis silhouette per surface; let it breathe.
- Keep Thoth blue dominant; gold is a quiet accent.
- Reference the etymology once in long-form contexts (README intro, layout footer, blog post intros).
- Apply the soft papyrus disc background (as in `docs/assets/thoth-logo.svg`) on marketing surfaces (README banner, OG cards) where the ibis needs a bit of warmth around it.

## DO NOT

- Replace the Delapouite ibis with a generic bird or a hand-drawn substitute — the species silhouette (round head, long down-curving beak, thin wading legs) is what carries the brand.
- Add hieroglyphic dividers, cartouches, or ankh icons as decoration. The brand carries via the ibis + name, not Egyptian costume.
- Lean on mythological metaphors in product copy or section headings.
- Apply gradients, drop shadows, or photoreal effects to the logo.
- Use Tailwind's default `text-red-*` for error states — they clash with the warm papyrus background; use `--thoth-warn` instead.
