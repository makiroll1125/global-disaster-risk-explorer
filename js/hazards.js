// Display categories are derived only from the source type/subtype, never inferred from impacts.
export const hazardColors = {
  'Earthquake': '#e28a26', 'Tsunami': '#1677c8',
  'Flood': '#3989ad', 'Riverine flood': '#297b9c', 'Flash flood': '#1f9bbb', 'Coastal flood': '#2865ab',
  'Hurricane / typhoon': '#7066bb', 'Tornado': '#81549c', 'Storm': '#777a99',
  'Blizzard / winter storm': '#75b9dd', 'Hailstorm': '#579fb8', 'Duststorm': '#b4934b',
  'Thunderstorm / lightning': '#a58a1e', 'Extratropical storm': '#536da7', 'Storm surge': '#4b65bc', 'Derecho': '#9567aa', 'Severe weather': '#8b7ba7',
  'Heatwave': '#e45732', 'Cold wave': '#4d9dc4', 'Severe winter conditions': '#86bacc',
  'Avalanche': '#8bc8df', 'Landslide (wet)': '#9a7655', 'Landslide (dry)': '#ad8d66',
  'Mudslide': '#8e6247', 'Rockfall': '#737876', 'Subsidence': '#998b76',
  'Drought': '#ba9b39', 'Wildfire': '#c84035', 'Firestorm': '#a82f27', 'Sinkhole': '#80715c',
  'Volcanic activity': '#a94e64', 'Glacial lake outburst flood': '#29a7b0',
  'Epidemic': '#9a6598', 'Infestation': '#7d913f', 'Impact': '#777187', 'Animal incident': '#4d8767',
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
