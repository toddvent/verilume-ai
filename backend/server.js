From 77427b19dd3a9f27b7aa0a4b2c85ba6eac631aa3 Mon Sep 17 00:00:00 2001
From: Claude <noreply@anthropic.com>
Date: Thu, 3 Sep 2026 17:10:14 +0000
Subject: [PATCH 1/2] Harden AI-vendor calls with request timeouts
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

Every direct AI-vendor fetch call in backend/server.js used a bare
fetch() with no AbortController, so a vendor that hung — no HTTP
error, just never resolving — could block whichever request awaited
it indefinitely. Against Vercel's function duration ceiling, that
surfaces as a 504 FUNCTION_INVOCATION_TIMEOUT (Vercel's own HTML
error page, not JSON — the root cause behind a "not valid JSON" parse
error seen client-side on POST /api/ops/vendor-blind-panel).

Adds fetchWithTimeout() (AbortController, 45s default, same pattern
fetchAndExtractPage() already used for the website-crawl case) and
repoints all 20 direct AI-vendor fetch calls onto it: Anthropic,
OpenAI, Gemini, x.ai, and Perplexity, across assessment readouts, the
brand voice contest, copywriting interview panels, the PR contest,
and the vendor-blind-panel route.

The vendor-blind-panel route's five vendor calls also now run in one
Promise.all instead of awaiting Anthropic before the other four in
sequence, so total wall-clock is bounded by the slowest single call
rather than a sum.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158uhiz7A1d1ysUcVrUYpFy
---
 backend/server.js | 132 +++++++++++++++++++++++++++++++++-------------
 1 file changed, 96 insertions(+), 36 deletions(-)

