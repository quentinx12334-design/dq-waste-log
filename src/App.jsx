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

  const [clockNow, setClockNow] = useState(new Date())

  const [view, setView] = useState("employee")
  const [counts, setCounts] = useState(EMPTY_COUNTS)
  const [message, setMessage] = useState("Ready to count closing waste")
  const [recentEntries, setRecentEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showSavedFlash, setShowSavedFlash] = useState(false)
  const [photoData, setPhotoData] = useState("")
  const [photoPreview, setPhotoPreview] = useState("")
  const [photoInfo, setPhotoInfo] = useState("")
  const [photoBusy, setPhotoBusy] = useState(false)

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

  const isOverGoal = todayWaste >= 5

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

  const groupedMonthEntries = useMemo(() => {
    if (!monthSummary?.entries?.length) return []

    const groups = new Map()

    monthSummary.entries.forEach((entry) => {
      const dateKey = new Date(entry.created_at).toLocaleDateString()
      const timeKey = formatTime(entry.created_at)
      const photoKey = entry.photo_id || "no-photo"
      const groupKey = `${dateKey}-${timeKey}-${photoKey}`

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          created_at: entry.created_at,
          photo_url: entry.photo_url,
          photo_id: entry.photo_id,
          entries: [],
          total_cost: 0,
          total_quantity: 0,
        })
      }

      const group = groups.get(groupKey)
      group.entries.push(entry)
      group.total_cost += Number(entry.total_cost || 0)
      group.total_quantity += Number(entry.quantity || 0)
    })

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
  }, [monthSummary])

    const groupedRecentEntries = useMemo(() => {
    if (!recentEntries?.length) return []

    const groups = new Map()

    recentEntries.forEach((entry) => {
      const dateKey = new Date(entry.created_at).toLocaleDateString()
      const timeKey = formatTime(entry.created_at)
      const photoKey = entry.photo_id || "no-photo"
      const groupKey = `${dateKey}-${timeKey}-${photoKey}`

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          created_at: entry.created_at,
          photo_url: entry.photo_url,
          photo_id: entry.photo_id,
          entries: [],
          total_cost: 0,
          total_quantity: 0,
        })
      }

      const group = groups.get(groupKey)
      group.entries.push(entry)
      group.total_cost += Number(entry.total_cost || 0)
      group.total_quantity += Number(entry.quantity || 0)
    })

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
  }, [recentEntries])

  useEffect(() => {
    loadRecentEntries()
    loadTodaySummary()
  }, [])

  useEffect(() => {
    const clockTimer = window.setInterval(() => {
      setClockNow(new Date())
    }, 1000)

    return () => window.clearInterval(clockTimer)
  }, [])

  useEffect(() => {
    function getNextTwoAM() {
      const now = new Date()
      const nextTwoAM = new Date()

      nextTwoAM.setHours(2, 0, 0, 0)
      if (nextTwoAM <= now) {
        nextTwoAM.setDate(nextTwoAM.getDate() + 1)
      }

      return nextTwoAM
    }

    const nextRefresh = getNextTwoAM()
    const delayUntilRefresh = nextRefresh.getTime() - Date.now()

    const refreshTimer = window.setTimeout(() => {
      window.location.reload()
    }, delayUntilRefresh)

    return () => window.clearTimeout(refreshTimer)
  }, [])

  async function loadRecentEntries() {
    try {
      const response = await fetch(`${API_BASE}/api/entries/recent?limit=10`)
      const data = await response.json()

      setRecentEntries(data)
    } catch {
      setMessage("Ready to count closing waste")
    }
  }

  async function loadTodaySummary() {
    try {
      const response = await fetch(`${API_BASE}/api/summary?period=today`)
      const data = await response.json()

      setSummary(data)
    } catch {
      setSummary(null)
      setMessage("Ready to count closing waste")
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
    removeSelectedPhoto()
    setMessage("Current count cleared")
  }

  function removeSelectedPhoto() {
    setPhotoData("")
    setPhotoPreview("")
    setPhotoInfo("")
  }

  function getPhotoUrl(photoUrl) {
    if (!photoUrl) return ""
    if (photoUrl.startsWith("http")) return photoUrl
    return `${API_BASE}${photoUrl}`
  }

  async function compressSelectedPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) return

    if (!file.type.startsWith("image/")) {
      setMessage("Choose an image file")
      return
    }

    setPhotoBusy(true)
    setMessage("Compressing waste photo...")

    try {
      const compressedPhoto = await compressImage(file)

      setPhotoData(compressedPhoto.dataUrl)
      setPhotoPreview(compressedPhoto.dataUrl)
      setPhotoInfo(`Photo ready • ${compressedPhoto.sizeKb} KB`)
      setMessage("Waste photo added")
    } catch {
      setMessage("Could not read photo — try again")
      removeSelectedPhoto()
    } finally {
      setPhotoBusy(false)
    }
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        const image = new Image()

        image.onload = () => {
          const maxSize = 1200
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
          const width = Math.round(image.width * scale)
          const height = Math.round(image.height * scale)

          const canvas = document.createElement("canvas")
          canvas.width = width
          canvas.height = height

          const context = canvas.getContext("2d")
          context.drawImage(image, 0, 0, width, height)

          let quality = 0.72
          let dataUrl = canvas.toDataURL("image/jpeg", quality)

          while (dataUrl.length > 850000 && quality > 0.42) {
            quality -= 0.08
            dataUrl = canvas.toDataURL("image/jpeg", quality)
          }

          resolve({
            dataUrl,
            sizeKb: Math.round((dataUrl.length * 0.75) / 1024),
          })
        }

        image.onerror = reject
        image.src = reader.result
      }

      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function saveSubmittedEntry(data) {
    setCounts(EMPTY_COUNTS)
    removeSelectedPhoto()

    setMessage(
      `Saved successfully • ${data.items_saved} item type(s) • $${data.entry_total.toFixed(2)}`
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
          photo_data: photoData || null,
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

  function openManagerSummary() {
    setView("manager")
  }

  function goBackToKiosk() {
    setView("employee")
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
                  Export {selectedYear} Report
                </button>

                <button className="twoYearButton" onClick={exportTwoYearReport}>
                  Export Full Report
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
                        {monthSummary.row_count} saved entries •{" "}
                        {monthSummary.total_quantity} items wasted
                      </span>
                    </div>

                    <button onClick={exportSelectedMonth}>
                      Export Monthly Report
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
                      <p>Entries Saved</p>
                      <strong>{monthSummary.row_count || 0}</strong>
                      <span>Saved waste entries</span>
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
                        {groupedMonthEntries.length === 0 ? (
                          <p className="emptyText">
                            No entries for this month.
                          </p>
                        ) : (
                          groupedMonthEntries.map((group) => (
                            <div className="entryRow dayEntryRow" key={group.key}>
                              <div>
                                <strong>
                                  {formatDate(group.created_at)} •{" "}
                                  {formatTime(group.created_at)}
                                </strong>

                                <p>
                                  {group.entries
                                    .map(
                                      (entry) =>
                                        `${entry.item_name} x${entry.quantity}`
                                    )
                                    .join(" • ")}
                                </p>
                              </div>

                              <div className="entryActions">
                                {group.photo_url && (
                                  <button
                                    className="photoViewBtn"
                                    onClick={() =>
                                      window.open(
                                        getPhotoUrl(group.photo_url),
                                        "_blank"
                                      )
                                    }
                                  >
                                    Photo
                                  </button>
                                )}

                                <span>${group.total_cost.toFixed(2)}</span>
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
            <div className="kioskClock" aria-label="Current time">
              <strong>
                {clockNow.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </strong>
              <span>
                {clockNow.toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>

            <button className="managerBtn" onClick={openManagerSummary}>
              Manager Summary
            </button>
          </div>
        </header>

        <section className="topStats">
          <div className={isOverGoal ? "totalPanel warning" : "totalPanel"}>
            <p>Today’s Total</p>
            <strong>${todayWaste.toFixed(2)}</strong>
            <span>
              {isOverGoal ? "Above daily target" : "Within daily target"}
            </span>
          </div>

          <div className="smallStat">
            <p>Current Count</p>
            <strong>${currentTotal.toFixed(2)}</strong>
            <span>{currentQuantity} items selected</span>
          </div>

          <div className="smallStat">
            <p>Daily Goal</p>
            <strong>$5.00</strong>
            <span>Goal is $5 or less</span>
          </div>
        </section>

        <section className="mainArea">
          <section className="entryArea">
            <div className="sectionTitle">
              <div>
                <h2>Closing Waste Count</h2>
                <p>Tap plus or minus for each wasted item.</p>
              </div>

              <span className="saveStatus">{message}</span>
            </div>

            <div className="wasteRows">
              {ITEMS.map((item) => {
                const quantity = counts[item.name]
                const rowTotal = quantity * item.price

                return (
                  <div className="wasteRow" key={item.name}>
                    <div className="itemName">
                      <span>{item.category}</span>
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
                      <strong>${rowTotal.toFixed(2)}</strong>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <aside className="recentArea">
            <div className="sectionTitle">
              <div>
                <h2>Recent</h2>
                <p>Today’s saved waste.</p>
              </div>
            </div>

            <div className="recentList">
              {groupedRecentEntries.length === 0 ? (
  <div className="emptyState">
    <strong>No entries yet</strong>
    <p>Saved waste will show here after submitting.</p>
  </div>
) : (
  groupedRecentEntries.map((group) => (
    <div className="recentCard recentGroupCard" key={group.key}>
      <div>
        <strong>{formatTime(group.created_at)}</strong>
        <p>
          {group.entries
            .map((entry) => `${entry.item_name} x${entry.quantity}`)
            .join(" • ")}
        </p>
      </div>

      <span>${group.total_cost.toFixed(2)}</span>
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

          <div className={photoPreview ? "photoCapture hasPhoto" : "photoCapture"}>
            <input
              id="wastePhotoInput"
              accept="image/*"
              capture="environment"
              type="file"
              onChange={compressSelectedPhoto}
            />

            <label htmlFor="wastePhotoInput" className="photoBtn">
              {photoPreview ? "Replace Photo" : "Add Waste Photo"}
            </label>

            {photoPreview && (
              <div className="photoMiniPreview">
                <img src={photoPreview} alt="Waste bucket preview" />
                <div>
                  <strong>Photo Added</strong>
                  <span>{photoInfo || "Ready to submit"}</span>
                </div>
                <button type="button" onClick={removeSelectedPhoto}>
                  Remove
                </button>
              </div>
            )}
          </div>

          <button
            className="submitBtn"
            disabled={loading || photoBusy}
            onClick={() => submitEntry(false)}
          >
            {loading
              ? "Saving..."
              : photoBusy
                ? "Preparing Photo..."
                : "Submit Closing Waste"}
          </button>
        </footer>
      </section>

      {showSavedFlash && (
        <div className="savedToast">
          <strong>Saved</strong>
          <span>Closing waste count recorded.</span>
        </div>
      )}
    </main>
  )
}

export default App
