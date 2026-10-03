import { fireEvent, render, screen, within, waitFor } from "@testing-library/react"
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

  it("requires explicit confirmation and Cancel makes no deletion request", async () => {
    const remove = vi.spyOn(api, "deleteTree").mockResolvedValue(undefined)
    render(<MemoryRouter><TreeListPage /></MemoryRouter>)
    const row = (await screen.findByText("Ready Assistant")).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/associated Runs and Trace/)).toBeVisible()
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it("deletes only the confirmed Tree and retains other rows", async () => {
    const remove = vi.spyOn(api, "deleteTree").mockResolvedValue(undefined)
    render(<MemoryRouter><TreeListPage /></MemoryRouter>)
    const row = (await screen.findByText("Ready Assistant")).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('ready-1'))
    expect(screen.getByText('Draft Assistant')).toBeVisible()
    expect(screen.queryByText('Ready Assistant')).not.toBeInTheDocument()
  })
})
