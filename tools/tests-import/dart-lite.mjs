/**
 * dart-lite — a tolerant reader for the *data* subset of Dart.
 *
 * The tests_app repo keeps every question, answer and result profile inside
 * Dart source (`lib/data/*.dart`), so there is no export path short of parsing
 * it. This module handles exactly the constructs those files use — literals,
 * collections, constructor calls, static members — and degrades to a symbolic
 * node for anything else instead of throwing. Whatever stays symbolic shows up
 * in the audit rather than silently becoming null.
 */

// ─────────────────────────────────────────────────────────── tokenizer

const PUNCT3 = new Set(["...", "??=", "..?"]);
const PUNCT2 = new Set([
  "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--",
  "+=", "-=", "*=", "/=",
]);

function matchBrace(src, i) {
  // src[i] === '{' — returns index just past the matching '}'
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') {
      i = readString(src, i, false).end;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return i;
}

const SIMPLE_ESCAPES = {
  n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0",
  "\\": "\\", "'": "'", '"': '"', $: "$",
};

function decodeEscape(src, j) {
  const c = src[j + 1];
  if (c === "u") {
    if (src[j + 2] === "{") {
      const end = src.indexOf("}", j + 3);
      const code = parseInt(src.slice(j + 3, end), 16);
      return [String.fromCodePoint(code), end - j + 1];
    }
    const code = parseInt(src.slice(j + 2, j + 6), 16);
    return [String.fromCodePoint(code), 6];
  }
  if (c === "x") return [String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16)), 4];
  if (c in SIMPLE_ESCAPES) return [SIMPLE_ESCAPES[c], 2];
  return [c ?? "", 2];
}

function readString(src, i, raw) {
  const q = src[i];
  let quote = q;
  let len = 1;
  if (src[i + 1] === q && src[i + 2] === q) {
    quote = q + q + q;
    len = 3;
  }
  let j = i + len;
  let out = "";
  let interp = false;
  while (j < src.length) {
    if (!raw && src[j] === "\\") {
      const [ch, adv] = decodeEscape(src, j);
      out += ch;
      j += adv;
      continue;
    }
    if (src.startsWith(quote, j)) {
      j += len;
      return { value: out, end: j, interp };
    }
    if (!raw && src[j] === "$") {
      if (src[j + 1] === "{") {
        const end = matchBrace(src, j + 1);
        out += src.slice(j, end);
        interp = true;
        j = end;
        continue;
      }
      if (/[A-Za-z_]/.test(src[j + 1] ?? "")) {
        let k = j + 1;
        while (k < src.length && /[A-Za-z0-9_]/.test(src[k])) k++;
        out += src.slice(j, k);
        interp = true;
        j = k;
        continue;
      }
    }
    out += src[j];
    j++;
  }
  return { value: out, end: j, interp };
}

