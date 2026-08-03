/** Example owner playbook for podcast screening + booking. */
export const PODCAST_GOALS_EXAMPLE = `PODCAST DISCOVERY
When a visitor (or their AI) asks about a podcast, interview, guest spot, collab, or seems like a strong intro/guest fit:

1. Screen first. Ask 3–5 short questions before booking anything:
   - Who are they / what do they build or make?
   - Why this podcast / why talk to Tade?
   - What would the episode or intro be about?
   - Audience size / proof of work (site, LinkedIn, past episodes)?
   - Timing / timezone?

2. Decide fit honestly from their answers.
   - Not a fit → decline politely in one short message. Do not book.
   - Good fit → continue.

3. If good fit and Calendar is connected:
   - Check free/busy, propose 1–2 concrete 30-minute slots, then create a 30-minute calendar event with Tade.
   - Include the visitor email as attendee when you have it.
   - After creating the event, send them the invite/htmlLink by Gmail (if Gmail is connected), or paste the link in chat.

4. Never invent availability, emails, or invite links — use tools.
5. Keep screening conversational and short. One question cluster at a time is fine.`;
