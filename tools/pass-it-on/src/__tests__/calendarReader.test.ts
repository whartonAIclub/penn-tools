import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { calendarRows, CalendarFormatError, MAX_CALENDAR_ROWS } from "../imports/calendar.js";

async function workbook(build: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("calendarRows", () => {
  it("reads rows from every tab with sheet name and row number", async () => {
    const data = await workbook((wb) => {
      const draft = wb.addWorksheet("Draft");
      draft.getRow(1).values = ["Date", "Name", "Location"];
      draft.getRow(3).values = [new Date(Date.UTC(2026, 7, 14)), "Pre-Term Pub", "Lucy's"];
      wb.addWorksheet("Signups").getRow(2).values = ["Free Pub"];
    });
    const rows = await calendarRows("cal.xlsx", data);
    expect(rows).toContainEqual({ sheet: "Draft", row: 3, text: "2026-08-14 | Pre-Term Pub | Lucy's" });
    expect(rows).toContainEqual({ sheet: "Signups", row: 2, text: "Free Pub" });
  });

  it("skips empty rows and reads formula results", async () => {
    const data = await workbook((wb) => {
      const ws = wb.addWorksheet("Signups");
      ws.getRow(1).values = ["Name"];
      ws.getCell("B3").value = { formula: "A1", result: "Armory" };
      ws.getCell("A5").value = "   ";
    });
    const rows = await calendarRows("cal.xlsx", data);
    expect(rows).toEqual([
      { sheet: "Signups", row: 1, text: "Name" },
      { sheet: "Signups", row: 3, text: "Armory" },
    ]);
  });

  it("rejects non-spreadsheets and workbooks over the row cap", async () => {
    await expect(calendarRows("plan.docx", new Uint8Array([1]))).rejects.toBeInstanceOf(CalendarFormatError);
    const big = await workbook((wb) => {
      const ws = wb.addWorksheet("Big");
      for (let i = 1; i <= MAX_CALENDAR_ROWS + 1; i++) ws.getRow(i).values = [`Event ${i}`];
    });
    await expect(calendarRows("big.xlsx", big)).rejects.toBeInstanceOf(CalendarFormatError);
  });

  it("returns no rows for an empty workbook", async () => {
    expect(await calendarRows("empty.xlsx", await workbook((wb) => wb.addWorksheet("Empty")))).toEqual([]);
  });

  it("reads a time-only cell as a time, not a 1899 date", async () => {
    const data = await workbook((wb) => {
      wb.addWorksheet("T").getRow(1).values = ["Pub", new Date(Date.UTC(1899, 11, 30, 17, 30))];
    });
    expect(await calendarRows("t.xlsx", data)).toEqual([{ sheet: "T", row: 1, text: "Pub | 17:30" }]);
  });
});
