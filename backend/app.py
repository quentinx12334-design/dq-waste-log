from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
import csv
import io
import os
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "dq_waste.db"

app = Flask(__name__)
CORS(app)

ITEM_PRICES = {
    "Patties": 0.66,
    "Strips": 0.40,
    "Buns": 0.21,
    "Bacon": 0.13,
    "Toast": 0.10,
}

ITEM_CATEGORIES = {
    "Patties": "Grill",
    "Strips": "Chicken",
    "Buns": "Bread",
    "Bacon": "Grill",
    "Toast": "Bread",
}

APP_SETTINGS = {
    "store_name": "DQ Waste Log",
    "daily_goal": 5.00,
}

RETENTION_YEARS = 2


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS waste_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                cost_per_item REAL NOT NULL,
                total_cost REAL NOT NULL,
                shift TEXT DEFAULT '',
                employee_name TEXT DEFAULT '',
                note TEXT DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_waste_entries_created_at
            ON waste_entries(created_at)
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS deleted_waste_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_entry_id INTEGER NOT NULL,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                cost_per_item REAL NOT NULL,
                total_cost REAL NOT NULL,
                shift TEXT DEFAULT '',
                employee_name TEXT DEFAULT '',
                note TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                deleted_at TEXT NOT NULL,
                void_reason TEXT NOT NULL
            )
        """)

        conn.commit()


def row_to_dict(row):
    return {
        "id": row["id"],
        "item_name": row["item_name"],
        "quantity": row["quantity"],
        "cost_per_item": row["cost_per_item"],
        "total_cost": row["total_cost"],
        "employee_name": row["employee_name"],
        "note": row["note"],
        "created_at": row["created_at"],
    }


def format_money(value):
    return f"${float(value or 0):.2f}"


def format_report_datetime(value):
    if not value:
        return ""

    try:
        parsed = datetime.fromisoformat(str(value))
        return parsed.strftime("%m/%d/%Y %I:%M %p")
    except ValueError:
        return str(value)


def format_report_date(value):
    if not value:
        return ""

    try:
        parsed = datetime.fromisoformat(str(value))
        return parsed.strftime("%m/%d/%Y")
    except ValueError:
        return str(value)


def build_item_lookup(item_rows):
    return {row["item_name"]: row for row in item_rows}


def write_report_header(writer, title, subtitle, report_range, total_quantity, total_cost, row_count):
    generated_at = datetime.now().strftime("%m/%d/%Y %I:%M %p")

    writer.writerow([title])
    writer.writerow([subtitle])
    writer.writerow([])
    writer.writerow(["Report Range", report_range])
    writer.writerow(["Generated", generated_at])
    writer.writerow(["Retention Requirement", f"{RETENTION_YEARS} years minimum"])
    writer.writerow([])
    writer.writerow(["SUMMARY"])
    writer.writerow(["Total Items Wasted", "Total Estimated Loss", "Saved Rows"])
    writer.writerow([total_quantity or 0, format_money(total_cost), row_count or 0])
    writer.writerow([])


def write_section_title(writer, title):
    writer.writerow([])
    writer.writerow([title])


def write_item_breakdown(writer, item_rows):
    item_lookup = build_item_lookup(item_rows)

    write_section_title(writer, "ITEM BREAKDOWN")
    writer.writerow(["Item", "Category", "Quantity", "Cost Per Item", "Estimated Loss"])

    for item_name, price in ITEM_PRICES.items():
        row = item_lookup.get(item_name)
        quantity = row["quantity"] if row else 0
        total_cost = row["total_cost"] if row else 0

        writer.writerow([
            item_name,
            ITEM_CATEGORIES.get(item_name, "Item"),
            quantity,
            format_money(price),
            format_money(total_cost),
        ])


def write_daily_totals(writer, daily_rows):
    write_section_title(writer, "DAILY TOTALS")
    writer.writerow(["Date", "Total Items", "Estimated Loss", "Rows Saved"])

    if not daily_rows:
        writer.writerow(["No waste logged", 0, format_money(0), 0])
        return

    for row in daily_rows:
        writer.writerow([
            format_report_date(row["date"]),
            row["quantity"],
            format_money(row["total_cost"]),
            row["row_count"],
        ])


def write_monthly_totals(writer, monthly_rows):
    write_section_title(writer, "MONTHLY TOTALS")
    writer.writerow(["Month", "Total Items", "Estimated Loss", "Rows Saved"])

    if not monthly_rows:
        writer.writerow(["No waste logged", 0, format_money(0), 0])
        return

    for row in monthly_rows:
        writer.writerow([
            row["month"],
            row["quantity"],
            format_money(row["total_cost"]),
            row["row_count"],
        ])


def write_yearly_totals(writer, yearly_rows):
    write_section_title(writer, "YEARLY TOTALS")
    writer.writerow(["Year", "Total Items", "Estimated Loss", "Rows Saved"])

    if not yearly_rows:
        writer.writerow(["No waste logged", 0, format_money(0), 0])
        return

    for row in yearly_rows:
        writer.writerow([
            row["year"],
            row["quantity"],
            format_money(row["total_cost"]),
            row["row_count"],
        ])


def write_entry_history(writer, entry_rows):
    write_section_title(writer, "FULL ENTRY HISTORY")
    writer.writerow([
        "Entry ID",
        "Date/Time",
        "Item",
        "Quantity",
        "Cost Per Item",
        "Estimated Loss",
        "Employee",
        "Note",
    ])

    if not entry_rows:
        writer.writerow(["No saved entries", "", "", 0, format_money(0), format_money(0), "", ""])
        return

    for row in entry_rows:
        writer.writerow([
            row["id"],
            format_report_datetime(row["created_at"]),
            row["item_name"],
            row["quantity"],
            format_money(row["cost_per_item"]),
            format_money(row["total_cost"]),
            row["employee_name"] or "",
            row["note"] or "",
        ])


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/api/items", methods=["GET"])
def get_items():
    return jsonify([
        {
            "name": name,
            "price": round(price, 2),
            "category": ITEM_CATEGORIES.get(name, "Item"),
        }
        for name, price in ITEM_PRICES.items()
    ])


@app.route("/api/items", methods=["PUT"])
def update_items():
    data = request.get_json(force=True)
    incoming_items = data.get("items", [])

    if not isinstance(incoming_items, list) or not incoming_items:
        return jsonify({"error": "Items list is required."}), 400

    for item in incoming_items:
        item_name = item.get("name")
        if item_name not in ITEM_PRICES:
            continue

        try:
            price = round(float(item.get("price", 0)), 2)
        except (TypeError, ValueError):
            return jsonify({"error": f"Invalid price for {item_name}."}), 400

        if price < 0:
            return jsonify({"error": f"Price for {item_name} cannot be negative."}), 400

        ITEM_PRICES[item_name] = price

    return get_items()


@app.route("/api/settings", methods=["GET"])
def get_settings():
    return jsonify(APP_SETTINGS)


@app.route("/api/settings", methods=["PUT"])
def update_settings():
    data = request.get_json(force=True)
    store_name = str(data.get("store_name", APP_SETTINGS["store_name"])).strip() or "DQ Waste Log"

    try:
        daily_goal = round(float(data.get("daily_goal", APP_SETTINGS["daily_goal"])), 2)
    except (TypeError, ValueError):
        return jsonify({"error": "Daily goal must be a number."}), 400

    if daily_goal < 0:
        return jsonify({"error": "Daily goal cannot be negative."}), 400

    APP_SETTINGS["store_name"] = store_name
    APP_SETTINGS["daily_goal"] = daily_goal
    return jsonify(APP_SETTINGS)


@app.route("/api/entries", methods=["POST"])
def create_entry():
    data = request.get_json(force=True)

    counts = data.get("counts", {})
    shift = data.get("shift", "")
    employee_name = data.get("employee_name", "")
    note = data.get("note", "")
    force = bool(data.get("force", False))
    now = datetime.now()
    created_at = now.isoformat(timespec="seconds")
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")

    with get_db() as conn:
        existing_today = conn.execute(
            "SELECT COUNT(*) AS count FROM waste_entries WHERE created_at >= ?",
            (start_today,),
        ).fetchone()["count"]

    if existing_today > 0 and not force:
        return jsonify({
            "error": "A closing waste count has already been submitted today.",
            "duplicate_warning": True,
            "existing_rows_today": existing_today,
        }), 409

    rows_to_insert = []

    for item_name, quantity in counts.items():
        if item_name not in ITEM_PRICES:
            continue

        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            quantity = 0

        if quantity <= 0:
            continue

        cost_per_item = ITEM_PRICES[item_name]
        total_cost = round(quantity * cost_per_item, 2)

        rows_to_insert.append((
            item_name,
            quantity,
            cost_per_item,
            total_cost,
            shift,
            employee_name,
            note,
            created_at,
        ))

    if not rows_to_insert:
        return jsonify({"error": "No valid waste items submitted."}), 400

    with get_db() as conn:
        conn.executemany("""
            INSERT INTO waste_entries
            (item_name, quantity, cost_per_item, total_cost, shift, employee_name, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, rows_to_insert)
        conn.commit()

    return jsonify({
        "message": "Waste entry saved.",
        "created_at": created_at,
        "items_saved": len(rows_to_insert),
        "entry_total": round(sum(row[3] for row in rows_to_insert), 2),
    }), 201


