# Condensed cuts and voice-over cues

2b → 45 seconds at 1280×720. 1b → 120 seconds at 720×1280. Both retain their original orientation at 30 fps.
Original files are untouched. The main exports retain selected original narration at unchanged speed and completely silent diagram holds for your voice-over.
Files ending in _voiceover_only.mp4 have the identical picture edit and a fully silent audio track, for replacement narration across the whole cut.
No new voice has been recorded or synthesized. The lines below are optional recording prompts; spoken inserts must fit their allotted slots.

## 1b — 120 seconds

Original narration playback speed: 1.0000×. Pitch is preserved.

| Output seconds | Type | Source seconds / held frame | Content or suggested voice-over |
|---|---|---|---|
| 0.000–4.800 | SILENT VO SLOT | Freeze at 1.000 | Explain the diagram in your own words. |
| 4.800–18.400 | Original narration | 0.000–13.600 | Original explanation, unchanged speed |
| 18.400–23.200 | SILENT VO SLOT | Freeze at 13.600 | Explain the diagram in your own words. |
| 23.200–32.900 | Original narration | 13.600–23.300 | Original explanation, unchanged speed |
| 32.900–37.700 | SILENT VO SLOT | Freeze at 23.300 | Explain the diagram in your own words. |
| 37.700–47.600 | Original narration | 23.300–33.200 | Original explanation, unchanged speed |
| 47.600–52.400 | SILENT VO SLOT | Freeze at 33.200 | Explain the diagram in your own words. |
| 52.400–66.600 | Original narration | 33.200–47.400 | Original explanation, unchanged speed |
| 66.600–71.400 | SILENT VO SLOT | Freeze at 47.400 | Explain the diagram in your own words. |
| 71.400–85.100 | Original narration | 47.400–61.100 | Original explanation, unchanged speed |
| 85.100–89.900 | SILENT VO SLOT | Freeze at 61.100 | Explain the diagram in your own words. |
| 89.900–100.800 | Original narration | 61.100–72.000 | Original explanation, unchanged speed |
| 100.800–105.600 | SILENT VO SLOT | Freeze at 72.000 | Explain the diagram in your own words. |
| 105.600–115.200 | Original narration | 72.000–81.600 | Original explanation, unchanged speed |
| 115.200–120.000 | SILENT VO SLOT | Freeze at 79.000 | The ERD documents constraints; database constraints implement them. |

## 2b — 45 seconds

Original narration playback speed: 1.0000×. Pitch is preserved.

| Output seconds | Type | Source seconds / held frame | Content or suggested voice-over |
|---|---|---|---|
| 0.000–4.133 | SILENT VO SLOT | Freeze at 50.000 | A lossless split must not invent rows. |
| 4.133–12.833 | Original narration | 50.100–58.800 | Shared attributes identify a component |
| 12.833–16.967 | SILENT VO SLOT | Freeze at 78.000 | The shared exchange ID identifies an exchange. |
| 16.967–31.967 | Original narration | 77.000–92.000 | Exchange ID key example |
| 31.967–40.833 | Original narration | 200.600–209.467 | Intersection and key verification |
| 40.833–45.000 | SILENT VO SLOT | Freeze at 214.000 | A shared superkey is sufficient; check functional dependencies. |

## Splicing your narration

Import the main MP4 into your editor, add your recording on a new audio track at the SILENT VO SLOT timestamps, and keep the total timeline unchanged. Trim recordings to fit rather than extending the movie. The source track is already silent in these slots.
For a full narrated recap, use the voiceover_only version instead. Do not increase audio level on a silent track; record/import your narration as a new track.
The join-proof cut intentionally omits the original video's claim that matching row counts alone is definitive proof. When narrating practical validation, compare the actual reconstructed tuples with the original result; equal counts alone can hide different records.