export function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === "/" && src[i + 1] === "*") { depth++; i += 2; }
        else if (src[i] === "*" && src[i + 1] === "/") { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === "r" && (src[i + 1] === "'" || src[i + 1] === '"')) {
      const r = readString(src, i + 1, true);
      toks.push({ t: "str", v: r.value, interp: false, pos: i });
      i = r.end;
      continue;
    }
    if (c === "'" || c === '"') {
      const r = readString(src, i, false);
      toks.push({ t: "str", v: r.value, interp: r.interp, pos: i });
      i = r.end;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      if (src[j] === "0" && (src[j + 1] === "x" || src[j + 1] === "X")) {
        j += 2;
        while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
      } else {
        while (j < n && /[0-9]/.test(src[j])) j++;
        if (src[j] === "." && /[0-9]/.test(src[j + 1] ?? "")) {
          j++;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
        if (src[j] === "e" || src[j] === "E") {
          let k = j + 1;
          if (src[k] === "+" || src[k] === "-") k++;
          if (/[0-9]/.test(src[k] ?? "")) {
            j = k;
            while (j < n && /[0-9]/.test(src[j])) j++;
          }
        }
      }
      toks.push({ t: "num", v: Number(src.slice(i, j)), pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (PUNCT3.has(three)) { toks.push({ t: "p", v: three, pos: i }); i += 3; continue; }
    if (PUNCT2.has(two)) { toks.push({ t: "p", v: two, pos: i }); i += 2; continue; }
    toks.push({ t: "p", v: c, pos: i });
    i++;
  }
  return toks;
}

// ─────────────────────────────────────────────────────────── parser

export class ParseError extends Error {}

const OPENERS = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);

class Parser {
  constructor(tokens) {
    this.t = tokens;
    this.i = 0;
  }
  peek(k = 0) { return this.t[this.i + k]; }
  atP(v) { const p = this.peek(); return !!p && p.t === "p" && p.v === v; }
  atId(v) { const p = this.peek(); return !!p && p.t === "id" && p.v === v; }
  eatP(v) { if (this.atP(v)) { this.i++; return true; } return false; }
  expectP(v) {
    if (!this.eatP(v)) {
      const got = this.peek();
      throw new ParseError(`expected '${v}', got ${got ? got.t + " " + got.v : "EOF"}`);
    }
  }

  /** Balanced `<...>` immediately followed by a literal/call opener. */
  trySkipTypeArgs() {
    if (!this.atP("<")) return false;
    let depth = 0;
    let k = this.i;
    while (k < this.t.length) {
      const tok = this.t[k];
      if (tok.t !== "p") { k++; continue; }
      if (tok.v === "<") depth++;
      else if (tok.v === ">") {
        depth--;
        if (depth === 0) break;
      } else if (tok.v === ";" || OPENERS[tok.v] || CLOSERS.has(tok.v)) {
        return false; // not a type argument list
      }
      k++;
    }
    if (depth !== 0) return false;
    const after = this.t[k + 1];
    if (!after || after.t !== "p" || !["{", "[", "("].includes(after.v)) return false;
    this.i = k + 1;
    return true;
  }

  parseExpr() {
    const cond = this.parseBinary();
    if (this.atP("?")) {
      this.i++;
      this.parseExpr();
      this.expectP(":");
      this.parseExpr();
      return { __node: "unknown", why: "ternary" };
    }
    return cond;
  }

  parseBinary() {
    let left = this.parseUnary();
    for (;;) {
      const p = this.peek();
      if (!p || p.t !== "p") break;
      if (!["+", "-", "*", "/", "%", "==", "!=", "&&", "||", "??"].includes(p.v)) break;
      this.i++;
      const right = this.parseUnary();
      left = { __node: "bin", op: p.v, l: left, r: right };
    }
    return left;
  }

  parseUnary() {
    if (this.atId("const") || this.atId("new")) { this.i++; return this.parseUnary(); }
    if (this.atP("-")) { this.i++; const v = this.parseUnary(); return typeof v === "number" ? -v : { __node: "unknown", why: "neg" }; }
    if (this.atP("!")) { this.i++; this.parseUnary(); return { __node: "unknown", why: "not" }; }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      if (this.atP(".") || this.atP("?.")) {
        this.i++;
        const name = this.peek();
        if (!name || name.t !== "id") throw new ParseError("expected member name");
        this.i++;
        if (this.atP("(")) {
          const { args, named } = this.parseArgs();
          const base = node?.__node === "ref" ? node.name : null;
          node = { __node: "call", name: base ? `${base}.${name.v}` : `?.${name.v}`, args, named };
        } else {
          const base = node?.__node === "ref" ? node.name : null;
          node = base
            ? { __node: "ref", name: `${base}.${name.v}` }
            : { __node: "member", target: node, name: name.v };
        }
        continue;
      }
      if (this.atP("(")) {
        const { args, named } = this.parseArgs();
        const name = node?.__node === "ref" ? node.name : null;
        node = { __node: "call", name: name ?? "<expr>", args, named };
        continue;
      }
      if (this.atP("[")) {
        this.i++;
        const index = this.parseExpr();
        this.expectP("]");
        node = { __node: "index", target: node, index };
        continue;
      }
      if (this.atP("!")) { this.i++; continue; }
      break;
    }
    return node;
  }

  parseArgs() {
    this.expectP("(");
    const args = [];
    const named = {};
    while (!this.atP(")")) {
      const p = this.peek();
      const nxt = this.peek(1);
      if (p && p.t === "id" && nxt && nxt.t === "p" && nxt.v === ":") {
        this.i += 2;
        named[p.v] = this.parseExpr();
      } else {
        args.push(this.parseExpr());
      }
      if (!this.eatP(",")) break;
    }
    this.expectP(")");
    return { args, named };
  }

  parsePrimary() {
    const p = this.peek();
    if (!p) throw new ParseError("unexpected EOF");

    if (p.t === "str") {
      // Dart concatenates adjacent string literals.
      let value = "";
      let interp = false;
      while (this.peek() && this.peek().t === "str") {
        value += this.peek().v;
        interp = interp || this.peek().interp;
        this.i++;
      }
      return interp ? { __node: "str", value, interp: true } : value;
    }
    if (p.t === "num") { this.i++; return p.v; }
    if (p.t === "id") {
      if (p.v === "true") { this.i++; return true; }
      if (p.v === "false") { this.i++; return false; }
      if (p.v === "null") { this.i++; return null; }
      this.i++;
      if (this.atP("<")) this.trySkipTypeArgs();
      if (this.atP("{")) return this.parseBraces();
      if (this.atP("[")) return this.parseList();
      return { __node: "ref", name: p.v };
    }
    if (p.t === "p") {
      if (p.v === "<") {
        if (this.trySkipTypeArgs()) {
          if (this.atP("{")) return this.parseBraces();
          if (this.atP("[")) return this.parseList();
        }
        throw new ParseError("unexpected '<'");
      }
      if (p.v === "[") return this.parseList();
      if (p.v === "{") return this.parseBraces();
      if (p.v === "(") {
        this.i++;
        const e = this.parseExpr();
        this.expectP(")");
        return e;
      }
    }
    throw new ParseError(`unexpected token ${p.t} ${p.v}`);
  }

  parseList() {
    this.expectP("[");
    const out = [];
    while (!this.atP("]")) {
      if (this.atP("...") || this.atId("if") || this.atId("for")) {
        this.skipUntilElementEnd("]");
        out.push({ __node: "unknown", why: "collection-control-flow" });
      } else {
        out.push(this.parseExpr());
      }
      if (!this.eatP(",")) break;
    }
    this.expectP("]");
    return out;
  }

  /** `{}` is a map here; sets do not appear in these data files. */
  parseBraces() {
    this.expectP("{");
    const entries = [];
    while (!this.atP("}")) {
      if (this.atP("...") || this.atId("if") || this.atId("for")) {
        this.skipUntilElementEnd("}");
        entries.push([{ __node: "unknown", why: "collection-control-flow" }, null]);
      } else {
        const k = this.parseExpr();
        this.expectP(":");
        const v = this.parseExpr();
        entries.push([k, v]);
      }
      if (!this.eatP(",")) break;
    }
    this.expectP("}");
    return { __node: "map", entries };
  }

  skipUntilElementEnd(closer) {
    let depth = 0;
    while (this.i < this.t.length) {
      const tok = this.t[this.i];
      if (tok.t === "p") {
        if (OPENERS[tok.v]) depth++;
        else if (CLOSERS.has(tok.v)) {
          if (depth === 0 && tok.v === closer) return;
          depth--;
        } else if (tok.v === "," && depth === 0) return;
      }
      this.i++;
    }
  }
}