diff --git a/backend/server.js b/backend/server.js
index 29aec99..e746ed5 100644
--- a/backend/server.js
+++ b/backend/server.js
@@ -1929,6 +1929,33 @@ const BRAND_VOICE_PRIMARY_BRIEF = {
 // configured/not-configured check, reused rather than duplicated since it's
 // the exact same credentials either way.
 //
+// 2026-09-03 fix, per the vendor-blind-panel 504 investigation — every AI
+// vendor call in this file (Anthropic direct, and the 4 vendors in
+// callVendorForText below) used a bare `fetch()` with no AbortController, so
+// a vendor that simply hung — no HTTP error, no response, ever — blocked
+// whichever request awaited it indefinitely. Against Vercel's function
+// duration ceiling, that surfaces as a 504 FUNCTION_INVOCATION_TIMEOUT
+// (Vercel's own HTML error page, not JSON — the actual root cause behind a
+// "not valid JSON" error seen client-side). fetchAndExtractPage() already
+// had this pattern right (8s AbortController) for the website-crawl case;
+// this is the same fix generalized so every direct vendor fetch in the file
+// shares one timeout behavior instead of each call site reinventing it.
+// 45s default: generous for a single completion call, small enough that
+// even several such calls in sequence (see the interview/contest panels,
+// which call multiple vendors) stay well under the 120s function ceiling.
+async function fetchWithTimeout(url, options, ms = 45000){
+  const controller = new AbortController();
+  const timer = setTimeout(() => controller.abort(), ms);
+  try {
+    return await fetch(url, { ...options, signal: controller.signal });
+  } catch (e){
+    if (e.name === 'AbortError') throw new Error(`Request to ${url} timed out after ${ms / 1000}s`);
+    throw e;
+  } finally {
+    clearTimeout(timer);
+  }
+}
+//
 // "Critical customer-facing messages" — per direct instruction, derived from
 // this account's EXISTING brand inputs rather than a new required field:
 // Products & Services (what to actually talk about) and the approved Brand &
@@ -1988,7 +2015,7 @@ ${context}
 
 Respond with ONLY a JSON object with two fields:
 {"visionStatement": "<a single, memorable 1-2 sentence vision statement for this brand's voice — the north star, not a tagline>", "longformExample": "<120-200 words of real, finished longform copy in this voice, written as if it were the opening of a real customer-facing piece (e.g. a welcome email or About page) — must naturally incorporate the critical customer-facing messages above, not just describe them>"}`;
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: angle.model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
@@ -3305,7 +3332,7 @@ Do NOT guess at anything you cannot see in these specific frames — no invented
 
 Respond with ONLY a JSON object: {"analysis": "<2-4 sentences, written as a usable brand-voice reference note>", "onScreenText": ["<verbatim on-screen text you actually saw, if any>"]}`;
 
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({
@@ -6969,7 +6996,7 @@ async function scoreContentRelevance(page, campaign){
   if (!process.env.ANTHROPIC_API_KEY) return { score: null, note: 'AI content relevance scoring requires ANTHROPIC_API_KEY to be configured.' };
   try {
     const prompt = `You are scoring whether a landing page's actual content matches a marketing campaign's intended messaging. Campaign objective: ${campaign.objective || '(not set)'}. Campaign key message: ${campaign.keyMessage || '(not set)'}. Campaign long-form copy: ${(campaign.longformCopy || '').slice(0, 1500) || '(not set)'}.\n\nLanding page title: ${page.title}\nLanding page headline: ${page.headline}\nLanding page body text: ${page.bodyText.slice(0, 2000)}\n\nScore 0-100 how well the landing page's actual content matches the campaign's intended messaging and objective. Respond with ONLY a JSON object: {"score": <0-100 integer>, "rationale": "<one sentence>"}`;
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
@@ -6998,7 +7025,7 @@ async function scoreImageRelevance(imageUrl, campaign){
     if (buf.length > 5_000_000) return { score: null, note: 'Hero image is too large to score (over 5MB).' };
     const b64 = buf.toString('base64');
     const prompt = `You are scoring whether a landing page's hero image matches a marketing campaign's intended brand and messaging. Campaign objective: ${campaign.objective || '(not set)'}. Campaign key message: ${campaign.keyMessage || '(not set)'}. Brand tone notes: ${campaign.brandToneNotes || '(not set)'}.\n\nScore 0-100 how well this image fits that campaign's brand and messaging. Respond with ONLY a JSON object: {"score": <0-100 integer>, "rationale": "<one sentence>"}`;
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({
@@ -7150,7 +7177,7 @@ ${draftCopy.slice(0, 3000)}
 Score 0-100: how likely is this specific copy, as written, to actually produce the Loop Stage's real business outcome for this Primary KPI — not whether it sounds nice, not whether it uses expected keywords, but whether a real reader in this audience would plausibly take the intended next action after reading it. A technically polished paragraph that never gives the reader a reason or a path to act should score LOW even if it is well-written. Copy that is bluntly written but unmistakably drives toward the right action for this stage should score HIGH.
 
 Respond with ONLY a JSON object: {"score": <0-100 integer>, "verdict": "<one of: strong, adequate, weak, off-target>", "rationale": "<2-3 sentences, specific to this draft, explaining the score in terms of actual likely reader behavior, not word choice>", "missingElements": ["<short phrase naming a concrete missing element, if any — e.g. 'no concrete next step for the reader'>", "..."]}`;
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
@@ -7586,7 +7613,7 @@ Respond with ONLY a JSON object: {"copy": "<the full drafted copy, paragraphs se
         // fall through to Anthropic below on an unparseable/empty response
       } catch (e){ /* fall through to Anthropic below */ }
     }
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
@@ -7779,7 +7806,7 @@ async function generateAssessmentReadout(input){
   }
   try {
     const prompt = buildAssessmentReadoutPrompt(input);
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 900, messages: [{ role: 'user', content: prompt }] })
@@ -7946,7 +7973,7 @@ async function draftPrCorpCommCopyViaAI(account, docType, brief){
         }
       } catch (e){ /* fall through to Anthropic below */ }
     }
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
@@ -7990,7 +8017,7 @@ ${pressRelease.workingCopy}
 FORMAT: A LinkedIn-native post — short punchy opening line (not the press release's dateline lede), 3-5 short paragraphs or a mix of short paragraphs and a brief line-broken list, plain conversational register appropriate for a feed rather than a wire service, ending with a clear call to action. Include 2-4 relevant hashtags on their own line at the end. 100-200 words, not counting hashtags.
 
 Respond with ONLY a JSON object: {"copy": "<the full LinkedIn post text, hashtags included>"}`;
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
@@ -8066,7 +8093,7 @@ TASK — respond with ONLY a JSON object in this exact shape:
 }
 ${competitors.length === 0 ? 'No competitors are named for this account, so return an empty "competitors" array — do not invent competitor names.' : `Include exactly one entry per named competitor above, in the same order, using their exact given names.`}`;
 
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1400, messages: [{ role: 'user', content: prompt }] })
@@ -8163,7 +8190,7 @@ async function runPrCandidateInterview(account, docType, brief){
     return { available: false, note: built.error, recommendedKey: null, candidates: [] };
   }
   const { prompt } = built;
-  const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
+  const anthropicResp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
     body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
@@ -8372,7 +8399,7 @@ ${campaign.mandatoryPhrase ? `MANDATORY PHRASE (required verbatim, word-for-word
 
 COPY TO SCORE:
 ${copyText.slice(0, 2000)}`;
-      const resp = await fetch('https://api.anthropic.com/v1/messages', {
+      const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
         body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
@@ -8488,7 +8515,7 @@ async function callVendorForText(vendorKey, prompt){
     return new Error(bodyText ? `HTTP ${resp.status}: ${bodyText}` : `HTTP ${resp.status}`);
   }
   if (vendorKey === 'openai-gpt'){
-    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
+    const resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
       body: JSON.stringify({ model: v.model, messages: [{ role: 'user', content: prompt }] })
@@ -8508,7 +8535,7 @@ async function callVendorForText(vendorKey, prompt){
     // GEMINI_MODEL is env-overridable specifically so this can be corrected
     // without a code change once vendorHttpError()'s response body below
     // names the actual bad model string.
-    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(v.model)}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
+    const resp = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(v.model)}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
@@ -8523,7 +8550,7 @@ async function callVendorForText(vendorKey, prompt){
     // POST /v1/responses, body {model, input}. The exact success-shape
     // (output_text vs. a structured output[] array) isn't confirmed against
     // live traffic here, so both documented shapes are tried in order.
-    const resp = await fetch('https://api.x.ai/v1/responses', {
+    const resp = await fetchWithTimeout('https://api.x.ai/v1/responses', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
       body: JSON.stringify({ model: v.model, input: prompt })
@@ -8535,7 +8562,7 @@ async function callVendorForText(vendorKey, prompt){
     return '';
   }
   if (vendorKey === 'perplexity'){
-    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
+    const resp = await fetchWithTimeout('https://api.perplexity.ai/chat/completions', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` },
       body: JSON.stringify({ model: v.model, messages: [{ role: 'user', content: prompt }] })
@@ -8596,7 +8623,7 @@ Respond with ONLY a JSON object: {"copy": "<the full drafted copy, paragraphs se
 async function generateInterviewCandidateCopy(angle, campaign, account, sampleContext){
   try {
     const prompt = buildInterviewPrompt(angle.brief, campaign, account, sampleContext);
-    const resp = await fetch('https://api.anthropic.com/v1/messages', {
+    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
       body: JSON.stringify({ model: angle.model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
@@ -10602,7 +10629,7 @@ async function handleRequest(req, res) {
 
       async function callAnthropicText(promptText){
         try {
-          const resp = await fetch('https://api.anthropic.com/v1/messages', {
+          const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
             body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 700, messages: [{ role: 'user', content: promptText }] })
@@ -10618,25 +10645,60 @@ async function handleRequest(req, res) {
         }
       }
 
-      const candidates = [];
-      if (process.env.ANTHROPIC_API_KEY){
-        const r = await callAnthropicText(prompt);
-        candidates.push({ key: 'anthropic-claude', vendor: 'Anthropic', model: 'claude-sonnet-4-5-20250929', text: r.text, error: r.error });
-      } else {
-        candidates.push({ key: 'anthropic-claude', vendor: 'Anthropic', model: null, text: null, error: 'not configured — ANTHROPIC_API_KEY not set' });
+      // 2026-09-03 fix, per timeout investigation — this used to await the
+      // Anthropic call FIRST, then Promise.all the other four, so total
+      // wall-clock was anthropic_time + slowest_of(other 4) on top of the
+      // crawl above, all against a 120s serverless ceiling. Worse: none of
+      // the vendor fetches (here or in callVendorForText) carry an
+      // AbortController, so a single vendor that hangs — no HTTP error, just
+      // never resolves — blocks the whole request indefinitely instead of
+      // failing that one card. That combination is what was producing the
+      // 504 FUNCTION_INVOCATION_TIMEOUT (Vercel's HTML error page, not JSON,
+      // which is why the frontend saw "Unexpected token 'A'... is not valid
+      // JSON" — a downstream symptom of this, not a JSON-handling bug).
+      // Fixed two ways: every vendor call (including Anthropic) now runs in
+      // the same Promise.all so total time is the slowest single call, not a
+      // sum; and withTimeout() below races each call against a 45s cap so
+      // one hung vendor degrades to an error card for that vendor instead of
+      // timing out the whole panel. 45s * (one still-sequential retry
+      // ceiling never happens here — each call fires once) comfortably fits
+      // under the 120s function ceiling alongside the ~8s crawl above.
+      const VENDOR_CALL_TIMEOUT_MS = 45000;
+      function withTimeout(promise, ms, label){
+        return new Promise((resolve) => {
+          const timer = setTimeout(() => resolve({ __timedOut: true }), ms);
+          promise.then(
+            (v) => { clearTimeout(timer); resolve(v); },
+            (e) => { clearTimeout(timer); resolve({ __error: e }); }
+          );
+        });
       }
-      const registryResults = await Promise.all(INTERVIEW_VENDOR_REGISTRY.map(async v => {
+
+      const anthropicCall = process.env.ANTHROPIC_API_KEY
+        ? (async () => {
+            const r = await withTimeout(callAnthropicText(prompt), VENDOR_CALL_TIMEOUT_MS, 'anthropic-claude');
+            if (r && r.__timedOut){
+              return { key: 'anthropic-claude', vendor: 'Anthropic', model: 'claude-sonnet-4-5-20250929', text: null, error: `Generation timed out after ${VENDOR_CALL_TIMEOUT_MS / 1000}s` };
+            }
+            return { key: 'anthropic-claude', vendor: 'Anthropic', model: 'claude-sonnet-4-5-20250929', text: r.text, error: r.error };
+          })()
+        : Promise.resolve({ key: 'anthropic-claude', vendor: 'Anthropic', model: null, text: null, error: 'not configured — ANTHROPIC_API_KEY not set' });
+
+      const registryCalls = INTERVIEW_VENDOR_REGISTRY.map(async v => {
         if (!process.env[v.envVar]){
           return { key: v.key, vendor: v.vendor, model: null, text: null, error: `not configured — ${v.envVar} not set` };
         }
-        try {
-          const text = await callVendorForText(v.key, prompt);
-          return { key: v.key, vendor: v.vendor, model: v.model, text, error: null };
-        } catch (e){
-          return { key: v.key, vendor: v.vendor, model: v.model, text: null, error: 'Generation failed: ' + e.message };
+        const r = await withTimeout(callVendorForText(v.key, prompt), VENDOR_CALL_TIMEOUT_MS, v.key);
+        if (r && r.__timedOut){
+          return { key: v.key, vendor: v.vendor, model: v.model, text: null, error: `Generation timed out after ${VENDOR_CALL_TIMEOUT_MS / 1000}s` };
         }
-      }));
-      candidates.push(...registryResults);
+        if (r && r.__error){
+          return { key: v.key, vendor: v.vendor, model: v.model, text: null, error: 'Generation failed: ' + r.__error.message };
+        }
+        return { key: v.key, vendor: v.vendor, model: v.model, text: r, error: null };
+      });
+
+      const candidates = await Promise.all([anthropicCall, ...registryCalls]);
 
       // Same blind-label shuffle as runBrandVoiceContest/runCandidateInterview.
       const shuffled = [...candidates];
@@ -10738,7 +10800,7 @@ ${candidatePaths.join('\n')}
 
 Respond with ONLY a JSON array of the chosen paths, copied exactly as they appear above, e.g. ["/path-one","/path-two"]. If none look relevant, respond with [].`;
         try {
-          const resp = await fetch('https://api.anthropic.com/v1/messages', {
+          const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
             body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 500, messages: [{ role: 'user', content: selectionPrompt }] })
@@ -10822,7 +10884,7 @@ Respond with ONLY a JSON object: {"scaleFormat":{"value":...,"evidence":...},"sp
         extractionError = 'no pages were successfully fetched — nothing to extract from';
       } else {
         try {
-          const resp = await fetch('https://api.anthropic.com/v1/messages', {
+          const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
             body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 900, messages: [{ role: 'user', content: extractionPrompt }] })
@@ -16119,5 +16181,3 @@ if (require.main === module) {
 INIT_PHASE = false;
 
 module.exports = handleRequest;
-
-
-- 
2.43.0


From 13fe05e544d83bc4a839c43cd6eb66f71f0ef195 Mon Sep 17 00:00:00 2001
From: Claude <noreply@anthropic.com>
Date: Thu, 3 Sep 2026 17:10:46 +0000
Subject: [PATCH 2/2] Add .gitignore for local build/runtime artifacts
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

Excludes node_modules/ and local SQLite dev database files — neither
belongs in source control (regenerable dependencies and local runtime
data, respectively).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158uhiz7A1d1ysUcVrUYpFy
---
 .gitignore | 7 +++++++
 1 file changed, 7 insertions(+)
 create mode 100644 .gitignore

diff --git a/.gitignore b/.gitignore
new file mode 100644
index 0000000..419a917
--- /dev/null
+++ b/.gitignore
@@ -0,0 +1,7 @@
+node_modules/
+*.db
+*.db-journal
+*.db-wal
+*.db-shm
+.env
+.env.local
-- 
2.43.0

