// The AI tools mirror this palette in
// crates/properties/src/inbound/toolset/tag_color.rs (TagColor::hex). Keep the
// two in sync when adding, removing, recoloring, or reordering a tag color.
export const TAG_COLORS = [
  '#E5484D', // Red
  '#E54D2E', // Tomato
  '#F76B15', // Orange
  '#FFB224', // Amber
  '#F5D90A', // Yellow
  '#46A758', // Green
  '#12A594', // Teal
  '#0091FF', // Blue
  '#3E63DD', // Indigo
  '#8E4EC6', // Purple
  '#E93D82', // Pink
  '#889096', // Gray
] as const;

export const DEFAULT_TAG_COLOR: string = TAG_COLORS[11];

export const TAG_COLOR_OPTIONS = [
  { color: TAG_COLORS[0], name: 'Red', labelKey: 'property.tags.colors.red' },
  {
    color: TAG_COLORS[1],
    name: 'Tomato',
    labelKey: 'property.tags.colors.tomato',
  },
  {
    color: TAG_COLORS[2],
    name: 'Orange',
    labelKey: 'property.tags.colors.orange',
  },
  {
    color: TAG_COLORS[3],
    name: 'Amber',
    labelKey: 'property.tags.colors.amber',
  },
  {
    color: TAG_COLORS[4],
    name: 'Yellow',
    labelKey: 'property.tags.colors.yellow',
  },
  {
    color: TAG_COLORS[5],
    name: 'Green',
    labelKey: 'property.tags.colors.green',
  },
  { color: TAG_COLORS[6], name: 'Teal', labelKey: 'property.tags.colors.teal' },
  { color: TAG_COLORS[7], name: 'Blue', labelKey: 'property.tags.colors.blue' },
  {
    color: TAG_COLORS[8],
    name: 'Indigo',
    labelKey: 'property.tags.colors.indigo',
  },
  {
    color: TAG_COLORS[9],
    name: 'Purple',
    labelKey: 'property.tags.colors.purple',
  },
  {
    color: TAG_COLORS[10],
    name: 'Pink',
    labelKey: 'property.tags.colors.pink',
  },
  {
    color: TAG_COLORS[11],
    name: 'Gray',
    labelKey: 'property.tags.colors.gray',
  },
] as const satisfies readonly {
  color: (typeof TAG_COLORS)[number];
  name: string;
  labelKey: string;
}[];
