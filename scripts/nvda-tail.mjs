#!/usr/bin/env node
/**
 * Keep a written record of what NVDA said, step by step.
 *
 *   npm run nvda-tail -- "<step label>" [--out <file>] [--log <file>] [--mark] [--quiet]
 *
 * NVDA, logging at the "input/output" level, writes everything it speaks and
 * every key it hears to its log (`%TEMP%\nvda.log`). Each call reads what was
 * added since the last call, keeps the speech, the key presses and NVDA's own
 * errors, appends them under the step label to the record file and prints
 * them. `--mark` only moves the starting point to the end of the log, to begin
 * a clean step. The record defaults to `build/nvda-speech.md`; the starting
 * point is kept beside it in `<record>.offset`.
 *
 * @license GPL-3.0-or-later
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const HEAD =
  /^(IO|INFO|DEBUG|DEBUGWARNING|WARNING|ERROR|CRITICAL) - (\S+) \((\d\d:\d\d:\d\d\.\d+)\)/;

// Speech commands NVDA lists between the words; their arguments are not speech.
const COMMANDS =
  /\b(LangChangeCommand|CallbackCommand|EndUtteranceCommand|BreakCommand|PitchCommand|CharacterModeCommand|BeepCommand|WaveFileCommand|PhonemeCommand|VolumeCommand|RateCommand)\s*\([^)]*\)/g;

const QUOTED = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;

/**
 * The rows worth reading from a stretch of NVDA's log.
 * @param {string} text
 * @returns {string[]} "time  words | words", "time  > key", or an NVDA error
 */
export function parseNvdaLog(text) {
  const entries = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const head = HEAD.exec(line);
    if (head) {
      current = { level: head[1], where: head[2], at: head[3], body: [] };
      entries.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  const rows = [];
  for (const { level, where, at, body } of entries) {
    const message = body.join('\n').trim();
    if (message.startsWith('Speaking [')) {
      const inner = message.slice('Speaking '.length).replace(COMMANDS, '');
      const words = [...inner.matchAll(QUOTED)]
        .map((m) => m[1] ?? m[2])
        .filter((part) => part.trim());
      if (words.length) rows.push(`${at}  ${words.join(' | ')}`);
    } else if (message.startsWith('Input:')) {
      rows.push(`${at}  > ${message.slice('Input:'.length).trim()}`);
    } else if (['WARNING', 'ERROR', 'CRITICAL'].includes(level)) {
      rows.push(`${at}  [NVDA ${level}] ${where}: ${message.split('\n')[0]}`);
    }
  }
  return rows;
}

/**
 * Read the log from the kept starting point, record the step, move the point.
 * @param {{log: string, out: string, label: string, mark?: boolean}} options
 * @returns {{marked: boolean, rows: string[]}}
 */
export function tailNvdaLog({ log, out, label, mark = false }) {
  const offsetFile = `${out}.offset`;
  const size = statSync(log).size;
  let offset = existsSync(offsetFile)
    ? Number(readFileSync(offsetFile, 'utf8'))
    : size;
  // NVDA starts a fresh log when it restarts.
  if (!(offset <= size)) offset = 0;

  mkdirSync(dirname(out), { recursive: true });
  if (mark) {
    writeFileSync(offsetFile, String(size));
    return { marked: true, rows: [] };
  }

  const buffer = Buffer.alloc(size - offset);
  const fd = openSync(log, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, offset);
  } finally {
    closeSync(fd);
  }
  writeFileSync(offsetFile, String(size));

  const rows = parseNvdaLog(buffer.toString('utf8'));
  appendFileSync(
    out,
    `\n### ${label}\n\n\`\`\`\n${rows.length ? rows.join('\n') : '(nothing spoken)'}\n\`\`\`\n`
  );
  return { marked: false, rows };
}

function main(argv) {
  const option = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const valueOf = new Set(
    ['--out', '--log']
      .map((name) => argv.indexOf(name))
      .filter((i) => i >= 0)
      .map((i) => i + 1)
  );
  const label =
    argv.find((arg, i) => !arg.startsWith('--') && !valueOf.has(i)) ?? 'step';
  const log = resolve(
    option('--log') ?? join(process.env.TEMP ?? tmpdir(), 'nvda.log')
  );
  const out = resolve(option('--out') ?? join('build', 'nvda-speech.md'));

  if (!existsSync(log)) {
    console.error(
      `No NVDA log at ${log}. In NVDA, set General > Logging level to "input/output", or pass --log.`
    );
    process.exit(1);
  }
  const result = tailNvdaLog({
    log,
    out,
    label,
    mark: argv.includes('--mark'),
  });
  if (result.marked) {
    console.log('Marked: the next call starts here.');
  } else if (!argv.includes('--quiet')) {
    console.log(`${result.rows.length} lines for "${label}" in ${out}`);
    console.log(result.rows.slice(-120).join('\n'));
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}