@app.route("/api/entries/<int:entry_id>", methods=["PUT"])
def update_entry(entry_id):
    data = request.get_json(force=True)

    item_name = data.get("item_name", "")
    quantity = data.get("quantity", 0)
    shift = data.get("shift", "")
    employee_name = data.get("employee_name", "")
    note = data.get("note", "")

    if item_name not in ITEM_PRICES:
        return jsonify({"error": "Invalid item name."}), 400

    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        return jsonify({"error": "Quantity must be a number."}), 400

    if quantity <= 0:
        return jsonify({"error": "Quantity must be at least 1."}), 400

    cost_per_item = ITEM_PRICES[item_name]
    total_cost = round(quantity * cost_per_item, 2)

    with get_db() as conn:
        existing = conn.execute("""
            SELECT *
            FROM waste_entries
            WHERE id = ?
        """, (entry_id,)).fetchone()

        if not existing:
            return jsonify({"error": "Entry not found."}), 404

        conn.execute("""
            UPDATE waste_entries
            SET item_name = ?,
                quantity = ?,
                cost_per_item = ?,
                total_cost = ?,
                shift = ?,
                employee_name = ?,
                note = ?
            WHERE id = ?
        """, (
            item_name,
            quantity,
            cost_per_item,
            total_cost,
            shift,
            employee_name,
            note,
            entry_id,
        ))

        conn.commit()

        updated = conn.execute("""
            SELECT *
            FROM waste_entries
            WHERE id = ?
        """, (entry_id,)).fetchone()

    return jsonify({
        "message": "Entry updated.",
        "entry": row_to_dict(updated),
    })


