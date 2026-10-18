// Display categories are derived only from the source type/subtype, never inferred from impacts.
export const hazardColors = {
  'Earthquake': '#e28a26', 'Tsunami': '#1677c8',
  'Flood': '#5146a6', 'Riverine flood': '#148557', 'Flash flood': '#c53494', 'Coastal flood': '#24aeb1',
  'Hurricane / typhoon': '#7a35b1', 'Tornado': '#a43755', 'Storm': '#596273',
  'Blizzard / winter storm': '#a8c7ed', 'Hailstorm': '#808dba', 'Duststorm': '#b77737',
  'Thunderstorm / lightning': '#a3a019', 'Extratropical storm': '#476a28', 'Storm surge': '#124e61', 'Derecho': '#e07bb2', 'Severe weather': '#8e80c5',
  'Heatwave': '#ed5e1c', 'Cold wave': '#4564ca', 'Severe winter conditions': '#597f9f',
  'Avalanche': '#79cdd9', 'Landslide (wet)': '#8a552b', 'Landslide (dry)': '#bb8f75',
  'Mudslide': '#6e443c', 'Rockfall': '#787c66', 'Subsidence': '#4b493b',
  'Drought': '#c2a027', 'Wildfire': '#9f173e', 'Firestorm': '#d12e35', 'Sinkhole': '#a1a48c',
  'Volcanic activity': '#bf6155', 'Glacial lake outburst flood': '#247f80',
  'Epidemic': '#97509b', 'Infestation': '#90ae39', 'Impact': '#3c354d', 'Animal incident': '#366d57',
};

// Plain-language summaries; sources and distinctions from EM-DAT classifications
// are documented in docs/data-methods.md. These do not reclassify source rows.
export const hazardDescriptions = {
  'Earthquake': 'Ground shaking caused by a sudden movement along a fault in the Earth’s crust.',
  'Tsunami': 'Large waves caused by a sudden displacement of water, often from an underwater earthquake.',
  'Flood': 'Water covering normally dry land; the source does not specify a more detailed flood subtype.',
  'Riverine flood': 'A river or stream overflowing its channel onto surrounding land.',
  'Flash flood': 'Flooding that develops rapidly, usually within hours of intense rainfall.',
  'Coastal flood': 'Seawater covering normally dry coastal land because of unusually high water levels.',
  'Hurricane / typhoon': 'A powerful rotating tropical storm; hurricanes, typhoons and tropical cyclones are regional names.',
  'Tornado': 'A violently rotating column of air extending from a storm to the ground.',
  'Storm': 'A damaging weather disturbance; the source does not specify a more detailed storm subtype.',
  'Blizzard / winter storm': 'A winter storm bringing heavy snow, ice or freezing rain, sometimes with strong winds.',
  'Hailstorm': 'A storm producing falling balls or lumps of ice.',
  'Duststorm': 'Strong winds lifting dust or sand and reducing visibility.',
  'Thunderstorm / lightning': 'Storm activity involving electrical discharges, thunder and often heavy rain.',
  'Extratropical storm': 'A rotating storm outside the tropics, powered by contrasts between warm and cold air.',
  'Storm surge': 'An unusual rise in sea level driven by a storm’s winds and pressure.',
  'Derecho': 'A widespread, fast-moving windstorm with damaging straight-line winds from thunderstorms.',
  'Severe weather': 'A broad source category for damaging weather without a more specific classification.',
  'Heatwave': 'A sustained period of unusually hot weather, sometimes combined with high humidity.',
  'Cold wave': 'A sustained period of unusually cold weather for the affected region.',
  'Severe winter conditions': 'Harmful snow or ice conditions affecting buildings, transport or other infrastructure.',
  'Avalanche': 'A rapid downhill movement of snow, ice or loose debris.',
  'Landslide (wet)': 'Soil or rock moving downhill under wet conditions, often after heavy rain or snowmelt.',
  'Landslide (dry)': 'Soil or rock moving downhill under dry conditions.',
  'Mudslide': 'Wet soil and debris flowing rapidly down a slope.',
  'Rockfall': 'Rock fragments breaking loose and falling or bouncing down a steep slope.',
  'Subsidence': 'The ground sinking or settling as support beneath it is lost.',
  'Drought': 'A prolonged shortage of rainfall that reduces available water.',
  'Wildfire': 'An uncontrolled fire spreading through forests, grassland or other natural vegetation.',
  'Firestorm': 'An extremely intense fire that generates powerful inward winds. No explicitly classified records in this export.',
  'Sinkhole': 'A hole or depression formed as the ground sinks or collapses. No explicitly classified records in this export.',
  'Volcanic activity': 'Volcanic processes releasing lava, ash, gases or other material.',
  'Glacial lake outburst flood': 'A sudden release of water from a lake held back by ice or glacial debris.',
  'Epidemic': 'An infectious disease outbreak with more cases than expected in a population.',
  'Infestation': 'A damaging increase or spread of pests, such as insects affecting crops or vegetation.',
  'Impact': 'A meteorite striking the ground or an incoming space object exploding in the atmosphere.',
  'Animal incident': 'Harmful encounters between people and dangerous animals.',
};

