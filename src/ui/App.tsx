import { useEffect, useMemo, useState } from "react";
import {
  type Card,
  type Color,
  COLORS,
  COLOR_NAMES,
  DECK_COUNTS,
  WILD_CARD,
  WILD_DRAW_FOUR_CARD,
  colorOf,
  formatCard,
  isWild,
  makeCard,
  parseCards,
} from "../engine/cards";
import { type Position, formatMove, validatePosition } from "../engine/rules";
import { type Recommendation, recommend } from "../engine/recommend";
import { seededRng } from "../engine/sim";
import { CardView } from "./CardView";

export interface TableState {
  hand: Card[];
  top: Card | null;
  activeColor: Color;
  opponents: number[];
}

const DEFAULT_STATE: TableState = { hand: [], top: null, activeColor: 0, opponents: [7, 7, 7] };
const STORAGE_KEY = "uno-calculator:table";
const PLAYOUTS = 4000;
const SHOWN = 4;

function loadState(): TableState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<TableState>) };
  } catch {
    // Storage can be unavailable (private mode); start fresh.
  }
  return DEFAULT_STATE;
}

function saveState(s: TableState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Not critical.
  }
}

/** Stable seed per position so the same input always shows the same answer. */
function hashPosition(p: Position): number {
  let h = 2166136261;
  for (const n of [...p.hand.slice().sort((a, b) => a - b), -1, p.top, p.activeColor, -1, ...p.opponents]) {
    h = Math.imul(h ^ (n & 0xff), 16777619);
  }
  return h >>> 0;
}

const RANKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const opponentLabel = (i: number, n: number) =>
  i === 0 ? "Next player" : i === n - 1 && n > 1 ? "Previous player" : `Player ${i + 2}`;

