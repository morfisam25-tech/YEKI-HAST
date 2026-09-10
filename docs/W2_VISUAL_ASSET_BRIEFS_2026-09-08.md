# W2 Visual Asset Briefs — 2026-09-08

Project: Listener APP / «یکی هست»  
Locked source RC: `release/wave1-global-rc-20260908` @ `839edf37daaa613deb995117164fb99e7f71d4d1`  
W2 branch: `visual/w2-wave1-global-rc-20260908`

## Direction locked for this pass

Warm orange, amber and coral light over cream and deep-dusk neutrals. The emotional sequence is quiet loneliness → being heard → relief. The imagery must feel human and adult, without therapy, dating, medical, crisis or nightlife cues. No generic stock-photo expressions and no crying close-ups.

The current web pass uses lightweight CSS-generated scene placeholders so the brand system, spacing, hierarchy and responsive behavior can be judged before final imagery is approved. These placeholders are intentionally not presented as final photography or illustration.

## Final asset briefs

### 1. Homepage hero — “someone is there”

A quiet apartment at dusk. One adult Persian-speaking user is seen from the side or slightly from behind, seated near a window with a phone nearby or discreet earbuds. The face does not need to be identifiable. Warm amber practical light inside; coral sunset fading into deep dusk outside. The person should read as alone but composed, not distressed. Leave clean negative space for Persian copy and CTA.

- Mood: intimate, calm, private, hopeful
- Avoid: tears, head-in-hands pose, therapy couch, medical symbols, flirtatious body language, dating-app framing
- Master crop: portrait-leaning 4:5 or 3:4, crop-safe for mobile hero
- Deliver: 1600 px long edge master plus 960 px derivative; AVIF/WebP

### 2. Story scene — “before speaking”

Late-night room/window vignette with one warm light and a strong dusk exterior. Human presence may be implied through a shoulder, hand, chair or cup rather than a full face. The visual should express “I have something to say” without dramatizing sadness.

- Master crop: 16:7 with a 4:3-safe central crop
- Deliver: 1600×700-ish master plus 960 px derivative; AVIF/WebP

### 3. Story scene — “being heard”

Two human presences shown through restrained composition rather than literal face-to-face counseling. They may be separated spatially by phone/audio context. Attention should be visible in posture and stillness. Use warm midtones, soft reflected amber, cream surfaces and deep-dusk accents.

- No romantic proximity or physical intimacy
- No headset/call-center cliché
- Master crop: 16:7 with 4:3-safe central crop
- Deliver: 1600×700-ish master plus 960 px derivative; AVIF/WebP

### 4. Story scene — “afterwards”

Early dawn or a room becoming lighter: open curtain, soft daylight, warm cup, relaxed shoulders or a cleared surface. Relief should come from light and posture, not a staged smile or “problem solved” expression.

- Master crop: 16:7 with a 4:3-safe central crop
- Deliver: 1600×700-ish master plus 960 px derivative; AVIF/WebP

### 5. Future Founder video poster

Use only an approved Founder photo/video still supplied for the project. Half-body or seated portrait in a simple cream/deep-dusk set with a warm rim light. Calm direct presence; no corporate keynote look. Reserve safe center space for a simple play control and short title. This is a poster slot only; W2 does not enable autoplay or audio.

- Aspect ratio: 16:9
- Deliver: 1600×900 and 960×540; AVIF/WebP poster
- Do not fabricate or generate a likeness without an approved source image

## Performance and accessibility constraints

- Prefer AVIF with WebP fallback where the implementation path supports it.
- Keep decorative hero imagery responsive and crop-safe; meaningful imagery needs useful alt text when introduced as `<img>`/`Image` content rather than CSS decoration.
- No autoplay audio. Motion must stay subtle and respect `prefers-reduced-motion`.
- Do not put essential product truth inside imagery.
- Final assets should be compressed before release QA; avoid multi-megabyte hero media.

## Breakpoint review targets

Mobile: 360 / 390 / 430 px  
Tablet: 768 / 820 / 1024 px  
Desktop: 1440 px reference

Final imagery must be rechecked at these exact widths after assets replace the CSS placeholders.