export function parseExpression(tokens) {
  const p = new Parser(tokens);
  return p.parseExpr();
}

// ─────────────────────────────────────────────────────────── file structure

function findMatching(tokens, openIdx) {
  const open = tokens[openIdx].v;
  const close = OPENERS[open];
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t !== "p") continue;
    if (tok.v === open) depth++;
    else if (tok.v === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function depthAwareIndex(tokens, pred) {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t !== "p") continue;
    if (CLOSERS.has(tok.v)) { depth--; continue; }
    // Test before descending, so a top-level `(` is itself matchable.
    if (depth === 0 && pred(tok, i)) return i;
    if (OPENERS[tok.v]) depth++;
  }
  return -1;
}

/** Split a `{ ... }` body into top-level statements. */
function splitStatements(tokens) {
  const out = [];
  let cur = [];
  let depth = 0;
  for (const tok of tokens) {
    if (tok.t === "p" && OPENERS[tok.v]) depth++;
    if (tok.t === "p" && CLOSERS.has(tok.v)) depth--;
    if (tok.t === "p" && tok.v === ";" && depth === 0) {
      if (cur.length) out.push(cur);
      cur = [];
      continue;
    }
    cur.push(tok);
    if (tok.t === "p" && tok.v === "}" && depth === 0) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function parseClassBody(tokens) {
  const members = new Map();
  let i = 0;
  while (i < tokens.length) {
    const start = i;
    let depth = 0;
    let end = -1;
    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok.t === "p" && OPENERS[tok.v]) { depth++; i++; continue; }
      if (tok.t === "p" && CLOSERS.has(tok.v)) {
        depth--;
        // A block that closes at top level and isn't followed by `;`/`,` is a
        // method body — everything else (map/list literals) is still mid-field.
        const next = tokens[i + 1];
        const terminates =
          depth === 0 &&
          tok.v === "}" &&
          !(next && next.t === "p" && (next.v === ";" || next.v === ","));
        i++;
        if (terminates) { end = i - 1; break; }
        continue;
      }
      if (tok.t === "p" && tok.v === ";" && depth === 0) { end = i; i++; break; }
      i++;
    }
    if (end === -1) break;
    const member = tokens.slice(start, end + 1);
    if (member.length) registerMember(members, member);
  }
  return members;
}