export function App({ initial }: { initial?: TableState }) {
  const [state, setState] = useState<TableState>(() => initial ?? loadState());
  const [target, setTarget] = useState<"hand" | "top">(() => (state.top === null ? "top" : "hand"));
  const [pickerColor, setPickerColor] = useState<Color>(0);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => saveState(state), [state]);

  const update = (patch: Partial<TableState>) => setState((s) => ({ ...s, ...patch }));

  const used = (c: Card) => state.hand.filter((x) => x === c).length + (state.top === c ? 1 : 0);
  const canAdd = (c: Card) => used(c) < DECK_COUNTS[c]!;

  const pick = (c: Card) => {
    if (target === "top") {
      update({ top: c, activeColor: isWild(c) ? state.activeColor : (colorOf(c) as Color) });
      setTarget("hand");
    } else if (canAdd(c)) {
      update({ hand: [...state.hand, c] });
    }
  };

  const removeFromHand = (i: number) => update({ hand: state.hand.filter((_, k) => k !== i) });

  const addTyped = () => {
    try {
      const cards = parseCards(typed);
      update({ hand: [...state.hand, ...cards] });
      setTyped("");
      setTypedError("");
    } catch (e) {
      setTypedError((e as Error).message);
    }
  };

  const setOpponent = (i: number, n: number) =>
    update({ opponents: state.opponents.map((v, k) => (k === i ? Math.max(1, Math.min(40, n)) : v)) });

  const position: Position | null =
    state.top === null
      ? null
      : { hand: state.hand, top: state.top, activeColor: state.activeColor, opponents: state.opponents };
  const errors = position ? validatePosition(position) : [];

  const results: Recommendation[] | null = useMemo(() => {
    if (!position || errors.length > 0) return null;
    return recommend(position, { playouts: PLAYOUTS, minPerMove: 250, rng: seededRng(hashPosition(position)) });
  }, [JSON.stringify(position), errors.length]);

  /** Apply a recommended move to my side of the table: card leaves my hand and becomes the top card. */
  const playMove = (r: Recommendation) => {
    if (r.move.kind === "draw") return;
    const i = state.hand.indexOf(r.move.card);
    update({ hand: state.hand.filter((_, k) => k !== i), top: r.move.card, activeColor: r.move.color });
  };

  return (
    <main className="app">
      <header>
        <h1>UNO Move Calculator</h1>
        <p className="sub">Enter your hand and the top card. Official rules, no stacking.</p>
      </header>

      <section className="panel table-row">
        <div className="top-slot">
          <h2>Top card</h2>
          <button
            type="button"
            className={`slot ${target === "top" ? "targeted" : ""}`}
            onClick={() => setTarget("top")}
            aria-label={state.top === null ? "Choose the top card" : "Change the top card"}
          >
            {state.top === null ? <span className="empty">Tap, then pick below</span> : <CardView card={state.top} named={state.activeColor} size="lg" />}
          </button>
          {state.top !== null && isWild(state.top) && (
            <div className="color-choice" role="radiogroup" aria-label="Color named for the wild">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={state.activeColor === c}
                  aria-label={COLOR_NAMES[c]}
                  className={`dot ${COLOR_NAMES[c]} ${state.activeColor === c ? "on" : ""}`}
                  onClick={() => update({ activeColor: c })}
                />
              ))}
            </div>
          )}
        </div>

        <div className="opponents">
          <h2>Opponents' cards</h2>
          <ul>
            {state.opponents.map((n, i) => (
              <li key={i}>
                <span className="opp-name">{opponentLabel(i, state.opponents.length)}</span>
                <button type="button" className="step" aria-label={`Fewer cards for ${opponentLabel(i, state.opponents.length)}`} onClick={() => setOpponent(i, n - 1)}>
                  −
                </button>
                <span className={`count ${n <= 2 ? "danger" : ""}`} aria-label={`${opponentLabel(i, state.opponents.length)} card count`}>
                  {n}
                </span>
                <button type="button" className="step" aria-label={`More cards for ${opponentLabel(i, state.opponents.length)}`} onClick={() => setOpponent(i, n + 1)}>
                  +
                </button>
              </li>
            ))}
          </ul>
          <div className="opp-actions">
            <button type="button" className="link" disabled={state.opponents.length <= 1} onClick={() => update({ opponents: state.opponents.slice(0, -1) })}>
              − player
            </button>
            <span>{state.opponents.length + 1} players</span>
            <button type="button" className="link" disabled={state.opponents.length >= 9} onClick={() => update({ opponents: [...state.opponents, 7] })}>
              + player
            </button>
          </div>
        </div>
      </section>

      <section className={`panel hand ${target === "hand" ? "targeted" : ""}`} onClick={() => setTarget("hand")}>
        <div className="hand-head">
          <h2>Your hand ({state.hand.length})</h2>
          {state.hand.length > 0 && (
            <button type="button" className="link" onClick={() => update({ hand: [] })}>
              Clear
            </button>
          )}
        </div>
        {state.hand.length === 0 ? (
          <p className="empty">Pick cards below, or type them.</p>
        ) : (
          <div className="hand-cards" aria-label="Your hand">
            {state.hand.map((c, i) => (
              <CardView key={`${c}-${i}`} card={c} size="sm" onClick={() => removeFromHand(i)} label={`Remove ${formatCard(c)}`} />
            ))}
          </div>
        )}
        <form
          className="typed"
          onSubmit={(e) => {
            e.preventDefault();
            addTyped();
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type cards: R5 G+2 BS YR W W+4"
            aria-label="Type cards to add"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit">Add</button>
        </form>
        {typedError && <p className="error">{typedError}</p>}
      </section>

      <section className="panel picker" aria-label="Card picker">
        <div className="picker-head">
          <span>
            Adding to: <strong>{target === "top" ? "top card" : "your hand"}</strong>
          </span>
          <div className="tabs" role="tablist">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={pickerColor === c}
                className={`tab ${COLOR_NAMES[c]} ${pickerColor === c ? "on" : ""}`}
                onClick={() => setPickerColor(c)}
              >
                {COLOR_NAMES[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid">
          {RANKS.map((r) => {
            const c = makeCard(pickerColor, r);
            return (
              <CardView
                key={c}
                card={c}
                onClick={target === "hand" && !canAdd(c) ? undefined : () => pick(c)}
                label={`${target === "top" ? "Set top card" : "Add"} ${formatCard(c)}`}
              />
            );
          })}
          {[WILD_CARD, WILD_DRAW_FOUR_CARD].map((c) => (
            <CardView key={c} card={c} onClick={target === "hand" && !canAdd(c) ? undefined : () => pick(c)} label={`${target === "top" ? "Set top card" : "Add"} ${formatCard(c)}`} />
          ))}
        </div>
      </section>

      <section className="panel results" aria-live="polite">
        <h2>Best move</h2>
        {!position && <p className="empty">Choose the top card to get a recommendation.</p>}
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {results && (
          <ol className="ranked">
            {(showAll ? results : results.slice(0, SHOWN)).map((r, i) => (
              <li key={formatMove(r.move)} className={i === 0 ? "best" : ""} data-move={formatMove(r.move)}>
                <div className="move">
                  {r.move.kind === "draw" ? <span className="card md draw">Draw</span> : <CardView card={r.move.card} named={r.move.color} />}
                  <div className="move-text">
                    <div className="move-title">
                      <strong>{r.move.kind === "draw" ? "Draw a card" : moveName(r)}</strong>
                      <span className="pct">
                        {r.tied && <span className="tie" title="Within simulation noise of the other tied moves">≈ </span>}
                        {Math.round(r.winRate * 100)}% win
                      </span>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${Math.round(r.winRate * 100)}%` }} />
                    </div>
                    <ul className="reasons">
                      {r.reasons.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {r.move.kind === "play" && (
                  <button type="button" className="link play" onClick={() => playMove(r)}>
                    I played this
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        {results && results.length > SHOWN && (
          <button type="button" className="link" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${results.length} moves`}
          </button>
        )}
        {results && (
          <p className="foot">
            Win chances from {PLAYOUTS.toLocaleString()} simulated games, guessing opponents' hands from the unseen cards.
            {results.some((r) => r.tied) && " Moves marked ≈ are too close to separate, so they're ordered by the longest-color rule."}
          </p>
        )}
      </section>
    </main>
  );
}

function moveName(r: Recommendation): string {
  if (r.move.kind === "draw") return "Draw";
  const token = formatCard(r.move.card);
  return isWild(r.move.card) ? `${token}, name ${COLOR_NAMES[r.move.color]}` : token;
}