@app.route("/api/entries/<int:entry_id>", methods=["DELETE"])
def delete_entry(entry_id):
    data = request.get_json(silent=True) or {}
    void_reason = str(data.get("void_reason", "No reason provided")).strip() or "No reason provided"
    deleted_at = datetime.now().isoformat(timespec="seconds")

    with get_db() as conn:
        existing = conn.execute("""
            SELECT *
            FROM waste_entries
            WHERE id = ?
        """, (entry_id,)).fetchone()

        if not existing:
            return jsonify({"error": "Entry not found."}), 404

        conn.execute("""
            INSERT INTO deleted_waste_entries
            (original_entry_id, item_name, quantity, cost_per_item, total_cost,
             shift, employee_name, note, created_at, deleted_at, void_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            existing["id"], existing["item_name"], existing["quantity"],
            existing["cost_per_item"], existing["total_cost"], existing["shift"],
            existing["employee_name"], existing["note"], existing["created_at"],
            deleted_at, void_reason,
        ))

        conn.execute("""
            DELETE FROM waste_entries
            WHERE id = ?
        """, (entry_id,))
        conn.commit()

    return jsonify({
        "message": "Entry voided/deleted.",
        "deleted_id": entry_id,
        "void_reason": void_reason,
    })


@app.route("/api/entries/recent", methods=["GET"])
def recent_entries():
    limit = request.args.get("limit", 10, type=int)
    limit = max(1, min(limit, 50))

    with get_db() as conn:
        rows = conn.execute("""
            SELECT *
            FROM waste_entries
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        """, (limit,)).fetchall()

    return jsonify([row_to_dict(row) for row in rows])


@app.route("/api/summary", methods=["GET"])
def summary():
    period = request.args.get("period", "today")

    now = datetime.now()

    if period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now - timedelta(days=30)
    elif period == "year":
        start = now - timedelta(days=365)
    elif period == "two_years":
        start = now - timedelta(days=365 * RETENTION_YEARS)
    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    start_iso = start.isoformat(timespec="seconds")

    with get_db() as conn:
        total_row = conn.execute("""
            SELECT
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS total_quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
        """, (start_iso,)).fetchone()

        item_rows = conn.execute("""
            SELECT
                item_name,
                COALESCE(SUM(quantity), 0) AS quantity,
                COALESCE(SUM(total_cost), 0) AS total_cost
            FROM waste_entries
            WHERE created_at >= ?
            GROUP BY item_name
            ORDER BY total_cost DESC
        """, (start_iso,)).fetchall()

        daily_rows = conn.execute("""
            SELECT
                DATE(created_at) AS date,
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity
            FROM waste_entries
            WHERE created_at >= ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """, (start_iso,)).fetchall()

    return jsonify({
        "period": period,
        "start": start_iso,
        "minimum_retention_years": RETENTION_YEARS,
        "total_cost": round(total_row["total_cost"], 2),
        "total_quantity": total_row["total_quantity"],
        "row_count": total_row["row_count"],
        "goal": APP_SETTINGS["daily_goal"],
        "goal_status": "under" if total_row["total_cost"] < APP_SETTINGS["daily_goal"] else "over",
        "items": [
            {
                "item_name": row["item_name"],
                "quantity": row["quantity"],
                "total_cost": round(row["total_cost"], 2),
            }
            for row in item_rows
        ],
        "daily": [
            {
                "date": row["date"],
                "total_cost": round(row["total_cost"], 2),
                "quantity": row["quantity"],
            }
            for row in daily_rows
        ],
    })


@app.route("/api/summary/month", methods=["GET"])
def summary_for_month():
    month = request.args.get("month")

    if not month:
        return jsonify({"error": "Month is required. Use YYYY-MM."}), 400

    try:
        year, month_num = map(int, month.split("-"))
    except ValueError:
        return jsonify({"error": "Invalid month format. Use YYYY-MM."}), 400

    start = f"{month}-01T00:00:00"

    if month_num == 12:
        end = f"{year + 1}-01-01T00:00:00"
    else:
        end = f"{year}-{month_num + 1:02d}-01T00:00:00"

    with get_db() as conn:
        total_row = conn.execute("""
            SELECT
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS total_quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
        """, (start, end)).fetchone()

        item_rows = conn.execute("""
            SELECT
                item_name,
                COALESCE(SUM(quantity), 0) AS quantity,
                COALESCE(SUM(total_cost), 0) AS total_cost
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            GROUP BY item_name
            ORDER BY total_cost DESC
        """, (start, end)).fetchall()

        daily_rows = conn.execute("""
            SELECT
                DATE(created_at) AS date,
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """, (start, end)).fetchall()

        entry_rows = conn.execute("""
            SELECT *
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            ORDER BY created_at DESC, id DESC
        """, (start, end)).fetchall()

    return jsonify({
        "month": month,
        "total_cost": round(total_row["total_cost"], 2),
        "total_quantity": total_row["total_quantity"],
        "row_count": total_row["row_count"],
        "goal": APP_SETTINGS["daily_goal"],
        "items": [
            {
                "item_name": row["item_name"],
                "quantity": row["quantity"],
                "total_cost": round(row["total_cost"], 2),
            }
            for row in item_rows
        ],
        "daily": [
            {
                "date": row["date"],
                "total_cost": round(row["total_cost"], 2),
                "quantity": row["quantity"],
                "row_count": row["row_count"],
            }
            for row in daily_rows
        ],
        "entries": [row_to_dict(row) for row in entry_rows],
    })


def make_report_response(csv_data, filename):
    csv_data = "\ufeff" + csv_data

    return Response(
        csv_data,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        },
    )


@app.route("/api/export/month", methods=["GET"])
def export_month_csv():
    month = request.args.get("month")

    if not month:
        return jsonify({"error": "Month is required. Use YYYY-MM."}), 400

    try:
        year, month_num = map(int, month.split("-"))
    except ValueError:
        return jsonify({"error": "Invalid month format. Use YYYY-MM."}), 400

    start = f"{month}-01T00:00:00"

    if month_num == 12:
        end = f"{year + 1}-01-01T00:00:00"
    else:
        end = f"{year}-{month_num + 1:02d}-01T00:00:00"

    with get_db() as conn:
        total_row = conn.execute("""
            SELECT
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
        """, (start, end)).fetchone()

        daily_rows = conn.execute("""
            SELECT
                DATE(created_at) AS date,
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """, (start, end)).fetchall()

        item_rows = conn.execute("""
            SELECT
                item_name,
                COALESCE(SUM(quantity), 0) AS quantity,
                COALESCE(SUM(total_cost), 0) AS total_cost
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            GROUP BY item_name
            ORDER BY item_name ASC
        """, (start, end)).fetchall()

        entry_rows = conn.execute("""
            SELECT *
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            ORDER BY created_at ASC, id ASC
        """, (start, end)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)

    write_report_header(
        writer,
        "DQ WASTE LOG REPORT",
        "Monthly Waste Summary",
        month,
        total_row["quantity"],
        total_row["total_cost"],
        total_row["row_count"],
    )
    write_item_breakdown(writer, item_rows)
    write_daily_totals(writer, daily_rows)
    write_entry_history(writer, entry_rows)

    csv_data = output.getvalue()
    output.close()

    return make_report_response(csv_data, f"DQ_Waste_Report_{month}.csv")


@app.route("/api/export/year", methods=["GET"])
def export_year_csv():
    year = request.args.get("year")

    if not year:
        return jsonify({"error": "Year is required. Use YYYY."}), 400

    try:
        year_num = int(year)
    except ValueError:
        return jsonify({"error": "Invalid year format. Use YYYY."}), 400

    start = f"{year_num}-01-01T00:00:00"
    end = f"{year_num + 1}-01-01T00:00:00"

    with get_db() as conn:
        yearly_total = conn.execute("""
            SELECT
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
        """, (start, end)).fetchone()

        monthly_rows = conn.execute("""
            SELECT
                strftime('%Y-%m', created_at) AS month,
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month ASC
        """, (start, end)).fetchall()

        item_rows = conn.execute("""
            SELECT
                item_name,
                COALESCE(SUM(quantity), 0) AS quantity,
                COALESCE(SUM(total_cost), 0) AS total_cost
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            GROUP BY item_name
            ORDER BY item_name ASC
        """, (start, end)).fetchall()

        daily_rows = conn.execute("""
            SELECT
                DATE(created_at) AS date,
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """, (start, end)).fetchall()

        entry_rows = conn.execute("""
            SELECT *
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at < ?
            ORDER BY created_at ASC, id ASC
        """, (start, end)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)

    write_report_header(
        writer,
        "DQ ANNUAL WASTE REPORT",
        "Yearly Waste Summary",
        str(year),
        yearly_total["quantity"],
        yearly_total["total_cost"],
        yearly_total["row_count"],
    )
    write_monthly_totals(writer, monthly_rows)
    write_item_breakdown(writer, item_rows)
    write_daily_totals(writer, daily_rows)
    write_entry_history(writer, entry_rows)

    csv_data = output.getvalue()
    output.close()

    return make_report_response(csv_data, f"DQ_Annual_Waste_Report_{year}.csv")


@app.route("/api/export/two-years", methods=["GET"])
def export_two_year_csv():
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365 * RETENTION_YEARS)

    start = start_date.isoformat(timespec="seconds")
    end = end_date.isoformat(timespec="seconds")

    with get_db() as conn:
        two_year_total = conn.execute("""
            SELECT
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at <= ?
        """, (start, end)).fetchone()

        yearly_rows = conn.execute("""
            SELECT
                strftime('%Y', created_at) AS year,
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at <= ?
            GROUP BY strftime('%Y', created_at)
            ORDER BY year ASC
        """, (start, end)).fetchall()

        monthly_rows = conn.execute("""
            SELECT
                strftime('%Y-%m', created_at) AS month,
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at <= ?
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month ASC
        """, (start, end)).fetchall()

        item_rows = conn.execute("""
            SELECT
                item_name,
                COALESCE(SUM(quantity), 0) AS quantity,
                COALESCE(SUM(total_cost), 0) AS total_cost
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at <= ?
            GROUP BY item_name
            ORDER BY item_name ASC
        """, (start, end)).fetchall()

        daily_rows = conn.execute("""
            SELECT
                DATE(created_at) AS date,
                COALESCE(SUM(total_cost), 0) AS total_cost,
                COALESCE(SUM(quantity), 0) AS quantity,
                COUNT(*) AS row_count
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at <= ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """, (start, end)).fetchall()

        entry_rows = conn.execute("""
            SELECT *
            FROM waste_entries
            WHERE created_at >= ?
              AND created_at <= ?
            ORDER BY created_at ASC, id ASC
        """, (start, end)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)

    write_report_header(
        writer,
        "DQ 2-YEAR WASTE REPORT",
        "Long-Term Waste Summary",
        f"{format_report_date(start)} to {format_report_date(end)}",
        two_year_total["quantity"],
        two_year_total["total_cost"],
        two_year_total["row_count"],
    )
    write_yearly_totals(writer, yearly_rows)
    write_monthly_totals(writer, monthly_rows)
    write_item_breakdown(writer, item_rows)
    write_daily_totals(writer, daily_rows)
    write_entry_history(writer, entry_rows)

    csv_data = output.getvalue()
    output.close()

    return make_report_response(csv_data, "DQ_2_Year_Waste_Report.csv")


@app.route("/api/entries/cleanup", methods=["POST"])
def cleanup_old_entries():
    cutoff = datetime.now() - timedelta(days=365 * RETENTION_YEARS)
    cutoff_iso = cutoff.isoformat(timespec="seconds")

    with get_db() as conn:
        result = conn.execute("""
            DELETE FROM waste_entries
            WHERE created_at < ?
        """, (cutoff_iso,))
        conn.commit()

    return jsonify({
        "message": "Old entries cleaned up.",
        "deleted_rows": result.rowcount,
        "retention_years": RETENTION_YEARS,
    })


# Create required SQLite tables when the app starts.
# Railway runs this app with Gunicorn, so code inside __main__ does not run there.
init_db()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
