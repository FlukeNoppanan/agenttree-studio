import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import i18n from "@/i18n"
import { api, type TreeListItem } from "@/lib/api"
import { TreeListPage } from "@/pages/trees/tree-list"

const trees: TreeListItem[] = [
  { id: "ready-1", name: "Ready Assistant", description: "production", status: "ready", version_number: 2, managers_count: 1, specialists_count: 1, updated_at: "2026-09-25T00:00:00Z" },
  { id: "draft-1", name: "Draft Assistant", description: "work in progress", status: "draft", version_number: 1, managers_count: 0, specialists_count: 0, updated_at: "2026-09-25T00:00:00Z" },
]

describe("Tree list", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage("en"); vi.spyOn(api, "listTrees").mockResolvedValue(trees) })

  it("allows Ready Tree editing and filters by name or description", async () => {
    render(<MemoryRouter initialEntries={["/trees"]}><Routes><Route path="trees" element={<TreeListPage />} /><Route path="trees/:treeId/edit" element={<p>Editing Tree</p>} /></Routes></MemoryRouter>)
    expect(await screen.findByText("Ready Assistant")).toBeInTheDocument()
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Trees" }), { target: { value: "production" } })
    expect(screen.getByText("Ready Assistant")).toBeInTheDocument()
    expect(screen.queryByText("Draft Assistant")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByText("Editing Tree")).toBeInTheDocument()
  })
})
