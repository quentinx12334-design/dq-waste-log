import { useEffect, useMemo, useState } from "react"
import "./App.css"

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000"

const ITEMS = [
  { name: "Patties", price: 0.66, category: "Grill" },
  { name: "Strips", price: 0.4, category: "Chicken" },
  { name: "Buns", price: 0.21, category: "Bread" },
  { name: "Bacon", price: 0.13, category: "Grill" },
  { name: "Toast", price: 0.1, category: "Bread" },
]

const EMPTY_COUNTS = {
  Patties: 0,
  Strips: 0,
  Buns: 0,
  Bacon: 0,
  Toast: 0,
}

const MANAGER_PIN = "2580"

const MONTHS = [
  { number: "01", short: "Jan", name: "January" },
  { number: "02", short: "Feb", name: "February" },
  { number: "03", short: "Mar", name: "March" },
  { number: "04", short: "Apr", name: "April" },
  { number: "05", short: "May", name: "May" },
  { number: "06", short: "Jun", name: "June" },
  { number: "07", short: "Jul", name: "July" },
  { number: "08", short: "Aug", name: "August" },
  { number: "09", short: "Sep", name: "September" },
  { number: "10", short: "Oct", name: "October" },
  { number: "11", short: "Nov", name: "November" },
  { number: "12", short: "Dec", name: "December" },
]