/** Positional parameter names, in order — enough to bind call arguments. */
function parseParamNames(tokens) {
  const groups = [];
  let cur = [];
  let depth = 0;
  for (const tok of tokens) {
    if (tok.t === "p" && (OPENERS[tok.v] || tok.v === "<")) { depth++; cur.push(tok); continue; }
    if (tok.t === "p" && (CLOSERS.has(tok.v) || tok.v === ">")) { depth--; cur.push(tok); continue; }
    if (tok.t === "p" && tok.v === "," && depth === 0) { groups.push(cur); cur = []; continue; }
    cur.push(tok);
  }
  if (cur.length) groups.push(cur);
  return groups
    .map((g) => {
      const eq = g.findIndex((t) => t.t === "p" && t.v === "=");
      const head = eq === -1 ? g : g.slice(0, eq);
      const ids = head.filter((t) => t.t === "id");
      return ids.length ? ids[ids.length - 1].v : null;
    })
    .filter(Boolean);
}

function registerMember(members, tokens) {
  const parenIdx = depthAwareIndex(tokens, (t) => t.v === "(");
  const arrowIdx = depthAwareIndex(tokens, (t) => t.v === "=>");
  const eqIdx = depthAwareIndex(tokens, (t) => t.v === "=");

  const nameBefore = (idx) => {
    const t = tokens[idx - 1];
    return t && t.t === "id" ? t.v : null;
  };

  if (parenIdx !== -1 && (arrowIdx === -1 || parenIdx < arrowIdx) && (eqIdx === -1 || parenIdx < eqIdx)) {
    const name = nameBefore(parenIdx);
    if (!name) return;
    const closeParen = findMatching(tokens, parenIdx);
    const params = parseParamNames(tokens.slice(parenIdx + 1, closeParen));
    const hasParams = params.length > 0;
    if (arrowIdx !== -1 && arrowIdx > closeParen) {
      members.set(name, { kind: "method", hasParams, params, expr: tokens.slice(arrowIdx + 1, tokens.length - 1) });
      return;
    }
    const braceIdx = tokens.findIndex((t, k) => k > closeParen && t.t === "p" && t.v === "{");
    if (braceIdx === -1) return;
    const closeBrace = findMatching(tokens, braceIdx);
    members.set(name, { kind: "method", hasParams, params, body: tokens.slice(braceIdx + 1, closeBrace) });
    return;
  }
  if (arrowIdx !== -1) {
    const name = nameBefore(arrowIdx);
    if (!name) return;
    members.set(name, { kind: "getter", hasParams: false, expr: tokens.slice(arrowIdx + 1, tokens.length - 1) });
    return;
  }
  if (eqIdx !== -1) {
    const name = nameBefore(eqIdx);
    if (!name) return;
    members.set(name, { kind: "field", hasParams: false, expr: tokens.slice(eqIdx + 1, tokens.length - 1) });
  }
}

/**
 * Declaration containers of a Dart file: one entry per class, plus `<top>` for
 * file-level declarations — several weights files declare their maps outside any
 * class, and those hold real data.
 */
