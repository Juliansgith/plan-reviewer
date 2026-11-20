import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanDocument, PlainPlanDocument } from "./PlanDocument";

const TEXT = `# Fair

Intro with **bold words** here.

## Notes

- First point
- Second point

> A quoted line.

\`\`\`
code block
\`\`\`

---
`;

describe("PlanDocument", () => {
  it("renders headings, lists, quotes, code and rules", () => {
    const { container } = render(<PlainPlanDocument text={TEXT} />);
    expect(screen.getByRole("heading", { name: "Fair" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "First point",
      "Second point",
    ]);
    expect(container.querySelector("blockquote")?.textContent).toBe("A quoted line.");
    expect(container.querySelector("pre")?.textContent).toBe("code block");
    expect(container.querySelector("hr")).not.toBeNull();
    expect(container.querySelector("mark")).toBeNull();
  });

  it("marks quoted passages across emphasis and selects them on click", async () => {
    const start = TEXT.indexOf("with");
    const end = TEXT.indexOf(" here");
    const onSelect = vi.fn();
    const { container } = render(
      <PlanDocument
        text={TEXT}
        highlights={[{ id: "finding:0", start, end }]}
        active={null}
        isStanding={(id) => id.startsWith("finding:")}
        onSelect={onSelect}
      />,
    );
    const marks = [...container.querySelectorAll("mark")];
    expect(marks.map((mark) => mark.textContent).join("")).toBe("with bold words");
    await userEvent.setup().click(marks[0]!);
    expect(onSelect).toHaveBeenCalledWith("finding:0");
  });

  it("shows task passages only when they are active", () => {
    const start = TEXT.indexOf("First point");
    const props = {
      text: TEXT,
      highlights: [{ id: "task:T1", start, end: start + "First point".length }],
      isStanding: (id: string) => id.startsWith("finding:"),
      onSelect: () => {},
    };
    const { container, rerender } = render(<PlanDocument {...props} active={null} />);
    expect(container.querySelector("mark")).toBeNull();
    rerender(<PlanDocument {...props} active="task:T1" />);
    expect(container.querySelector('mark[data-active="true"]')?.textContent).toBe("First point");
  });
});
