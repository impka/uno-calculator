// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/ui/App";

afterEach(cleanup);

describe("App", () => {
  it("recommends a move after entering the top card and a hand", async () => {
    const user = userEvent.setup();
    const { container } = render(<App initial={{ hand: [], top: null, activeColor: 0, opponents: [1, 6] }} />);

    // Top card is targeted first: pick red 5.
    await user.click(screen.getByRole("button", { name: "Set top card R5" }));
    expect(screen.getByRole("button", { name: "Change the top card" })).toBeTruthy();

    await user.type(screen.getByLabelText("Type cards to add"), "R+2 R3 G7 G8{enter}");
    expect(within(screen.getByLabelText("Your hand")).getAllByRole("button")).toHaveLength(4);

    const best = container.querySelector(".ranked > li.best");
    expect(best?.getAttribute("data-move")).toBe("R+2");
    expect(best?.textContent).toMatch(/Next player has 1 card/);
  });

  it("shows parse errors and removes cards on tap", async () => {
    const user = userEvent.setup();
    render(<App initial={{ hand: [], top: null, activeColor: 0, opponents: [7] }} />);
    await user.type(screen.getByLabelText("Type cards to add"), "Q9{enter}");
    expect(screen.getByText(/start with a color/)).toBeTruthy();

    await user.clear(screen.getByLabelText("Type cards to add"));
    await user.type(screen.getByLabelText("Type cards to add"), "B1 B2{enter}");
    await user.click(screen.getByRole("button", { name: "Remove B1" }));
    expect(within(screen.getByLabelText("Your hand")).getAllByRole("button").map((b) => b.getAttribute("data-token"))).toEqual(["B2"]);
  });

  it("asks for the named color when the top card is a wild, and plays a move", async () => {
    const user = userEvent.setup();
    const { container } = render(<App initial={{ hand: [], top: null, activeColor: 0, opponents: [5] }} />);
    await user.click(screen.getByRole("button", { name: "Set top card W" }));
    await user.click(screen.getByRole("radio", { name: "green" }));
    await user.type(screen.getByLabelText("Type cards to add"), "G4 R4{enter}");
    expect(container.querySelector(".ranked > li.best")?.getAttribute("data-move")).toBe("G4");

    await user.click(within(container.querySelector(".ranked > li.best") as HTMLElement).getByRole("button", { name: "I played this" }));
    expect(within(screen.getByLabelText("Your hand")).getAllByRole("button").map((b) => b.getAttribute("data-token"))).toEqual(["R4"]);
    expect(screen.getByRole("img", { name: "green 4" })).toBeTruthy();
  });
});
