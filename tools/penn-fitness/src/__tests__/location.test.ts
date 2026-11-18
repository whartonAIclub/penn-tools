import { describe, it, expect } from "vitest";
import { areaOfCorner, blocksBetween, formatCorner, isCorner, type Corner } from "../location.js";

const corner = (street: number, crossStreet: Corner["crossStreet"]): Corner => ({ street, crossStreet });

describe("corners", () => {
  it("accepts numbered streets 1 to 69 and the listed cross streets", () => {
    expect(isCorner(corner(23, "Chestnut"))).toBe(true);
    expect(isCorner(corner(1, "Race"))).toBe(true);
    expect(isCorner(corner(0, "Chestnut"))).toBe(false);
    expect(isCorner(corner(23.5, "Chestnut"))).toBe(false);
    expect(isCorner(corner(23, "Broadway" as Corner["crossStreet"]))).toBe(false);
  });

  it("puts streets up to the Schuylkill in Center City, and past it around campus", () => {
    expect(areaOfCorner(corner(18, "Walnut"))).toBe("CENTER_CITY");
    expect(areaOfCorner(corner(26, "Walnut"))).toBe("CENTER_CITY");
    expect(areaOfCorner(corner(34, "Walnut"))).toBe("CAMPUS");
  });

  it("counts blocks across numbered streets plus across cross streets", () => {
    expect(blocksBetween(corner(23, "Chestnut"), corner(23, "Chestnut"))).toBe(0);
    // 23rd to 37th is 14 blocks; Chestnut to Walnut is 1.
    expect(blocksBetween(corner(23, "Chestnut"), corner(37, "Walnut"))).toBe(15);
    expect(blocksBetween(corner(37, "Walnut"), corner(23, "Chestnut"))).toBe(15);
    expect(blocksBetween(corner(20, "Market"), corner(20, "South"))).toBe(7);
  });

  it("formats corners the way people say them", () => {
    expect(formatCorner(corner(23, "Chestnut"))).toBe("23rd & Chestnut");
    expect(formatCorner(corner(1, "Market"))).toBe("1st & Market");
    expect(formatCorner(corner(22, "Pine"))).toBe("22nd & Pine");
    expect(formatCorner(corner(11, "Spruce"))).toBe("11th & Spruce");
    expect(formatCorner(corner(13, "Locust"))).toBe("13th & Locust");
    expect(formatCorner(corner(40, "Walnut"))).toBe("40th & Walnut");
  });
});
