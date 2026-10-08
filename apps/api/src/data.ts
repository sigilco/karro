// Generated from data/ — bake-time SARE zones + garage catalog.

export const CATALOG: { id: string; name: string; lat: number; lon: number }[] = [
  { id: "CE", name: "Cervantes", lat: 36.7208633, lon: -4.4119148 },
  { id: "PA", name: "El Palo", lat: 36.721035, lon: -4.3607192 },
  { id: "AN", name: "Av. de Andalucía", lat: 36.7173271, lon: -4.427712 },
  { id: "CA", name: "Camas", lat: 36.7202072, lon: -4.4244981 },
  { id: "AL", name: "Alcazaba", lat: 36.7224312, lon: -4.4165168 },
  { id: "SJ", name: "San Juan De La Cruz", lat: 36.717865, lon: -4.4332781 },
  { id: "MA", name: "Pz. de la Marina", lat: 36.7174149, lon: -4.4200468 },
  { id: "TE", name: "Tejón y Rodriguez", lat: 36.7235985, lon: -4.4214821 },
  { id: "CY", name: "Carlos Haya", lat: 36.71192991, lon: -4.44097 },
  { id: "PB", name: "Pío Baroja", lat: 36.721035, lon: -4.3607192 },
  { id: "SA", name: "Salitre", lat: 36.7136431, lon: -4.4272355 },
  { id: "CR", name: "Cruz de Humilladero", lat: 36.712046, lon: -4.44049 },
];

export const ZONES: {
  type: "FeatureCollection";
  name?: string;
  metadata?: Record<string, any>;
  features: {
    type: "Feature";
    geometry?: { type: string; coordinates: any };
    properties?: Record<string, any>;
  }[];
} = {
  type: "FeatureCollection",
  name: "malaga_sare_zones",
  metadata: {
    source:
      "plazasaparcamientossare2013.csv (street-count table, no geometry) — polygons hand-authored as bounding boxes of the dataset's real sector names.",
    baked: "2026-10-07",
    confidence: "inferred",
  },
  features: [
    {
      type: "Feature",
      properties: {
        name: "Atarazanas",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: true,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.4272, 36.7175],
            [-4.4223, 36.7175],
            [-4.4223, 36.72],
            [-4.4272, 36.72],
            [-4.4272, 36.7175],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Soho",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: true,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.4295, 36.713],
            [-4.4223, 36.713],
            [-4.4223, 36.7175],
            [-4.4295, 36.7175],
            [-4.4295, 36.713],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Ayuntamiento",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: true,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.4223, 36.7178],
            [-4.414, 36.7178],
            [-4.414, 36.7215],
            [-4.4223, 36.7215],
            [-4.4223, 36.7178],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Malagueta",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: true,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.414, 36.7185],
            [-4.396, 36.7185],
            [-4.396, 36.725],
            [-4.414, 36.725],
            [-4.414, 36.7185],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "El Carmen",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: false,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.408, 36.709],
            [-4.396, 36.709],
            [-4.396, 36.7185],
            [-4.408, 36.7185],
            [-4.408, 36.709],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Comp. Lemberg Ruiz",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: false,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.4365, 36.717],
            [-4.431, 36.717],
            [-4.431, 36.72],
            [-4.4365, 36.72],
            [-4.4365, 36.717],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Aurora",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: false,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.4355, 36.7145],
            [-4.4285, 36.7145],
            [-4.4285, 36.718],
            [-4.4355, 36.718],
            [-4.4355, 36.7145],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Urbanismo",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: false,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.4395, 36.71],
            [-4.4285, 36.71],
            [-4.4285, 36.7145],
            [-4.4395, 36.7145],
            [-4.4395, 36.71],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Babel",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: false,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.468, 36.7065],
            [-4.458, 36.7065],
            [-4.458, 36.7135],
            [-4.468, 36.7135],
            [-4.468, 36.7065],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Huelin",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: false,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.446, 36.699],
            [-4.436, 36.699],
            [-4.436, 36.706],
            [-4.446, 36.706],
            [-4.446, 36.699],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        name: "Parque Tecnológico",
        type: "sare_blue",
        hours: "Mon–Fri 9–14 & 16–20, Sat 9–14",
        priceEurPerHour: 1.1,
        maxStayMin: 30,
        zbe: false,
        confidence: "inferred",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4.49, 36.672],
            [-4.462, 36.672],
            [-4.462, 36.695],
            [-4.49, 36.695],
            [-4.49, 36.672],
          ],
        ],
      },
    },
  ],
};
