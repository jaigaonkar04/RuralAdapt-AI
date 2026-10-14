# RuralAdapt AI — Full Farmer-First MVP

**Global Ideas. Local Solutions.** This is an update of the existing React + Vite + Express + Gemini project. It retains the existing application structure and does **not** include automated WhatsApp Business API/webhook integration.

## Included

- Responsive React interface with mobile navigation and larger-text accessibility toggle.
- Guest access to the problem-solving workflow; optional account registration/login for saved solutions and farm profile.
- Adaptation Ladder: **Traditional → Low-Cost → Community → Smart**.
- Farmer problem workflow with crop/activity, farm size, broad location, budget, water, electricity and optional environment details.
- **Soil report auto-fill:** upload a soil report photo or PDF from the solution form; Gemini extracts readable values, the farmer can edit values/units, then confirms to populate the Soil Analysis context used for recommendations. Missing or unclear values are not guessed. Manual entry remains available.
- Dedicated soil-report analysis with reported parameters, limitations, potential crop options and suggested additional tests.
- Crop/farm photo assessment with image-clarity check, visible observations and possible causes. Farmer confirmation is required; this is not a definitive diagnosis.
- Language preference for AI recommendations: English, Hindi, Marathi or Konkani. Browser voice input/output depends on browser/device language support; the interface itself is currently in English and text remains available.
- Traditional-first AI recommendations with explicit data used, missing data, constraints, pilot steps and risks.
- Private-by-default local case records; separate explicit opt-in for minimized anonymized shared learning; similar-case search limited to consented cases; optional outcome feedback.
- Optional user accounts, farm profile, saved solutions and history.
- `supabase_schema.sql` as the planned Supabase database starting schema.
- A WhatsApp share link for manually sharing a solution summary only. **Automated WhatsApp integration is not included**, as requested.

## Run locally

1. Install Node.js 20 or newer.
2. Open a terminal in the project directory and run `npm install`.
3. Create a `.env` file in the project root. Add the variables below, replacing the Gemini placeholder with your API key. `GEMINI_API_KEY` is needed for AI recommendations and image/report analysis; the app can start without it, but those endpoints will be unavailable.
4. In terminal 1, run `npm run server`.
5. In terminal 2, run `npm run dev`.
6. Open the local URL shown by Vite.

Never place the Gemini key in frontend code or share it in chat.

## Environment variables

```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
JWT_SECRET=replace-with-a-long-random-secret-of-at-least-32-characters
```

`PORT`, `GEMINI_MODEL`, and `JWT_SECRET` have development defaults. Set a unique, strong `JWT_SECRET` (at least 32 characters) for any hosted deployment; the server refuses the default/short secret in production mode.

## Data storage and deployment status

This MVP currently stores accounts, cases, saved solutions and analysis records in `data/db.json`. The Supabase schema is provided, but hosted Supabase/PostgreSQL and Storage are **not connected automatically** because the project needs your own Supabase project credentials and deployment-specific access policies. Do not expose this local JSON prototype publicly with real private farmer data.

Before a real pilot or public deployment:

1. Create a Supabase project and run `supabase_schema.sql`.
2. Create a private Storage bucket for farmer reports/photos.
3. Add server-side Supabase credentials only; never expose the service-role key to the React client.
4. Implement and test ownership policies, Row Level Security, secure guest-case access, consent withdrawal, deletion/retention controls, rate limiting and production secret management.
5. Verify supported report types and image handling with sample files before real farmer use.

## Responsible-use notes

- Extracted soil values must be checked against the original report before use. Missing/unclear values stay missing.
- A soil report alone cannot guarantee crop suitability; water, climate, drainage, season and other conditions may matter.
- Crop photo observations are not a confirmed diagnosis. Verify high-impact agricultural decisions with local agricultural extension services or qualified experts.
- Similar farmer cases are not proof that a solution will work in every setting. Farmer-reported outcomes and expert-reviewed evidence must remain clearly distinguished.
- Conduct genuine farmer interviews and pilot tests before claiming effectiveness.
- Automated WhatsApp Business API/webhook integration is intentionally left for a later phase after deployment.
