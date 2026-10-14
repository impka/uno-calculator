import { type Card, COLOR_NAMES, colorOf, describeCard, formatCard, isWild, rankOf, SKIP, REVERSE, DRAW_TWO, WILD } from "../engine/cards";

const FACE: Record<number, string> = { [SKIP]: "⊘", [REVERSE]: "⇄", [DRAW_TWO]: "+2", [WILD]: "W", 14: "+4" };

export function cardFace(c: Card): string {
  return FACE[rankOf(c)] ?? String(rankOf(c));
}

export function colorClass(c: Card, activeColor?: number): string {
  if (isWild(c)) return activeColor === undefined ? "wild" : `wild named-${COLOR_NAMES[activeColor]}`;
  return COLOR_NAMES[colorOf(c)]!;
}

interface Props {
  card: Card;
  /** For a wild on the pile or a wild move: the color it names. */
  named?: number;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  label?: string;
}

export function CardView({ card, named, size = "md", onClick, label }: Props) {
  const cls = `card ${size} ${colorClass(card, named)}`;
  const title = label ?? describeCard(card) + (named !== undefined && isWild(card) ? ` naming ${COLOR_NAMES[named]}` : "");
  const face = <span className="face">{cardFace(card)}</span>;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={title} title={title} data-token={formatCard(card)}>
      {face}
    </button>
  ) : (
    <span className={cls} role="img" aria-label={title} title={title} data-token={formatCard(card)}>
      {face}
    </span>
  );
}
