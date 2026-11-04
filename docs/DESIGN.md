# Tideline: design

Status: P3d. G3 passed 31 Oct 2026: the user picked direction F (glass sphere, DESIGN-REFERENCE-3.md). Page flow accepted with `continue`. P3d done 31 Oct 2026 (components, tokens, golden-path screens); P3e critic and prototype next.

Tool: Figma MCP (access confirmed 30 Oct 2026, can create and edit files).

- FigJam (stories and flow): https://www.figma.com/board/wWNYPNNY2nkzdr7hb8yhZX
- Figma design file (style tiles): https://www.figma.com/design/PNmEWlpZj9DrsJC1ZYJIeh

## Research (P3a)

Pages were read as text, not checked visually. Nearblocks was blocked by a Cloudflare challenge. DefiLlama, Token Terminal, Dune and Pudding were not opened.

**[NEAR Intents Explorer](https://explorer.near-intents.org/)**
- Adopt: volume strip for all-time, 24h, 7D and 30D, plus affiliate and referral tables with transaction counts (FR-05).
- Adapt: truncated hash or transaction ID with a Copy button, and a link to the underlying rows from each number (FR-02, FR-13).
- Avoid: a dense live table with no definitions and no plain-language line (FR-12, FR-13).

**[L2BEAT, Arbitrum One](https://l2beat.com/layer2s/projects/arbitrum)**
- Adopt: evidence per claim, with each risk as a plain sentence and the verdict listing what is missing (FR-12, FR-13).
- Adapt: fixed labelled boxes become five readings, each on one of two sides, beside the verdict above the fold at 1440px (FR-12).
- Avoid: a long scroll that buries the headline, and an "outdated" warning with no date. Every number gets a dated "as of".

**[Our World in Data](https://ourworldindata.org/grapher/co-emissions-per-capita)** (taste reference)
- Adopt: provenance as plain fields next to a chart: source, unit, date range, last updated (FR-13).
- Adapt: a download panel for each chart, pointing at repo files (FR-07, FR-10).
- Avoid: long prose before the data. Number and its one-line meaning come first.

## Style tiles (P3c, 31 Oct 2026)

Readings on both tiles are sample values from the draft, not results. Colours are hard-coded in the tiles; variables come in P3d, for the chosen direction only.

**A, Clearance.** The gap under a bridge: the headline screen is a scale drawing: today's volume is the load, the threshold is the beam. Overpass, which descends from US highway lettering. Concrete grey, sign yellow, road-sign green. Risk: a drawing instead of a dashboard, with the readings in a narrow column.

**B, Two sides.** Both outcomes of every reading are written down first, so the screen is that form: bearish left, bullish right, one spine between. Zilla Slab and Atkinson Hyperlegible, carbon-copy blue, a stamp colour. Risk: the threshold shrinks to a small bar.

**C, Soft fintech.** The user's style reference, DESIGN-REFERENCE.md: #F5F5F5 page, one large lavender card, black pills with an arrow circle, #2B2644 cards, tight medium-weight headings. Our own content only: no name, logo, partner list, photos or video from the reference. Albert Sans stands in for TT Norms Pro, a paid font. To keep it from reading as any fintech page, a coin stack sits under the two thresholds, drawn to scale. Risk: the look is common, and the screen needs real art in P3d to match the reference.

**D, Soft clearance (A + C, the user's pick).** C's shell: #F5F5F5 page, lavender hero card, black pills, #2B2644 cards, Albert Sans. A's idea: a scale drawing with a gauge, beams with hazard edges, road signs, and today's volume as the load. Overpass only for big dollar figures and signs. The sign yellow #F7C600 is the one accent. The readings run along the bottom of the card, which fixes A's narrow column. C's coin stack is dropped.

**E, Glass landscape.** From the user's DESIGN-REFERENCE-2.md: #F0F0F0 page, 48-radius frame, grey centred headline, glass cards over a dusk scene, a corner cut out of the frame. Arimo stands in for Helvetica. The scene is a vector stand-in.

**F, Glass sphere.** From DESIGN-REFERENCE-3.md: pale blue page, Inter in light weights, very large thin figures, a glass meter panel. The sphere is a vector stand-in.

**G, Bowl glow.** From the revised DESIGN-REFERENCE-4.md: white page, a cyan bowl glow from the top edge, a white pill nav, navy text, a button with a glowing dot, and three scroll scenes (headline, flooded statement, dark split). The partner-logo grid holds the verdict, thresholds and readings. The photo is replaced by a threshold drawing. Inter stands in for Inter Tight in Figma; the accent darkens to #3558D6 so it stays readable on the glow. Motion is not shown in the tile.

E, F and G use our content only: no name, logo, partners, stats, photos or video from the references.

## Chosen direction (G3, 31 Oct 2026): F, Glass sphere

Pale blue page (#E6EDF6), Inter in Light and Extra Light for headings and big figures, thin glass panels, near-black pill buttons with a chevron knob. Tokens are in the Figma file. Known risks the critic must test in P3e: Inter is on the slop checklist's banned list, and a glass sphere is a common premium look with no link to fees. Both are accepted for now; the vector sphere is a stand-in.

## Figma build (P3d, 31 Oct 2026)

- **Tokens** (Figma variables, scoped, with web code syntax): collections `color` (17 colours) and `space` (spacing, radius). Text styles: display, heading, body, label groups, all Inter.
- **Components** (page `Components F`): Button (primary, secondary, disabled, loading), Status tag, Reading cell (Bullish, Neutral, Bearish, Not measured), Number card, Banner (stale, gap, error), Slider, Skeleton number, Toast, Empty state, Nav pill. Not built as components: hover and focus states, a mobile menu panel, the error and loading versions of every screen.
- **Screens** (page `Screens F`), built from those instances: S1 Headline, S2 Follow the fee, S3 Elasticity (underpowered state), S4 Model, S5 Reproduce (not yet anchored state), each at 1440px, plus S1 and S4 at 375px.
- Content is honest placeholder: figures marked sample come from the draft; S2's cost split is arithmetic on the draft's 20.3 bps sample, and who receives the app fee is shown as unchecked; S5 shows no anchored day because none exists.
- Known gaps for the critic and for G4: the sphere art is not on these screens (only on the tile), the mark is a placeholder, mobile nav menu is a button only, and Elasticity's chart is a dashed placeholder.

## Anti-slop review (P3e, 31 Oct 2026)

Reviewer: design-critic subagent on Opus 5.5, medium effort, against the Figma screens. **Verdict: FAIL on the first pass.** Swap test: copy passes, visuals fail, because without the sphere every screen is a pale-blue Inter page with white cards.

Fixed in Figma, same day:
- S4 sliders were one copied instance: each now has its own unit, range and thumb (elasticity is a two-thumb range). They are detached from the Slider component to allow that. Buybacks added on mobile. Thumb hit area raised to 28px.
- S4 gained the HSP-029 schedule switch and a growth-path control.
- Draft figures are marked "Sample from the draft" with an "Open the query" line on S1, S2, S4 and mobile S1 (FR-13 is still only a design: the Number sheet is not drawn).
- S2 used two swap sizes: now one ($10k, 20.3 bps). The split has a swatch per row, and rows for NEAR revenue, buyback and unexplained, shown as not traced yet.
- S1: verdict moved into the readings strip, one primary button, the GitHub link is plain text, and the gap in the figure labels became "short each month". The threshold panel now carries ticks for both thresholds.
- S3 states the count and has an axis-and-band placeholder instead of a dashed box; S5 uses `<day>` and a Copy button per command.
- New states: S5 anchored and mismatch, S1 stale data and S1 loading.

**Decided 31 Oct 2026 (critic finding 9):** the user said yes: the threshold gauge is the signature. Rebuilt S1 around a Threshold gauge component (a $0 to $25B bar: today filled, ticks at the two thresholds, a bracket and large figure for the gap), flat ruled readings instead of glass cards, Overpass for gauge labels only. S4 and mobile S1 use it too; S2 got a percentage scale. Tabular figures are not settable in Figma and must be done in CSS. Second review (Opus 5.5, medium): FAIL narrowly, swap test PASS. Its follow-ups are fixed: stale and loading states rebuilt from the new S1 (loading hides the derived multiplier and verdict), issuance tick labels now match the linear scale, sample note moved above the headline, S2 reframed as a $10,000 swap in dollars and cents, S5 anchored and mismatch show hashes and a transaction link, mobile S1 gauge has axis ends. Not re-reviewed after these last fixes.

**Was open at first review (now superseded by the paragraph above):** the screens still do not draw anything about fees. The critic suggests making the threshold gauge the signature (a line and a fill-to-threshold bar on every figure) in place of generic glass cards, and using tabular figures plus a second face for labels. This changes the chosen direction F, so it is the user's call at G4.

Also open: no Number sheet design yet, no error states for S2 to S5, mobile menu panel not drawn, contrast values are estimates from hex codes.

## Screen inventory (draft)

The site has no wallet connect, so the workflow's wallet states don't apply. On-chain states are on S5: anchored, not yet anchored, mismatch.

| ID | Name | FRs |
| --- | --- | --- |
| S1 | Headline | FR-10, FR-12, FR-13, FR-15 |
| S2 | Follow the fee | FR-05, FR-13 |
| S3 | Elasticity | FR-06, FR-07, FR-08, FR-13 |
| S4 | Model | FR-10, FR-11 |
| S5 | Reproduce | FR-02, FR-14 |
| S6 | Concentration (Should) | FR-09, FR-19 |
| S7 | What would move each reading (Should) | FR-19 |
| S8 | Method (Should) | FR-18, FR-19 |
| Sheet | Number sheet: plain-language line and query link | FR-13 |
| Banner | Stale data and sampler gap | NFR-6 |

## Copy rule (31 Oct 2026)

Title Case for headings, nav items, buttons, row and field labels and status tags. Sentences, captions and values stay in sentence case. Applied to the Figma file (Screens F and Components F) and to the prototype on the same day.

**31 Oct 2026, sphere restored (user's request):** the glass sphere from tile F is back on the three desktop S1 frames (normal, stale, loading) at 75% scale behind the headline and left of the Verdict block, and on the S1 page in the prototype. It is still the vector stand-in. The gauge stays the signature. Not on the 375px screens; not on S2 to S5.

## Full Figma pages for G4 (31 Oct 2026, V5)

Page `Screens F` now holds every screen in the inventory. Added today, all assembled from the existing components and tokens:
- Phone (375px): S2 Follow the Fee, S3 Elasticity (underpowered), S5 Reproduce, mobile menu panel. S1 and S4 were already there.
- Error states (desktop): S2, S3, S4, S5. Each uses the Banner (Error) and a Try Again button; S4 keeps its inputs and result and replaces only the gauge.
- Should pages (desktop): S6 Who Brings the Volume? (concentration table by swap size, 77% card), S7 What Would Move Each Reading (five Reading cells with the Bullish and Bearish conditions), S8 How the Numbers Are Made (sources, pre-registration, reconciliation table).
- Number sheet (desktop): side sheet over S2 with the plain-language line, source and query link.

Draft copy to confirm with the human: S7's Bullish and Bearish conditions are my reading of each reading's meaning, with the levels left to the pre-registration. S8's "Why They Differ" lines come from SRS section 1.3 (draft $15.8B at $4.97 against $13.7B at $4.34; the $177M a day figure from TronWeekly, Apr 2026, with NEAR at $1.35). The buyback share and cumulative volume rows say "Still to collect".
Not drawn: phone versions of S6 to S8 and of the error states; hover and focus states.

## Critic review of the full pages (31 Oct 2026, V5)

Reviewer: design-critic subagent, Opus, medium effort, on screenshots of all 23 frames. **Verdict: FAIL.** Swap test: S1 and S4 pass; the other screens read as white cards on a pale page with the gauge missing. Contrast was not measured.

Fixed the same day in Figma (checked against the files first):
- Copy that read as a result: S8 now says "will re-run with npm run verify" (the command is a stub), "to be hashed each day", and "Ours (Sample)"; the 36% reading says "sample".
- S2 bar was drawn at 94.7% for the app fee against a true 98.5%: now true scale, slivers 2 px minimum (phone too).
- S1 loading: no "Not Measured" tags while loading, links and button dimmed, headline "—× Today", and the skeleton is drawn in the shape of the gauge.
- Way in: "Method" added to the nav (S6 to S8 sit under it, with underlines recomputed on every frame) and to the mobile menu; S1 links to S6 and S7; S8 has a "More on This Site" row; the S2 figure has a dotted underline (opens the Number sheet).
- S4: "Custom" segment, elasticity slider shown dimmed with "Does not change the result yet"; phone version gets the compact gauge, the Revenue-Maximizing Fee row, a "1.6% if the vote passes" caption and spacing; the desktop button no longer overlaps the panel.
- Errors: specific titles (Quotes, Fee-Change List, NEAR Testnet), "Show Last Good Sample" on S2, a next step and GitHub report link on the S5 mismatch, one phone error frame.
- Sphere moved and reduced so it clears the nav and the body text; footers on the 72 px gutter; S2 number card in a right column; S5 card padding; one footer string; "Open the Query", "$0.00" and "10 Nov 2026" made consistent.

Not changed, for the human to decide at G4:
- The signature gauge appears only on S1 and S4. The critic suggests drawing S2's bar, S3's chart and S6's 77% in the gauge's language (thin track, Overpass ticks). This changes the look of those pages.
- Gold carries four meanings (gauge gap, Protocol Fee swatch, Unexplained note, stale banner); the critic suggests keeping it for the gap only.
- Button icons: a chevron sits on Copy, Close and Try Again; the hamburger stays when the menu is open.
- Reading cells are indented 12 px from their rule; status tags do not share a baseline.
Not re-reviewed after these fixes.

## Gauge-style alternates, "version B" (31 Oct 2026, for G4)

The human asked to see the critic's suggestion drawn as extra versions, not replacing anything. Four frames sit in a row below the rest of Screens F (y = 8700), next to nothing else; the originals are unchanged:
- S2 version B (51:514): the cost split as a thin track with a callout tick and 0 to 100% Overpass scale, in the gauge's language. The six rows below it are unchanged.
- S3 version B (51:604): the empty chart is now a date axis with the 30 real fee changes from `data/census/fee-events-sample-2026-10-30.json` (15 Oct 2025 to 15 Oct 2026, duplicates on the same day overlap) and a dashed band for the smallest effect it could see.
- S6 version B (52:591): the 77% card as a thin track with a dashed (unconfirmed) fill.
- S4 error version B (52:662): the gauge stays with both thresholds and a dashed "Today: Not Loaded" bar; only the fill and the gap are hidden.
Phone versions of these were not drawn. If chosen, the originals are replaced by these in the prototype.

**31 Oct 2026, slider handles:** in Figma the handles were 28 px circles cropped by their 8 px track frame, so they looked like small dark pills. Clipping is now off on the Slider component and on the four S4 frames (desktop, 375px, error, error version B), so they draw as round dots, as in the prototype. Checked on S4 desktop only.

## G4 passed (31 Oct 2026)

The human approved the full Figma pages ("I agree to everything"). Decisions recorded:
- Version B is final for S2 (cost bar), S3 (fee-change axis), S6 (77% bar) and the S4 error page (gauge kept). The old frames are kept, renamed "(desktop, old)", in a row at y = 10300 of Screens F. Nothing was deleted.
- Gold is for the gauge gap and warnings only: on S2 the Protocol Fee swatch and bar piece are now the muted text colour, and the Unexplained banner has a muted outline. Stale, gap and error banners keep their warning colours.
- The open mobile menu shows an X.
- Still not changed: the chevron on Copy, Close and Try Again; phone versions of S6 to S8, the version B pages and the error states; hover and focus states.
- Next: P3f, the local prototype brought in line with these pages, and docs/TESTS.md.

## S3 redrawn for the real result (1 Nov 2026, U5)

The S3 frames showed the sample state ("Not enough fee changes to say yet", 30 sample ticks, a "shown once the list is frozen" box). With the real result in, the page was redesigned in code with the human's feedback, then Figma was redrawn to match it. Layout, in this order:
- **Top row, two white cards of equal height, 32 px apart:** left "Underpowered" (Overpass Bold 20, then three short lines: the result with the number in Medium weight, how to read -1, pass-through), right "Where the Answer Sits" (the new interval plot: dot = estimate, blue bar = 95% interval, pale band = effects too small to tell from chance, markers at 0 and -1, a one-line key).
- **Checks card, full width, two columns** (placebo dates, drop the largest, 2 and 10 bps shifts, exploit-pause run, 30-day windows, "Not Run" for the CoW control).
- **Date chart card:** "22 Frozen Fee Changes" with the 22 real ticks, then "Smallest effect it could see: 1.21". All gaps are 32 px (24 px on phone).
- All three cards use the same white card style and title style (Overpass Bold 20), so the old pale "empty state" card is no longer used on S3. The "Not enough fee changes" copy stays in code for fewer than 3 usable events and was not redrawn.
- Frames: new desktop `S3 Elasticity: underpowered (desktop)` (62:583) and phone `S3 Elasticity: underpowered (375px)` (63:592). The previous versions are kept, renamed "(desktop, old 2)" (51:604, y = 10300, x = 3080) and "(375px, old)" (39:440, x = 4700, y = 10300). The S3 error frame (40:443) is unchanged; it was not redrawn.
- Numbers on the frames are the first real run (`data/published/elasticity.json`); they change if the pipeline is re-run.
- New component in code: `components/IntervalPlot.tsx`. In Figma it is built from plain shapes on the frame, not yet a reusable component. Checked in Chrome at desktop width and 375 px; the Figma frames were compared to the page by eye, not pixel by pixel.

## Reference checklist: DESIGN-REFERENCE-3.md (2 Nov 2026, V10 P3a)

The human found the built UI does not use the reference directly. Status below is the code before the revision, read from `app/globals.css`, `app/layout.tsx`, `app/page.tsx` and `components/Nav.tsx`; it has not been compared in a browser.

| Item | Reference | Built today | Status |
| --- | --- | --- | --- |
| Background | Looping 10 s video plate with poster, fixed to the viewport, `.tint` over it | `sphere.svg` vector, S1 only, hidden on phones; CSS gradient page | Missing |
| Reduced motion for video | Hold frame 1, follow the setting live, resume on tab visible | None | Missing |
| Scale system | Every size is `calc(N*var(--u))` from a 1280x960 comp; `--t` floor on phones | Fixed px and two `vw` values | Missing |
| Layout | One full-viewport hero, never scrolls, absolute `--x`/`--y`, `.sx` optical tracking | Scrolling page in a 1440 wrap | Missing |
| Colour tokens | `--ink`, `--muted`, `--frame`, `--cta`, `--cta-knob`, `--accent`, `--track` | Mostly the same values | Done; `--muted`, `--muted2`, `--ink-soft`, `--meet-knob` not all used |
| Font | Inter variable 100-900, exact weights 200, 360, 400, 425, 470, 500, 520, 570 | Inter 200, 300, 400, 500, plus Overpass and Overpass Mono | Changed |
| Nav pill | 293x67 glass capsule, blur 40, icons, divider, 2 items | Solid white pill, 5 text items | Changed |
| Primary CTA | 217x70 with 49 knob, shadow | 46 high with 30 knob, no shadow | Changed |
| Hero type | h1 98/90 weight 360, eyebrow 16/470, tag 24/470 with play button | h1 92 weight 300, no play button | Changed |
| Glass panel | 275x271, gradient, blur, saturate, inset highlights, title, dot, shield, scale, meter | No panel; plain Verdict text. `.glass` is a solid white card | Missing |
| Stats row | Two 100/200 figures, labels, gradient slash | None on S1 | Missing |
| Meet pill | 269x86 glass, sphere thumbnail, knob | None | Missing |
| Responsive | Three tiers keyed to frame shape, compact landscape, rotated phone | One 900px breakpoint | Changed |
| Burger menu | Glass panel, animated X, closes on outside click, Escape, link, rotate | Plain panel, X; no Escape or outside click | Changed |
| Hover and focus | Lift -2u; focus `#2f5f9e` | Colour change; focus uses accent | Changed |
| Entrance motion | WAAPI timeline, 4 behaviours, exact order, removes itself | None | Missing |

Problems to settle before building (V10 P3a step 2):
- The video and poster sit on someone else's CloudFront account. Both answered HTTP 200 on 2 Nov 2026 (4.7 MB and 0.97 MB). The license is not stated in the reference.
- ConSentinel's name, logo, copy, 112+ and 55K+ must not ship (rule 10).
- The reference never scrolls and has one screen. This site has the gauge, five readings and eight pages.
- The nav pill holds 2 items and this site has 5 links.
- The play button has no video to open, and "Meet Sentinel" has no equivalent here.
- The G4 decisions (gauge as signature, Overpass labels) are not in the reference.
- The slop checklist bans Inter everywhere and glassmorphism everywhere unless deliberately justified. The reference requires both, so the justification is the human's explicit pick.

Decided by the human, 2 Nov 2026: copy the video and poster into `public/media/` (license still unknown); exact hero first, then scroll; full theme on every page with calmer motion; keep the gauge, Inter only (Overpass removed, Overpass Mono stays for commands).

Built 2 Nov 2026, styles in `app/reference.css`. This replaces Figma as the source for the look: the Figma frames no longer match the site. Every checklist row above is now done, except these deliberate changes:
- Content swapped (rule 10): Tideline name, copy and numbers; logo is still the placeholder mark; the shield is replaced by that mark. "Get free plan" is GitHub Repo, "Meet Sentinel" is Open Model.
- Page scrolls below the hero, and the inner pages use px rather than `--u`, so short windows do not shrink their text. Their glass is more opaque than the reference (.74 to .52, not .44 to .16) so tables stay readable.
- Nav pill width follows 5 links (reference: 293 for 2). Item spacing is flex, not measured offsets. The burger also shows on short landscape phones. The menu has no icons.
- Stat label and slash positions moved right, because $3.9B is wider than 112+. Mobile h1 is 59 (reference 66), to fit the longer headline. The rotated-phone scale from the reference is used as written.
- The play button goes to the gauge, because there is no video to open.
- The panel meter scale is linear ($0 to $30B), so its fill is true to scale. The reference's scale is not linear.

Checked in Chrome on 2 Nov 2026 in same-origin frames sized 1440x900 and 375x812: S1, S2, S3, S4, S5, S6, S8 at 1440 (S7 not opened), S1, S2, S4, S8 at 375 (S3, S5, S6, S7 not opened). All eight pages measured no sideways overflow at both sizes. Video plays, menu opens and closes on Escape. Not checked: text contrast measured over the video (by eye only), speed on a slow phone, `?state=stale` and `?state=loading`, entrance timing frame by frame. The design critic has not re-reviewed it.
