/**
 * DWR Statewide Crop Mapping 2019 — crop code → readable name lookup.
 *
 * Coding pattern:
 *   Letter = category (G=Grain, R=Rice, F=Field, P=Pasture, T=Tree, V=Vine,
 *                       D=Truck/Nursery, C=Citrus, I=Idle, S=Semi-ag, U=Urban, etc.)
 *   Number = specific crop within that category
 */

const CROP_CODES: Record<string, string> = {
  // Grain & Hay (G)
  G1: "Wheat",
  G2: "Corn (Grain)",
  G3: "Barley",
  G4: "Oats",
  G5: "Millet",
  G6: "Sorghum",
  G7: "Sudan",
  G8: "Triticale",
  G9: "Rye",
  G10: "Wild Rice",
  G11: "Miscellaneous Grain",

  // Rice (R)
  R1: "Rice — Wild",
  R2: "Rice",

  // Field Crops (F)
  F1: "Cotton",
  F2: "Safflower",
  F3: "Flax",
  F4: "Hops",
  F5: "Sugar Beets",
  F6: "Corn (Silage)",
  F7: "Beans (Dry)",
  F8: "Sunflower",
  F9: "Miscellaneous Field",
  F10: "Alfalfa",
  F11: "Clover",
  F12: "Mixed Hay",
  F13: "Grain Hay",

  // Pasture (P)
  P1: "Native Pasture",
  P2: "Irrigated Pasture",
  P3: "Mixed Pasture",
  P4: "Native Pasture (Foothill)",

  // Truck, Nursery & Berry (D)
  D1: "Lettuce",
  D2: "Cole Crops (Broccoli, Cabbage, Cauliflower)",
  D3: "Carrots",
  D4: "Celery",
  D5: "Spinach",
  D6: "Sweet Potatoes",
  D7: "Potatoes",
  D8: "Asparagus",
  D9: "Onions",
  D10: "Melons, Squash, Cucumbers",
  D11: "Peppers",
  D12: "Mixed Vegetables",
  D13: "Tomatoes",
  D14: "Flowers, Nursery, Christmas Trees",
  D15: "Strawberries",
  D16: "Bush Berries",
  D17: "Herbs",
  D18: "Greenhouse",

  // Citrus & Subtropical (C)
  C1: "Grapefruit",
  C2: "Lemons",
  C3: "Oranges",
  C4: "Dates",
  C5: "Avocados",
  C6: "Olives",
  C7: "Kiwis",
  C8: "Jojoba",
  C9: "Eucalyptus",
  C10: "Miscellaneous Subtropical",
  C11: "Tangerines/Mandarins",

  // Tree Crops (T)
  T1: "Apples",
  T2: "Apricots",
  T3: "Cherries",
  T4: "Figs",
  T5: "Peaches/Nectarines",
  T6: "Pears",
  T7: "Plums",
  T8: "Prunes",
  T9: "Pomegranates",
  T10: "Miscellaneous Deciduous",
  T11: "Almonds",
  T12: "Walnuts",
  T13: "Pistachios",
  T14: "Pecans",
  T15: "Almonds",
  T16: "Mixed Nuts",
  T17: "Young Orchard",

  // Vine Crops (V)
  V1: "Table Grapes",
  V2: "Wine Grapes",
  V3: "Raisin Grapes",
  V4: "Miscellaneous Grapes",

  // Idle (I)
  I1: "Idle — New",
  I2: "Idle — Fallow",
  I3: "Idle — Perennial",

  // Semi-Agricultural & Other (S)
  S1: "Farmstead",
  S2: "Livestock Feedlot",
  S3: "Poultry",
  S4: "Dairy",
  S5: "Aquaculture",

  // Urban (U)
  U1: "Urban Residential",
  U2: "Urban Commercial",
  U3: "Urban Industrial",
  U4: "Urban Vacant",

  // Riparian / Native (NR/NV/NW)
  NR1: "Riparian Vegetation",
  NV1: "Native Vegetation",
  NW1: "Water Surface",
};

/** Decode a DWR MAIN_CROP code to a human-readable name. Falls back to the raw code. */
export function decodeCropCode(code: string): string {
  if (!code) return "Unknown";
  const name = CROP_CODES[code.trim()];
  return name ?? code;
}