export function parseFile(src) {
  const tokens = tokenize(src);
  const classes = new Map();
  const topLevel = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const isContainer =
      tok.t === "id" && ["class", "mixin", "enum", "extension"].includes(tok.v) && tokens[i + 1]?.t === "id";
    if (isContainer) {
      const nameTok = tokens[i + 1];
      let j = i + 2;
      while (j < tokens.length && !(tokens[j].t === "p" && tokens[j].v === "{")) {
        if (tokens[j].t === "p" && tokens[j].v === ";") break;
        j++;
      }
      if (j < tokens.length && tokens[j].t === "p" && tokens[j].v === "{") {
        const close = findMatching(tokens, j);
        if (close !== -1) {
          if (tok.v === "class" || tok.v === "mixin") {
            classes.set(nameTok.v, parseClassBody(tokens.slice(j + 1, close)));
          }
          i = close + 1;
          continue;
        }
      }
    }
    topLevel.push(tok);
    i++;
  }
  if (topLevel.length) classes.set("<top>", parseClassBody(topLevel));
  return classes;
}

// ─────────────────────────────────────────────────────────── evaluation

const UNRESOLVED = Symbol("unresolved");

export class Evaluator {
  constructor(classes, { onIssue } = {}) {
    this.classes = classes;
    this.cache = new Map();
    this.inProgress = new Set();
    this.issues = [];
    this.onIssue = onIssue;
  }

  issue(msg) {
    this.issues.push(msg);
    this.onIssue?.(msg);
  }

  /** Every zero-arg static member of every class, evaluated. */
  evalAll() {
    const out = {};
    for (const [cls, members] of this.classes) {
      for (const [name, m] of members) {
        if (m.hasParams) continue;
        const key = `${cls}.${name}`;
        try {
          out[key] = this.evalMember(cls, name);
        } catch (e) {
          this.issue(`${key}: ${e.message}`);
        }
      }
    }
    return out;
  }

