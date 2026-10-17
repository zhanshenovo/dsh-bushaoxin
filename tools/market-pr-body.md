## What

Adds one catalog entry for [`zhanshenovo/dsh-bushaoxin`](https://github.com/zhanshenovo/dsh-bushaoxin), category `fun`.

**One file, as the guide asks:** `data/plugins/zhanshenovo__dsh-bushaoxin.yml`

## About the plugin

A conversation-style layer for DSH. When a reply has to warn about a shortcut that
is cheap but has a catch, it can say so in the phrasing of a Chinese internet meme
instead of a flat "not recommended": the fast cheap road is the rival shop, the slow
one keeps its rules. It ships:

- a rewrite engine that turns arbitrary text into a fixed-skeleton dialogue with five
  independent knobs (act count, catchphrase density, ending turn, seed, preset) —
  辣度 is a set of shapes, not a volume
- a slider for four intensity levels (`关/轻/中/重`) that writes to host state per session
- a `/bushaoxin` command that reports a joke "heartburn index" from the session tool-call log

## Compliance

| Requirement | Status |
|---|---|
| `package.json` declares `dsh.bundle` | ✅ `{ "patch": "./cordis.patch.yml" }` |
| `cordis.patch.yml` at repo root | ✅ |
| Repo has real, working code | ✅ zero dependencies, 35 assertions, CI green on Node 20 + 22 |
| Repo is at least 1 day old | ✅ created 2026-10-09 |
| `dsh-plugin` topic | ✅ |
| Description states function, no marketing | ✅ |

## A note on the description

Two things worth flagging so a reviewer can check them rather than take my word:

1. The plugin's defining constraint is that **every rewrite ends with a real technical
   conclusion that cannot be disabled** (`keepTruthLine` is only for tests). That is why
   the description says so — it is a property of the code, not a claim about quality.
2. It **does not** improve efficiency, add features, or change code quality, and the
   README says so explicitly. I would rather the entry undersell it than have a user
   install it expecting something it isn't.