function App() {
  const currentYear = new Date().getFullYear()

  const [view, setView] = useState("employee")
  const [counts, setCounts] = useState(EMPTY_COUNTS)
  const [message, setMessage] = useState("Ready for closing waste count")
  const [recentEntries, setRecentEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [managerPin, setManagerPin] = useState("")
  const [managerError, setManagerError] = useState("")
  const [showSavedFlash, setShowSavedFlash] = useState(false)

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState("")
  const [monthSummary, setMonthSummary] = useState(null)
  const [managerMessage, setManagerMessage] = useState(
    "Select a month to view records"
  )

  const [editingEntry, setEditingEntry] = useState(null)
  const [editForm, setEditForm] = useState({
    item_name: "Patties",
    quantity: 1,
    employee_name: "",
    note: "",
  })

  const currentTotal = useMemo(() => {
    return ITEMS.reduce((sum, item) => sum + counts[item.name] * item.price, 0)
  }, [counts])

  const currentQuantity = useMemo(() => {
    return Object.values(counts).reduce((sum, count) => sum + count, 0)
  }, [counts])

  const todayWaste =
    (summary?.period === "today" ? summary.total_cost : 0) + currentTotal

  const dailyGoal = 5
  const goalDifference = Math.abs(dailyGoal - todayWaste)
  const isOverGoal = todayWaste > dailyGoal

  const topMonthItem = useMemo(() => {
    if (!monthSummary?.items?.length) return null

    return [...monthSummary.items].sort(
      (a, b) => b.total_cost - a.total_cost
    )[0]
  }, [monthSummary])

  const averageMonthlyRecord = useMemo(() => {
    if (!monthSummary?.row_count) return 0

    return (monthSummary.total_cost || 0) / monthSummary.row_count
  }, [monthSummary])

  useEffect(() => {
    loadRecentEntries()
    loadTodaySummary()
  }, [])

  async function loadRecentEntries() {
    try {
      const response = await fetch(`${API_BASE}/api/entries/recent?limit=10`)
      const data = await response.json()

      setRecentEntries(data)
    } catch {
      setMessage("Ready for closing waste count")
    }
  }

  async function loadTodaySummary() {
    try {
      const response = await fetch(`${API_BASE}/api/summary?period=today`)
      const data = await response.json()

      setSummary(data)
    } catch {
      setSummary(null)
      setMessage("Ready for closing waste count")
    }
  }

  async function loadMonthReport(monthValue) {
    try {
      setManagerMessage("Loading month...")

      const response = await fetch(
        `${API_BASE}/api/summary/month?month=${monthValue}`
      )

      const data = await response.json()

      setSelectedMonth(monthValue)
      setMonthSummary(data)
      setManagerMessage(`${monthValue} loaded`)
    } catch {
      setManagerMessage("Could not load month report")
    }
  }

  function changeYear(amount) {
    setSelectedYear((prev) => prev + amount)
    setSelectedMonth("")
    setMonthSummary(null)
    setEditingEntry(null)
    setManagerMessage("Select a month to view records")
  }

  function exportSelectedMonth() {
    if (!selectedMonth) {
      setManagerMessage("Select a month before exporting")
      return
    }

    window.open(`${API_BASE}/api/export/month?month=${selectedMonth}`, "_blank")
  }

  function exportSelectedYear() {
    window.open(`${API_BASE}/api/export/year?year=${selectedYear}`, "_blank")
  }

  function exportTwoYearReport() {
    window.open(`${API_BASE}/api/export/two-years`, "_blank")
  }

  function updateCount(name, amount) {
    setCounts((prev) => ({
      ...prev,
      [name]: Math.max(0, prev[name] + amount),
    }))

    setMessage("Unsaved closing count")
  }

  function clearEntry() {
    setCounts(EMPTY_COUNTS)
    setMessage("Current count cleared")
  }

  async function saveSubmittedEntry(data) {
    setCounts(EMPTY_COUNTS)

    setMessage(
      `Saved ${data.items_saved} item type(s) • $${data.entry_total.toFixed(2)}`
    )

    setShowSavedFlash(true)
    window.setTimeout(() => setShowSavedFlash(false), 1400)

    await loadRecentEntries()
    await loadTodaySummary()

    if (selectedMonth) {
      await loadMonthReport(selectedMonth)
    }
  }

  async function submitEntry(force = false) {
    if (currentQuantity === 0) {
      setMessage("Add at least one item before submitting")
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          counts,
          employee_name: "",
          note: "",
          force,
        }),
      })

      const data = await response.json()

      if (response.status === 409 && data.duplicate_warning && !force) {
        const confirmExtraSubmit = window.confirm(
          "A closing waste count has already been submitted today. Submit another one?"
        )

        if (!confirmExtraSubmit) {
          setMessage("Submit canceled")
          return
        }

        await submitEntry(true)
        return
      }

      if (!response.ok) {
        setMessage(data.error || "Could not submit entry")
        return
      }

      await saveSubmittedEntry(data)
    } catch {
      setMessage("Connection issue — try again")
    } finally {
      setLoading(false)
    }
  }

  function openEdit(entry) {
    setEditingEntry(entry)

    setEditForm({
      item_name: entry.item_name,
      quantity: entry.quantity,
      employee_name: entry.employee_name || "",
      note: entry.note || "",
    })
  }

  function closeEdit() {
    setEditingEntry(null)

    setEditForm({
      item_name: "Patties",
      quantity: 1,
      employee_name: "",
      note: "",
    })
  }

  async function saveEdit() {
    if (!editingEntry) return

    try {
      const response = await fetch(`${API_BASE}/api/entries/${editingEntry.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editForm),
      })

      const data = await response.json()

      if (!response.ok) {
        setManagerMessage(data.error || "Could not update entry")
        return
      }

      setManagerMessage("Entry updated")
      closeEdit()

      await loadRecentEntries()
      await loadTodaySummary()

      if (selectedMonth) {
        await loadMonthReport(selectedMonth)
      }
    } catch {
      setManagerMessage("Connection issue — try again")
    }
  }

  async function deleteEdit() {
    if (!editingEntry) return

    const confirmDelete = window.confirm("Delete this waste entry?")
    if (!confirmDelete) return

    try {
      const response = await fetch(`${API_BASE}/api/entries/${editingEntry.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        setManagerMessage(data.error || "Could not delete entry")
        return
      }

      setManagerMessage("Entry deleted")
      closeEdit()

      await loadRecentEntries()
      await loadTodaySummary()

      if (selectedMonth) {
        await loadMonthReport(selectedMonth)
      }
    } catch {
      setManagerMessage("Connection issue — try again")
    }
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
  }

  function formatDate(value) {
    return new Date(value).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })
  }

  function prettyMonth(monthValue) {
    if (!monthValue) return "No month selected"

    const [year, month] = monthValue.split("-")
    const found = MONTHS.find((item) => item.number === month)

    return `${found?.name || month} ${year}`
  }

  function openManagerGate() {
    setManagerError("")
    setManagerPin("")
    setView("managerGate")
  }

  function unlockManager(event) {
    event.preventDefault()

    if (managerPin !== MANAGER_PIN) {
      setManagerError("Wrong PIN")
      return
    }

    setManagerError("")
    setManagerPin("")
    setView("manager")
  }

  function goBackToKiosk() {
    setView("employee")
    setManagerPin("")
    setManagerError("")
  }

  if (view === "managerGate") {
    return (
      <main className="app gateApp">
        <section className="pinShell">
          <div className="pinCard">
            <div className="pinBadge">DQ</div>

            <p>Summary Access</p>
            <h1>Enter PIN</h1>

            <span>Summary reports, exports, edits, and delete controls.</span>

            <form onSubmit={unlockManager}>
              <input
                autoFocus
                inputMode="numeric"
                maxLength="4"
                placeholder="••••"
                type="password"
                value={managerPin}
                onChange={(event) => {
                  setManagerPin(event.target.value.replace(/\D/g, ""))
                  setManagerError("")
                }}
              />

              {managerError && (
                <strong className="pinError">{managerError}</strong>
              )}

              <button type="submit">Unlock Summary</button>

              <button
                className="pinCancel"
                type="button"
                onClick={goBackToKiosk}
              >
                Back to Kiosk
              </button>
            </form>
          </div>
        </section>
      </main>
    )
  }

  if (view === "manager") {
    return (
      <main className="app">
        <section className="managerShell">
          <header className="managerTop">
            <div>
              <p>Summary Dashboard</p>
              <h1>Waste Summary</h1>
              <span>{managerMessage}</span>
            </div>

            <button onClick={goBackToKiosk}>Back to Kiosk</button>
          </header>

          <section className="managerWorkspace">
            <aside className="monthPanel">
              <div className="yearCard">
                <button onClick={() => changeYear(-1)}>−</button>

                <div>
                  <p>Selected Year</p>
                  <strong>{selectedYear}</strong>
                </div>

                <button onClick={() => changeYear(1)}>+</button>
              </div>

              <div className="exportButtons">
                <button className="annualButton" onClick={exportSelectedYear}>
                  Download {selectedYear} Report
                </button>

                <button className="twoYearButton" onClick={exportTwoYearReport}>
                  Download 2-Year Report
                </button>
              </div>

              <div className="monthGrid">
                {MONTHS.map((month) => {
                  const monthValue = `${selectedYear}-${month.number}`

                  return (
                    <button
                      key={monthValue}
                      className={
                        selectedMonth === monthValue
                          ? "monthTile activeMonthTile"
                          : "monthTile"
                      }
                      onClick={() => loadMonthReport(monthValue)}
                    >
                      <span>{month.number}</span>
                      <strong>{month.short}</strong>
                    </button>
                  )
                })}
              </div>
            </aside>

            <section className="reportPanel">
              {!monthSummary ? (
                <div className="emptyReport">
                  <h2>Select a month</h2>
                  <p>
                    Choose one of the 12 months on the left. The report, entry
                    history, edit buttons, and export button will appear here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="reportHeader">
                    <div>
                      <p>Monthly Summary</p>
                      <h2>{prettyMonth(monthSummary.month)}</h2>
                      <span>
                        {monthSummary.row_count} records •{" "}
                        {monthSummary.total_quantity} items wasted
                      </span>
                    </div>

                    <button onClick={exportSelectedMonth}>
                      Download Monthly Report
                    </button>
                  </div>

                  <div className="managerStats">
                    <div>
                      <p>Monthly Loss</p>
                      <strong>
                        ${(monthSummary.total_cost || 0).toFixed(2)}
                      </strong>
                      <span>Estimated food cost</span>
                    </div>

                    <div>
                      <p>Items Wasted</p>
                      <strong>{monthSummary.total_quantity || 0}</strong>
                      <span>Total items logged</span>
                    </div>

                    <div>
                      <p>Counts Saved</p>
                      <strong>{monthSummary.row_count || 0}</strong>
                      <span>Waste records saved</span>
                    </div>

                    <div>
                      <p>Top Item</p>
                      <strong>{topMonthItem?.item_name || "—"}</strong>
                      <span>
                        {topMonthItem
                          ? `$${topMonthItem.total_cost.toFixed(2)} lost`
                          : "No waste logged"}
                      </span>
                    </div>
                  </div>

                  <div className="insightStrip">
                    <div>
                      <p>Average per Entry</p>
                      <strong>${averageMonthlyRecord.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="reportGrid">
                    <div className="reportCard">
                      <h3>Item Breakdown</h3>

                      <table>
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Cost</th>
                          </tr>
                        </thead>

                        <tbody>
                          {ITEMS.map((item) => {
                            const found = monthSummary.items?.find(
                              (row) => row.item_name === item.name
                            )

                            return (
                              <tr key={item.name}>
                                <td>{item.name}</td>
                                <td>{found?.quantity || 0}</td>
                                <td>${(found?.total_cost || 0).toFixed(2)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="reportCard">
                      <h3>Entry History</h3>

                      <div className="entryList">
                        {monthSummary.entries?.length === 0 ? (
                          <p className="emptyText">
                            No entries for this month.
                          </p>
                        ) : (
                          monthSummary.entries.map((entry) => (
                            <div className="entryRow" key={entry.id}>
                              <div>
                                <strong>{entry.item_name}</strong>
                                <p>
                                  {formatDate(entry.created_at)} •{" "}
                                  {formatTime(entry.created_at)} • Qty{" "}
                                  {entry.quantity}
                                </p>
                              </div>

                              <div className="entryActions">
                                <span>${entry.total_cost.toFixed(2)}</span>

                                <button onClick={() => openEdit(entry)}>
                                  Edit
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          </section>
        </section>

        {editingEntry && (
          <section className="editOverlay">
            <div className="editPanel">
              <div className="editHeader">
                <div>
                  <p>Summary Edit</p>
                  <h2>Edit Waste Entry</h2>
                  <span>Entry #{editingEntry.id}</span>
                </div>

                <button onClick={closeEdit}>×</button>
              </div>

              <div className="editGrid">
                <label>
                  Item
                  <select
                    value={editForm.item_name}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        item_name: event.target.value,
                      }))
                    }
                  >
                    {ITEMS.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    value={editForm.quantity}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        quantity: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  Employee
                  <input
                    value={editForm.employee_name}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        employee_name: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>

                <label className="noteField">
                  Note
                  <textarea
                    value={editForm.note}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        note: event.target.value,
                      }))
                    }
                    placeholder="Optional note"
                  />
                </label>
              </div>

              <div className="editActions">
                <button className="deleteEntryBtn" onClick={deleteEdit}>
                  Delete
                </button>

                <button className="cancelEditBtn" onClick={closeEdit}>
                  Cancel
                </button>

                <button className="saveEditBtn" onClick={saveEdit}>
                  Save Changes
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    )
  }

  return (
    <main className="app">
      <section className="kiosk">
        <header className="header">
          <div className="brand">
            <div className="brandIcon">DQ</div>

            <div>
              <p>Closing Operations</p>
              <h1>Waste Log</h1>
            </div>
          </div>

          <div className="headerMeta">
            <p>
              {new Date().toLocaleDateString([], {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </p>

            <button className="managerBtn" onClick={openManagerGate}>
              Summary
            </button>
          </div>
        </header>

        <section className="topStats">
          <div className={isOverGoal ? "totalPanel warning" : "totalPanel"}>
            <p>Daily Waste Goal</p>
            <strong>$5.00</strong>
            <span className={isOverGoal ? "goalStatus over" : "goalStatus under"}>
              {isOverGoal
                ? `$${goalDifference.toFixed(2)} over goal today`
                : `$${goalDifference.toFixed(2)} under goal today`}
            </span>
          </div>

          <div className="smallStat">
            <p>Current Count</p>
            <strong>${currentTotal.toFixed(2)}</strong>
            <span>{currentQuantity} items selected</span>
          </div>

          <div className="smallStat">
            <p>Saved Today</p>
            <strong>{summary?.row_count || 0}</strong>
            <span>Saved entries</span>
          </div>
        </section>

        <section className="mainArea">
          <section className="entryArea">
            <div className="sectionTitle">
              <div>
                <h2>Closing Waste Count</h2>
                <p>Enter the final waste count at close, then submit once.</p>
              </div>

              <div className="saveStatus">
                {loading ? "Saving..." : message}
              </div>
            </div>

            <div className="wasteRows">
              {ITEMS.map((item) => {
                const quantity = counts[item.name]
                const itemTotal = quantity * item.price

                return (
                  <article className="wasteRow" key={item.name}>
                    <div className="itemName">
                      <strong>{item.name}</strong>
                    </div>

                    <div className="itemPrice">
                      <p>Each</p>
                      <strong>${item.price.toFixed(2)}</strong>
                    </div>

                    <button
                      className="qtyBtn minus"
                      onClick={() => updateCount(item.name, -1)}
                    >
                      −
                    </button>

                    <div className="qtyDisplay">
                      <p>Qty</p>
                      <strong>{quantity}</strong>
                    </div>

                    <button
                      className="qtyBtn plus"
                      onClick={() => updateCount(item.name, 1)}
                    >
                      +
                    </button>

                    <div className="rowTotal">
                      <p>Total</p>
                      <strong>${itemTotal.toFixed(2)}</strong>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <aside className="recentArea">
            <div className="sectionTitle compact">
              <div>
                <h2>Recent</h2>
                <p>Latest entries</p>
              </div>
            </div>

            <div className="recentList">
              {recentEntries.length === 0 ? (
                <div className="emptyState">
                  <strong>No submissions yet</strong>
                  <p>Saved entries will appear here.</p>
                </div>
              ) : (
                recentEntries.slice(0, 5).map((entry) => (
                  <div className="recentCard" key={entry.id}>
                    <div>
                      <strong>{entry.item_name}</strong>
                      <p>
                        {formatTime(entry.created_at)} • Qty {entry.quantity}
                      </p>
                    </div>

                    <span>${entry.total_cost.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>

        <footer className="actions">
          <button className="clearBtn" onClick={clearEntry}>
            Clear Count
          </button>

          <button
            className="submitBtn"
            onClick={() => submitEntry(false)}
            disabled={loading}
          >
            Submit Closing Waste
          </button>
        </footer>
      </section>

      {showSavedFlash && (
        <div className="savedToast">
          <strong>Saved</strong>
          <span>Closing waste count logged</span>
        </div>
      )}
    </main>
  )
}

export default App
