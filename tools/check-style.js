#!/usr/bin/env node
/*
 * check-style.js — catches the exact class of bug behind the "confirm
 * button doesn't match the site" report (2026-09-09): a button (or any
 * element) given a CSS class in markup — including markup built as a JS
 * template string, which is how most of this app's UI is generated — that
 * is never actually defined anywhere in the page's own <style> block.
 * `class="btn-secondary"` was used on six confirm-dialog buttons across
 * portal.html; no `.btn-secondary` rule has ever existed in the CSS, so
 * every one of those buttons silently fell back to unstyled browser
 * defaults instead of the site's real .btn-primary/.btn-ghost pill style.
 * That bug is invisible in a code review unless someone actually greps the
 * stylesheet — this script does that grep, every time, mechanically.
 *
 * This does not replace the judgment calls in
 * claude/cxmedia-design-system-checklist.md (the Claude Project doc) — it
 * only catches the one failure mode that's fully mechanical: a class
 * referenced in markup with no matching rule anywhere in that file's own
 * <style> block. Run it before delivering any change that touches markup
 * in frontend/*.html:
 *
 *   node tools/check-style.js
 *   npm run check-style
 *
 * Exits non-zero (and prints every offending file/class/line) if it finds
 * anything. A clean exit is necessary, not sufficient — it doesn't check
 * whether the RIGHT class was reused (e.g. .field vs. a one-off inline
 * style), only whether a class actually resolves to a rule.
 *
 * 2026-09-09, same day — first run against the live codebase turned up 22
 * more undefined classes beyond btn-secondary, all pre-existing. Every one
 * was triaged individually (not batch-silenced): 9 were real bugs and got
 * fixed (a missing .data-table rule alone covered 36 tables sitewide);
 * the other 13 were verified, not assumed, to already render correctly —
 * each is a pure JS hook/wrapper, or is always paired with a second real
 * class or sits inside an ancestor that supplies its whole visual rule via
 * a descendant selector (".crumb a", ".cfd-input-row input", etc.) — see
 * KNOWN_EXTERNAL_OR_JS_ONLY below for each one's specific reason. The
 * script now runs clean with zero exceptions left unaccounted for.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const TARGET_FILES = ['portal.html', 'ops-console.html', 'account.html', 'onboarding.html'];

// Classes that are legitimately never defined in a page's own <style>
// block: framework/vendor classes injected by a loaded library, or classes
// that are toggled onto elements purely to be *targeted* by JS (visibility
// or lookup) with no visual rule of their own — a real absence, verified,
// not a guess. Extend this list deliberately, with a one-line reason.
const KNOWN_EXTERNAL_OR_JS_ONLY = new Set([
  'tab-pane', // ops-console.html — pure JS hook (querySelectorAll('.tab-pane')); visibility comes entirely from the real .hidden class toggled alongside it, not from .tab-pane itself.

  // 2026-09-09 — the rest of the original baseline (see git history /
  // project doc for the full list this replaced), triaged one by one:
  // 9 were real findings and got fixed (data-table, field-row, toggle-row,
  // kpi-delta, cmp-mmm-li-input, library-row, creative-asset-channel-group,
  // icon-link, cmgmt-search-input — see each one's own comment at its CSS
  // rule and/or call site). These 13 are verified NOT bugs: each is a pure
  // JS hook/semantic wrapper, or every element carrying it also carries a
  // second, real class (or sits inside an ancestor) that supplies 100% of
  // its actual visual rule via a descendant selector — confirmed by
  // reading each one's CSS and markup, not assumed.
  'dash-tab-panel',   // pure visibility wrapper (style="display:none" toggled by switchDashboardTab()); every real component inside is separately styled.
  'crumb-home-link',  // fully covered by the element-descendant rule ".crumb a{color:var(--cx);text-decoration:none;cursor:pointer;}" — the class itself is unused as a selector anywhere.
  'ai-thought-mount',  // pure JS mount point (see renderAiThoughts()/similar) — starts empty, filled with its own separately-classed content.
  'mktcal-filter-search', // always paired with the real, fully-styling ".mktcal-filter-field" class on the same element; this is a bare modifier hook.
  'funnel-rate-cell', // pure grid-item wrapper inside .funnel-rate-grid (display:grid); its children .funnel-rate-label/.funnel-rate-input carry all real styling.
  'msg-col',          // always paired with a real modifier (.msg-col-draft or .msg-col-preview, both defined under #cmpStage-messaging) that supplies the actual layout.
  'msg-improve-card', // always paired with the real, fully-styling ".msg-card" class on the same element; this is a bare modifier hook.
  'cfdWsInput',       // fully covered by the element-descendant rule ".cfd-input-row input{...}" — the class is a querySelectorAll hook (cfdWsSubmit()), not a style target.
  'eff-meter-block',  // pure wrapper; its .eff-meter children carry all real styling.
  'draw-row',         // fully inline-styled at its one call site (updateCmpAllocationDraw rows); class is a semantic/JS marker only.
  'spinner',          // fully inline-styled at its one call site (border/animation/size all inline); distinct from the real, defined .portal-load-cover-spinner / .mini-load-spinner classes elsewhere.
  'mmm-bucket-input', // input sits inside a real ".field" wrapper, styled via ".field input" already; class is a value-read hook (mbuApplyMapping() et al.), not a style target.
  'campaign-type-detail-field', // always paired with the real, fully-styling ".field" class on the same element; this is a bare modifier hook.
  'cmp-mmm-li-input', // kept as the querySelectorAll('.cmp-mmm-li-input') read-back hook alongside the real ".tbl-input" class added 2026-09-09 for the actual styling — the class itself is intentionally never a style target.
]);

function extractStyleBlockClassNames(html) {
  const classes = new Set();
  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  for (const css of styleBlocks) {
    // Strip comments so a class name mentioned only in a /* ... */ note
    // (e.g. this file's own header) never counts as a real definition.
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of stripped.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) {
      classes.add(m[1]);
    }
  }
  return classes;
}