  evalMember(cls, name) {
    const key = `${cls}.${name}`;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.inProgress.has(key)) return { __node: "unknown", why: "recursive" };
    const members = this.classes.get(cls);
    const m = members?.get(name);
    if (!m) return UNRESOLVED;
    this.inProgress.add(key);
    let value;
    try {
      if (m.expr) value = this.evaluate(parseExpression(m.expr), { cls, vars: new Map() });
      else if (m.body) value = this.evalBody(m.body, { cls, vars: new Map() });
      else value = UNRESOLVED;
    } catch (e) {
      this.issue(`${key}: ${e.message}`);
      value = { __node: "unknown", why: `parse: ${e.message}` };
    } finally {
      this.inProgress.delete(key);
    }
    this.cache.set(key, value);
    return value;
  }

  /** Same as evalMember, but with positional arguments bound. Not memoised. */
  evalMemberWithArgs(cls, name, args) {
    const m = this.classes.get(cls)?.get(name);
    if (!m) return { __node: "unresolved", name: `${cls}.${name}` };
    const key = `${cls}.${name}(args)`;
    if (this.inProgress.has(key)) return { __node: "unknown", why: "recursive" };
    this.inProgress.add(key);
    const vars = new Map();
    (m.params ?? []).forEach((p, i) => {
      if (i < args.length) vars.set(p, args[i]);
    });
    const env = { cls, vars };
    try {
      if (m.expr) return this.evaluate(parseExpression(m.expr), env);
      if (m.body) return this.evalBody(m.body, env);
      return { __node: "unresolved", name: `${cls}.${name}` };
    } catch (e) {
      this.issue(`${cls}.${name}(args): ${e.message}`);
      return { __node: "unknown", why: `parse: ${e.message}` };
    } finally {
      this.inProgress.delete(key);
    }
  }

  evalBody(tokens, env) {
    const stmts = splitStatements(tokens);
    for (const stmt of stmts) {
      if (!stmt.length) continue;
      if (stmt[0].t === "id" && stmt[0].v === "return") {
        return this.evaluate(parseExpression(stmt.slice(1)), env);
      }
      const eqIdx = depthAwareIndex(stmt, (t) => t.v === "=");
      if (eqIdx > 0) {
        const nameTok = stmt[eqIdx - 1];
        const beforeName = stmt[eqIdx - 2];
        const looksLikeDecl =
          nameTok.t === "id" &&
          (!beforeName || beforeName.t === "id" || (beforeName.t === "p" && beforeName.v === ">"));
        if (looksLikeDecl) {
          try {
            env.vars.set(nameTok.v, this.evaluate(parseExpression(stmt.slice(eqIdx + 1)), env));
          } catch {
            env.vars.set(nameTok.v, { __node: "unknown", why: "local-decl" });
          }
        }
      }
    }
    return { __node: "unknown", why: "no-return" };
  }

  evaluate(node, env) {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map((n) => this.evaluate(n, env));

    switch (node.__node) {
      case "str":
        return node.value; // interpolated — kept raw, flagged by the audit
      case "map": {
        const entries = node.entries.map(([k, v]) => [this.evaluate(k, env), this.evaluate(v, env)]);
        const allStringKeys = entries.every(([k]) => typeof k === "string");
        if (!allStringKeys) return { __node: "map", entries };
        const obj = {};
        const dupes = [];
        for (const [k, v] of entries) {
          if (k in obj) dupes.push(k);
          obj[k] = v;
        }
        if (dupes.length) Object.defineProperty(obj, "__dupKeys", { value: dupes, enumerable: false });
        return obj;
      }
      case "ref": {
        const [head, tail] = node.name.split(".");
        if (!tail && env.vars.has(head)) return env.vars.get(head);
        if (!tail) {
          const own = this.classes.get(env.cls);
          if (own?.has(head)) return this.evalMember(env.cls, head);
        }
        if (tail && this.classes.get(head)?.has(tail)) return this.evalMember(head, tail);
        return { __node: "unresolved", name: node.name };
      }
      case "call": {
        const { name } = node;
        const [head, tail] = name.split(".");
        // Resolve calls into static members of this file before treating the
        // name as a constructor — `_getQuestions(answers)` is a real call.
        let targetCls = null;
        let memberName = null;
        if (!tail && this.classes.get(env.cls)?.has(head)) {
          targetCls = env.cls;
          memberName = head;
        } else if (tail && this.classes.get(head)?.has(tail)) {
          targetCls = head;
          memberName = tail;
        }
        if (targetCls) {
          const m = this.classes.get(targetCls).get(memberName);
          if (!m.hasParams) return this.evalMember(targetCls, memberName);
          const args = node.args.map((a) => this.evaluate(a, env));
          return this.evalMemberWithArgs(targetCls, memberName, args);
        }
        if (/^[A-Z]/.test(tail ?? head) || /^[A-Z]/.test(head)) {
          const named = {};
          for (const [k, v] of Object.entries(node.named)) named[k] = this.evaluate(v, env);
          return {
            __ctor: tail ? `${head}.${tail}` : head,
            args: node.args.map((a) => this.evaluate(a, env)),
            named,
          };
        }
        return { __node: "unresolved", name };
      }
      case "index": {
        const target = this.evaluate(node.target, env);
        const index = this.evaluate(node.index, env);
        if (target && typeof target === "object" && (typeof index === "string" || typeof index === "number")) {
          const v = Array.isArray(target) ? target[index] : target[index];
          if (v !== undefined) return v;
        }
        return { __node: "unresolved", name: "index" };
      }
      case "bin": {
        const l = this.evaluate(node.l, env);
        const r = this.evaluate(node.r, env);
        if (node.op === "+" && typeof l === "string" && typeof r === "string") return l + r;
        if (node.op === "+" && Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
        if (typeof l === "number" && typeof r === "number") {
          switch (node.op) {
            case "+": return l + r;
            case "-": return l - r;
            case "*": return l * r;
            case "/": return l / r;
            case "%": return l % r;
          }
        }
        return { __node: "unknown", why: `bin ${node.op}` };
      }
      case "member":
        return { __node: "unresolved", name: node.name };
      default:
        return node;
    }
  }
}

/** Depth-first walk collecting every constructor node with the given name. */
export function collectCtors(value, name, out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const v of value) collectCtors(v, name, out);
    return out;
  }
  if (value.__ctor === name) out.push(value);
  for (const v of Object.values(value)) collectCtors(v, name, out);
  return out;
}

export function ctorHistogram(value, out = new Map()) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const v of value) ctorHistogram(v, out);
    return out;
  }
  if (value.__ctor) out.set(value.__ctor, (out.get(value.__ctor) ?? 0) + 1);
  for (const v of Object.values(value)) ctorHistogram(v, out);
  return out;
}
