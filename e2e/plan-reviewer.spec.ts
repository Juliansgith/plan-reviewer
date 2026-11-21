import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("plan list", () => {
  test("shows every plan with a verdict, and every plan page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Event plans" })).toBeVisible();
    await expect(page.getByText("1 day late")).toBeVisible();
    await expect(page.getByText("Can't be scheduled")).toBeVisible();
    await expect(page.getByText("Review can't be shown")).toBeVisible();

    const links = await page.getByRole("link", { name: /Pellerby/ }).all();
    expect(links.length).toBe(4);
    for (const href of await Promise.all(links.map((link) => link.getAttribute("href")))) {
      const response = await page.goto(href!);
      expect(response?.status(), href!).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("answers an unknown plan with a friendly 404", async ({ page }) => {
    const response = await page.goto("/plans/no-such-plan");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Plan not found" })).toBeVisible();
  });
});

test.describe("plan page", () => {
  test("leads with the verdict and links each remark to the plan", async ({ page }) => {
    await page.goto("/plans/test-fair");
    const verdict = page.getByRole("region", { name: "Verdict" });
    await expect(verdict.getByRole("heading", { name: "Will finish 1 day late" })).toBeVisible();
    await expect(verdict).toContainText("Ann has 7 days of work");

    const remarks = page.getByRole("region", { name: "What needs fixing" });
    await remarks.getByRole("button", { name: "See this in the plan" }).first().click();
    const active = page.locator('mark[data-active="true"]');
    await expect(active).toHaveText("Everything must be done by day 6.");
    await expect(active).toBeInViewport();
  });

  test("lets Nora correct the review, keeps it across a reload, and discards it", async ({
    page,
  }) => {
    await page.goto("/plans/test-fair");
    await page.getByRole("button", { name: "Change tasks" }).click();
    await page.getByRole("spinbutton", { name: "Days for Print posters" }).fill("2");

    const corrections = page.getByRole("region", { name: "Your changes" });
    await expect(corrections).toContainText(
      "Finishes on day 5 instead of day 7, 2 days sooner. Now on time, with 1 day to spare.",
    );
    await expect(page.getByRole("region", { name: "Verdict" }).getByRole("heading")).toHaveText(
      "On time, with 1 day to spare",
    );

    await page.reload();
    await expect(corrections).toContainText("Print posters: 4 → 2 days");
    await corrections.getByRole("button", { name: "Undo all changes" }).click();
    await expect(page.getByRole("region", { name: "Verdict" }).getByRole("heading")).toHaveText(
      "Will finish 1 day late",
    );
  });

  test("explains a plan that cannot be scheduled", async ({ page }) => {
    await page.goto("/plans/harbour-run");
    const verdict = page.getByRole("region", { name: "Verdict" });
    await expect(verdict.getByRole("heading")).toHaveText("Can't be scheduled");
    await expect(verdict).toContainText("Take out the event insurance");
    await expect(page.getByText("The plan gives different deadlines")).toBeVisible();
    await expect(page.getByText("The plan tries to direct the review")).toBeVisible();
  });

  test("sorts out a must-fix remark from the remark itself", async ({ page }) => {
    await page.goto("/plans/harbour-run");
    const verdict = page.getByRole("region", { name: "Verdict" }).getByRole("heading");
    await expect(verdict).toHaveText("Can't be scheduled");

    const circle = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "Tasks wait on each other in a circle" }) });
    await circle.getByRole("button", { name: 'Do "Take out the event insurance" first' }).click();
    await expect(circle).toContainText("Sorted by your changes");
    await expect(verdict).toHaveText("No clear deadline");

    await page.getByRole("button", { name: "Use day 35" }).click();
    await expect(verdict).not.toHaveText("No clear deadline");
    await expect(page.getByRole("region", { name: "Your changes" })).toContainText(
      "Deadline: none → day 35",
    );
  });

  test("hands a task to someone else by dragging it to their row", async ({ page }) => {
    await page.goto("/plans/test-fair");
    // Mouse positions are on the screen, so the timeline must be on it.
    await page.getByRole("group", { name: /^Schedule by person/ }).scrollIntoViewIfNeeded();
    const stewards = await page.getByRole("button", { name: /^Find stewards,/ }).boundingBox();
    const hall = await page.getByRole("button", { name: /^Book the hall,/ }).boundingBox();
    await page.mouse.move(stewards!.x + 10, stewards!.y + stewards!.height / 2);
    await page.mouse.down();
    await page.mouse.move(stewards!.x + 12, hall!.y + hall!.height / 2, { steps: 8 });
    await expect(page.getByRole("status")).toHaveText('Give "Find stewards" to Ann');
    await page.mouse.up();
    await expect(page.getByRole("region", { name: "Your changes" })).toContainText(
      "Find stewards: owner Bob → Ann",
    );
    await expect(page.getByRole("region", { name: "Verdict" }).getByRole("heading")).toHaveText(
      "Will finish 3 days late",
    );
  });

  test("shortens a task by dragging its end", async ({ page }) => {
    await page.goto("/plans/test-fair");
    await page.getByRole("group", { name: /^Schedule by person/ }).scrollIntoViewIfNeeded();
    const posters = await page.getByRole("button", { name: /^Print posters,/ }).boundingBox();
    const perDay = posters!.width / 4;
    const y = posters!.y + posters!.height / 2;
    await page.mouse.move(posters!.x + posters!.width - 3, y);
    await page.mouse.down();
    await page.mouse.move(posters!.x + posters!.width - 3 - 2 * perDay, y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("region", { name: "Your changes" })).toContainText(
      "Print posters: 4 → 2 days",
    );
    await expect(page.getByRole("region", { name: "Verdict" }).getByRole("heading")).toHaveText(
      "On time, with 1 day to spare",
    );
  });

  test("refuses to show a review that fails its checks, and says why", async ({ page }) => {
    await page.goto("/plans/lantern-festival");
    await expect(page.getByRole("heading", { name: "This review can't be shown" })).toBeVisible();
    await expect(page.getByText(/is not in the plan/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Verdict" })).toHaveCount(0);
  });
});

test.describe("accessibility", () => {
  for (const path of ["/", "/plans/test-fair", "/plans/harbour-run", "/plans/lantern-festival"]) {
    test(`${path} has no WCAG A or AA violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id}: ${v.help} — ${v.nodes
              .slice(0, 4)
              .map((n) => n.target.join(" "))
              .join(", ")}`,
        ),
      ).toEqual([]);
    });
  }
});

test.describe("API", () => {
  test("answers the contract's example request", async ({ request }) => {
    const response = await request.post("/api/schedule", {
      data: {
        tasks: [
          { id: "A", name: "Book the hall", owner: "Ann", duration_days: 3, depends_on: [] },
          { id: "B", name: "Sign the contract", owner: "Ann", duration_days: 2, depends_on: ["A"] },
          { id: "C", name: "Design the poster", owner: "Ann", duration_days: 4, depends_on: [] },
          { id: "D", name: "Print the poster", owner: "Bob", duration_days: 2, depends_on: ["C"] },
        ],
        deadline_day: 10,
      },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "scheduled",
      end_day: 9,
      meets_deadline: true,
    });
  });
});
