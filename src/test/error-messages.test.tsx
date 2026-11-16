import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "@/components/ui-bits";

describe("server error presentation", () => {
  it("does not expose internal server details in the page error view", () => {
    const internalMessage = "database.internal.example failed: secret query detail";
    render(<RouteError error={new Error(internalMessage)} reset={vi.fn()} />);

    expect(screen.getByText(/Your saved data is safe/)).toBeInTheDocument();
    expect(screen.queryByText(internalMessage)).not.toBeInTheDocument();
  });
});