const subtypes = {
  'Tsunami': 'Tsunami', 'Riverine flood': 'Riverine flood', 'Flash flood': 'Flash flood', 'Coastal flood': 'Coastal flood',
  'Tropical cyclone': 'Hurricane / typhoon', 'Tornado': 'Tornado', 'Blizzard/Winter storm': 'Blizzard / winter storm',
  'Hail': 'Hailstorm', 'Sand/Dust storm': 'Duststorm', 'Lightning/Thunderstorms': 'Thunderstorm / lightning',
  'Extra-tropical storm': 'Extratropical storm', 'Storm surge': 'Storm surge', 'Derecho': 'Derecho', 'Severe weather': 'Severe weather',
  'Heat wave': 'Heatwave', 'Cold wave': 'Cold wave', 'Severe winter conditions': 'Severe winter conditions',
  'Avalanche (wet)': 'Avalanche', 'Avalanche (dry)': 'Avalanche', 'Landslide (wet)': 'Landslide (wet)',
  'Landslide (dry)': 'Landslide (dry)', 'Mudslide': 'Mudslide', 'Rockfall (wet)': 'Rockfall',
  'Rockfall (dry)': 'Rockfall', 'Sudden Subsidence (wet)': 'Subsidence',
};

export function hazardType(row) {
  return subtypes[row.subtype] || row.source_type || row.type;
}

// Each expanded category belongs to exactly one family. This partition keeps
// grouped selection, expanded selection and marker colors in agreement.
export const hazardFamilies = {
  'Flood': ['Flood', 'Riverine flood', 'Flash flood', 'Coastal flood', 'Glacial lake outburst flood'],
  'Storm': ['Storm', 'Hurricane / typhoon', 'Tornado', 'Blizzard / winter storm', 'Hailstorm', 'Duststorm', 'Thunderstorm / lightning', 'Extratropical storm', 'Storm surge', 'Derecho', 'Severe weather'],
  'Earthquake / tsunami': ['Earthquake', 'Tsunami'],
  'Extreme temperature': ['Heatwave', 'Cold wave', 'Severe winter conditions'],
  'Landslide / avalanche': ['Avalanche', 'Landslide (wet)', 'Landslide (dry)', 'Mudslide', 'Rockfall', 'Subsidence', 'Sinkhole'],
  'Drought': ['Drought'], 'Wildfire': ['Wildfire', 'Firestorm'],
  'Volcanic activity': ['Volcanic activity'], 'Epidemic': ['Epidemic'],
  'Infestation': ['Infestation'], 'Impact': ['Impact'], 'Animal incident': ['Animal incident'],
};
export const hazardFamilyColors = {
  'Flood': '#247f9a', 'Storm': '#7353a6', 'Earthquake / tsunami': '#c97924',
  'Extreme temperature': '#c34f47', 'Landslide / avalanche': '#826346',
  'Drought': '#a58b25', 'Wildfire': '#9f173e', 'Volcanic activity': '#bf6155',
  'Epidemic': '#97509b', 'Infestation': '#6e8b2d', 'Impact': '#3c354d', 'Animal incident': '#366d57',
};
const familyByType = new Map(Object.entries(hazardFamilies).flatMap(([family, types]) => types.map(type => [type, family])));
export const hazardFamily = type => familyByType.get(type) || type;
export const eventColor = (type, { colorByType = false, hazardLevel = 'grouped' } = {}) =>
  colorByType ? (hazardLevel === 'grouped' ? hazardFamilyColors[hazardFamily(type)] : hazardColors[type]) || '#777a99' : '#167c75';

export const DAY = 86400000;

// Missing and invalid days are excluded from daily replay, rather than assigned a date.
export function eventDay(row) {
  const { year, start_month: month, start_day: day } = row;
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? +date : null;
}

export function hasCoordinates(row) {
  return Number.isFinite(row.latitude) && Number.isFinite(row.longitude)
    && Math.abs(row.latitude) <= 90 && Math.abs(row.longitude) <= 180;
}