function lineNumberAt(html, index) {
  return html.slice(0, index).split('\n').length;
}

// Removes every `${ ... }` template-literal interpolation from a string,
// with basic brace balancing so a ternary like `${cond ? 'a' : 'b'}` (no
// nested braces) or `${fn({x:1})}` (one level of nested `{}`) is removed
// as a single span rather than stopping at the first `}`. This can still
// discard a conditional class name we can't statically resolve (e.g.
// `${active ? 'selected' : ''}` loses "selected") — that's a deliberate
// false-negative tradeoff, not a bug: a class this script can't see is
// still real CSS-defined markup, so nothing is mis-flagged as undefined.
function stripInterpolations(str) {
  let out = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] === '$' && str[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < str.length && depth > 0) {
        if (str[j] === '{') depth++;
        else if (str[j] === '}') depth--;
        j++;
      }
      i = j; // skip past the matched (or ran-off-the-end) interpolation
    } else {
      out += str[i];
      i++;
    }
  }
  return out;
}

function extractClassAttrUsages(html) {
  // Matches class="..." and class='...' anywhere in the file — including
  // inside <script> template strings, since that's where most of this
  // app's markup is actually generated.
  const usages = [];
  for (const m of html.matchAll(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const raw = m[2] !== undefined ? m[2] : m[3];
    const line = lineNumberAt(html, m.index);
    const cleaned = stripInterpolations(raw);
    for (const token of cleaned.split(/\s+/)) {
      if (!token) continue;
      // Skip anything that isn't a plausible bare class name — leftover
      // backtick fragments, or a template string that opened a `${...}`
      // this brace-balancer couldn't close (e.g. it was cut off by the
      // outer quote-matching regex above), never a real class.
      if (token.includes('`') || token.includes('$')) continue;
      // A trailing hyphen (e.g. "tier-" left behind by
      // `class="tier-${slug}"` once the interpolation is stripped) is a
      // template-prefix fragment, never a real class name — real classes
      // don't end in a bare hyphen.
      if (!/^-?[A-Za-z_][A-Za-z0-9_-]*[A-Za-z0-9_]$/.test(token) && !/^-?[A-Za-z_]$/.test(token)) continue;
      usages.push({ className: token, line });
    }
  }
  return usages;
}

function checkFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const defined = extractStyleBlockClassNames(html);
  const usages = extractClassAttrUsages(html);
  const findings = new Map(); // className -> first line
  for (const u of usages) {
    if (defined.has(u.className)) continue;
    if (KNOWN_EXTERNAL_OR_JS_ONLY.has(u.className)) continue;
    if (!findings.has(u.className)) findings.set(u.className, u.line);
  }
  return findings;
}

function main() {
  let anyFindings = false;
  for (const name of TARGET_FILES) {
    const filePath = path.join(FRONTEND_DIR, name);
    if (!fs.existsSync(filePath)) continue;
    const findings = checkFile(filePath);
    if (findings.size === 0) {
      console.log(`OK   ${name}: every class used in markup resolves to a rule in its own <style> block.`);
      continue;
    }
    anyFindings = true;
    console.log(`FAIL ${name}: ${findings.size} class(es) used in markup with no matching CSS rule —`);
    for (const [className, line] of findings) {
      console.log(`       .${className}  (first used around line ${line})`);
    }
  }
  if (anyFindings) {
    console.log('\nEach class above renders as unstyled browser default (or inherits nothing) instead of the site look — either');
    console.log('define the missing rule, or replace it with the real existing class (.btn-primary / .btn-ghost / .field / etc.).');
    console.log('See claude/cxmedia-design-system-checklist.md for the broader pre-ship checklist this script does not cover.');
    process.exit(1);
  } else {
    console.log('\nNo undefined-class findings.');
    process.exit(0);
  }
}

main();

