/**
 * Hospitals MCFRS transports to (the destinations that appear on the county radio fleetmap).
 *
 * Compiled 2026-09-03 from public sources:
 *  - Coordinates: OpenStreetMap `amenity=hospital` features (Overpass API, queried 2026-09-03;
 *    OSM way/relation centroid of the main hospital building or campus), cross-checked against
 *    Nominatim geocodes of each street address and, where present, the Wikipedia infobox coordinate.
 *  - Addresses: OSM `addr:*` tags on the same features, cross-checked with each hospital's Wikipedia
 *    article infobox.
 *  - Trauma designations: Wikipedia infobox / article text for Suburban, Walter Reed, Children's
 *    National, MedStar Washington Hospital Center and Inova Fairfax. Left undefined where not verified
 *    this session (see `notes`).
 *
 * Coordinates are the campus/building centroid, not the ED ambulance entrance; treat as +/- ~100 m.
 * The Wikipedia coordinate for White Oak (38.9856, -77.0017) is the closed Washington Adventist
 * Hospital in Takoma Park and must not be used.
 */

export interface Hospital {
  id: string;
  name: string;
  shortName: string;
  address: string;
  latitude: number;
  longitude: number;
  traumaLevel?: string;
  notes?: string;
}

export const HOSPITALS: readonly Hospital[] = [
  {
    id: "holy-cross-silver-spring",
    name: "Holy Cross Hospital",
    shortName: "Holy Cross SS",
    address: "1500 Forest Glen Rd, Silver Spring, MD 20910",
    latitude: 39.01487,
    longitude: -77.03521,
  },
  {
    id: "holy-cross-germantown",
    name: "Holy Cross Germantown Hospital",
    shortName: "Holy Cross Gtn",
    address: "19801 Observation Dr, Germantown, MD 20876",
    latitude: 39.18195,
    longitude: -77.24291,
  },
  {
    id: "medstar-montgomery",
    name: "MedStar Montgomery Medical Center",
    shortName: "MedStar Mont",
    address: "18101 Prince Philip Dr, Olney, MD 20832",
    latitude: 39.1537,
    longitude: -77.0547,
    notes: "Olney.",
  },
  {
    id: "shady-grove",
    name: "Adventist HealthCare Shady Grove Medical Center",
    shortName: "Shady Grove",
    address: "9901 Medical Center Dr, Rockville, MD 20850",
    latitude: 39.09819,
    longitude: -77.19864,
  },
  {
    id: "suburban",
    name: "Suburban Hospital (Johns Hopkins Medicine)",
    shortName: "Suburban",
    address: "8600 Old Georgetown Rd, Bethesda, MD 20814",
    latitude: 38.99788,
    longitude: -77.11053,
    traumaLevel: "Level II",
    notes: "Montgomery County's designated adult trauma center.",
  },
  {
    id: "white-oak",
    name: "Adventist HealthCare White Oak Medical Center",
    shortName: "White Oak",
    address: "11890 Healing Way, Silver Spring, MD 20904",
    latitude: 39.04966,
    longitude: -76.95726,
    notes: "Opened 2019, replacing Washington Adventist Hospital in Takoma Park. Coordinate confirmed by Nominatim reverse geocode (Healing Way, Fairland).",
  },
  {
    id: "walter-reed",
    name: "Walter Reed National Military Medical Center",
    shortName: "Walter Reed",
    address: "8901 Rockville Pike, Bethesda, MD 20889",
    latitude: 39.00167,
    longitude: -77.09384,
    traumaLevel: "Level II",
    notes: "Military facility (Naval Support Activity Bethesda); civilian transports are limited. Coordinate is the OSM campus relation centroid.",
  },
  {
    id: "sibley",
    name: "Sibley Memorial Hospital (Johns Hopkins Medicine)",
    shortName: "Sibley",
    address: "5255 Loughboro Rd NW, Washington, DC 20016",
    latitude: 38.9367,
    longitude: -77.1088,
  },
  {
    id: "frederick-health",
    name: "Frederick Health Hospital",
    shortName: "Frederick",
    address: "400 W 7th St, Frederick, MD 21701",
    latitude: 39.42317,
    longitude: -77.41482,
    notes: "Formerly Frederick Memorial Hospital (OSM still carries the old name). Commonly listed as a MIEMSS Level III trauma center; designation not verified this session, so traumaLevel is left unset.",
  },
  {
    id: "childrens-national",
    name: "Children's National Hospital",
    shortName: "Children's",
    address: "111 Michigan Ave NW, Washington, DC 20010",
    latitude: 38.92711,
    longitude: -77.01417,
    traumaLevel: "Pediatric Level I",
  },
  {
    id: "medstar-whc",
    name: "MedStar Washington Hospital Center",
    shortName: "WHC",
    address: "110 Irving St NW, Washington, DC 20010",
    latitude: 38.92876,
    longitude: -77.01478,
    traumaLevel: "Level I",
    notes: "Adjacent to Children's National on the same campus; MedSTAR trauma and burn center.",
  },
  {
    id: "inova-fairfax",
    name: "Inova Fairfax Hospital",
    shortName: "Inova Fairfax",
    address: "3300 Gallows Rd, Falls Church, VA 22042",
    latitude: 38.85699,
    longitude: -77.228,
    traumaLevel: "Level I",
  },
];

export const HOSPITAL_BY_ID: Map<string, Hospital> = new Map(HOSPITALS.map((h) => [h.id, h]));

export function getHospital(id: string): Hospital | undefined {
  return HOSPITAL_BY_ID.get(id);
}
