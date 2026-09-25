import { fireEvent, render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RouteError } from "@/components/route-error"
import i18n from "@/i18n"

function Broken(): never { throw new Error("private-debug-marker") }

describe("branded route error", () => {
  beforeEach(() => vi.restoreAllMocks())

  it.each([
    ["en", "Something went wrong", "Try Again", "Back to Dashboard"],
    ["th", "เกิดข้อผิดพลาด", "ลองอีกครั้ง", "กลับไปแดชบอร์ด"],
  ])("uses %s labels and recovers", async (language, title, retry, dashboard) => {
    await i18n.changeLanguage(language)
    const onRetry = vi.fn()
    const router = createMemoryRouter([
      { path: "/", element: <p>Dashboard recovered</p> },
      { path: "/broken", element: <Broken />, errorElement: <RouteError onRetry={onRetry} /> },
    ], { initialEntries: ["/broken"] })
    render(<RouterProvider router={router} />)
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument()
    expect(screen.queryByText(/private-debug-marker/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: retry }))
    expect(onRetry).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("link", { name: dashboard }))
    expect(await screen.findByText("Dashboard recovered")).toBeInTheDocument()
  })
})
